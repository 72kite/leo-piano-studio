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

async function registerUser(app, overrides = {}) {
  return request(app).post('/api/auth/register').send({
    username: 'keyzero',
    email: 'keyzero@example.com',
    password: VALID_PASSWORD,
    role: 'student',
    ...overrides,
  });
}

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const { app } = agent();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('CORS', () => {
  it('reflects an allowed origin', async () => {
    const { app } = agent();
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('omits CORS headers for a disallowed origin', async () => {
    const { app } = agent();
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns tokens matching the client contract', async () => {
    const { app } = agent();
    const res = await registerUser(app);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      userId: expect.any(String),
      username: 'keyzero',
      role: 'student',
      mmr: 1000,
      wallet: 0,
    });
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('never returns the password or its hash', async () => {
    const { app } = agent();
    const res = await registerUser(app);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/passwordHash/i);
    expect(raw.toLowerCase()).not.toContain(VALID_PASSWORD.toLowerCase());
  });

  it('rejects a duplicate username case-insensitively', async () => {
    const { app } = agent();
    await registerUser(app);
    const res = await registerUser(app, { username: 'KeyZero', email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USERNAME_TAKEN');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const { app } = agent();
    const res = await registerUser(app, { password: 'short1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects a username starting with "guest_"', async () => {
    const { app } = agent();
    const res = await registerUser(app, { username: 'guest_hacker' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid role instead of silently accepting it', async () => {
    const { app } = agent();
    const res = await registerUser(app, { role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized request body', async () => {
    const { app } = agent();
    const res = await registerUser(app, { username: 'a'.repeat(20), email: `${'x'.repeat(20000)}@example.com` });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with username or email and issues fresh tokens', async () => {
    const { app } = agent();
    await registerUser(app);

    const byUsername = await request(app).post('/api/auth/login')
      .send({ identifier: 'keyzero', password: VALID_PASSWORD });
    expect(byUsername.status).toBe(200);

    const byEmail = await request(app).post('/api/auth/login')
      .send({ identifier: 'keyzero@example.com', password: VALID_PASSWORD });
    expect(byEmail.status).toBe(200);
    expect(byEmail.body.refreshToken).not.toBe(byUsername.body.refreshToken);
  });

  it('rejects a wrong password with a generic error', async () => {
    const { app } = agent();
    await registerUser(app);
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: 'keyzero', password: 'totally wrong password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown identifier with the same generic error (no user enumeration)', async () => {
    const { app } = agent();
    const res = await request(app).post('/api/auth/login')
      .send({ identifier: 'nobody-here', password: 'whatever12345' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /api/auth/refresh — rotation & reuse detection', () => {
  it('rotates the refresh token and the old one stops working', async () => {
    const { app } = agent();
    const reg = await registerUser(app);
    const firstRefresh = reg.body.refreshToken;

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefresh });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refreshToken).not.toBe(firstRefresh);
    expect(typeof rotated.body.accessToken).toBe('string');

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefresh });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('REFRESH_REUSED');
  });

  it('revokes the whole session family on reuse, so the rotated token is also dead', async () => {
    const { app } = agent();
    const reg = await registerUser(app);
    const firstRefresh = reg.body.refreshToken;

    const rotated = await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefresh });
    const secondRefresh = rotated.body.refreshToken;

    // Replaying the retired token should burn the entire family...
    await request(app).post('/api/auth/refresh').send({ refreshToken: firstRefresh });

    // ...so even the legitimately-rotated newest token is now rejected too.
    const afterCompromise = await request(app).post('/api/auth/refresh').send({ refreshToken: secondRefresh });
    expect(afterCompromise.status).toBe(401);
  });

  it('rejects a garbage refresh token', async () => {
    const { app } = agent();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REFRESH_INVALID');
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the given refresh token', async () => {
    const { app } = agent();
    const reg = await registerUser(app);

    const out = await request(app).post('/api/auth/logout').send({ refreshToken: reg.body.refreshToken });
    expect(out.status).toBe(204);

    const afterLogout = await request(app).post('/api/auth/refresh').send({ refreshToken: reg.body.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('is idempotent and never errors on an unknown token', async () => {
    const { app } = agent();
    const res = await request(app).post('/api/auth/logout').send({ refreshToken: 'unknown-token' });
    expect(res.status).toBe(204);
  });
});

describe('PUT /api/profile/settings', () => {
  it('rejects requests with no bearer token', async () => {
    const { app } = agent();
    const res = await request(app).put('/api/profile/settings').send({ theme: 'nord' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed/garbage bearer token', async () => {
    const { app } = agent();
    const res = await request(app).put('/api/profile/settings')
      .set('Authorization', 'Bearer not-a-jwt')
      .send({ theme: 'nord' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid token and persists a whitelisted setting', async () => {
    const { app } = agent();
    const reg = await registerUser(app);

    const res = await request(app).put('/api/profile/settings')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ theme: 'nord' });
    expect(res.status).toBe(204);
  });

  it('rejects an unknown setting key', async () => {
    const { app } = agent();
    const reg = await registerUser(app);

    const res = await request(app).put('/api/profile/settings')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ isAdmin: true });
    expect(res.status).toBe(400);
  });

  it('rejects more than one setting per request', async () => {
    const { app } = agent();
    const reg = await registerUser(app);

    const res = await request(app).put('/api/profile/settings')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ theme: 'nord', font: 'Fira Code' });
    expect(res.status).toBe(400);
  });
});

describe('rate limiting on /api/auth', () => {
  it('returns 429 once the auth limiter budget is exhausted', async () => {
    const original = process.env.AUTH_RATE_LIMIT_MAX;
    process.env.AUTH_RATE_LIMIT_MAX = '3';
    const { app } = agent();

    let last;
    for (let i = 0; i < 4; i++) {
      last = await request(app).post('/api/auth/login').send({ identifier: 'x', password: 'y' });
    }
    expect(last.status).toBe(429);
    expect(last.body.error).toBe('RATE_LIMIT');

    process.env.AUTH_RATE_LIMIT_MAX = original;
  });
});

describe('malformed JSON bodies', () => {
  it('responds 400 instead of crashing', async () => {
    const { app } = agent();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});
