/**
 * CLIOverlay — ESC command-line settings interface
 * Single searchable list. Also shown as quick-settings chips.
 * Paired inline with settings rows via >_ chips.
 */
import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/index.js';
import './CLIOverlay.css';

const SCHEMA = {
  theme:       { options:['dark','light','sepia','terminal','nord','dracula','rose-pine'] },
  difficulty:  { options:['normal','expert','master'] },
  language:    { options:['en','en-british','es','ar','python','cpp','go','rust'] },
  mode:        { options:['time','words','quote','zen'] },
  font:        { options:['Space Mono','Fira Code','JetBrains Mono','DM Mono'] },
  caretStyle:  { options:['line','block','underline','off'] },
  quickRestart:{ options:['tab','esc','enter'] },
  funbox:      { options:['none','mirror','earthquake','choo_choo','gibberish','no_backspace','polyglot'] },
  timeLimit:   { range:[15,30,60,120] },
  wordCount:   { range:[10,25,50,100] },
  minSpeed:    { type:'number', min:0, max:200 },
  minAccuracy: { type:'number', min:0, max:100 },
  blindMode:   { type:'bool' },
  repeatQuote: { type:'bool' },
  showKeymap:  { type:'bool' },
  soundType:   { options:['off','click','pop','soft'] },
};

export function CLIOverlay({ open, onClose, prefillKey }) {
  const s = useSettingsStore();
  const [input, setInput]   = useState('');
  const [output, setOutput] = useState(null);
  const [hiIdx, setHiIdx]   = useState(0);
  const inputRef = useRef();

  useEffect(() => {
    if (open) {
      setInput(prefillKey ? prefillKey + ' ' : '');
      setOutput(null);
      setHiIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, prefillKey]);

  // Filter schema to matching entries
  const q       = input.trim().split(/\s+/)[0]?.toLowerCase() || '';
  const entries = Object.entries(SCHEMA).filter(([k]) =>
    !q || k.toLowerCase().includes(q)
  ).slice(0, 20);

  const run = (raw) => {
    const parts = raw.trim().split(/\s+/);
    const cmd   = parts[0]?.toLowerCase();
    const val   = parts.slice(1).join(' ');

    if (cmd === 'reset')   { s.reset(); setOutput({ ok:true,  msg:'Reset to defaults' }); return; }
    if (cmd === 'help')    { setOutput({ ok:true,  msg:Object.keys(SCHEMA).join(' · ') }); return; }

    if (SCHEMA[cmd]) {
      if (!val) { setOutput({ ok:true, msg:`${cmd} = ${s[cmd]}` }); return; }
      const sch = SCHEMA[cmd];
      if (sch.type === 'bool') {
        const v = val !== 'off' && val !== 'false' && val !== '0';
        s.set(cmd, v);
        setOutput({ ok:true, msg:`${cmd} → ${v}` });
        return;
      }
      if (sch.options && !sch.options.includes(val)) {
        setOutput({ ok:false, msg:`${cmd}: ${sch.options.join(' | ')}` }); return;
      }
      if (sch.range && !sch.range.includes(Number(val))) {
        setOutput({ ok:false, msg:`${cmd}: ${sch.range.join(' | ')}` }); return;
      }
      if (sch.type === 'number') {
        const n = Number(val);
        if (isNaN(n) || n < sch.min || n > sch.max) {
          setOutput({ ok:false, msg:`${cmd}: ${sch.min}–${sch.max}` }); return;
        }
        s.set(cmd, n);
        setOutput({ ok:true, msg:`${cmd} → ${n}` });
        return;
      }
      s.set(cmd, sch.range ? Number(val) : val);
      setOutput({ ok:true, msg:`${cmd} → ${val}` });
      return;
    }

    setOutput({ ok:false, msg:`Unknown: "${cmd}". Type help.` });
  };

  const onKey = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); run(input); setInput(''); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') setHiIdx(i => Math.min(i+1, entries.length-1));
    if (e.key === 'ArrowUp')   setHiIdx(i => Math.max(i-1, 0));
    if (e.key === 'Tab' && entries[hiIdx]) {
      e.preventDefault();
      const [k] = entries[hiIdx];
      setInput(k + ' ');
    }
  };

  if (!open) return null;

  return (
    <div className="cli-backdrop" onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="cli-box" role="dialog" aria-modal="true" aria-label="Command line settings">
        <div className="cli-title">command line &nbsp;·&nbsp; esc to close</div>

        <div className="cli-list" role="listbox">
          {entries.map(([k, sch], i) => (
            <div
              key={k}
              className={`cli-item ${i===hiIdx?'cli-hi':''}`}
              onClick={() => { setInput(k+' '); inputRef.current?.focus(); }}
              role="option"
              aria-selected={i===hiIdx}
            >
              <span className="cli-key">{k}</span>
              <span className="cli-val">
                {s[k] !== undefined ? String(s[k]) : '—'}
                {' '}·{' '}
                {sch.options ? sch.options.join('|') : sch.range ? sch.range.join('|') : sch.type}
              </span>
            </div>
          ))}
        </div>

        <input
          ref={inputRef}
          className="cli-input"
          value={input}
          onChange={e=>{ setInput(e.target.value); setOutput(null); setHiIdx(0); }}
          onKeyDown={onKey}
          placeholder="type a setting or command…"
          autoComplete="off"
          spellCheck={false}
        />

        {output && (
          <div className={`cli-output ${output.ok ? 'ok' : 'err'}`}>{output.msg}</div>
        )}

        <div className="cli-chips">
          {['dark','light','nord','dracula','rose-pine','terminal','sepia'].map(t=>(
            <button key={t} className="cli-chip" onClick={()=>run('theme '+t)}>theme {t}</button>
          ))}
          <span className="chip-sep" />
          {['normal','expert','master'].map(d=>(
            <button key={d} className="cli-chip" onClick={()=>run('difficulty '+d)}>{d}</button>
          ))}
          <span className="chip-sep" />
          <button className="cli-chip" onClick={()=>run('blindMode on')}>blind on</button>
          <button className="cli-chip" onClick={()=>run('blindMode off')}>blind off</button>
          <button className="cli-chip" onClick={()=>run('reset')}>reset</button>
        </div>
      </div>
    </div>
  );
}
