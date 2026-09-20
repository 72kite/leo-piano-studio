/**
 * Leo backend — PostgreSQL-backed persistence.
 *
 * A drop-in replacement for JsonDb: same async method signatures, same
 * return shapes, so every route keeps talking to `db` without knowing or
 * caring which backend is behind it (per the note in db.js — "swap this
 * module out... when that phase of the roadmap starts"). Selected by
 * server/index.js when DATABASE_URL is set; JsonDb stays the zero-config
 * default otherwise, so existing single-file deployments are unaffected.
 *
 * Design notes:
 * - `users` is a real table (indexed username/email uniqueness) with a few
 *   variable-shaped fields — `settings`, `runs`, `roster` — kept as JSONB
 *   columns rather than normalized into their own tables. `runs` in
 *   particular is capped at MAX_RUNS and only ever read back whole for one
 *   user at a time (never queried/joined across users), so a relational
 *   `runs` table would add schema/migration overhead without buying
 *   anything this app actually needs yet.
 * - `refresh_tokens` IS a real table, not JSONB — unlike runs, it's looked
 *   up by hash on every token refresh (a hot, security-sensitive path), so
 *   it gets a real index instead of a full-table JSONB scan.
 * - Schema is bootstrapped lazily (idempotent `CREATE TABLE IF NOT EXISTS`
 *   on first use, cached after) — no separate migration step or tool,
 *   consistent with JsonDb's "plain tier" philosophy. Revisit if/when this
 *   needs real migrations (e.g. a column rename).
 */
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const MAX_RUNS = 500; // matches db.js's cap

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    username       TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    email          TEXT,
    email_lower    TEXT UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'student',
    mmr            INTEGER NOT NULL DEFAULT 1000,
    wallet         INTEGER NOT NULL DEFAULT 0,
    created_at     BIGINT NOT NULL,
    settings       JSONB NOT NULL DEFAULT '{}'::jsonb,
    runs           JSONB NOT NULL DEFAULT '[]'::jsonb,
    roster         JSONB
  );
  CREATE INDEX IF NOT EXISTS idx_users_roster_join_code ON users (((roster ->> 'joinCode')));

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id  TEXT NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
`;

// Unambiguous alphabet — no 0/O/1/I — mirrors db.js's makeJoinCode exactly.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

// snake_case row -> the camelCase shape every route already expects from
// JsonDb. Deliberately omits refreshTokens/usedRefreshTokens — nothing in
// the routes reads those directly off a user object; they only go through
// findByRefreshTokenHash/rotateRefreshToken/etc, which query the
// refresh_tokens table directly regardless of how a user was looked up.
function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    usernameLower: row.username_lower,
    email: row.email,
    emailLower: row.email_lower,
    passwordHash: row.password_hash,
    role: row.role,
    mmr: row.mmr,
    wallet: row.wallet,
    createdAt: Number(row.created_at),
    settings: row.settings || {},
    runs: row.runs || [],
    roster: row.roster || null,
  };
}

export class PgDb {
  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('PgDb requires DATABASE_URL to be set.');
    this.pool = new Pool({ connectionString });
    this._ready = null;
  }

  _ensureReady() {
    if (!this._ready) this._ready = this.pool.query(SCHEMA_SQL);
    return this._ready;
  }

  async close() {
    await this.pool.end();
  }

  async findUserByLogin(identifier) {
    await this._ensureReady();
    const id = identifier.trim().toLowerCase();
    const { rows } = await this.pool.query(
      'SELECT * FROM users WHERE username_lower = $1 OR email_lower = $1 LIMIT 1',
      [id]
    );
    return rowToUser(rows[0]);
  }

  async usernameOrEmailTaken(username, email) {
    await this._ensureReady();
    const uLower = username.trim().toLowerCase();
    const eLower = email ? email.trim().toLowerCase() : null;
    const { rows } = await this.pool.query(
      'SELECT 1 FROM users WHERE username_lower = $1 OR ($2::text IS NOT NULL AND email_lower = $2) LIMIT 1',
      [uLower, eLower]
    );
    return rows.length > 0;
  }

  async createUser(user) {
    await this._ensureReady();
    await this.pool.query(
      `INSERT INTO users (id, username, username_lower, email, email_lower, password_hash, role, mmr, wallet, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [user.id, user.username, user.usernameLower, user.email, user.emailLower,
       user.passwordHash, user.role, user.mmr, user.wallet, user.createdAt]
    );
    return user;
  }

  async findUserById(userId) {
    await this._ensureReady();
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    return rowToUser(rows[0]);
  }

  /** Generic column-patch, mirroring JsonDb's Object.assign(user, patch) semantics. */
  async updateUser(userId, patch) {
    await this._ensureReady();
    const COLUMN = {
      username: 'username', usernameLower: 'username_lower', email: 'email', emailLower: 'email_lower',
      passwordHash: 'password_hash', role: 'role', mmr: 'mmr', wallet: 'wallet', createdAt: 'created_at',
      settings: 'settings', runs: 'runs', roster: 'roster',
    };
    const JSONB = new Set(['settings', 'runs', 'roster']);
    const keys = Object.keys(patch).filter(k => COLUMN[k]);
    if (keys.length === 0) return this.findUserById(userId);

    const setClauses = [];
    const values = [];
    keys.forEach((key, i) => {
      const col = COLUMN[key];
      const placeholder = `$${i + 1}`;
      setClauses.push(JSONB.has(key) ? `${col} = ${placeholder}::jsonb` : `${col} = ${placeholder}`);
      values.push(JSONB.has(key) ? JSON.stringify(patch[key]) : patch[key]);
    });
    values.push(userId);

    const { rows } = await this.pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return rowToUser(rows[0]);
  }

  async addRefreshToken(userId, entry) {
    await this._ensureReady();
    await this._pruneExpired(userId);
    await this.pool.query(
      `INSERT INTO refresh_tokens (token_hash, user_id, family_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [entry.tokenHash, userId, entry.familyId, entry.createdAt, entry.expiresAt]
    );
    return this.findUserById(userId);
  }

  async findByRefreshTokenHash(tokenHash) {
    await this._ensureReady();
    const { rows } = await this.pool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1', [tokenHash]
    );
    const row = rows[0];
    if (!row) return null;
    const user = await this.findUserById(row.user_id);
    if (!user) return null;
    const entry = {
      tokenHash: row.token_hash, familyId: row.family_id,
      createdAt: Number(row.created_at), expiresAt: Number(row.expires_at),
    };
    return { user, entry, reused: row.used };
  }

  async rotateRefreshToken(userId, oldTokenHash, newEntry) {
    await this._ensureReady();
    await this._pruneExpired(userId);
    await this.pool.query('UPDATE refresh_tokens SET used = TRUE WHERE token_hash = $1', [oldTokenHash]);
    await this.pool.query(
      `INSERT INTO refresh_tokens (token_hash, user_id, family_id, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [newEntry.tokenHash, userId, newEntry.familyId, newEntry.createdAt, newEntry.expiresAt]
    );
    return this.findUserById(userId);
  }

  async removeRefreshToken(userId, tokenHash) {
    await this._ensureReady();
    await this.pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2', [tokenHash, userId]);
    return this.findUserById(userId);
  }

  async revokeFamily(userId, familyId) {
    await this._ensureReady();
    await this.pool.query('DELETE FROM refresh_tokens WHERE family_id = $1 AND user_id = $2', [familyId, userId]);
    return this.findUserById(userId);
  }

  async _pruneExpired(userId) {
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1 AND expires_at <= $2', [userId, Date.now()]);
  }

  /** Atomic single-statement append+cap — no read-modify-write race under concurrent writers. */
  async addRun(userId, run) {
    await this._ensureReady();
    const { rows } = await this.pool.query(
      `UPDATE users
       SET runs = CASE
         WHEN jsonb_array_length(runs) >= $2 THEN (runs - 0) || $3::jsonb
         ELSE runs || $3::jsonb
       END
       WHERE id = $1
       RETURNING runs`,
      [userId, MAX_RUNS, JSON.stringify([run])]
    );
    if (!rows[0]) return null;
    return run;
  }

  async getRuns(userId, { limit = 50, offset = 0 } = {}) {
    await this._ensureReady();
    const { rows } = await this.pool.query('SELECT runs FROM users WHERE id = $1', [userId]);
    if (!rows[0]) return null;
    const runs = rows[0].runs || [];
    const sorted = [...runs].sort((a, b) => b.createdAt - a.createdAt);
    return { runs: sorted.slice(offset, offset + limit), total: runs.length };
  }

  async getOrCreateJoinCode(teacherId) {
    await this._ensureReady();
    const code = makeJoinCode();
    const { rows } = await this.pool.query(
      `UPDATE users
       SET roster = COALESCE(roster, jsonb_build_object('joinCode', $2::text, 'studentIds', '[]'::jsonb))
       WHERE id = $1
       RETURNING roster`,
      [teacherId, code]
    );
    if (!rows[0]) return null;
    return rows[0].roster.joinCode;
  }

  async joinRoster(joinCode, studentId) {
    await this._ensureReady();
    const code = joinCode.trim().toUpperCase();
    const { rows: found } = await this.pool.query(
      `SELECT id, username FROM users WHERE roster ->> 'joinCode' = $1`, [code]
    );
    const teacher = found[0];
    if (!teacher) return { ok: false, reason: 'NOT_FOUND' };
    if (teacher.id === studentId) return { ok: false, reason: 'SELF' };

    await this.pool.query(
      `UPDATE users
       SET roster = jsonb_set(
         roster, '{studentIds}',
         CASE WHEN (roster -> 'studentIds') @> $2::jsonb THEN (roster -> 'studentIds')
              ELSE (roster -> 'studentIds') || $2::jsonb END
       )
       WHERE id = $1`,
      [teacher.id, JSON.stringify([studentId])]
    );
    return { ok: true, teacherId: teacher.id, teacherUsername: teacher.username };
  }

  async getRosterStudents(teacherId) {
    await this._ensureReady();
    const teacher = await this.findUserById(teacherId);
    if (!teacher) return null;
    const ids = teacher.roster?.studentIds || [];
    if (ids.length === 0) return [];
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = ANY($1::text[])', [ids]);
    return rows.map(rowToUser);
  }

  /** Adds a student directly to a teacher's roster — see db.js's JsonDb version for why this exists alongside joinRoster. */
  async addStudentToRoster(teacherId, studentId) {
    await this._ensureReady();
    const joinCode = await this.getOrCreateJoinCode(teacherId); // ensures roster exists
    if (joinCode === null) return false;
    await this.pool.query(
      `UPDATE users
       SET roster = jsonb_set(
         roster, '{studentIds}',
         CASE WHEN (roster -> 'studentIds') @> $2::jsonb THEN (roster -> 'studentIds')
              ELSE (roster -> 'studentIds') || $2::jsonb END
       )
       WHERE id = $1`,
      [teacherId, JSON.stringify([studentId])]
    );
    return true;
  }
}
