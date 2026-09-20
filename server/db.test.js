// @vitest-environment node
//
// Caught live: a burst of rapid sequential writes (POST
// /api/teacher/accounts/bulk creating several accounts back-to-back) threw
// EPERM on Windows during JsonDb._persist's rename step — something
// (antivirus/indexing) transiently holding a handle on the destination
// path right as it's renamed onto. POSIX rename doesn't have this
// problem, so this never reproduces on the Linux container this actually
// deploys in, but it's real for local Windows dev.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { JsonDb } from './lib/db.js';

function freshDbPath() {
  return path.join(os.tmpdir(), `leo-db-test-${crypto.randomUUID()}.json`);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('JsonDb._persist rename retry', () => {
  it('retries a transient EPERM on rename and eventually succeeds', async () => {
    const db = new JsonDb(freshDbPath());
    // Bootstrap the empty-file write (JsonDb._load's own first-time
    // _persist) with the real, unmocked rename — otherwise it eats into
    // the call count below before the write under test even happens.
    await db.findUserById('nobody');

    const realRename = fs.rename.bind(fs);
    let calls = 0;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      calls++;
      if (calls < 3) {
        const err = new Error('EPERM: operation not permitted, rename');
        err.code = 'EPERM';
        throw err;
      }
      return realRename(from, to);
    });

    const user = { id: 'u1', username: 'a', usernameLower: 'a', role: 'student', mmr: 1000, wallet: 0, createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [] };
    await db.createUser(user); // must not throw despite the first two rename attempts failing

    expect(calls).toBe(3);
    expect(await db.findUserById('u1')).toMatchObject({ username: 'a' });
  });

  it('gives up after exhausting retries, cleans up the tmp file, and surfaces the error', async () => {
    const dbPath = freshDbPath();
    const db = new JsonDb(dbPath);
    vi.spyOn(fs, 'rename').mockImplementation(async () => {
      const err = new Error('EPERM: operation not permitted, rename');
      err.code = 'EPERM';
      throw err;
    });

    const user = { id: 'u1', username: 'a', usernameLower: 'a', role: 'student', mmr: 1000, wallet: 0, createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [] };
    await expect(db.createUser(user)).rejects.toThrow(/EPERM/);

    // No leftover .tmp files next to the target path.
    const dir = path.dirname(dbPath);
    const leftovers = (await fs.readdir(dir)).filter(f => f.startsWith(path.basename(dbPath)) && f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('does not retry a non-transient error', async () => {
    const db = new JsonDb(freshDbPath());
    vi.spyOn(fs, 'rename').mockImplementation(async () => {
      const err = new Error('ENOSPC: no space left on device');
      err.code = 'ENOSPC';
      throw err;
    });

    const user = { id: 'u1', username: 'a', usernameLower: 'a', role: 'student', mmr: 1000, wallet: 0, createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [] };
    await expect(db.createUser(user)).rejects.toThrow(/ENOSPC/);
    expect(fs.rename).toHaveBeenCalledTimes(1); // no retry loop wasted on a hopeless error
  });
});

describe('JsonDb under a rapid write burst (real filesystem, no mocking)', () => {
  it('survives 20 back-to-back writes to the same store without dropping or corrupting any', async () => {
    const db = new JsonDb(freshDbPath());
    const teacher = { id: 'teacher1', username: 't', usernameLower: 't', role: 'educator', mmr: 1000, wallet: 0, createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [] };
    await db.createUser(teacher);

    // Mirrors the real bulk-accounts route: createUser then addStudentToRoster,
    // sequentially, many times in a row — the exact pattern that surfaced the bug.
    for (let i = 0; i < 20; i++) {
      const student = { id: `s${i}`, username: `s${i}`, usernameLower: `s${i}`, role: 'student', mmr: 1000, wallet: 0, createdAt: Date.now(), refreshTokens: [], usedRefreshTokens: [] };
      await db.createUser(student);
      await db.addStudentToRoster('teacher1', student.id);
    }

    const roster = await db.getRosterStudents('teacher1');
    expect(roster).toHaveLength(20);
    expect(new Set(roster.map(s => s.id)).size).toBe(20); // none dropped, none duplicated
  });
});
