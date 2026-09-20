/**
 * Leo backend — JSON file-backed persistence.
 *
 * This is the "plain" storage tier referenced by the loader that used to
 * live in server.js (leo-server.js vs leo-server-redis.js vs
 * leo-server-postgres.js). It is intentionally simple: a single JSON file,
 * written atomically, with an in-process write queue so concurrent
 * mutations never interleave. Swap this module out for a Postgres/Redis
 * client when that phase of the roadmap starts — every route talks to the
 * store through the functions exported here, not to the file directly.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_DB_FILE = path.join(process.cwd(), 'server', 'data', 'db.json');
const MAX_RUNS = 500; // per-user cap on stored typing-hub run history

function emptyDb() {
  return { users: [] };
}

function pruneUser(user, now) {
  user.refreshTokens = (user.refreshTokens || []).filter(t => t.expiresAt > now);
  user.usedRefreshTokens = (user.usedRefreshTokens || []).filter(t => t.expiresAt > now);
}

export class JsonDb {
  constructor(filePath = process.env.DB_FILE || DEFAULT_DB_FILE) {
    this.filePath = filePath;
    this._queue = Promise.resolve();
    this._cache = null;
  }

  async _load() {
    if (this._cache) return this._cache;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this._cache = JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this._cache = emptyDb();
      await this._persist();
    }
    return this._cache;
  }

  async _persist() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this._cache, null, 2), 'utf8');
    try {
      await this._renameWithRetry(tmp, this.filePath);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  /**
   * Windows can transiently EPERM/EBUSY a rename onto a path something
   * else (antivirus, search indexing) briefly has a handle open on —
   * POSIX rename doesn't have this problem, so in practice this only ever
   * matters for local Windows dev, never the Linux container this actually
   * deploys in. A short retry is the standard mitigation for it (the same
   * approach the write-file-atomic package uses) rather than surfacing a
   * spurious 500 for what's really just a timing hiccup — caught live via
   * a burst of rapid writes (POST /api/teacher/accounts/bulk) that never
   * hit this on Linux but reproduced it immediately on Windows.
   */
  async _renameWithRetry(from, to, attempts = 5, delayMs = 30) {
    for (let i = 0; i < attempts; i++) {
      try {
        await fs.rename(from, to);
        return;
      } catch (err) {
        const transient = err.code === 'EPERM' || err.code === 'EBUSY';
        if (!transient || i === attempts - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }

  /** Serializes every read-modify-write against this store so writes never race. */
  _enqueue(fn) {
    const run = this._queue.then(async () => {
      await this._load();
      return fn(this._cache);
    });
    // swallow errors here so one failed op doesn't wedge the queue for the next caller
    this._queue = run.catch(() => {});
    return run;
  }

  async findUserByLogin(identifier) {
    const id = identifier.trim().toLowerCase();
    const db = await this._load();
    return db.users.find(u => u.usernameLower === id || u.emailLower === id) || null;
  }

  async usernameOrEmailTaken(username, email) {
    const db = await this._load();
    const uLower = username.trim().toLowerCase();
    const eLower = email ? email.trim().toLowerCase() : null;
    return db.users.some(u => u.usernameLower === uLower || (eLower && u.emailLower === eLower));
  }

  async createUser(user) {
    return this._enqueue(db => {
      db.users.push(user);
      return this._persist().then(() => user);
    });
  }

  async findUserById(userId) {
    const db = await this._load();
    return db.users.find(u => u.id === userId) || null;
  }

  async updateUser(userId, patch) {
    return this._enqueue(db => {
      const user = db.users.find(u => u.id === userId);
      if (!user) return null;
      Object.assign(user, patch);
      return this._persist().then(() => user);
    });
  }

  /** Adds a fresh, active refresh-token session (a new login). */
  async addRefreshToken(userId, entry) {
    return this._enqueue(db => {
      const user = db.users.find(u => u.id === userId);
      if (!user) return null;
      pruneUser(user, Date.now());
      user.refreshTokens.push(entry);
      return this._persist().then(() => user);
    });
  }

  /**
   * Looks up which user (if any) owns a refresh-token hash, across both
   * currently-active tokens and the short-lived tombstones left behind by
   * rotation. `reused: true` means the hash matched a tombstone — i.e. a
   * token that was already exchanged for a newer one is being replayed,
   * which is the standard signal of a stolen refresh token.
   */
  async findByRefreshTokenHash(tokenHash) {
    const db = await this._load();
    for (const user of db.users) {
      const active = (user.refreshTokens || []).find(t => t.tokenHash === tokenHash);
      if (active) return { user, entry: active, reused: false };
      const tombstoned = (user.usedRefreshTokens || []).find(t => t.tokenHash === tokenHash);
      if (tombstoned) return { user, entry: tombstoned, reused: true };
    }
    return null;
  }

  /**
   * Atomically retires one refresh token and issues its replacement in the
   * same session family. The retired token is kept as a tombstone (not
   * deleted outright) so a later replay of it can be recognized as reuse.
   */
  async rotateRefreshToken(userId, oldTokenHash, newEntry) {
    return this._enqueue(db => {
      const user = db.users.find(u => u.id === userId);
      if (!user) return null;
      const now = Date.now();
      pruneUser(user, now);
      const old = user.refreshTokens.find(t => t.tokenHash === oldTokenHash);
      user.refreshTokens = user.refreshTokens.filter(t => t.tokenHash !== oldTokenHash);
      if (old) user.usedRefreshTokens.push(old);
      user.refreshTokens.push(newEntry);
      return this._persist().then(() => user);
    });
  }

  /** Removes one active refresh session by hash — used on logout. */
  async removeRefreshToken(userId, tokenHash) {
    return this._enqueue(db => {
      const user = db.users.find(u => u.id === userId);
      if (!user) return null;
      user.refreshTokens = (user.refreshTokens || []).filter(t => t.tokenHash !== tokenHash);
      return this._persist().then(() => user);
    });
  }

  /** Revokes every active token in a session family — used when reuse is detected. */
  async revokeFamily(userId, familyId) {
    return this._enqueue(db => {
      const user = db.users.find(u => u.id === userId);
      if (!user) return null;
      user.refreshTokens = (user.refreshTokens || []).filter(t => t.familyId !== familyId);
      return this._persist().then(() => user);
    });
  }

  /** Appends one completed typing-hub run, capped to the most recent MAX_RUNS per user. */
  async addRun(userId, run) {
    return this._enqueue(db => {
      const user = db.users.find(u => u.id === userId);
      if (!user) return null;
      user.runs = user.runs || [];
      user.runs.push(run);
      if (user.runs.length > MAX_RUNS) user.runs = user.runs.slice(-MAX_RUNS);
      return this._persist().then(() => run);
    });
  }

  /** Returns a user's runs newest-first, paginated, plus the total count stored. */
  async getRuns(userId, { limit = 50, offset = 0 } = {}) {
    const db = await this._load();
    const user = db.users.find(u => u.id === userId);
    if (!user) return null;
    const runs = user.runs || [];
    const sorted = [...runs].sort((a, b) => b.createdAt - a.createdAt);
    return { runs: sorted.slice(offset, offset + limit), total: runs.length };
  }

  /**
   * Returns a teacher's roster join code, creating one (and the roster
   * itself) on first request. The roster hangs off the teacher's own user
   * record, same pattern as `runs` hanging off a student's — no separate
   * "classes" collection needed for a single-roster-per-teacher model.
   */
  async getOrCreateJoinCode(teacherId) {
    return this._enqueue(db => {
      const teacher = db.users.find(u => u.id === teacherId);
      if (!teacher) return null;
      if (!teacher.roster) {
        teacher.roster = { joinCode: makeJoinCode(), studentIds: [] };
        return this._persist().then(() => teacher.roster.joinCode);
      }
      return teacher.roster.joinCode;
    });
  }

  /** Adds a student to the teacher's roster whose join code matches. Idempotent. */
  async joinRoster(joinCode, studentId) {
    return this._enqueue(db => {
      const code = joinCode.trim().toUpperCase();
      const teacher = db.users.find(u => u.roster?.joinCode === code);
      if (!teacher) return { ok: false, reason: 'NOT_FOUND' };
      if (teacher.id === studentId) return { ok: false, reason: 'SELF' };
      if (!teacher.roster.studentIds.includes(studentId)) {
        teacher.roster.studentIds.push(studentId);
        return this._persist().then(() => ({ ok: true, teacherId: teacher.id, teacherUsername: teacher.username }));
      }
      return { ok: true, teacherId: teacher.id, teacherUsername: teacher.username };
    });
  }

  /**
   * Adds a student directly to a teacher's roster — for bulk-created
   * accounts (the teacher already knows these are their own students),
   * as opposed to joinRoster's join-code flow for self-service signup.
   * Creates the roster (and its join code) if this is the teacher's first
   * student either way.
   */
  async addStudentToRoster(teacherId, studentId) {
    return this._enqueue(db => {
      const teacher = db.users.find(u => u.id === teacherId);
      if (!teacher) return false;
      if (!teacher.roster) teacher.roster = { joinCode: makeJoinCode(), studentIds: [] };
      if (!teacher.roster.studentIds.includes(studentId)) teacher.roster.studentIds.push(studentId);
      return this._persist().then(() => true);
    });
  }

  /** Resolves a teacher's roster to the actual student user records. */
  async getRosterStudents(teacherId) {
    const db = await this._load();
    const teacher = db.users.find(u => u.id === teacherId);
    if (!teacher) return null;
    const ids = teacher.roster?.studentIds || [];
    return ids.map(id => db.users.find(u => u.id === id)).filter(Boolean);
  }
}

// Unambiguous alphabet — no 0/O/1/I — so a code read aloud in a classroom
// never trips over a look-alike character.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function toPublicUser(user) {
  return {
    userId:   user.id,
    username: user.username,
    role:     user.role,
    mmr:      user.mmr,
    wallet:   user.wallet,
  };
}
