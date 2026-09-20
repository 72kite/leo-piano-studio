/**
 * RacePage — competitive race UI
 * State-driven. Bots fill empty slots when not enough players online.
 * Bot names use Transformers-style codenames (no "Bot" label).
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRaceStore, useAuthStore, useSettingsStore, useSessionLockStore } from '../../store/index.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useTypingEngine } from '../../hooks/useTypingEngine.js';
import { TypingCanvas } from '../typing/TypingCanvas.jsx';
import { toast } from '../ui/Toast.jsx';
import { maskName } from '../../lib/maskName.js';
import { Trophy } from 'lucide-react';
import './RacePage.css';

const AVA_COLORS = ['#e8d44d', '#5b8af5', '#a78bfa', '#f472b6', '#fb923c'];

const RACER_NAMES = [
  'Nitro-V', 'Cyber-Spec', 'Opti-Speed', 'Turbo-Flux',
  'Mech-Blaze', 'Proto-Dash', 'Vector-X', 'Hyper-Sync',
  'Volt-Strike', 'Omega-Phase', 'Delta-Core', 'Apex-Glitch',
];

const BOT_WPM_RANGE = {
  normal: [42, 68],
  expert: [70, 95],
  master: [98, 130],
};

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function makeRacers(count, difficulty) {
  const [min, max] = BOT_WPM_RANGE[difficulty] || BOT_WPM_RANGE.normal;
  const pool = [...RACER_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({
    userId:    `racer_${i}`,
    username:  pool[i] || `Racer-${i + 1}`,
    isBot:     true,
    targetWpm: randInt(min, max),
    progress:  0,
    wpm:       0,
  }));
}

const PLACEMENT_COINS = { 1: 120, 2: 60, 3: 30, 4: 10 };

function coinsForPlace(place) { return PLACEMENT_COINS[place] ?? 5; }

// ── Progress laser track ──────────────────────────────────────
function PlayerTrack({ player, progress, wpm, isMe, color }) {
  const maskUsernames = useSessionLockStore(s => s.maskUsernames);
  const shownName = isMe ? 'YOU' : (maskUsernames && !player.isBot ? maskName(player.username) : player.username);
  return (
    <div className="player-track">
      <span className={`track-name ${isMe ? 'track-me' : ''}`}>
        {shownName}
      </span>
      <div className="track-rail">
        <div
          className="track-fill"
          style={{ width: `${progress}%`, background: color + (isMe ? '' : '88') }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        <div className="track-orb" style={{ left: `${progress}%`, background: color }} />
      </div>
      <span className="track-wpm">{wpm > 0 ? `${wpm}` : '—'}</span>
    </div>
  );
}

// ── Vote option row ───────────────────────────────────────────
function VoteOption({ option, totalPlayers, tally, onVote, voted }) {
  const count = tally[option.id] || 0;
  const pct   = totalPlayers > 0 ? (count / totalPlayers) * 100 : 0;
  return (
    <div className={`vote-opt ${voted === option.id ? 'voted' : ''}`} onClick={() => onVote(option.id)}>
      <div className="vote-info">
        <div className="vote-title">{option.title}</div>
        <div className="vote-author">by {option.author} · {option.type}</div>
      </div>
      <div className="vote-bar-wrap"><div className="vote-bar" style={{ width: `${pct}%` }} /></div>
      <div className="vote-count">{count}</div>
    </div>
  );
}

// ── Bot Race ──────────────────────────────────────────────────
const BOT_RACE_TEXT = "the quick brown fox jumps over the lazy dog and then runs away into the forest where it finds a hidden treasure chest full of golden coins";

function BotRace({ onFinish }) {
  const { difficulty } = useSettingsStore();
  const engine = useTypingEngine({ text: BOT_RACE_TEXT });

  const [phase, setPhase]           = useState('countdown'); // countdown | racing | results
  const [countdown, setCountdown]   = useState(10);
  const [racers, setRacers]         = useState(() => makeRacers(3, difficulty));
  const [myProgress, setMyProgress] = useState(0);
  const [placement, setPlacement]   = useState(null);
  const [finalStats, setFinalStats] = useState(null);
  const botTimerRef  = useRef(null);
  const finishedRef  = useRef(false);
  const wordCount    = BOT_RACE_TEXT.split(' ').length;

  // Countdown phase
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setPhase('racing'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // Tick racers during racing phase
  useEffect(() => {
    if (phase !== 'racing') return;
    botTimerRef.current = setInterval(() => {
      setRacers(prev => prev.map(r => {
        if (r.progress >= 100) return r;
        const charsPerTick = (r.targetWpm * 5 / 60) * 0.12;
        const delta = (charsPerTick / (wordCount * 5)) * 100;
        const jitter = (Math.random() - 0.5) * 0.4;
        return {
          ...r,
          progress: Math.min(100, r.progress + delta + jitter),
          wpm: Math.round(r.targetWpm + (Math.random() - 0.5) * 6),
        };
      }));
    }, 120);
    return () => clearInterval(botTimerRef.current);
  }, [phase, wordCount]);

  const textProgress = wordCount > 0
    ? Math.round((engine.wordIdx / wordCount) * 100)
    : 0;

  useEffect(() => { setMyProgress(textProgress); }, [textProgress]);

  const handleFinish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearInterval(botTimerRef.current);
    setMyProgress(100);

    // Determine final placement
    const allAtFinish = [
      { id: 'me', progress: 100 },
      ...racers.map(r => ({ id: r.userId, progress: r.progress })),
    ].sort((a, b) => b.progress - a.progress);

    const place = allAtFinish.findIndex(p => p.id === 'me') + 1;
    const coins = coinsForPlace(place);

    setPlacement(place);
    setFinalStats({ wpm: engine.wpm, accuracy: engine.accuracy, coins });
    setPhase('results');
  }, [racers, engine]);

  // Enter/Tab to re-race from results
  useEffect(() => {
    if (phase !== 'results') return;
    const handler = (e) => {
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onFinish?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [phase, onFinish]);

  const placeEmoji = ['🥇', '🥈', '🥉', '4th'];
  const allPlayers = [
    { userId: 'me', username: 'YOU', isBot: false, progress: myProgress, wpm: engine.wpm, isMe: true },
    ...racers,
  ].sort((a, b) => b.progress - a.progress);

  // ── Countdown screen ──
  if (phase === 'countdown') {
    // Text is revealed 4 seconds before GO so players can read ahead and start typing
    const textRevealed = countdown > 0 && countdown <= 4;
    return (
      <div className="race-center">
        <div className="race-pre-banner">Rival racers locked in</div>
        {/* Hide racer list once text is revealed — give the canvas to the typing area */}
        {!textRevealed && (
          <div className="tracks-section tracks-preview">
            {[{ userId: 'me', username: 'YOU', isMe: true }, ...racers].map((p, i) => (
              <PlayerTrack key={p.userId} player={p} progress={0} wpm={0} isMe={p.isMe} color={AVA_COLORS[i % AVA_COLORS.length]} />
            ))}
          </div>
        )}
        <div className={`countdown-num ${textRevealed ? 'countdown-compact' : ''}`}>
          {countdown > 0 ? countdown : 'GO!'}
        </div>
        {textRevealed ? (
          <div className="race-text-reveal">
            <div className="race-text-hint">Text revealed — start typing!</div>
            <TypingCanvas engine={engine} onFinish={handleFinish} />
          </div>
        ) : (
          <div className="race-sub">Race begins in…</div>
        )}
      </div>
    );
  }

  // ── Results screen ──
  if (phase === 'results' && finalStats) {
    return (
      <div className="race-results">
        <div className="race-title">
          <Trophy size={18} style={{ color: 'var(--acc)', marginRight: 6 }} />
          {placeEmoji[(placement || 1) - 1]} {placement === 1 ? 'Victory!' : `Finished ${placement}${['st','nd','rd'][placement-1]||'th'}`}
        </div>
        <div className="race-res-grid">
          {allPlayers.map((p, i) => (
            <div key={p.userId} className={`race-res-row ${p.isMe ? 'res-me' : ''}`}>
              <span style={{ color: AVA_COLORS[i], fontFamily: 'var(--font-mono)', fontSize: '.875rem' }}>
                {placeEmoji[i] || `${i + 1}`}
              </span>
              <span className="res-name">
                {p.username}
                {p.isMe && <span className="res-you">YOU</span>}
              </span>
              <span className="res-wpm">{p.isMe ? finalStats.wpm : p.wpm} wpm</span>
              {p.isMe && (
                <span className="res-acc">{finalStats.accuracy.toFixed(1)}%</span>
              )}
            </div>
          ))}
        </div>

        <div className="race-coins-earned">
          <div className="coins-icon">🪙</div>
          <div className="coins-amount">+{finalStats.coins}</div>
          <div className="coins-label">coins earned</div>
        </div>

        <button className="race-btn-primary" onClick={onFinish}>
          Race again →
        </button>
        <div className="race-restart-hint">press Enter to race again</div>
      </div>
    );
  }

  // ── Active race ──
  return (
    <div className="racing-screen">
      <div className="tracks-section">
        {allPlayers.map((p, i) => (
          <PlayerTrack
            key={p.userId} player={p}
            progress={p.progress} wpm={p.wpm}
            isMe={p.isMe} color={AVA_COLORS[i % AVA_COLORS.length]}
          />
        ))}
      </div>
      <TypingCanvas engine={engine} onFinish={handleFinish} />
      <div className="race-foot">
        <span>Space = next word</span>
        <span>{engine.wpm} wpm</span>
      </div>
    </div>
  );
}

