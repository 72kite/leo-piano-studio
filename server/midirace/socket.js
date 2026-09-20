/**
 * MIDI Race server — proficiency-based piano racing. Unlike typing race,
 * players don't compete on who finishes first: everyone is assigned the
 * same piece and plays it for the same fixed duration, so ranking is by
 * how well each player played it (self-reported proficiency score,
 * sanity-clamped server-side — see scoring.js), not finish time.
 *
 * That difference simplifies the lifecycle a lot versus server/race/socket.js:
 * no track vote, no JIT payload withholding (there's no "spoiler" in seeing
 * which piece you're about to play — unlike race text, prior familiarity
 * with a piece is normal, earned skill, not a client-side unfair advantage
 * the way pre-reading withheld race text would be). Queue → matched (piece
 * + a short synchronized start countdown) → each client plays locally and
 * self-reports a score on finish → results once everyone's in (or a
 * timeout). Same single-process, in-memory "plain" tier as the race server.
 */
import { pickPiece } from './pieces.js';
import { computeResults } from './results.js';
import { sanitizeFinish } from './scoring.js';

export const DEFAULT_TIMINGS = {
  matchmakeDelayMs: 1200, // pause between "matched" and the start countdown, so the roster is visible
  countdownMs: 5000,
  resultsTimeoutMs: 120000, // force results if a race runs unreasonably long
};

export function attachMidiRaceServer(io, { db, lobbySize = 2, timings = {} } = {}) {
  const T = { ...DEFAULT_TIMINGS, ...timings };

  const queue = [];                  // { socketId, userId, username, isGuest }
  const lobbies = new Map();         // lobbyId -> lobby
  const lobbyIdBySocket = new Map(); // socketId -> lobbyId

  function clearLobbyTimers(lobby) {
    ['startTimer', 'resultsTimer'].forEach(k => {
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
    const lobbyId = `midirace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const players = entries.map(e => ({ userId: e.userId, username: e.username, isGuest: e.isGuest }));
    const piece = pickPiece();
    const lobby = {
      id: lobbyId,
      players,
      phase: 'matched',
      piece,
      finishes: new Map(),
      startTimer: null, resultsTimer: null,
    };
    lobbies.set(lobbyId, lobby);

    for (const e of entries) {
      const sock = io.sockets.sockets.get(e.socketId);
      if (sock) { sock.join(lobbyId); lobbyIdBySocket.set(e.socketId, lobbyId); }
    }

    io.to(lobbyId).emit('midirace:matched', { lobbyId, players, pieceId: piece.id, pieceTitle: piece.title });
    lobby.startTimer = setTimeout(() => startCountdown(lobby), T.matchmakeDelayMs);
  }

  function startCountdown(lobby) {
    if (!lobbies.has(lobby.id)) return;
    lobby.phase = 'countdown';
    const startsAt = Date.now() + T.countdownMs;
    io.to(lobby.id).emit('midirace:countdown_start', { startsAt });
    lobby.startTimer = setTimeout(() => {
      lobby.phase = 'playing';
      io.to(lobby.id).emit('midirace:start');
      lobby.resultsTimer = setTimeout(() => finishLobby(lobby), T.resultsTimeoutMs);
    }, T.countdownMs);
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
          wallet: (user.wallet || 0) + r.coins,
        });
      }));
    }

    io.to(lobby.id).emit('midirace:over', { results });

    for (const p of lobby.players) {
      const sock = [...io.sockets.sockets.values()].find(s => lobbyIdBySocket.get(s.id) === lobby.id && s.data.identity?.userId === p.userId);
      if (sock) { sock.leave(lobby.id); lobbyIdBySocket.delete(sock.id); }
    }
    lobbies.delete(lobby.id);
  }

  io.on('connection', (socket) => {
    const identity = socket.data.identity;
    if (!identity) return; // resolved by race/socket.js's io.use() middleware on the shared io

    socket.on('midirace:queue', () => {
      if (lobbyIdBySocket.has(socket.id)) return;
      if (queue.some(e => e.socketId === socket.id)) return;
      queue.push({ socketId: socket.id, userId: identity.userId, username: identity.username, isGuest: identity.isGuest });
      socket.emit('midirace:queued', { position: queue.length });
      tryMatchmake();
    });

    socket.on('midirace:dequeue', () => removeFromQueue(socket.id));

    socket.on('midirace:finish', ({ lobbyId, score, hits, totalNotes } = {}) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby || lobby.phase !== 'playing') return;
      if (!lobby.players.some(p => p.userId === identity.userId)) return;
      if (lobby.finishes.has(identity.userId)) return;

      const clean = sanitizeFinish(score, hits, totalNotes);
      if (clean.suspicious) socket.emit('midirace:anticheat_warning');

      lobby.finishes.set(identity.userId, { ...clean, finishedAt: Date.now() });
      if (lobby.finishes.size >= lobby.players.length) finishLobby(lobby);
    });

    socket.on('disconnect', () => {
      removeFromQueue(socket.id);
      lobbyIdBySocket.delete(socket.id);
    });
  });
}
