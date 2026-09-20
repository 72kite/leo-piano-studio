/**
 * SheetMusic — SVG treble-clef staff renderer
 * Accepts a notes array from @tonejs/midi and renders them as noteheads.
 *
 * Improvements over v1:
 * - Multiple ledger lines above and below the staff (as many as the note needs)
 * - Scroll-to-active: the container smoothly scrolls to keep the playing note centred
 * - Higher contrast staff lines
 * - Optional onOverride callback renders a "Change file" button overlay
 */
import { useMemo, useRef, useEffect } from 'react';
import './SheetMusic.css';

const STAFF_STEP = 6;       // px per diatonic staff slot
const LINE_GAP   = STAFF_STEP * 2; // px between adjacent staff lines

// semitone index → diatonic step (C=0 … B=6)
const DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

// B4 (MIDI 71) = staff line 3 reference
function midiToStaffY(midiNote, staffCenterY) {
  const oct  = Math.floor(midiNote / 12) - 1;
  const semi = midiNote % 12;
  const dia  = DIATONIC[semi];
  const stepsFromB4 = (oct - 4) * 7 + (dia - 6);
  return staffCenterY - stepsFromB4 * STAFF_STEP;
}

function isSharp(midiNote) {
  return [1, 3, 6, 8, 10].includes(midiNote % 12);
}

// Build the array of Y positions for all ledger lines a note needs
function ledgerLinesBelow(noteY, bottomLineY) {
  const lines = [];
  for (let y = bottomLineY + LINE_GAP; y <= noteY + STAFF_STEP * 0.5; y += LINE_GAP) {
    lines.push(y);
  }
  return lines;
}

function ledgerLinesAbove(noteY, topLineY) {
  const lines = [];
  for (let y = topLineY - LINE_GAP; y >= noteY - STAFF_STEP * 0.5; y -= LINE_GAP) {
    lines.push(y);
  }
  return lines;
}

const NOTE_COLORS = {
  active: '#e8d44d',
  normal: 'rgba(255,255,255,0.75)',
  ledger: 'rgba(255,255,255,0.30)',
};

export function SheetMusic({ notes = [], activeNote = null, width = 800, onOverride }) {
  const HEIGHT       = 180;
  const MARGIN_LEFT  = 52;
  const STAFF_TOP    = 48;
  const staffCenterY = STAFF_TOP + LINE_GAP * 2; // line 3 = middle B4

  const containerRef = useRef(null);

  const displayNotes = useMemo(() => {
    return notes
      .filter(n => n.midi >= 40 && n.midi <= 96)
      .slice(0, 120);
  }, [notes]);

  const noteSpacing = displayNotes.length > 0
    ? Math.max(18, Math.min(30, (width - MARGIN_LEFT - 20) / displayNotes.length))
    : 24;

  // Scroll so the active note stays centred in the viewport
  useEffect(() => {
    if (activeNote === null || !containerRef.current) return;
    const idx = displayNotes.findIndex(n => n.midi === activeNote);
    if (idx === -1) return;
    const x = MARGIN_LEFT + idx * noteSpacing + noteSpacing / 2;
    containerRef.current.scrollTo({
      left: Math.max(0, x - containerRef.current.clientWidth / 2),
      behavior: 'smooth',
    });
  }, [activeNote, displayNotes, noteSpacing]);

  // 5 staff lines: positions relative to STAFF_TOP
  const staffLines = [0, 1, 2, 3, 4].map(i => STAFF_TOP + i * LINE_GAP);
  const topLine    = staffLines[0];
  const bottomLine = staffLines[4];

  const svgWidth = Math.max(width, displayNotes.length * noteSpacing + MARGIN_LEFT + 30);

  return (
    <div className="sheet-music-wrap" ref={containerRef}>
      {onOverride && (
        <button className="sheet-override-btn" onClick={onOverride} title="Load a different file">
          ↑ Change file
        </button>
      )}
      <svg
        className="sheet-music-svg"
        width={svgWidth}
        height={HEIGHT}
        aria-label="Sheet music"
      >
        {/* Staff lines — higher opacity for legibility */}
        {staffLines.map((y, i) => (
          <line key={i} x1={MARGIN_LEFT - 12} y1={y} x2={svgWidth - 4} y2={y}
            stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
        ))}

        {/* Treble clef */}
        <text x={6} y={STAFF_TOP + LINE_GAP * 3.4}
          fontSize="46" fill="rgba(255,255,255,0.45)"
          fontFamily="serif" style={{ pointerEvents: 'none' }}>
          𝄞
        </text>

        {/* Notes */}
        {displayNotes.map((note, i) => {
          const x       = MARGIN_LEFT + i * noteSpacing + noteSpacing / 2;
          const y       = midiToStaffY(note.midi, staffCenterY);
          const isActive = note.midi === activeNote;
          const sharp    = isSharp(note.midi);
          const color    = isActive ? NOTE_COLORS.active : NOTE_COLORS.normal;

          const ledgersBelow = ledgerLinesBelow(y, bottomLine);
          const ledgersAbove = ledgerLinesAbove(y, topLine);

          return (
            <g key={i}>
              {/* Active note: subtle glow ring rendered behind the notehead */}
              {isActive && (
                <ellipse cx={x} cy={y} rx={10} ry={8}
                  fill="rgba(232,212,77,0.18)" />
              )}

              {/* Ledger lines below staff */}
              {ledgersBelow.map((ly, j) => (
                <line key={`lb${j}`} x1={x - 9} y1={ly} x2={x + 9} y2={ly}
                  stroke={NOTE_COLORS.ledger} strokeWidth="1.2" />
              ))}

              {/* Ledger lines above staff */}
              {ledgersAbove.map((ly, j) => (
                <line key={`la${j}`} x1={x - 9} y1={ly} x2={x + 9} y2={ly}
                  stroke={NOTE_COLORS.ledger} strokeWidth="1.2" />
              ))}

              {/* Sharp accidental */}
              {sharp && (
                <text x={x - 10} y={y + 4} fontSize="10" fill={color}
                  fontFamily="serif" opacity={isActive ? 1 : 0.65}>♯</text>
              )}

              {/* Notehead */}
              <ellipse cx={x} cy={y} rx={5} ry={4}
                fill={color}
                style={{ transition: 'fill 80ms ease' }}
              />

              {/* Stem */}
              <line x1={x + 4.5} y1={y} x2={x + 4.5} y2={y - LINE_GAP * 2.5}
                stroke={color} strokeWidth="1.2"
                style={{ transition: 'stroke 80ms ease' }} />
            </g>
          );
        })}

        {/* Empty state hint */}
        {displayNotes.length === 0 && (
          <text x={MARGIN_LEFT + 12} y={staffCenterY + 4}
            fontSize="11" fill="rgba(255,255,255,0.25)"
            fontFamily="var(--font-mono)">
            Load a track or play notes to see sheet music
          </text>
        )}
      </svg>
    </div>
  );
}
