// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { attachRaceServer } from '../race/socket.js';
import { attachMidiRaceServer } from './socket.js';
import { JsonDb } from '../lib/db.js';
import { signAccessToken, hashPassword } from '../lib/security.js';
import { PIECE_POOL } from './pieces.js';

process.env.JWT_SECRET = 'd'.repeat(32);

const TIMINGS = {
  matchmakeDelayMs: 20,
  countdownMs: 100,
  resultsTimeoutMs: 5000,
};

function waitFor(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

let httpServer, port, db, dbFile, playerA, playerB, tokenA;

beforeAll(async () => {
  dbFile = path.join(os.tmpdir(), `leo-midirace-test-db-${crypto.randomUUID()}.json`);
  db = new JsonDb(dbFile);

  const passwordHash = await hashPassword('irrelevant-for-this-test');
  playerA = {
    id: crypto.randomUUID(), username: 'pianist_a', usernameLower: 'pianist_a',
    email: null, emailLower: null, passwordHash, role: 'student', mmr: 1000, wallet: 0,
    createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [],
  };
  await db.createUser(playerA);
  tokenA = signAccessToken(playerA);

  httpServer = createServer();
  const io = attachRaceServer(httpServer, { db, lobbySize: 99, corsOrigin: 'http://localhost:5173' }); // lobbySize 99 so the race server itself never matches during these tests
  attachMidiRaceServer(io, { db, lobbySize: 2, timings: TIMINGS });
  await new Promise(resolve => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  httpServer.closeAllConnections?.();
  await new Promise(resolve => httpServer.close(resolve));
  await fs.rm(dbFile, { force: true });
});

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

describe('midi race socket server — full lifecycle', () => {
  it('takes two players from queue through a scored finish to persisted MMR/wallet', async () => {
    const a = connect({ token: tokenA }); // registered user
    const b = connect({});                 // guest

    const [identityA, identityB] = await Promise.all([waitFor(a, 'auth:identity'), waitFor(b, 'auth:identity')]);
    expect(identityA.userId).toBe(playerA.id);
    expect(identityB.userId).toMatch(/^guest_/);

    a.emit('midirace:queue');
    b.emit('midirace:queue');

    const [matchedA, matchedB] = await Promise.all([waitFor(a, 'midirace:matched'), waitFor(b, 'midirace:matched')]);
    expect(matchedA.lobbyId).toBe(matchedB.lobbyId);
    expect(matchedA.players.map(p => p.userId).sort()).toEqual([identityA.userId, identityB.userId].sort());
    expect(PIECE_POOL.some(p => p.id === matchedA.pieceId)).toBe(true);
    expect(matchedA.pieceId).toBe(matchedB.pieceId); // both players get the SAME piece
    const lobbyId = matchedA.lobbyId;

    const [countdownA, countdownB] = await Promise.all([waitFor(a, 'midirace:countdown_start'), waitFor(b, 'midirace:countdown_start')]);
    expect(countdownA.startsAt).toBe(countdownB.startsAt);
    expect(countdownA.startsAt).toBeGreaterThan(Date.now());

    await Promise.all([waitFor(a, 'midirace:start'), waitFor(b, 'midirace:start')]);

    // A plays it well, B plays it badly.
    a.emit('midirace:finish', { lobbyId, score: 92, hits: 27, totalNotes: 28 });
    b.emit('midirace:finish', { lobbyId, score: 41, hits: 12, totalNotes: 28 });

    const [overA, overB] = await Promise.all([waitFor(a, 'midirace:over'), waitFor(b, 'midirace:over')]);
    expect(overA.results).toEqual(overB.results);

    const winner = overA.results.find(r => r.placement === 1);
    const loser  = overA.results.find(r => r.placement === 2);
    expect(winner.userId).toBe(identityA.userId); // higher score wins, not who finished first
    expect(winner.score).toBe(92);
    expect(loser.score).toBe(41);
    expect(winner.eloDelta).toBeGreaterThan(0);
    expect(loser.eloDelta).toBe(0); // guest — no account to persist MMR to

    const updatedA = await db.findUserById(playerA.id);
    expect(updatedA.mmr).toBe(1000 + winner.eloDelta);
    expect(updatedA.wallet).toBe(winner.coins);
  });

  it('clamps a self-reported score above 100 and flags it suspicious', async () => {
    const a = connect({ token: tokenA });
    const b = connect({});
    const [identityA] = await Promise.all([waitFor(a, 'auth:identity'), waitFor(b, 'auth:identity')]);

    a.emit('midirace:queue');
    b.emit('midirace:queue');
    const matchedA = await waitFor(a, 'midirace:matched');
    await Promise.all([waitFor(a, 'midirace:start'), waitFor(b, 'midirace:start')]);

    a.emit('midirace:finish', { lobbyId: matchedA.lobbyId, score: 250, hits: 500, totalNotes: 28 });
    await waitFor(a, 'midirace:anticheat_warning'); // fires regardless of payload — just proves the flag tripped

    b.emit('midirace:finish', { lobbyId: matchedA.lobbyId, score: 50, hits: 14, totalNotes: 28 });
    const over = await waitFor(a, 'midirace:over');
    const aResult = over.results.find(r => r.userId === identityA.userId);
    expect(aResult.score).toBe(100); // clamped from 250
    expect(aResult.hits).toBe(28);   // clamped to totalNotes
  });
});
