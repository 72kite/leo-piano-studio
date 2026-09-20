/**
 * Real-time race server — matchmaking, voting, countdown, JIT payload
 * delivery, and results, over the same Socket.io event contract the
 * client already speaks (src/hooks/useSocket.js). Single-process,
 * in-memory lobby/queue state — the "plain" tier, same positioning as
 * server/lib/db.js. Swap in a Redis-backed queue/pubsub if this ever
 * needs to run across multiple instances.
 *
 * Guests race exactly like signed-in players (no account required to
 * play) — only MMR/wallet persistence is skipped for them, since
 * there's no account to persist it to.
 */
import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/security.js';
import { makeGuestIdentity } from '../lib/guestIdentity.js';
import { parseOrigins } from '../lib/cors.js';
import { pickVoteOptions } from './tracks.js';
import { computeResults } from './results.js';
import { sanitizeFinish, coinsForPlacement } from './scoring.js';

export const DEFAULT_TIMINGS = {
  matchmakeDelayMs: 1200,   // pause between "matched" and the vote starting, so the roster is visible
  voteMs: 15000,
  countdownMs: 10000,
  payloadLeadMs: 2500,      // race text is delivered this long before the start (anti-cheat JIT delivery)
  resultsTimeoutMs: 180000, // force results if a race runs unreasonably long
};

async function resolveIdentity(db, token) {
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      const user = await db.findUserById(payload.sub);
      if (user) {
        return { userId: user.id, username: user.username, mmr: user.mmr, isGuest: false };
      }
    } catch {
      // falls through to guest — an expired/invalid token degrades gracefully
      // instead of refusing the connection.
    }
  }
  const guest = makeGuestIdentity();
  return { userId: guest.userId, username: guest.username, mmr: guest.mmr, isGuest: true };
}

