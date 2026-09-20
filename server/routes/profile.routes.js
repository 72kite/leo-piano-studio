import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate, settingsPatchSchema } from '../lib/validation.js';

export function createProfileRouter(db) {
  const router = Router();

  router.put('/settings', requireAuth, async (req, res, next) => {
    try {
      const v = validate(settingsPatchSchema, req.body);
      if (!v.ok) throw new ApiError(400, 'VALIDATION_ERROR', v.message);

      const user = await db.findUserById(req.userId);
      if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User no longer exists');

      await db.updateUser(user.id, { settings: { ...(user.settings || {}), ...v.data } });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
