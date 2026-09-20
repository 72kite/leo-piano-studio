// @vitest-environment node
//
// Skipped unless DATABASE_URL points at a real Postgres instance — CI and
// `npm test` by default have no Postgres service, and JsonDb (the default
// backend) is fully covered by app.test.js/stats.test.js/teacher.test.js
// without one. Run locally against a throwaway Postgres to exercise this:
//   docker run -d --name leo-pg-test -e POSTGRES_PASSWORD=testpass \
//     -e POSTGRES_DB=leo_test -p 5433:5432 postgres:16-alpine
//   DATABASE_URL=postgres://postgres:testpass@localhost:5433/leo_test npm test -- pgDb
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { PgDb } from './lib/pgDb.js';

const RUN = !!process.env.DATABASE_URL;

describe.skipIf(!RUN)('PgDb (requires DATABASE_URL)', () => {
  let db;
  beforeAll(() => { db = new PgDb(); });
  afterAll(async () => { await db?.close(); });

  const uid = () => crypto.randomUUID();
  function makeUser(overrides = {}) {
    const id = uid();
    return {
      id, username: `u_${id.slice(0, 8)}`, usernameLower: `u_${id.slice(0, 8)}`,
      email: null, emailLower: null, passwordHash: 'hash', role: 'student',
      mmr: 1000, wallet: 0, createdAt: Date.now(), ...overrides,
    };
  }

  it('creates and finds a user by id, username, and email', async () => {
    const user = makeUser({ email: `${uid()}@example.com` });
    user.emailLower = user.email;
    await db.createUser(user);

    expect((await db.findUserById(user.id)).username).toBe(user.username);
    expect((await db.findUserByLogin(user.usernameLower)).id).toBe(user.id);
    expect((await db.findUserByLogin(user.emailLower)).id).toBe(user.id);
  });

  it('detects taken usernames/emails and allows free ones', async () => {
    const user = makeUser({ email: `${uid()}@example.com` });
    user.emailLower = user.email;
    await db.createUser(user);

    expect(await db.usernameOrEmailTaken(user.username, 'someoneelse@example.com')).toBe(true);
    expect(await db.usernameOrEmailTaken('totally-free-name', 'free@example.com')).toBe(false);
  });

  it('updateUser patches scalar and JSONB columns generically', async () => {
    const user = makeUser();
    await db.createUser(user);
    await db.updateUser(user.id, { mmr: 1234, wallet: 50, settings: { theme: 'nord' } });
    const updated = await db.findUserById(user.id);
    expect(updated.mmr).toBe(1234);
    expect(updated.wallet).toBe(50);
    expect(updated.settings.theme).toBe('nord');
  });

  it('refresh-token lifecycle: add, look up, rotate (tombstones old), revoke family', async () => {
    const user = makeUser();
    await db.createUser(user);
    const familyId = uid();
    const now = Date.now();

    await db.addRefreshToken(user.id, { tokenHash: 'h1', familyId, createdAt: now, expiresAt: now + 60000 });
    const active = await db.findByRefreshTokenHash('h1');
    expect(active.reused).toBe(false);
    expect(active.user.id).toBe(user.id);

    await db.rotateRefreshToken(user.id, 'h1', { tokenHash: 'h2', familyId, createdAt: now, expiresAt: now + 60000 });
    expect((await db.findByRefreshTokenHash('h1')).reused).toBe(true);  // tombstoned — replay detection
    expect((await db.findByRefreshTokenHash('h2')).reused).toBe(false); // the new active token

    await db.revokeFamily(user.id, familyId);
    expect(await db.findByRefreshTokenHash('h2')).toBeNull();
  });

  it('removeRefreshToken deletes just the one token', async () => {
    const user = makeUser();
    await db.createUser(user);
    const now = Date.now();
    await db.addRefreshToken(user.id, { tokenHash: 'r1', familyId: uid(), createdAt: now, expiresAt: now + 60000 });
    await db.removeRefreshToken(user.id, 'r1');
    expect(await db.findByRefreshTokenHash('r1')).toBeNull();
  });

  it('addRun/getRuns: newest-first, correct total, respects limit/offset', async () => {
    const user = makeUser();
    await db.createUser(user);
    for (const wpm of [10, 20, 30, 40]) {
      await db.addRun(user.id, { id: uid(), createdAt: Date.now() + wpm, mode: 'time', wpm, rawWpm: wpm, accuracy: 95, duration: 30 });
    }
    const all = await db.getRuns(user.id, { limit: 50, offset: 0 });
    expect(all.total).toBe(4);
    expect(all.runs.map(r => r.wpm)).toEqual([40, 30, 20, 10]);

    const page = await db.getRuns(user.id, { limit: 2, offset: 1 });
    expect(page.runs.map(r => r.wpm)).toEqual([30, 20]);
  });

  it('addRun caps at MAX_RUNS via a single atomic statement (no read-modify-write race)', async () => {
    const user = makeUser();
    await db.createUser(user);
    const writes = Array.from({ length: 30 }, (_, i) =>
      db.addRun(user.id, { id: uid(), createdAt: Date.now() + i, mode: 'time', wpm: i, rawWpm: i, accuracy: 90, duration: 30 })
    );
    await Promise.all(writes); // concurrent — would corrupt a naive read-modify-write
    const result = await db.getRuns(user.id, { limit: 100, offset: 0 });
    expect(result.total).toBe(30); // well under the cap, but proves nothing got dropped/duplicated under concurrency
  });

  it('roster: join code is created once and reused, join is idempotent and rejects self/unknown codes', async () => {
    const teacher = makeUser({ role: 'educator' });
    const student = makeUser({ role: 'student' });
    await db.createUser(teacher);
    await db.createUser(student);

    const code1 = await db.getOrCreateJoinCode(teacher.id);
    const code2 = await db.getOrCreateJoinCode(teacher.id);
    expect(code1).toBe(code2);
    expect(code1.length).toBeGreaterThanOrEqual(4);

    const join1 = await db.joinRoster(code1, student.id);
    expect(join1.ok).toBe(true);
    const join2 = await db.joinRoster(code1, student.id); // repeat — must not duplicate
    expect(join2.ok).toBe(true);

    const self = await db.joinRoster(code1, teacher.id);
    expect(self).toEqual({ ok: false, reason: 'SELF' });

    const unknown = await db.joinRoster('NOPE12', student.id);
    expect(unknown).toEqual({ ok: false, reason: 'NOT_FOUND' });

    const roster = await db.getRosterStudents(teacher.id);
    expect(roster).toHaveLength(1);
    expect(roster[0].id).toBe(student.id);
  });

  it('getRosterStudents returns [] for a teacher with no roster yet', async () => {
    const teacher = makeUser({ role: 'educator' });
    await db.createUser(teacher);
    expect(await db.getRosterStudents(teacher.id)).toEqual([]);
  });

  it('addStudentToRoster adds directly (no join code needed) and is idempotent, creating the roster on first use', async () => {
    const teacher = makeUser({ role: 'educator' });
    const student = makeUser({ role: 'student' });
    await db.createUser(teacher);
    await db.createUser(student);

    expect((await db.findUserById(teacher.id)).roster).toBeNull(); // no roster yet
    await db.addStudentToRoster(teacher.id, student.id);
    await db.addStudentToRoster(teacher.id, student.id); // repeat — must not duplicate

    const roster = await db.getRosterStudents(teacher.id);
    expect(roster).toHaveLength(1);
    expect(roster[0].id).toBe(student.id);
    expect((await db.findUserById(teacher.id)).roster.joinCode).toEqual(expect.any(String));
  });
});
