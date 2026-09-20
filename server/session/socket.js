/**
 * Session-lock server — lets an educator broadcast Focus-tab restrictions
 * (locked modes/pages, a full-screen lock, masked usernames) to every
 * currently-connected student on their roster, over the same shared
 * Socket.io instance the race server already owns (server/race/socket.js
 * attaches `io.use()` identity-resolution middleware that runs for every
 * connecting socket regardless of which module's `io.on('connection', ...)`
 * handler consumes it — so this file just adds a second handler onto that
 * same `io`, rather than standing up its own Server()).
 *
 * In-memory only, same "plain" tier as the race server: a lock isn't
 * persisted and isn't re-sent to a student who reconnects after it was
 * broadcast — they'll pick up the next broadcast, or ask their teacher to
 * re-send. That's an intentional scope cut, not an oversight; this only
 * needs to matter once a deployment runs long-lived classroom sessions
 * across reconnects, which isn't the case yet.
 */
import { sessionLockSchema } from '../lib/validation.js';

export function attachSessionServer(io, { db }) {
  const socketsByUser = new Map(); // userId -> Set<socketId>

  function trackConnect(userId, socketId) {
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
    socketsByUser.get(userId).add(socketId);
  }

  function trackDisconnect(userId, socketId) {
    const set = socketsByUser.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) socketsByUser.delete(userId);
  }

  io.on('connection', (socket) => {
    const identity = socket.data.identity;
    if (!identity || identity.isGuest) return; // guests can't be rostered, so never a broadcast target or sender

    trackConnect(identity.userId, socket.id);

    socket.on('session:set_modes', async (payload) => {
      const user = await db.findUserById(identity.userId);
      if (!user || user.role !== 'educator') return; // students can't broadcast

      const parsed = sessionLockSchema.safeParse(payload);
      if (!parsed.success) return;

      const roster = await db.getRosterStudents(identity.userId);
      if (!roster || roster.length === 0) return;

      const rosterIds = new Set(roster.map(s => s.id));
      for (const [userId, socketIds] of socketsByUser) {
        if (!rosterIds.has(userId)) continue;
        for (const socketId of socketIds) {
          io.to(socketId).emit('session:modes_locked', parsed.data);
        }
      }
    });

    socket.on('disconnect', () => trackDisconnect(identity.userId, socket.id));
  });
}
