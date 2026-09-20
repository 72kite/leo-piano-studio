import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { JsonDb } from './lib/db.js';
import { parseOrigins } from './lib/cors.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createProfileRouter } from './routes/profile.routes.js';
import { createStatsRouter } from './routes/stats.routes.js';
import { createTeacherRouter } from './routes/teacher.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

export function createApp({ db = new JsonDb() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // sits behind nginx in production; needed for correct rate-limit IPs

  app.use(helmet());

  const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
  app.use(cors({
    origin(origin, callback) {
      // no Origin header (curl, server-to-server, same-origin) — allow;
      // otherwise only allow explicitly whitelisted frontends.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  }));

  app.use(express.json({ limit: '16kb' }));

  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 120),
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/profile', createProfileRouter(db));
  app.use('/api/stats', createStatsRouter(db));
  app.use('/api/teacher', createTeacherRouter(db));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
