/**
 * ModeToolbar — pill-shaped toggles row
 * Groups: Modifiers | Modes | Values | FunBox
 * Adapts options when in piano mode.
 */
import { useEffect } from 'react';
import { useSettingsStore, useSessionLockStore } from '../../store/index.js';
import './ModeToolbar.css';

const FUNBOXES = [
  { id: 'none',        label: 'fun off'    },
  { id: 'mirror',      label: 'mirror'     },
  { id: 'earthquake',  label: 'earthquake' },
  { id: 'choo_choo',   label: 'choo choo'  },
  { id: 'gibberish',   label: 'gibberish'  },
  { id: 'no_backspace',label: 'no bs'      },
  { id: 'polyglot',    label: 'polyglot'   },
];

function Pill({ label, active, onClick, accent, locked }) {
  return (
    <button
      className={`pill ${active ? 'pill-on' : ''} ${accent ? 'pill-accent' : ''} ${locked ? 'pill-locked' : ''}`}
      onClick={locked ? undefined : onClick}
      disabled={locked}
      aria-pressed={active}
      title={locked ? 'Locked by your teacher' : undefined}
    >
      {label}
    </button>
  );
}

function Divider() { return <span className="toolbar-divider" aria-hidden="true" />; }

export function ModeToolbar() {
  const s = useSettingsStore();
  const lockedModes = useSessionLockStore(sl => sl.lockedModes);

  const activeFunbox = s.funbox || 'none';
  const modeLocked   = (m) => lockedModes.includes(m);
  const funboxLocked = lockedModes.includes('funbox');

  // If the teacher locks the mode/funbox the student is currently on,
  // force them off it immediately rather than leaving a locked-but-active
  // pill visible.
  useEffect(() => {
    if (modeLocked(s.mode)) {
      const firstOpen = ['time', 'words', 'quote', 'zen'].find(m => !modeLocked(m));
      if (firstOpen) s.set('mode', firstOpen);
    }
  }, [lockedModes, s.mode]);

  useEffect(() => {
    if (funboxLocked && activeFunbox !== 'none') s.set('funbox', 'none');
  }, [funboxLocked, activeFunbox]);

  return (
    <div className="mode-toolbar" role="toolbar" aria-label="Typing mode options">
      {/* ── Modifiers ── */}
      <Pill label="@" active={s.punctuation} onClick={() => s.set('punctuation', !s.punctuation)} />
      <Pill label="#" active={s.numbers}     onClick={() => s.set('numbers',     !s.numbers)}     />
      <Divider />

      {/* ── Modes ── */}
      {['time', 'words', 'quote', 'zen'].map(m => (
        <Pill key={m} label={m} active={s.mode === m} onClick={() => s.set('mode', m)} locked={modeLocked(m)} />
      ))}
      <Divider />

      {/* ── Values (time or word count) ── */}
      {s.mode === 'time'  && [15, 30, 60, 120].map(n => (
        <Pill key={n} label={`${n}`} active={s.timeLimit === n} onClick={() => s.set('timeLimit', n)} />
      ))}
      {s.mode === 'words' && [10, 25, 50, 100].map(n => (
        <Pill key={n} label={`${n}`} active={s.wordCount === n} onClick={() => s.set('wordCount', n)} />
      ))}
      {s.mode === 'zen' && <span className="toolbar-hint">∞ no end condition</span>}

      <Divider />

      {/* ── FunBox ── */}
      {FUNBOXES.map(f => (
        <Pill
          key={f.id}
          label={f.label}
          active={activeFunbox === f.id}
          onClick={() => s.set('funbox', f.id === 'none' ? 'none' : f.id)}
          locked={f.id !== 'none' && funboxLocked}
        />
      ))}
    </div>
  );
}
