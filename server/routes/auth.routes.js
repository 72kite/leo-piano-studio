import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { toPublicUser } from '../lib/db.js';
import {
  validate, registerSchema, loginSchema, refreshSchema, logoutSchema,
} from '../lib/validation.js';
import {
  hashPassword, verifyPassword, signAccessToken,
  createRefreshEntry, hashRefreshToken, DUMMY_PASSWORD_HASH,
} from '../lib/security.js';

export function createAuthRouter(db) {
  const router = Router();

  // Credential-guessing endpoints get a tighter budget than the rest of the
  // API. Built here (not at module scope) so each server instance — and
  // each test's app — gets its own counter instead of sharing one globally.
  const authLimiter = rateLimit({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMIT' },
  });

  router.post('/register', authLimiter, async (req, res, next) => {
    try {
      const v = validate(registerSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);
      const { username, email, password, role } = v.data;

      if (await db.usernameOrEmailTaken(username, email)) {
        throw new ApiError(409, 'USERNAME_TAKEN', 'Username or email already in use');
      }

      const user = {
        id: crypto.randomUUID(),
        username,
        usernameLower: username.toLowerCase(),
        email: email || null,
        emailLower: email ? email.toLowerCase() : null,
        passwordHash: await hashPassword(password),
        role,
        mmr: 1000,
        wallet: 0,
        createdAt: Date.now(),
        refreshTokens: [],
        usedRefreshTokens: [],
      };
      await db.createUser(user);

      const accessToken = signAccessToken(user);
      const { token: refreshToken, entry } = createRefreshEntry();
      await db.addRefreshToken(user.id, entry);

      res.status(201).json({ user: toPublicUser(user), accessToken, refreshToken });
    } catch (err) { next(err); }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const v = validate(loginSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);
      const { identifier, password } = v.data;

      const user = await db.findUserByLogin(identifier);
      // Always run bcrypt.compare, even for an unknown user, against a
      // precomputed dummy hash — keeps response time independent of
      // whether the identifier exists.
      const valid = await verifyPassword(password, user ? user.passwordHash : DUMMY_PASSWORD_HASH);
      if (!user || !valid) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username/email or password');
      }

      const accessToken = signAccessToken(user);
      const { token: refreshToken, entry } = createRefreshEntry();
      await db.addRefreshToken(user.id, entry);

      res.json({ user: toPublicUser(user), accessToken, refreshToken });
    } catch (err) { next(err); }
  });

  router.post('/refresh', authLimiter, async (req, res, next) => {
    try {
      const v = validate(refreshSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);
      const { refreshToken } = v.data;

      const tokenHash = hashRefreshToken(refreshToken);
      const found = await db.findByRefreshTokenHash(tokenHash);
      if (!found) throw new ApiError(401, 'REFRESH_INVALID', 'Refresh token is invalid or expired');

      if (found.reused) {
        // This exact token was already exchanged once before — someone else
        // has it. Kill every token descended from that login, not just this one.
        await db.revokeFamily(found.user.id, found.entry.familyId);
        throw new ApiError(401, 'REFRESH_REUSED', 'Session revoked — refresh token was reused');
      }
      if (found.entry.expiresAt <= Date.now()) {
        throw new ApiError(401, 'REFRESH_INVALID', 'Refresh token is invalid or expired');
      }

      const { token: newRefreshToken, entry } = createRefreshEntry(found.entry.familyId);
      await db.rotateRefreshToken(found.user.id, tokenHash, entry);

      res.json({ accessToken: signAccessToken(found.user), refreshToken: newRefreshToken });
    } catch (err) { next(err); }
  });

  router.post('/logout', async (req, res) => {
    const v = validate(logoutSchema, req.body);
    if (v.ok && v.data.refreshToken) {
      const tokenHash = hashRefreshToken(v.data.refreshToken);
      const found = await db.findByRefreshTokenHash(tokenHash).catch(() => null);
      if (found && !found.reused) {
        await db.removeRefreshToken(found.user.id, tokenHash).catch(() => {});
      }
    }
    // Logout is idempotent and never leaks whether a token existed.
    res.status(204).end();
  });

  return router;
}
