/**
 * /api/teacher — an educator's roster and each roster student's aggregate
 * stats. A student joins a teacher's roster with a short join code (shown
 * on the teacher's dashboard); the roster itself hangs off the teacher's
 * own user record (see JsonDb.getOrCreateJoinCode/joinRoster/getRosterStudents).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate, joinCodeSchema, bulkAccountsSchema } from '../lib/validation.js';
import { summarizeRuns } from '../lib/statsSummary.js';
import { hashPassword } from '../lib/security.js';

const SUMMARY_SAMPLE = 500; // matches db.js's MAX_RUNS cap, same as /api/stats/summary

// Unambiguous alphabet (no 0/O/1/I) — same spirit as the join-code
// alphabet in db.js, so generated usernames/passwords read back correctly
// off a projector or printed roster sheet.
const ACCOUNT_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function randomToken(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ACCOUNT_ALPHABET[bytes[i] % ACCOUNT_ALPHABET.length];
  return out;
}

export function createTeacherRouter(db) {
  const router = Router();

  // Bulk account creation hashes a password per account (bcrypt, ~100ms+
  // each by design) and writes a real user row per account — a tighter
  // budget than the general API limit, mirroring auth.routes.js's
  // authLimiter for the same "expensive, abuse-prone" reasoning. Built
  // here (not module scope) so each server/test instance gets its own
  // counter, same as authLimiter.
  const bulkAccountsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT' },
  });

  // Educator: fetch (creating on first call) their join code, plus each
  // roster student's aggregate stats.
  router.get('/roster', requireAuth, async (req, res, next) => {
    try {
      if (req.userRole !== 'educator') {
        throw new ApiError(403, 'FORBIDDEN', 'Educator role required');
      }

      const joinCode = await db.getOrCreateJoinCode(req.userId);
      if (joinCode === null) throw new ApiError(404, 'USER_NOT_FOUND', 'User no longer exists');

      const students = await db.getRosterStudents(req.userId);
      const roster = await Promise.all(students.map(async (student) => {
        const result = await db.getRuns(student.id, { limit: SUMMARY_SAMPLE, offset: 0 });
        const summary = summarizeRuns(result?.runs || [], result?.total || 0);
        return { userId: student.id, username: student.username, ...summary };
      }));

      res.json({ joinCode, students: roster });
    } catch (err) { next(err); }
  });

  // Student: join a teacher's roster via their join code.
  router.post('/roster/join', requireAuth, async (req, res, next) => {
    try {
      if (req.userRole !== 'student') {
        throw new ApiError(403, 'FORBIDDEN', 'Only student accounts can join a class');
      }

      const v = validate(joinCodeSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);

      const result = await db.joinRoster(v.data.joinCode, req.userId);
      if (!result.ok) {
        if (result.reason === 'SELF') throw new ApiError(400, 'INVALID_JOIN', "Can't join your own class");
        throw new ApiError(404, 'NOT_FOUND', 'No class found for that code');
      }

      res.json({ teacherUsername: result.teacherUsername });
    } catch (err) { next(err); }
  });

  // Educator: create `count` fresh student accounts, added straight to the
  // caller's roster, with generated credentials returned once (plaintext,
  // since a bcrypt hash can't be reversed — this response is the only time
  // the password is ever visible; the teacher hands it to the student).
  router.post('/accounts/bulk', bulkAccountsLimiter, requireAuth, async (req, res, next) => {
    try {
      if (req.userRole !== 'educator') {
        throw new ApiError(403, 'FORBIDDEN', 'Educator role required');
      }

      const v = validate(bulkAccountsSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);

      const { count, prefix } = v.data;
      const base = (prefix || 'student').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'student';
      const accounts = [];

      for (let i = 0; i < count; i++) {
        let username;
        let attempts = 0;
        do {
          username = `${base}_${randomToken(6)}`;
          attempts++;
        } while (attempts < 5 && await db.usernameOrEmailTaken(username, null));

        const password = randomToken(10);
        const user = {
          id: crypto.randomUUID(),
          username, usernameLower: username.toLowerCase(),
          email: null, emailLower: null,
          passwordHash: await hashPassword(password),
          role: 'student', mmr: 1000, wallet: 0, createdAt: Date.now(),
          refreshTokens: [], usedRefreshTokens: [],
        };
        await db.createUser(user);
        await db.addStudentToRoster(req.userId, user.id);
        accounts.push({ username, password });
      }

      res.status(201).json({ accounts });
    } catch (err) { next(err); }
  });

  return router;
}
