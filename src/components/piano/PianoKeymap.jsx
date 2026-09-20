/**
 * PianoKeymap — keyboard label strip rendered below the piano keys
 * Shows which computer key triggers each white piano key. Fluid-width to
 * stay pixel-percentage aligned with PianoKeys, which now stretches
 * edge-to-edge instead of using a fixed key width.
 * Respects current pianoOctave setting.
 */
import { useMemo } from 'react';
import { useSettingsStore } from '../../store/index.js';
import { WHITE_SEMITONES } from '../../lib/pianoLayout.js';
import './PianoKeymap.css';

// Same keyboard mapping as useMidi.js (relative offsets from base C)
const KB_MAP = {
  0: 'z', 2: 'x', 4: 'c', 5: 'v', 7: 'b', 9: 'n', 11: 'm',
  12: ',', 14: '.', 16: '/',
  13: 'q', 15: 'w', 17: 'e', 19: 'r', 21: 't', 23: 'y', 24: 'u', 26: 'i', 28: 'o',
};

function getKeyLabel(midiNote, baseNote) {
  const offset = midiNote - baseNote;
  return KB_MAP[offset] || null;
}

export function PianoKeymap({ minNote = 36, maxNote = 96 }) {
  const { pianoOctave } = useSettingsStore();
  const baseNote = 60 + (pianoOctave - 4) * 12; // C at current octave

  const whiteKeys = useMemo(() => {
    const keys = [];
    for (let n = minNote; n <= maxNote; n++) {
      if (WHITE_SEMITONES.has(n % 12)) keys.push(n);
    }
    return keys;
  }, [minNote, maxNote]);

  const widthPct = 100 / whiteKeys.length;

  return (
    <div className="piano-keymap">
      {whiteKeys.map(note => {
        const label = getKeyLabel(note, baseNote);
        return (
          <div key={note} className={`km-key ${label ? 'km-active' : ''}`} style={{ width: `${widthPct}%` }}>
            {label || ''}
          </div>
        );
      })}
    </div>
  );
}