export function attachRaceServer(httpServer, { db, lobbySize = 4, timings = {}, corsOrigin } = {}) {
  const T = { ...DEFAULT_TIMINGS, ...timings };
  const allowedOrigins = parseOrigins(corsOrigin ?? process.env.CORS_ORIGIN);

  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    },
  });

  const queue = [];                        // { socketId, userId, username, mmr, isGuest }
  const lobbies = new Map();                // lobbyId -> lobby
  const lobbyIdBySocket = new Map();        // socketId -> lobbyId

  function clearLobbyTimers(lobby) {
    ['voteTimer', 'payloadTimer', 'startTimer', 'resultsTimer'].forEach(k => {
      if (lobby[k]) clearTimeout(lobby[k]);
    });
  }

  function removeFromQueue(socketId) {
    const idx = queue.findIndex(e => e.socketId === socketId);
    if (idx !== -1) queue.splice(idx, 1);
  }

  function tryMatchmake() {
    if (queue.length < lobbySize) return;
    const entries = queue.splice(0, lobbySize);
    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const players = entries.map(e => ({ userId: e.userId, username: e.username, mmr: e.mmr, isGuest: e.isGuest }));
    const lobby = {
      id: lobbyId,
      players,
      phase: 'matched',
      votes: new Map(),
      voteOptions: [],
      selectedTrack: null,
      startEpoch: null,
      finishes: new Map(),
      voteTimer: null, payloadTimer: null, startTimer: null, resultsTimer: null,
    };
    lobbies.set(lobbyId, lobby);

    for (const e of entries) {
      const sock = io.sockets.sockets.get(e.socketId);
      if (sock) { sock.join(lobbyId); lobbyIdBySocket.set(e.socketId, lobbyId); }
    }

    io.to(lobbyId).emit('race:matched', { lobbyId, players });
    setTimeout(() => startVoting(lobby), T.matchmakeDelayMs);
  }

  function startVoting(lobby) {
    if (!lobbies.has(lobby.id)) return;
    lobby.phase = 'voting';
    lobby.voteOptions = pickVoteOptions(3);
    lobby.voteEndsAt = Date.now() + T.voteMs;
    io.to(lobby.id).emit('race:vote_start', { options: lobby.voteOptions, endsAt: lobby.voteEndsAt });
    lobby.voteTimer = setTimeout(() => finalizeVoting(lobby), T.voteMs);
  }

  function finalizeVoting(lobby) {
    if (!lobbies.has(lobby.id) || lobby.phase !== 'voting') return;
    clearTimeout(lobby.voteTimer);

    const tally = new Map();
    for (const trackId of lobby.votes.values()) tally.set(trackId, (tally.get(trackId) || 0) + 1);

    let winnerId = null, best = -1;
    for (const opt of lobby.voteOptions) {
      const count = tally.get(opt.id) || 0;
      if (count > best) { best = count; winnerId = opt.id; }
    }
    if (winnerId === null) winnerId = lobby.voteOptions[Math.floor(Math.random() * lobby.voteOptions.length)].id;

    lobby.selectedTrack = lobby.voteOptions.find(t => t.id === winnerId) || lobby.voteOptions[0];
    startCountdown(lobby);
  }

  function startCountdown(lobby) {
    lobby.phase = 'countdown';
    lobby.startEpoch = Date.now() + T.countdownMs;
    io.to(lobby.id).emit('race:countdown_start', { startsAt: lobby.startEpoch });

    const leadMs = Math.max(0, T.countdownMs - T.payloadLeadMs);
    lobby.payloadTimer = setTimeout(() => {
      io.to(lobby.id).emit('race:payload', {
        content: lobby.selectedTrack.content,
        title: lobby.selectedTrack.title,
        msBeforeStart: T.countdownMs - leadMs,
      });
    }, leadMs);

    lobby.startTimer = setTimeout(() => startRace(lobby), T.countdownMs);
  }

  function startRace(lobby) {
    if (!lobbies.has(lobby.id)) return;
    lobby.phase = 'racing';
    io.to(lobby.id).emit('race:start');
    lobby.resultsTimer = setTimeout(() => finishLobby(lobby), T.resultsTimeoutMs);
  }

  async function finishLobby(lobby) {
    if (!lobbies.has(lobby.id)) return;
    clearLobbyTimers(lobby);
    lobby.phase = 'results';

    const results = computeResults(lobby.players, lobby.finishes);

    if (db) {
      await Promise.all(results.map(async r => {
        const player = lobby.players.find(p => p.userId === r.userId);
        if (!player || player.isGuest) return;
        const user = await db.findUserById(r.userId);
        if (!user) return;
        await db.updateUser(r.userId, {
          mmr: (user.mmr || 1000) + r.eloDelta,
          wallet: (user.wallet || 0) + coinsForPlacement(r.placement),
        });
      }));
    }

    io.to(lobby.id).emit('race:over', { results });

    for (const p of lobby.players) {
      const sock = [...io.sockets.sockets.values()].find(s => lobbyIdBySocket.get(s.id) === lobby.id && s.data.identity?.userId === p.userId);
      if (sock) { sock.leave(lobby.id); lobbyIdBySocket.delete(sock.id); }
    }
    lobbies.delete(lobby.id);
  }

  io.use(async (socket, next) => {
    socket.data.identity = await resolveIdentity(db, socket.handshake.auth?.token);
    next();
  });

  io.on('connection', (socket) => {
    const identity = socket.data.identity;
    socket.emit('auth:identity', { userId: identity.userId });

    socket.on('race:queue', () => {
      if (lobbyIdBySocket.has(socket.id)) return; // already in an active lobby
      if (queue.some(e => e.socketId === socket.id)) return; // already queued
      queue.push({ socketId: socket.id, userId: identity.userId, username: identity.username, mmr: identity.mmr, isGuest: identity.isGuest });
      socket.emit('race:queued', { position: queue.length });
      tryMatchmake();
    });

    socket.on('race:dequeue', () => removeFromQueue(socket.id));

    socket.on('race:vote', ({ lobbyId, trackId } = {}) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby || lobby.phase !== 'voting') return;
      if (!lobby.players.some(p => p.userId === identity.userId)) return;
      if (!lobby.voteOptions.some(t => t.id === trackId)) return;

      lobby.votes.set(identity.userId, trackId);
      if (lobby.votes.size >= lobby.players.length) finalizeVoting(lobby);
    });

    socket.on('race:progress', ({ lobbyId, progress, wpm, accuracy } = {}) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby || lobby.phase !== 'racing') return;
      if (!lobby.players.some(p => p.userId === identity.userId)) return;

      const clean = sanitizeFinish(wpm, accuracy);
      if (clean.suspicious) socket.emit('race:anticheat_warning');

      if (Number(progress) >= 100 && !lobby.finishes.has(identity.userId)) {
        lobby.finishes.set(identity.userId, { wpm: clean.wpm, accuracy: clean.accuracy, finishedAt: Date.now() });
      }

      socket.to(lobby.id).emit('race:opponent_update', {
        userId: identity.userId, username: identity.username, progress: Number(progress) || 0, wpm: clean.wpm,
      });

      if (lobby.finishes.size >= lobby.players.length) finishLobby(lobby);
    });

    socket.on('heartbeat:ping', () => {});

    socket.on('disconnect', () => {
      removeFromQueue(socket.id);
      lobbyIdBySocket.delete(socket.id);
    });
  });

  return io;
}
