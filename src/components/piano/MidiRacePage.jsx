/**
 * MidiRacePage — proficiency-based MIDI Race.
 *
 * Unlike typing Race Mode, players don't compete on speed: everyone is
 * assigned the same piece (server/midirace/pieces.js picks one of the
 * built-in Community Library tracks — src/lib/builtInPieces.js has the
 * matching note data) and plays it once, at the same tempo, for the same
 * duration. Ranking is by how well each player played it — a proficiency
 * score computed from hit-rate (did you press the right pitch near the
 * right time) and a small penalty for wrong/extra presses — not who
 * finished first. See server/midirace/socket.js for the server side of
 * this contract.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useMidiRaceStore, useAuthStore, useSessionLockStore } from '../../store/index.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useMidi } from '../../hooks/useMidi.js';
import { useCompositionPlayback } from '../../hooks/useCompositionPlayback.js';
import { getBuiltInPiece } from '../../lib/builtInPieces.js';
import { maskName } from '../../lib/maskName.js';
import { PianoKeys } from './PianoKeys.jsx';
import { FallingNotes } from './FallingNotes.jsx';
import { Trophy, Music } from 'lucide-react';
import './MidiRacePage.css';
import '../race/RacePage.css'; // reuses .race-center/.match-*/.race-res-*/.countdown-num — generic race-page chrome, not typing-specific

const HIT_TOLERANCE = 0.35; // seconds — how close a press has to land to a note's onset to count
// Stable reference for "no piece assigned yet" — `piece?.notes || []` would
// hand useCompositionPlayback a *new* empty array every render, and its own
// `useEffect(() => stop(), [notes])` treats that as "notes changed" every
// single time, calling setState in a loop (React's "Maximum update depth
// exceeded").
const EMPTY_NOTES = [];

