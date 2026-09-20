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

async function registeredUser(app, overrides = {}) {
  const res = await request(app).post('/api/auth/register').send({
    username: 'runlogger',
    email: 'runlogger@example.com',
    password: VALID_PASSWORD,
    role: 'student',
    ...overrides,
  });
  return { token: res.body.accessToken, userId: res.body.user.userId };
}

function sampleRun(overrides = {}) {
  return {
    mode: 'time',
    wpm: 72,
    rawWpm: 80,
    accuracy: 96.5,
    duration: 30,
    timeLimit: 30,
    language: 'en',
    consistency: 88,
    ...overrides,
  };
}

describe('POST /api/stats/runs', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = agent();
    const res = await request(app).post('/api/stats/runs').send(sampleRun());
    expect(res.status).toBe(401);
  });

  it('rejects a payload with an implausible wpm', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);
    const res = await request(app)
      .post('/api/stats/runs')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleRun({ wpm: 9001 }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown mode', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);
    const res = await request(app)
      .post('/api/stats/runs')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleRun({ mode: 'sprint' }));
    expect(res.status).toBe(400);
  });

  it('persists a valid run and returns it with a generated id', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);
    const res = await request(app)
      .post('/api/stats/runs')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleRun());

    expect(res.status).toBe(201);
    expect(res.body.run).toEqual(expect.objectContaining({
      id: expect.any(String),
      createdAt: expect.any(Number),
      mode: 'time',
      wpm: 72,
    }));
  });
});

describe('GET /api/stats/runs', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = agent();
    const res = await request(app).get('/api/stats/runs');
    expect(res.status).toBe(401);
  });

  it('returns saved runs newest-first with a total count', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);

    for (const wpm of [60, 70, 80]) {
      await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${token}`).send(sampleRun({ wpm }));
    }

    const res = await request(app).get('/api/stats/runs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.runs.map(r => r.wpm)).toEqual([80, 70, 60]);
  });

  it('respects limit and offset', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);
    for (const wpm of [10, 20, 30, 40]) {
      await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${token}`).send(sampleRun({ wpm }));
    }

    const res = await request(app).get('/api/stats/runs?limit=2&offset=1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.runs.map(r => r.wpm)).toEqual([30, 20]);
  });
});

describe('GET /api/stats/summary', () => {
  it('reports zeroes with an empty trend for a user with no runs', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);
    const res = await request(app).get('/api/stats/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ totalRuns: 0, bestWpm: 0, avgWpm: 0, avgAccuracy: 0, trend: [], lastRunAt: null });
  });

  it('aggregates best/avg wpm and accuracy across runs', async () => {
    const { app } = agent();
    const { token } = await registeredUser(app);
    await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${token}`).send(sampleRun({ wpm: 60, accuracy: 90 }));
    await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${token}`).send(sampleRun({ wpm: 90, accuracy: 98 }));

    const res = await request(app).get('/api/stats/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalRuns).toBe(2);
    expect(res.body.bestWpm).toBe(90);
    expect(res.body.avgWpm).toBe(75);
    expect(res.body.avgAccuracy).toBe(94);
    expect(res.body.trend).toHaveLength(2);
  });

  it('scopes stats to the requesting user only', async () => {
    const { app } = agent();
    const a = await registeredUser(app, { username: 'alice', email: 'alice@example.com' });
    const b = await registeredUser(app, { username: 'bob', email: 'bob@example.com' });

    await request(app).post('/api/stats/runs').set('Authorization', `Bearer ${a.token}`).send(sampleRun({ wpm: 100 }));

    const res = await request(app).get('/api/stats/summary').set('Authorization', `Bearer ${b.token}`);
    expect(res.body.totalRuns).toBe(0);
  });
});