// ── Main RacePage ─────────────────────────────────────────────
export function RacePage() {
  const race    = useRaceStore();
  const { user } = useAuthStore();
  const { difficulty }    = useSettingsStore();
  const { emit }  = useSocket();
  const maskUsernames = useSessionLockStore(s => s.maskUsernames);
  const [voted, setVoted]           = useState(null);
  const [voteTimer, setVoteTimer]   = useState(15);
  const [myProgress, setMyProgress] = useState(0);
  const [cdSecs, setCdSecs]         = useState(5);
  const [tally, setTally]           = useState({});
  const [botMode, setBotMode]       = useState(false);
  const [bots, setBots]             = useState([]);
  const engine      = useTypingEngine({ text: race.payloadText });
  const botTimerRef = useRef(null);

  // Mirrors BotRace's local progress tracking — otherwise your own track
  // sits frozen at 0% until the moment you finish.
  const textProgress = engine.words.length > 0
    ? Math.round((engine.wordIdx / engine.words.length) * 100)
    : 0;
  useEffect(() => { setMyProgress(textProgress); }, [textProgress]);

  useEffect(() => {
    emit('race:queue');
    return () => { emit('race:dequeue'); };
  }, []);

  // After 8s in queue with no match, fall back to bots
  useEffect(() => {
    if (race.phase !== 'queued') return;
    const timer = setTimeout(() => {
      toast('No players found — starting rival match', 'info');
      setBots(makeRacers(3, difficulty));
      setBotMode(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [race.phase, difficulty]);

  // Fill remaining slots with racers
  useEffect(() => {
    if (race.phase !== 'racing') return;
    const needed = Math.max(0, 3 - race.opponents.length);
    if (needed > 0) {
      const newBots = makeRacers(needed, difficulty);
      setBots(newBots);
      botTimerRef.current = setInterval(() => {
        setBots(prev => prev.map(b => {
          if (b.progress >= 100) return b;
          const charsPerTick = (b.targetWpm * 5 / 60) * 0.12;
          const totalChars   = race.payloadText ? race.payloadText.length : 500;
          const delta = (charsPerTick / totalChars) * 100;
          return { ...b, progress: Math.min(100, b.progress + delta + (Math.random() - 0.5) * 0.4), wpm: Math.round(b.targetWpm + (Math.random() - 0.5) * 6) };
        }));
      }, 120);
    }
    return () => clearInterval(botTimerRef.current);
  }, [race.phase, race.opponents.length]);

  useEffect(() => {
    if (race.phase !== 'countdown' || !race.startEpoch) return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((race.startEpoch - Date.now()) / 1000));
      setCdSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 200);
    return () => clearInterval(tick);
  }, [race.phase, race.startEpoch]);

  useEffect(() => {
    if (race.phase !== 'voting' || !race.voteEndsAt) return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((race.voteEndsAt - Date.now()) / 1000));
      setVoteTimer(s);
      if (s <= 0) clearInterval(tick);
    }, 500);
    return () => clearInterval(tick);
  }, [race.phase, race.voteEndsAt]);

  const handleProgress = (pct, wpm, acc) => {
    setMyProgress(pct);
    emit('race:progress', { lobbyId: race.lobbyId, progress: pct, wpm, accuracy: acc });
  };

  // ── Bot mode ──────────────────────────────────────────────
  if (botMode) return (
    <BotRace onFinish={() => { setBotMode(false); race.reset(); }} />
  );

  // ── Phase: queued ─────────────────────────────────────────
  if (race.phase === 'idle' || race.phase === 'queued') return (
    <div className="race-center">
      <div className="queue-ring" />
      <div className="race-title">Finding a race…</div>
      <div className="race-sub">Matching 5 players by MMR</div>
      {race.phase === 'queued' && <div className="race-hint">In queue — rivals fill in 8s if no match</div>}
      <div className="race-btn-row">
        <button className="race-btn-ghost" onClick={() => { emit('race:dequeue'); race.reset(); }}>Cancel</button>
        <button className="race-btn-ghost" onClick={() => { emit('race:dequeue'); setBots(makeRacers(3, difficulty)); setBotMode(true); }}>
          vs Rivals now
        </button>
      </div>
    </div>
  );

  // ── Phase: matched ────────────────────────────────────────
  if (race.phase === 'matched') return (
    <div className="race-center">
      <div className="race-title ok">✓ Match Found!</div>
      <div className="match-players">
        {race.players.map((p, i) => {
          const isMe = p.userId === race.myId;
          const shown = isMe || !maskUsernames ? p.username : maskName(p.username);
          return (
            <div key={p.userId} className="match-player">
              <div className="match-av" style={{ background: AVA_COLORS[i] + '22', color: AVA_COLORS[i] }}>
                {shown.slice(0, 2).toUpperCase()}
              </div>
              <span className="match-name">{shown}</span>
              <span className="match-mmr">{p.mmr} mmr</span>
              {isMe && <span className="match-you">YOU</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Phase: voting ─────────────────────────────────────────
  if (race.phase === 'voting') return (
    <div className="race-vote">
      <div className="vote-header">
        <div className="race-title">Choose a track</div>
        <div className="vote-timer">{voteTimer}s</div>
      </div>
      <div className="vote-options">
        {race.voteOptions.map(opt => (
          <VoteOption
            key={opt.id} option={opt}
            totalPlayers={race.players.length}
            tally={tally} voted={voted}
            onVote={id => {
              if (voted) return;
              setVoted(id);
              emit('race:vote', { lobbyId: race.lobbyId, trackId: id });
            }}
          />
        ))}
      </div>
    </div>
  );

  // ── Phase: countdown ──────────────────────────────────────
  if (race.phase === 'countdown') {
    // Payload arrives at T-2500ms; reveal text at T-4s when both are ready
    const textRevealed = cdSecs <= 4 && race.payloadReady;
    return (
      <div className="race-center">
        <div className={`countdown-num ${textRevealed ? 'countdown-compact' : ''}`}>
          {cdSecs > 0 ? cdSecs : 'GO!'}
        </div>
        {textRevealed ? (
          <div className="race-text-reveal">
            <div className="race-text-hint">Track revealed — start typing!</div>
            <TypingCanvas engine={engine} onFinish={() => handleProgress(100, engine.wpm, engine.accuracy)} />
          </div>
        ) : (
          <>
            <div className="race-sub">Race starts in…</div>
            <div className={`payload-lock ${race.payloadReady ? 'ready' : ''}`}>
              {race.payloadReady ? '✓ Track ready' : '🔒 Track hidden — JIT delivery active'}
            </div>
            <div className="jit-label">anti-cheat · payload delivery: T-2500ms</div>
          </>
        )}
      </div>
    );
  }

  // ── Phase: racing ─────────────────────────────────────────
  if (race.phase === 'racing') {
    const allPlayers = [
      { userId: race.myId, username: user.username, progress: myProgress, wpm: engine.wpm, isMe: true, isBot: false },
      ...race.opponents.map(o => ({ ...o, isMe: false, isBot: false })),
      ...bots,
    ];
    return (
      <div className="racing-screen">
        <div className="tracks-section">
          {allPlayers.map((p, i) => (
            <PlayerTrack key={p.userId} player={p} progress={p.progress} wpm={p.wpm} isMe={p.isMe} color={AVA_COLORS[i % AVA_COLORS.length]} />
          ))}
        </div>
        <TypingCanvas engine={engine} onFinish={() => handleProgress(100, engine.wpm, engine.accuracy)} />
        <div className="race-foot">
          <span>Space = next word</span>
          <span id="live-wpm">{engine.wpm} wpm</span>
        </div>
      </div>
    );
  }

  // ── Phase: results ────────────────────────────────────────
  if (race.phase === 'results' && race.results) {
    const me     = race.results.find(r => r.userId === race.myId);
    const places = ['🥇', '🥈', '🥉', '4th', '5th'];
    const placeNum = me?.placement || 1;
    const coins    = coinsForPlace(placeNum);

    return (
      <div className="race-results">
        <div className="race-title">
          <Trophy size={18} style={{ color: 'var(--acc)', marginRight: 6 }} />
          {places[(placeNum) - 1]} {placeNum === 1 ? 'Victory!' : 'Finished'}
        </div>
        <div className="race-res-grid">
          {race.results.map((r, i) => {
            const isMe = r.userId === race.myId;
            const shown = isMe || !maskUsernames ? r.username : maskName(r.username);
            return (
              <div key={r.userId} className={`race-res-row ${isMe ? 'res-me' : ''}`}>
                <span style={{ color: AVA_COLORS[i], fontFamily: 'var(--font-mono)', fontSize: '.875rem' }}>{places[i] || i + 1}</span>
                <span className="res-name">{shown}{isMe && <span className="res-you">YOU</span>}</span>
                <span className="res-wpm">{r.wpm} wpm</span>
                <span className="res-acc">{r.accuracy?.toFixed(1)}%</span>
                <span className={`res-elo ${(r.eloDelta || 0) >= 0 ? 'pos' : 'neg'}`}>{(r.eloDelta || 0) >= 0 ? '+' : ''}{r.eloDelta || 0}</span>
              </div>
            );
          })}
        </div>
        <div className="race-coins-earned">
          <div className="coins-icon">🪙</div>
          <div className="coins-amount">+{coins}</div>
          <div className="coins-label">coins earned</div>
        </div>
        <button className="race-btn-primary" onClick={() => { race.reset(); emit('race:queue'); }}>
          Race again →
        </button>
        <div className="race-restart-hint">press Enter to race again</div>
      </div>
    );
  }

  return null;
}
