/**
 * PianoQuickBar — slim, sticky bar directly under the app's TopNav. Holds
 * everything needed to actually play without scrolling: the Studio/Canvas/
 * Fullscreen switch, transport (rewind/play/stop), the instrument picker,
 * and circular quick-access triggers for the Metronome and Chord Selector
 * (each opens a small glass popover containing the full control — the
 * circle is the new compact identity for both, replacing the two boxy
 * cards that used to live at the bottom of the page).
 */
import { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Square, Rewind, Piano as PianoIcon, Sparkles,
  Maximize2, Minimize2, Music, Music2,
} from 'lucide-react';
import { INSTRUMENTS } from '../../lib/instruments/index.js';
import { Metronome } from './Metronome.jsx';
import { ChordSelector } from './ChordSelector.jsx';
import './PianoQuickBar.css';

export function PianoQuickBar({
  isCanvasMode, setSetting, isFullscreen, toggleFullscreen,
  playback, instrumentId, onChordHighlight,
}) {
  const [openPanel, setOpenPanel] = useState(null); // null | 'metro' | 'chords'
  const barRef = useRef(null);

  useEffect(() => {
    if (!openPanel) return;
    const onDocPointer = (e) => {
      if (barRef.current && !barRef.current.contains(e.target)) setOpenPanel(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenPanel(null); };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPanel]);

  const togglePanel = (name) => setOpenPanel(p => (p === name ? null : name));

  const { playing, elapsed, totalDuration, play, pause, stop, rewind } = playback;
  const pct = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;

  return (
    <div className="piano-quickbar" ref={barRef}>
      <div className="qb-group">
        <button
          className={`glass-btn qb-mode-btn ${!isCanvasMode ? 'active' : ''}`}
          onClick={() => setSetting('pianoSubMode', 'composition')}
        >
          <PianoIcon size={13} /> Studio
        </button>
        <button
          className={`glass-btn qb-mode-btn ${isCanvasMode ? 'active' : ''}`}
          onClick={() => setSetting('pianoSubMode', 'canvas')}
        >
          <Sparkles size={13} /> Canvas
        </button>
        <button
          className="glass-btn qb-icon-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>

      {!isCanvasMode && (
        <div className="qb-group qb-transport">
          <button className="glass-btn qb-icon-btn" onClick={() => rewind(5)} disabled={totalDuration === 0} title="Back 5s">
            <Rewind size={13} />
          </button>
          {playing ? (
            <button className="glass-btn qb-icon-btn" onClick={pause} title="Pause"><Pause size={13} /></button>
          ) : (
            <button className="glass-btn qb-icon-btn" onClick={play} disabled={totalDuration === 0} title="Play"><Play size={13} /></button>
          )}
          <button className="glass-btn qb-icon-btn" onClick={stop} title="Stop"><Square size={13} /></button>
          <div className="qb-progress"><div className="qb-progress-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {!isCanvasMode && (
        <div className="qb-group qb-instruments">
          {INSTRUMENTS.map(inst => (
            <button
              key={inst.id}
              className={`glass-btn qb-inst-btn ${instrumentId === inst.id ? 'active' : ''}`}
              onClick={() => setSetting('pianoInstrument', inst.id)}
              title={inst.name}
            >
              {inst.name}
            </button>
          ))}
        </div>
      )}

      {!isCanvasMode && (
        <div className="qb-group qb-circles">
          {/* Both popovers stay mounted (visibility toggled via CSS, not
              conditional rendering) — closing the popover shouldn't clear
              the chord highlight on the keyboard or stop a running
              metronome; it should just tuck the controls out of the way. */}
          <div className="qb-circle-wrap">
            <button
              className={`glass-btn qb-circle-btn ${openPanel === 'metro' ? 'active' : ''}`}
              onClick={() => togglePanel('metro')}
              title="Metronome"
            >
              <Music size={16} />
            </button>
            <div className={`qb-popover glass-panel ${openPanel === 'metro' ? 'qb-popover-open' : ''}`}>
              <Metronome />
            </div>
          </div>
          <div className="qb-circle-wrap">
            <button
              className={`glass-btn qb-circle-btn ${openPanel === 'chords' ? 'active' : ''}`}
              onClick={() => togglePanel('chords')}
              title="Chord Selector"
            >
              <Music2 size={16} />
            </button>
            <div className={`qb-popover glass-panel ${openPanel === 'chords' ? 'qb-popover-open' : ''}`}>
              <ChordSelector instrumentId={instrumentId} onHighlight={onChordHighlight} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
