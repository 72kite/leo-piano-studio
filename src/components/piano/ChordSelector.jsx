/**
 * ChordSelector — pick a root + quality, see the chord highlighted (purple)
 * on the keyboard below, and play it as a block chord on whatever
 * instrument is currently selected.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { CHORD_QUALITIES, ROOT_NAMES, buildChord, chordName } from '../../lib/chords.js';
import { getAudioCtx } from '../../lib/audioContext.js';
import { getInstrument } from '../../lib/instruments/index.js';
import { Music2, Play } from 'lucide-react';

export function ChordSelector({ instrumentId, onHighlight }) {
  const [root, setRoot]       = useState(0);
  const [quality, setQuality] = useState('maj');
  const [octave, setOctave]   = useState(4);

  const chordNotes = useMemo(() => buildChord(root, quality, octave), [root, quality, octave]);

  useEffect(() => {
    onHighlight?.(chordNotes);
    return () => onHighlight?.([]);
  }, [chordNotes, onHighlight]);

  const play = useCallback(() => {
    const ctx = getAudioCtx();
    const instrument = getInstrument(instrumentId);
    chordNotes.forEach(midi => {
      const voice = instrument.play(ctx, midi, 92);
      setTimeout(() => voice.release(), 1000);
    });
  }, [chordNotes, instrumentId]);

  return (
    <div className="chord-selector">
      <div className="chord-title"><Music2 size={13} /> Chord Selector</div>

      <div className="chord-roots">
        {ROOT_NAMES.map((name, i) => (
          <button
            key={name}
            className={`chord-root-btn ${root === i ? 'active' : ''}`}
            onClick={() => setRoot(i)}
          >
            {name}
          </button>
        ))}
      </div>

      <select className="chord-quality-select" value={quality} onChange={e => setQuality(e.target.value)}>
        {CHORD_QUALITIES.map(q => (
          <option key={q.id} value={q.id}>{q.label}</option>
        ))}
      </select>

      <div className="chord-readout">
        <span className="chord-name">{chordName(root, quality)}</span>
        <div className="chord-octave">
          <button className="chord-oct-btn" onClick={() => setOctave(o => Math.max(2, o - 1))}>−</button>
          <span>oct {octave}</span>
          <button className="chord-oct-btn" onClick={() => setOctave(o => Math.min(6, o + 1))}>+</button>
        </div>
      </div>

      <button className="chord-play-btn" onClick={play}>
        <Play size={12} /> Play Chord
      </button>
    </div>
  );
}
