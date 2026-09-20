#!/usr/bin/env node
/**
 * One-time helper to copy an existing JsonDb file's users into Postgres.
 * Switching DATABASE_URL on does NOT migrate existing data by itself (see
 * docker-compose.yml's comment on leo-server's DATABASE_URL) — run this
 * once, deliberately, before cutting a live deployment over:
 *
 *   DATABASE_URL=postgres://user:pass@host:5432/db \
 *     node server/scripts/migrate-json-to-pg.js [path/to/db.json]
 *
 * Refresh-token sessions are intentionally NOT migrated — they're
 * short-lived by design (30 days by default) and every user can just log
 * in again; carrying them over adds real complexity (reuse-detection
 * state, family chains) for something that self-heals in one login.
 * Everything else — account, role, mmr/wallet, settings, run history,
 * teacher roster/join-code — is migrated as-is. Safe to re-run: users
 * already present in the target (matched by id) are skipped, not duplicated
 * or overwritten.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PgDb } from '../lib/pgDb.js';

const jsonPath = process.argv[2] || path.join(process.cwd(), 'server', 'data', 'db.json');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL to the target Postgres instance before running this script.');
    process.exit(1);
  }

  const raw = await fs.readFile(jsonPath, 'utf8');
  const { users } = JSON.parse(raw);
  console.log(`Read ${users.length} user(s) from ${jsonPath}`);

  const db = new PgDb();
  let migrated = 0, skipped = 0;

  try {
    for (const user of users) {
      const exists = await db.findUserById(user.id);
      if (exists) { skipped++; continue; }

      await db.createUser({
        id: user.id, username: user.username, usernameLower: user.usernameLower,
        email: user.email ?? null, emailLower: user.emailLower ?? null,
        passwordHash: user.passwordHash, role: user.role,
        mmr: user.mmr ?? 1000, wallet: user.wallet ?? 0, createdAt: user.createdAt,
      });

      const patch = {};
      if (user.settings)      patch.settings = user.settings;
      if (user.runs?.length)  patch.runs = user.runs;
      if (user.roster)        patch.roster = user.roster;
      if (Object.keys(patch).length) await db.updateUser(user.id, patch);

      migrated++;
    }
  } finally {
    await db.close();
  }

  console.log(`Migrated ${migrated} user(s), skipped ${skipped} already present in the target.`);
  console.log('Refresh-token sessions were not migrated — affected users will need to log in again.');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
