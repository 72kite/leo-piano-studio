// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { attachRaceServer } from '../race/socket.js';
import { attachSessionServer } from './socket.js';
import { JsonDb } from '../lib/db.js';
import { signAccessToken, hashPassword } from '../lib/security.js';

process.env.JWT_SECRET = 'c'.repeat(32);

function waitFor(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });
}

// Asserts an event does NOT arrive within `ms` — used to prove a broadcast
// was correctly scoped (unrostered student) or correctly rejected (non-
// educator sender, invalid payload).
function neverEmits(socket, event, ms = 400) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    socket.once(event, () => { clearTimeout(t); reject(new Error(`unexpectedly received "${event}"`)); });
  });
}

let httpServer, port, db, dbFile;
let educator, student1, student2, unrelatedTeacher, student3;
let educatorToken, student1Token, student2Token;

beforeAll(async () => {
  dbFile = path.join(os.tmpdir(), `leo-session-test-db-${crypto.randomUUID()}.json`);
  db = new JsonDb(dbFile);

  const passwordHash = await hashPassword('irrelevant-for-this-test');
  const baseUser = (overrides) => ({
    id: crypto.randomUUID(),
    email: null, emailLower: null,
    passwordHash,
    mmr: 1000, wallet: 0,
    createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [],
    ...overrides,
  });

  educator = baseUser({ username: 'ms_rivera', usernameLower: 'ms_rivera', role: 'educator' });
  student1 = baseUser({ username: 'student_one', usernameLower: 'student_one', role: 'student' });
  student2 = baseUser({ username: 'student_two', usernameLower: 'student_two', role: 'student' }); // never rostered
  unrelatedTeacher = baseUser({ username: 'mr_lopez', usernameLower: 'mr_lopez', role: 'educator' });
  student3 = baseUser({ username: 'student_three', usernameLower: 'student_three', role: 'student' }); // unrelatedTeacher's own roster

  for (const u of [educator, student1, student2, unrelatedTeacher, student3]) await db.createUser(u);
  await db.addStudentToRoster(educator.id, student1.id);        // only student1 is on educator's roster
  await db.addStudentToRoster(unrelatedTeacher.id, student3.id); // unrelatedTeacher has a real roster, just not student1

  educatorToken = signAccessToken(educator);
  student1Token = signAccessToken(student1);
  student2Token = signAccessToken(student2);

  httpServer = createServer();
  const io = attachRaceServer(httpServer, { db, lobbySize: 4, corsOrigin: 'http://localhost:5173' });
  attachSessionServer(io, { db });
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

function connect(token) {
  const client = ioClient(`http://localhost:${port}`, { auth: { token }, transports: ['websocket'], forceNew: true });
  openClients.push(client);
  return client;
}

const LOCK_PAYLOAD = { lockedModes: ['piano', 'race'], screenLocked: true, maskUsernames: true, chatDisabled: false };

describe('session-lock socket server', () => {
  it('broadcasts a teacher\'s lock only to their own connected, rostered students', async () => {
    const teacherSocket  = connect(educatorToken);
    const rosteredSocket = connect(student1Token);
    const otherSocket    = connect(student2Token);

    await Promise.all([
      waitFor(teacherSocket, 'auth:identity'),
      waitFor(rosteredSocket, 'auth:identity'),
      waitFor(otherSocket, 'auth:identity'),
    ]);

    teacherSocket.emit('session:set_modes', LOCK_PAYLOAD);

    const [received] = await Promise.all([
      waitFor(rosteredSocket, 'session:modes_locked'),
      neverEmits(otherSocket, 'session:modes_locked'),
    ]);
    expect(received).toEqual(LOCK_PAYLOAD);
  });

  it('rejects a broadcast from a non-educator', async () => {
    const senderSocket   = connect(student2Token); // student, not educator
    const rosteredSocket = connect(student1Token);
    await Promise.all([waitFor(senderSocket, 'auth:identity'), waitFor(rosteredSocket, 'auth:identity')]);

    senderSocket.emit('session:set_modes', LOCK_PAYLOAD);
    await neverEmits(rosteredSocket, 'session:modes_locked');
  });

  it('ignores a payload with an invalid lockedModes value', async () => {
    const teacherSocket  = connect(educatorToken);
    const rosteredSocket = connect(student1Token);
    await Promise.all([waitFor(teacherSocket, 'auth:identity'), waitFor(rosteredSocket, 'auth:identity')]);

    teacherSocket.emit('session:set_modes', { ...LOCK_PAYLOAD, lockedModes: ['not-a-real-mode'] });
    await neverEmits(rosteredSocket, 'session:modes_locked');
  });

  it('never broadcasts to a different educator\'s roster', async () => {
    const otherTeacherSocket = connect(signAccessToken(unrelatedTeacher));
    const rosteredSocket     = connect(student1Token); // rostered to `educator`, not `unrelatedTeacher`
    await Promise.all([waitFor(otherTeacherSocket, 'auth:identity'), waitFor(rosteredSocket, 'auth:identity')]);

    otherTeacherSocket.emit('session:set_modes', LOCK_PAYLOAD);
    await neverEmits(rosteredSocket, 'session:modes_locked');
  });
});
