import { ApiError } from '../lib/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'NOT_FOUND' });
}

// Structured, dependency-free baseline: every unexpected error is one JSON
// line with enough context (method, path, userId if authenticated, the
// real error) to grep or pipe into a log aggregator later — swap the body
// of this one function for a real APM/error-tracking SDK call when this
// leaves guest-mode-only territory; nothing else needs to change since
// every route already funnels here via `next(err)`.
function logServerError(err, req) {
  console.error(JSON.stringify({
    at: new Date().toISOString(),
    level: 'error',
    method: req.method,
    path: req.originalUrl,
    userId: req.userId || null,
    message: err?.message || String(err),
    stack: err?.stack,
  }));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    // Client-caused (4xx) — expected traffic, not worth logging as an error.
    if (err.status >= 500) logServerError(err, req);
    return res.status(err.status).json({ error: err.code });
  }

  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({ error: 'INVALID_BODY' });
  }

  // Never leak internals (stack traces, file paths, driver errors) to clients.
  logServerError(err, req);
  res.status(500).json({ error: 'INTERNAL_ERROR' });
}