export function MidiRacePage() {
  const midiRace = useMidiRaceStore();
  const { user } = useAuthStore();
  const maskUsernames = useSessionLockStore(s => s.maskUsernames);
  const { emit } = useSocket();
  const [cdSecs, setCdSecs] = useState(5);
  const finishedRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const hitIndicesRef = useRef(new Set());
  const wrongCountRef = useRef(0);

  const piece = midiRace.pieceId ? getBuiltInPiece(midiRace.pieceId) : null;
  const notes = piece?.notes || EMPTY_NOTES;
  const playback = useCompositionPlayback(notes, 'grand-piano');

  const [liveHits, setLiveHits] = useState(0);
  const [liveWrong, setLiveWrong] = useState(0);

  const scoreAndFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const totalNotes = notes.length;
    const hits = hitIndicesRef.current.size;
    const hitRatio = totalNotes > 0 ? hits / totalNotes : 0;
    const wrongPenalty = Math.min(30, wrongCountRef.current); // capped so a wild flurry can't drag the score negative
    const score = Math.max(0, Math.round(hitRatio * 100 - wrongPenalty));
    emit('midirace:finish', { lobbyId: midiRace.lobbyId, score, hits, totalNotes });
  }, [notes.length, emit, midiRace.lobbyId]);

  const handleNoteOn = useCallback((midiNote) => {
    const t = playback.elapsedRef.current;
    let bestIdx = -1, bestDist = Infinity;
    notes.forEach((n, i) => {
      if (hitIndicesRef.current.has(i)) return;
      if (n.midi !== midiNote) return;
      const dist = Math.abs(n.time - t);
      if (dist <= HIT_TOLERANCE && dist < bestDist) { bestDist = dist; bestIdx = i; }
    });
    if (bestIdx !== -1) {
      hitIndicesRef.current.add(bestIdx);
      setLiveHits(hitIndicesRef.current.size);
    } else {
      wrongCountRef.current += 1;
      setLiveWrong(wrongCountRef.current);
    }
  }, [notes, playback.elapsedRef]);

  const { status: midiStatus } = useMidi({ onNoteOn: handleNoteOn });

  // Countdown display, driven by the server's shared startEpoch.
  useEffect(() => {
    if (midiRace.phase !== 'countdown' || !midiRace.startEpoch) return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((midiRace.startEpoch - Date.now()) / 1000));
      setCdSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 200);
    return () => clearInterval(tick);
  }, [midiRace.phase, midiRace.startEpoch]);

  // When the server says "start," reset local scoring state and begin
  // playback — the piece itself is the shared clock every player follows.
  useEffect(() => {
    if (midiRace.phase !== 'playing') return;
    finishedRef.current = false;
    hitIndicesRef.current = new Set();
    wrongCountRef.current = 0;
    setLiveHits(0);
    setLiveWrong(0);
    playback.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiRace.phase]);

  // The piece ending is what ends a player's race — useCompositionPlayback
  // flips `playing` back to false via stopAtEnd() when it reaches the end.
  // Watch for that falling edge specifically (true -> false) rather than
  // also checking `elapsed > 0`: stopAtEnd() resets elapsed to 0 in the same
  // batch as setting playing=false, so by the time a render shows
  // playing===false, elapsed has already gone back to 0 too — a "just
  // finished" state and "never started" state look identical if you only
  // read elapsed.
  useEffect(() => {
    if (playback.playing) {
      wasPlayingRef.current = true;
    } else if (wasPlayingRef.current && midiRace.phase === 'playing') {
      wasPlayingRef.current = false;
      scoreAndFinish();
    }
  }, [playback.playing, midiRace.phase, scoreAndFinish]);

  useEffect(() => {
    emit('midirace:queue');
    return () => { emit('midirace:dequeue'); midiRace.reset(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownName = (p) => (p.userId === midiRace.myId || !maskUsernames) ? p.username : maskName(p.username);

  // ── Phase: queued ──
  if (midiRace.phase === 'idle' || midiRace.phase === 'queued') return (
    <div className="race-center">
      <div className="queue-ring" />
      <div className="race-title">Finding a MIDI race…</div>
      <div className="race-sub">Matching by proficiency — same piece, same start</div>
      <button className="race-btn-ghost" onClick={() => { emit('midirace:dequeue'); midiRace.reset(); }}>Cancel</button>
    </div>
  );

  // ── Phase: matched ──
  if (midiRace.phase === 'matched') return (
    <div className="race-center">
      <div className="race-title ok">✓ Match Found!</div>
      <div className="race-sub"><Music size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />{piece?.title || midiRace.pieceTitle}</div>
      <div className="match-players">
        {midiRace.players.map((p, i) => (
          <div key={p.userId} className="match-player">
            <div className="match-av" style={{ background: '#e8d44d22', color: '#e8d44d' }}>
              {shownName(p).slice(0, 2).toUpperCase()}
            </div>
            <span className="match-name">{shownName(p)}</span>
            {p.userId === midiRace.myId && <span className="match-you">YOU</span>}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Phase: countdown ──
  if (midiRace.phase === 'countdown') return (
    <div className="race-center">
      <div className="countdown-num">{cdSecs > 0 ? cdSecs : 'GO!'}</div>
      <div className="race-sub">{piece?.title || midiRace.pieceTitle} — get ready</div>
    </div>
  );

  // ── Phase: playing ──
  if (midiRace.phase === 'playing') return (
    <div className="midirace-stage">
      <div className="midirace-hud">
        <span className="mr-piece-title">{piece?.title}</span>
        <span className="mr-live-score">
          <span className="mr-hits">{liveHits}</span> / {notes.length} hit
          {liveWrong > 0 && <span className="mr-wrong">{liveWrong} wrong</span>}
        </span>
        <span className={`mr-midi-status mr-${midiStatus}`}>{midiStatus}</span>
      </div>
      <FallingNotes notes={notes} elapsedRef={playback.elapsedRef} minNote={48} maxNote={84} height={200} />
      <PianoKeys keyCount={61} highlightNotes={playback.activeMidi} />
    </div>
  );

  // ── Phase: results ──
  if (midiRace.phase === 'results' && midiRace.results) {
    const me = midiRace.results.find(r => r.userId === midiRace.myId);
    const places = ['🥇', '🥈', '🥉', '4th', '5th'];
    return (
      <div className="race-results">
        <div className="race-title">
          <Trophy size={18} style={{ color: 'var(--acc)', marginRight: 6 }} />
          {places[(me?.placement || 1) - 1]} {me?.placement === 1 ? 'Victory!' : 'Finished'}
        </div>
        <div className="race-res-grid">
          {midiRace.results.map((r, i) => (
            <div key={r.userId} className={`race-res-row ${r.userId === midiRace.myId ? 'res-me' : ''}`}>
              <span style={{ color: '#e8d44d', fontFamily: 'var(--font-mono)', fontSize: '.875rem' }}>{places[i] || i + 1}</span>
              <span className="res-name">{shownName(r)}{r.userId === midiRace.myId && <span className="res-you">YOU</span>}</span>
              <span className="res-wpm">{r.score} pts</span>
              <span className="res-wpm">{r.hits}/{r.totalNotes} hit</span>
              <span className={`res-elo ${(r.eloDelta || 0) >= 0 ? 'pos' : 'neg'}`}>{(r.eloDelta || 0) >= 0 ? '+' : ''}{r.eloDelta || 0}</span>
            </div>
          ))}
        </div>
        {me && (
          <div className="race-coins-earned">
            <div className="coins-icon">🪙</div>
            <div className="coins-amount">+{me.coins}</div>
            <div className="coins-label">coins earned</div>
          </div>
        )}
        <button className="race-btn-primary" onClick={() => { midiRace.reset(); emit('midirace:queue'); }}>
          Race again →
        </button>
      </div>
    );
  }

  return null;
}
