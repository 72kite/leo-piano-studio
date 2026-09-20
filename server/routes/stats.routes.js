import { Router } from 'express';
import crypto from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate, runSchema } from '../lib/validation.js';
import { summarizeRuns } from '../lib/statsSummary.js';

const SUMMARY_SAMPLE = 500; // matches db.js's MAX_RUNS cap — summary looks at everything stored

export function createStatsRouter(db) {
  const router = Router();

  router.post('/runs', requireAuth, async (req, res, next) => {
    try {
      const v = validate(runSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);

      const run = { id: crypto.randomUUID(), createdAt: Date.now(), ...v.data };
      const saved = await db.addRun(req.userId, run);
      if (!saved) throw new ApiError(404, 'USER_NOT_FOUND', 'User no longer exists');

      res.status(201).json({ run });
    } catch (err) { next(err); }
  });

  router.get('/runs', requireAuth, async (req, res, next) => {
    try {
      const limit  = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const result = await db.getRuns(req.userId, { limit, offset });
      if (!result) throw new ApiError(404, 'USER_NOT_FOUND', 'User no longer exists');

      res.json(result);
    } catch (err) { next(err); }
  });

  router.get('/summary', requireAuth, async (req, res, next) => {
    try {
      const result = await db.getRuns(req.userId, { limit: SUMMARY_SAMPLE, offset: 0 });
      if (!result) throw new ApiError(404, 'USER_NOT_FOUND', 'User no longer exists');

      res.json(summarizeRuns(result.runs, result.total));
    } catch (err) { next(err); }
  });

  return router;
}
