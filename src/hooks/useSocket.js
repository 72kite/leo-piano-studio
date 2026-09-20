/**
 * useSocket — manages the single Socket.io connection
 * Binds all race events to useRaceStore mutations.
 */
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore, useRaceStore, useSessionLockStore, useMidiRaceStore } from '../store/index.js';

// Same VITE_API_URL build-time env var the REST client uses (src/store/index.js)
// — unset, this stays the zero-config localhost default.
const SERVER = import.meta.env.VITE_API_URL || 'http://localhost:3001';
let _socket = null;
let _socketToken; // the token _socket was authenticated with — undefined before first connect

export function useSocket() {
  const token      = useAuthStore(s => s.token);
  const race       = useRaceStore();
  const midiRace   = useMidiRaceStore();
  const applyLock  = useSessionLockStore(s => s.applyLock);
  const myIdRef    = useRef(null);

  useEffect(() => {
    // A socket that's connected but was authenticated with a *different*
    // token (most commonly: connected as a guest before login, then the
    // user logs in) needs to be torn down and reopened — otherwise every
    // component that mounts after login keeps reusing the old, still-guest
    // identity forever, since "already connected" used to be treated as
    // "nothing to do here."
    if (_socket?.connected && _socketToken === token) return;
    if (_socket) { _socket.disconnect(); _socket.off(); }
    _socketToken = token;
    _socket = io(SERVER, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
    });

    _socket.on('auth:identity', ({ userId }) => {
      myIdRef.current = userId;
    });

    _socket.on('race:queued',   ({ position }) => race.setPhase('queued'));
    _socket.on('race:matched',  ({ lobbyId, players }) => {
      race.setLobby(lobbyId, players, myIdRef.current);
    });
    _socket.on('race:vote_start', ({ options, endsAt }) => {
      race.setVoteOptions(options, endsAt);
    });
    _socket.on('race:countdown_start', ({ startsAt }) => {
      race.setCountdown(startsAt);
      console.log('[anti-cheat] countdown — payload withheld');
    });
    _socket.on('race:payload', ({ content, title, msBeforeStart }) => {
      console.log(`[anti-cheat] ✅ payload received: "${title}" (${msBeforeStart}ms before zero)`);
      race.setPayload(content);
    });
    _socket.on('race:start',          () => race.setRacing());
    _socket.on('race:opponent_update',({ userId, username, progress, wpm }) => {
      race.updateOpponent(userId, username, progress, wpm);
    });
    _socket.on('race:anticheat_warning', () => race.addWarning());
    _socket.on('race:over', ({ results }) => race.setResults(results));

    _socket.on('session:modes_locked', (payload) => applyLock(payload));

    _socket.on('midirace:queued', () => midiRace.setQueued());
    _socket.on('midirace:matched', ({ lobbyId, players, pieceId, pieceTitle }) => {
      midiRace.setMatched(lobbyId, players, pieceId, pieceTitle, myIdRef.current);
    });
    _socket.on('midirace:countdown_start', ({ startsAt }) => midiRace.setCountdown(startsAt));
    _socket.on('midirace:start', () => midiRace.setPlaying());
    _socket.on('midirace:anticheat_warning', () => midiRace.addWarning());
    _socket.on('midirace:over', ({ results }) => midiRace.setResults(results));

    const hb = setInterval(() => {
      if (_socket?.connected) _socket.emit('heartbeat:ping', { ts: Date.now() });
    }, 5000);

    return () => {
      clearInterval(hb);
      _socket?.off();
    };
  }, [token]);

  return {
    emit: (event, data) => _socket?.emit(event, data),
    connected: () => _socket?.connected,
    socket: _socket,
  };
}
