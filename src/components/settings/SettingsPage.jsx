/**
 * SettingsPage — two-column grid with inline >_ CLI quick chips
 */
import { useState } from 'react';
import { useSettingsStore, useAuthStore, useTeacherStore } from '../../store/index.js';
import { toast } from '../ui/Toast.jsx';
import './SettingsPage.css';

const THEMES = ['dark','light','sepia','terminal','nord','dracula','rose-pine'];
const FONTS   = ['Space Mono','Fira Code','JetBrains Mono','DM Mono'];
const LANGS   = ['en','en-british','es','ar','python','cpp','go','rust'];
const FUNBOXES= ['none','mirror','earthquake','choo_choo','gibberish','no_backspace','polyglot'];

function Chips({ options, active, onSelect }) {
  return (
    <div className="chip-group">
      {options.map(o => (
        <button key={o} className={`chip ${active===o?'chip-on':''}`} onClick={()=>onSelect(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
function Toggle({ value, onChange }) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" className="toggle-input" checked={value} onChange={e=>onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  );
}
function Slider({ value, min, max, step, onChange }) {
  return (
    <div className="range-wrap">
      <input type="range" className="range-input" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} />
      <span className="range-val">{value}</span>
    </div>
  );
}
function NumInput({ value, min, max, onChange }) {
  return (
    <input type="number" className="num-input" min={min} max={max} value={value}
      onChange={e=>onChange(Number(e.target.value))} />
  );
}

// ── Join a Class — students only; posts the teacher's join code to
// /api/teacher/roster/join so their aggregate stats show up on the
// teacher's dashboard. ──
function JoinClassSection() {
  const { user, isGuest } = useAuthStore();
  const joinClass = useTeacherStore(s => s.joinClass);
  const [code, setCode]     = useState('');
  const [joining, setJoining] = useState(false);

  if (isGuest || user?.role !== 'student') return null;

  const submit = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setJoining(true);
    const result = await joinClass(trimmed);
    setJoining(false);
    if (result.ok) {
      toast(`Joined ${result.teacherUsername}'s class`, 'success');
      setCode('');
    } else {
      const message = result.error === 'NOT_FOUND' ? 'No class found for that code' : 'Could not join class';
      toast(message, 'error');
    }
  };

  return (
    <>
      <div className="settings-section-title" style={{marginTop:'1rem'}}>Classroom</div>
      <Row label="Join a class" desc="Enter the code your teacher shared to appear on their roster.">
        <div className="join-class-row">
          <input
            className="num-input join-class-input"
            type="text"
            placeholder="CODE"
            value={code}
            maxLength={12}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <button className="settings-reset-btn" onClick={submit} disabled={joining || !code.trim()}>
            {joining ? 'Joining…' : 'Join'}
          </button>
        </div>
      </Row>
    </>
  );
}

function Row({ label, desc, children, settingKey, onCLI }) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-label">
          {label}
          {settingKey && (
            <button className="setting-cli-chip" onClick={()=>onCLI?.(settingKey)} title="Set via CLI">&gt;_</button>
          )}
        </div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({ onOpenCLI }) {
  const s = useSettingsStore();

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div className="settings-title">Settings</div>
        <button className="settings-reset-btn" onClick={s.reset}>reset to defaults</button>
      </div>
      <div className="settings-grid">
        {/* ── Left column ── */}
        <div className="settings-section">
          <div className="settings-section-title">Difficulty</div>
          <Row label="Difficulty" desc="normal=classic · expert=fail on wrong word · master=fail on any error" settingKey="difficulty" onCLI={onOpenCLI}>
            <Chips options={['normal','expert','master']} active={s.difficulty} onSelect={v=>s.set('difficulty',v)} />
          </Row>
          <Row label="Blind mode" desc="Hides all error feedback" settingKey="blindMode" onCLI={onOpenCLI}>
            <Toggle value={s.blindMode} onChange={v=>s.set('blindMode',v)} />
          </Row>
          <Row label="Min speed (WPM)" desc="0 = off" settingKey="minSpeed" onCLI={onOpenCLI}>
            <NumInput value={s.minSpeed} min={0} max={200} onChange={v=>s.set('minSpeed',v)} />
          </Row>
          <Row label="Min accuracy %" desc="0 = off" settingKey="minAccuracy" onCLI={onOpenCLI}>
            <NumInput value={s.minAccuracy} min={0} max={100} onChange={v=>s.set('minAccuracy',v)} />
          </Row>

          <div className="settings-section-title" style={{marginTop:'1rem'}}>Behaviour</div>
          <Row label="Quick restart" settingKey="quickRestart" onCLI={onOpenCLI}>
            <Chips options={['tab','esc','enter']} active={s.quickRestart} onSelect={v=>s.set('quickRestart',v)} />
          </Row>
          <Row label="Repeat quote" settingKey="repeatQuote" onCLI={onOpenCLI}>
            <Toggle value={s.repeatQuote} onChange={v=>s.set('repeatQuote',v)} />
          </Row>

          <div className="settings-section-title" style={{marginTop:'1rem'}}>Language</div>
          <Row label="Language" settingKey="language" onCLI={onOpenCLI}>
            <Chips options={LANGS} active={s.language} onSelect={v=>s.set('language',v)} />
          </Row>
          {s.language === 'en' && (
            <Row label="British spelling" desc="Mixes colour/centre/theatre-style words into the English pool" settingKey="britishEn" onCLI={onOpenCLI}>
              <Toggle value={s.britishEn} onChange={v=>s.set('britishEn',v)} />
            </Row>
          )}

          <div className="settings-section-title" style={{marginTop:'1rem'}}>Funbox</div>
          <Row label="Modifier" settingKey="funbox" onCLI={onOpenCLI}>
            <Chips options={FUNBOXES} active={s.funbox} onSelect={v=>s.set('funbox',v)} />
          </Row>
        </div>

        {/* ── Right column ── */}
        <div className="settings-section">
          <div className="settings-section-title">Appearance</div>
          <Row label="Theme" settingKey="theme" onCLI={onOpenCLI}>
            <Chips options={THEMES} active={s.theme} onSelect={v=>s.set('theme',v)} />
          </Row>
          <Row label="Font" settingKey="font" onCLI={onOpenCLI}>
            <Chips options={FONTS} active={s.font} onSelect={v=>s.set('font',v)} />
          </Row>
          <Row label="Caret style" settingKey="caretStyle" onCLI={onOpenCLI}>
            <Chips options={['line','block','underline','off']} active={s.caretStyle} onSelect={v=>s.set('caretStyle',v)} />
          </Row>
          <Row label="Virtual keymap" settingKey="showKeymap" onCLI={onOpenCLI}>
            <Toggle value={s.showKeymap} onChange={v=>s.set('showKeymap',v)} />
          </Row>

          <div className="settings-section-title" style={{marginTop:'1rem'}}>Sound</div>
          <Row label="Key sound" settingKey="soundType" onCLI={onOpenCLI}>
            <Chips options={['off','click','pop','soft']} active={s.soundType} onSelect={v=>s.set('soundType',v)} />
          </Row>
          <Row label="Volume" settingKey="soundVolume" onCLI={onOpenCLI}>
            <Slider value={s.soundVolume} min={0} max={100} step={5} onChange={v=>s.set('soundVolume',v)} />
          </Row>

          <JoinClassSection />
        </div>
      </div>
    </div>
  );
}
