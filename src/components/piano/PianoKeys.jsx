/**
 * PianoKeys — full chromatic piano keyboard, fluid-width (fills its
 * container edge-to-edge; key positions are percentages, not fixed pixels).
 * Renders 61 keys by default (MIDI 36–96, C2–C7). keyCount prop adjusts the
 * visual range.
 */
import { useMemo } from 'react';
import { useMidiStore } from '../../store/index.js';
import { buildKeyLayout, buildKeyFractions, RANGES, noteName } from '../../lib/pianoLayout.js';
import './PianoKeys.css';

// Re-exported so existing imports (PianoMode.jsx) keep working.
export { noteName };
const octaveLabel = noteName;

export function PianoKeys({ keyCount = 61, highlightNotes, teachNotes, teachCorrect, chordNotes, size = 'normal' }) {
  const { pressedKeys } = useMidiStore();
  const [minNote, maxNote] = RANGES[keyCount] || RANGES[61];

  const { whiteKeys, blackKeys, fractions } = useMemo(() => {
    const all = buildKeyLayout(minNote, maxNote);
    return {
      whiteKeys: all.filter(k => k.isWhite),
      blackKeys: all.filter(k => !k.isWhite),
      fractions: buildKeyFractions(minNote, maxNote),
    };
  }, [minNote, maxNote]);

  // Pressed set (Set of MIDI notes from store)
  const pressed = pressedKeys; // already a Set<number>

  // Highlight notes (from composition playback)
  const highlighted = highlightNotes ? new Set(highlightNotes) : new Set();
  // Teaching Mode: notes still awaited vs. already correctly played this step
  const teachNext    = teachNotes   ? new Set(teachNotes)   : new Set();
  const teachDone     = teachCorrect ? new Set(teachCorrect) : new Set();
  // Chord Selector: notes of the currently selected chord
  const chordSet      = chordNotes  ? new Set(chordNotes)   : new Set();

  const H = size === 'large' ? 168 : 130;
  const BH = Math.round(H * 0.63);

  return (
    <div
      className="piano-keyboard"
      style={{ position: 'relative', width: '100%', height: H }}
      role="img"
      aria-label="Piano keyboard"
    >
      {/* White keys */}
      {whiteKeys.map(({ note }) => {
        const pos = fractions.positions.get(note);
        const isPressed    = pressed.has(note);
        const isHighlighted = highlighted.has(note);
        const isTeachNext   = teachNext.has(note);
        const isTeachDone   = teachDone.has(note);
        const isChord       = chordSet.has(note);
        const showLabel    = note % 12 === 0; // label C notes
        return (
          <div
            key={note}
            className={[
              'pk-white',
              isPressed     ? 'pk-pressed'      : '',
              isHighlighted ? 'pk-highlighted'  : '',
              isTeachNext   ? 'pk-teach-next'   : '',
              isTeachDone   ? 'pk-teach-correct': '',
              isChord       ? 'pk-chord-note'   : '',
            ].filter(Boolean).join(' ')}
            style={{ position: 'absolute', left: `${pos.leftPct}%`, width: `${pos.widthPct}%`, height: H, top: 0 }}
            title={octaveLabel(note)}
            aria-hidden="true"
          >
            {showLabel && (
              <span className="pk-note-label">{octaveLabel(note)}</span>
            )}
          </div>
        );
      })}

      {/* Black keys */}
      {blackKeys.map(({ note }) => {
        const pos = fractions.positions.get(note);
        const isPressed     = pressed.has(note);
        const isHighlighted = highlighted.has(note);
        const isTeachNext   = teachNext.has(note);
        const isTeachDone   = teachDone.has(note);
        const isChord       = chordSet.has(note);
        return (
          <div
            key={note}
            className={[
              'pk-black',
              isPressed     ? 'pk-pressed'      : '',
              isHighlighted ? 'pk-highlighted'  : '',
              isTeachNext   ? 'pk-teach-next'   : '',
              isTeachDone   ? 'pk-teach-correct': '',
              isChord       ? 'pk-chord-note'   : '',
            ].filter(Boolean).join(' ')}
            style={{ position: 'absolute', left: `${pos.leftPct}%`, width: `${pos.widthPct}%`, height: BH, top: 0, zIndex: 2 }}
            title={octaveLabel(note)}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}
