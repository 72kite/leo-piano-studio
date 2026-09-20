import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BCRYPT_COST = 12;

// Client (src/store/index.js) treats a token as fresh for 14 minutes, then
// silently refreshes — the access token must outlive that window.
export const ACCESS_TOKEN_TTL_SEC  = Number(process.env.ACCESS_TOKEN_TTL_SEC || 15 * 60);
export const REFRESH_TOKEN_TTL_MS  = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30) * 24 * 60 * 60 * 1000;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a string of 32+ characters in production.');
  }

  // Dev/test convenience only: stable within a single process, never persisted.
  if (!getJwtSecret._devSecret) {
    getJwtSecret._devSecret = crypto.randomBytes(48).toString('hex');
    console.warn(
      '[leo-server] JWT_SECRET is not set (or too short) — using an ephemeral development ' +
      'secret. Every restart invalidates existing sessions. Set JWT_SECRET in your .env before deploying.'
    );
  }
  return getJwtSecret._devSecret;
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// A syntactically valid hash of a value nobody typed, compared against on
// every failed-lookup login so a request for an unknown user costs the same
// wall-clock time as a request for a known one with the wrong password —
// otherwise response timing leaks which usernames/emails are registered.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_COST);

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    getJwtSecret(),
    { expiresIn: ACCESS_TOKEN_TTL_SEC }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Opaque, high-entropy refresh token plus the record stored server-side for
 * it. Only the SHA-256 hash is ever persisted — the raw token exists only
 * in the response body and the caller's storage. `familyId` links every
 * token descended from one login so a detected replay can revoke the whole
 * chain (see JsonDb#revokeFamily).
 */
export function createRefreshEntry(familyId = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  const now = Date.now();
  return {
    token,
    entry: {
      tokenHash: hashRefreshToken(token),
      familyId,
      createdAt: now,
      expiresAt: now + REFRESH_TOKEN_TTL_MS,
    },
  };
}
