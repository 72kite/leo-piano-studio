// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { attachRaceServer } from './socket.js';
import { JsonDb } from '../lib/db.js';
import { signAccessToken, hashPassword } from '../lib/security.js';

process.env.JWT_SECRET = 'b'.repeat(32);

const TIMINGS = {
  matchmakeDelayMs: 20,
  voteMs: 300,
  countdownMs: 400,
  payloadLeadMs: 150,
  resultsTimeoutMs: 5000,
};

function waitFor(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

let httpServer, port, db, dbFile, registeredUser, registeredToken;

beforeAll(async () => {
  dbFile = path.join(os.tmpdir(), `leo-race-test-db-${crypto.randomUUID()}.json`);
  db = new JsonDb(dbFile);

  registeredUser = {
    id: crypto.randomUUID(),
    username: 'racerone', usernameLower: 'racerone',
    email: null, emailLower: null,
    passwordHash: await hashPassword('irrelevant-for-this-test'),
    role: 'student', mmr: 1000, wallet: 0,
    createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [],
  };
  await db.createUser(registeredUser);
  registeredToken = signAccessToken(registeredUser);

  httpServer = createServer();
  attachRaceServer(httpServer, { db, lobbySize: 2, timings: TIMINGS, corsOrigin: 'http://localhost:5173' });
  await new Promise(resolve => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  httpServer.closeAllConnections?.(); // force-close anything left dangling before waiting on close()
  await new Promise(resolve => httpServer.close(resolve));
  await fs.rm(dbFile, { force: true });
});

// Tracked centrally and closed in afterEach so a failed assertion mid-test
// (which skips whatever cleanup code follows it) can never leave a live
// socket behind to hang the server's close() in afterAll.
let openClients = [];
afterEach(() => {
  openClients.forEach(c => c.close());
  openClients = [];
});

function connect(auth = {}) {
  const client = ioClient(`http://localhost:${port}`, { auth, transports: ['websocket'], forceNew: true });
  openClients.push(client);
  return client;
}

describe('race socket server — full lifecycle', () => {
  it('takes two players from queue through to persisted results', async () => {
    const a = connect({ token: registeredToken }); // registered user
    const b = connect({});                          // guest

    const [identityA, identityB] = await Promise.all([waitFor(a, 'auth:identity'), waitFor(b, 'auth:identity')]);
    expect(identityA.userId).toBe(registeredUser.id);
    expect(identityB.userId).toMatch(/^guest_/);

    a.emit('race:queue');
    b.emit('race:queue');

    const [matchedA, matchedB] = await Promise.all([waitFor(a, 'race:matched'), waitFor(b, 'race:matched')]);
    expect(matchedA.lobbyId).toBe(matchedB.lobbyId);
    expect(matchedA.players.map(p => p.userId).sort()).toEqual([identityA.userId, identityB.userId].sort());
    const lobbyId = matchedA.lobbyId;

    const [voteStartA, voteStartB] = await Promise.all([waitFor(a, 'race:vote_start'), waitFor(b, 'race:vote_start')]);
    expect(voteStartA.options).toHaveLength(3);
    expect(voteStartA.options[0]).toMatchObject({ id: expect.any(String), title: expect.any(String), author: expect.any(String), type: expect.any(String) });
    expect(voteStartA.options.map(o => o.id)).toEqual(voteStartB.options.map(o => o.id));

    const chosenTrackId = voteStartA.options[0].id;
    // Both vote for the same option — should finalize immediately rather than waiting out voteMs.
    a.emit('race:vote', { lobbyId, trackId: chosenTrackId });
    b.emit('race:vote', { lobbyId, trackId: chosenTrackId });

    const [countdownA, countdownB] = await Promise.all([waitFor(a, 'race:countdown_start'), waitFor(b, 'race:countdown_start')]);
    expect(countdownA.startsAt).toBeGreaterThan(Date.now());
    expect(countdownA.startsAt).toBe(countdownB.startsAt);

    const [payloadA, payloadB] = await Promise.all([waitFor(a, 'race:payload'), waitFor(b, 'race:payload')]);
    expect(payloadA.content).toBe(payloadB.content);
    expect(payloadA.title.length).toBeGreaterThan(0);

    await Promise.all([waitFor(a, 'race:start'), waitFor(b, 'race:start')]);

    // A finishes first, B second — A should place 1st.
    const bOpponentUpdate = waitFor(b, 'race:opponent_update');
    a.emit('race:progress', { lobbyId, progress: 100, wpm: 95, accuracy: 98 });
    const update = await bOpponentUpdate;
    expect(update.userId).toBe(identityA.userId);
    expect(update.progress).toBe(100);

    await new Promise(r => setTimeout(r, 20)); // ensure distinct finish timestamps
    const [overA, overB] = await Promise.all([
      waitFor(a, 'race:over'),
      waitFor(b, 'race:over'),
      (async () => b.emit('race:progress', { lobbyId, progress: 100, wpm: 70, accuracy: 94 }))(),
    ]);

    expect(overA.results).toEqual(overB.results);
    const placedA = overA.results.find(r => r.userId === identityA.userId);
    const placedB = overA.results.find(r => r.userId === identityB.userId);
    expect(placedA.placement).toBe(1);
    expect(placedB.placement).toBe(2);
    expect(placedA.eloDelta).toBeGreaterThan(0); // registered user, 1st place
    expect(placedB.eloDelta).toBe(0);            // guest never gets MMR

    // Registered user's MMR/wallet should now be persisted.
    const updatedUser = await db.findUserById(registeredUser.id);
    expect(updatedUser.mmr).toBeGreaterThan(1000);
    expect(updatedUser.wallet).toBeGreaterThan(0);
  }, 10000);

  it('flags an implausible wpm as suspicious without crashing the race', async () => {
    const a = connect({});
    const b = connect({});
    await Promise.all([waitFor(a, 'auth:identity'), waitFor(b, 'auth:identity')]);
    a.emit('race:queue'); b.emit('race:queue');
    const matchedA = await waitFor(a, 'race:matched');
    const lobbyId = matchedA.lobbyId;

    const voteStartA = await waitFor(a, 'race:vote_start');
    await waitFor(b, 'race:vote_start');
    const trackId = voteStartA.options[0].id;
    a.emit('race:vote', { lobbyId, trackId });
    b.emit('race:vote', { lobbyId, trackId });

    await Promise.all([waitFor(a, 'race:countdown_start'), waitFor(b, 'race:countdown_start')]);
    await Promise.all([waitFor(a, 'race:payload'), waitFor(b, 'race:payload')]);
    await Promise.all([waitFor(a, 'race:start'), waitFor(b, 'race:start')]);

    // The event carries no payload (matching the client's listener, which
    // takes none) — resolving at all, instead of timing out, is the assertion.
    const warning = waitFor(a, 'race:anticheat_warning');
    a.emit('race:progress', { lobbyId, progress: 100, wpm: 9001, accuracy: 100 });
    await warning;

    b.emit('race:progress', { lobbyId, progress: 100, wpm: 70, accuracy: 90 });
    const over = await waitFor(a, 'race:over');
    // wpm should be capped at MAX_PLAUSIBLE_WPM (250), not the spoofed 9001
    expect(Math.max(...over.results.map(r => r.wpm))).toBeLessThanOrEqual(250);
  }, 10000);
});
