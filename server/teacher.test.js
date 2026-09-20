// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createApp } from './app.js';
import { JsonDb } from './lib/db.js';

process.env.JWT_SECRET = 'a'.repeat(32);
process.env.CORS_ORIGIN = 'http://localhost:5173';

const dbFiles = [];
function freshDb() {
  const file = path.join(os.tmpdir(), `leo-test-db-${crypto.randomUUID()}.json`);
  dbFiles.push(file);
  return new JsonDb(file);
}

afterAll(async () => {
  await Promise.all(dbFiles.map(f => fs.rm(f, { force: true })));
});

function agent(db = freshDb()) {
  return { app: createApp({ db }), db };
}

const VALID_PASSWORD = 'correct horse battery';
let seq = 0;

async function registeredUser(app, overrides = {}) {
  seq += 1;
  const res = await request(app).post('/api/auth/register').send({
    username: `user${seq}`,
    email: `user${seq}@example.com`,
    password: VALID_PASSWORD,
    role: 'student',
    ...overrides,
  });
  return { token: res.body.accessToken, userId: res.body.user.userId };
}

function sampleRun(overrides = {}) {
  return {
    mode: 'time', wpm: 72, rawWpm: 80, accuracy: 96.5, duration: 30,
    timeLimit: 30, language: 'en', consistency: 88, ...overrides,
  };
}

describe('GET /api/teacher/roster', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = agent();
    const res = await request(app).get('/api/teacher/roster');
    expect(res.status).toBe(401);
  });

  it('rejects a student caller', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'student' });
    const res = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('creates a join code on first request and reuses it after', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'educator' });

    const first  = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${token}`);
    const second = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(first.body.joinCode).toEqual(expect.any(String));
    expect(first.body.joinCode.length).toBeGreaterThanOrEqual(4);
    expect(second.body.joinCode).toBe(first.body.joinCode);
    expect(first.body.students).toEqual([]);
  });

  it('aggregates each roster student\'s stats', async () => {
    const { app } = agent();
    const teacher = await registeredUser(app, { role: 'educator' });
    const student = await registeredUser(app, { role: 'student' });

    const { body: { joinCode } } = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacher.token}`);
    await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${student.token}`).send({ joinCode });

    await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${student.token}`).send(sampleRun({ wpm: 60, accuracy: 90 }));
    await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${student.token}`).send(sampleRun({ wpm: 90, accuracy: 98 }));

    const res = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacher.token}`);
    expect(res.status).toBe(200);
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0]).toEqual(expect.objectContaining({
      userId: student.userId, username: expect.any(String),
      totalRuns: 2, bestWpm: 90, avgWpm: 75, avgAccuracy: 94,
    }));
  });

  it('does not leak students from another teacher\'s roster', async () => {
    const { app } = agent();
    const teacherA = await registeredUser(app, { role: 'educator' });
    const teacherB = await registeredUser(app, { role: 'educator' });
    const student  = await registeredUser(app, { role: 'student' });

    const { body: { joinCode } } = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacherA.token}`);
    await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${student.token}`).send({ joinCode });

    const resB = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacherB.token}`);
    expect(resB.body.students).toEqual([]);
  });
});

describe('POST /api/teacher/roster/join', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = agent();
    const res = await request(app).post('/api/teacher/roster/join').send({ joinCode: 'ABCD12' });
    expect(res.status).toBe(401);
  });

  it('rejects an educator caller', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'educator' });
    const res = await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${token}`).send({ joinCode: 'ABCD12' });
    expect(res.status).toBe(403);
  });

  it('rejects an unknown join code', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'student' });
    const res = await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${token}`).send({ joinCode: 'ZZZZZZ' });
    expect(res.status).toBe(404);
  });

  it('joins successfully and is idempotent on repeat', async () => {
    const { app } = agent();
    const teacher = await registeredUser(app, { role: 'educator' });
    const student = await registeredUser(app, { role: 'student' });

    const { body: { joinCode } } = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacher.token}`);

    const first  = await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${student.token}`).send({ joinCode });
    const second = await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${student.token}`).send({ joinCode });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const roster = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacher.token}`);
    expect(roster.body.students).toHaveLength(1); // not duplicated
  });

  it('accepts the join code case-insensitively', async () => {
    const { app } = agent();
    const teacher = await registeredUser(app, { role: 'educator' });
    const student = await registeredUser(app, { role: 'student' });

    const { body: { joinCode } } = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacher.token}`);
    const res = await request(app).post('/api/teacher/roster/join').set('Authorization', `Bearer ${student.token}`).send({ joinCode: joinCode.toLowerCase() });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/teacher/accounts/bulk', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = agent();
    const res = await request(app).post('/api/teacher/accounts/bulk').send({ count: 3 });
    expect(res.status).toBe(401);
  });

  it('rejects a student caller', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'student' });
    const res = await request(app).post('/api/teacher/accounts/bulk').set('Authorization', `Bearer ${token}`).send({ count: 3 });
    expect(res.status).toBe(403);
  });

  it('rejects an out-of-range count', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'educator' });
    const res = await request(app).post('/api/teacher/accounts/bulk').set('Authorization', `Bearer ${token}`).send({ count: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('creates the requested number of unique accounts, each usable to log in, and adds them to the roster', async () => {
    const { app } = agent();
    const teacher = await registeredUser(app, { role: 'educator' });

    const res = await request(app).post('/api/teacher/accounts/bulk')
      .set('Authorization', `Bearer ${teacher.token}`)
      .send({ count: 3, prefix: 'batch' });

    expect(res.status).toBe(201);
    expect(res.body.accounts).toHaveLength(3);
    const usernames = res.body.accounts.map(a => a.username);
    expect(new Set(usernames).size).toBe(3); // no collisions within the batch
    usernames.forEach(u => expect(u.startsWith('batch_')).toBe(true));

    // Every generated password actually logs the account in.
    const [first] = res.body.accounts;
    const login = await request(app).post('/api/auth/login').send({ identifier: first.username, password: first.password });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('student');

    const roster = await request(app).get('/api/teacher/roster').set('Authorization', `Bearer ${teacher.token}`);
    expect(roster.body.students).toHaveLength(3);
    expect(roster.body.students.map(s => s.username).sort()).toEqual(usernames.sort());
  });

  it('defaults the prefix to "student" when none is given', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app, { role: 'educator' });
    const res = await request(app).post('/api/teacher/accounts/bulk').set('Authorization', `Bearer ${token}`).send({ count: 1 });
    expect(res.status).toBe(201);
    expect(res.body.accounts[0].username.startsWith('student_')).toBe(true);
  });
});
