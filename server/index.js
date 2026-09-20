import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { JsonDb } from './lib/db.js';
import { PgDb } from './lib/pgDb.js';
import { attachRaceServer } from './race/socket.js';
import { attachSessionServer } from './session/socket.js';
import { attachMidiRaceServer } from './midirace/socket.js';

const PORT = Number(process.env.PORT || 3001);

// Shared between the REST API and the race server so they see the same
// user records. DATABASE_URL opts into durable Postgres storage (see
// lib/pgDb.js); unset, JsonDb's single-file store stays the zero-config
// default so existing deployments are unaffected.
const db = process.env.DATABASE_URL ? new PgDb() : new JsonDb();
console.log(`[leo-server] using ${db instanceof PgDb ? 'PostgreSQL' : 'JSON-file'} storage`);

const app = createApp({ db });
const httpServer = createServer(app);
const io = attachRaceServer(httpServer, { db, lobbySize: Number(process.env.RACE_LOBBY_SIZE || 4) });
attachSessionServer(io, { db });
attachMidiRaceServer(io, { db, lobbySize: Number(process.env.MIDI_RACE_LOBBY_SIZE || 2) });

const server = httpServer.listen(PORT, () => {
  console.log(`[leo-server] listening on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`[leo-server] received ${signal}, shutting down...`);
  server.close(async () => {
    if (db instanceof PgDb) await db.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
