/**
 * pianoLayout — single source of truth for how MIDI notes map to horizontal
 * key positions. Shared by PianoKeys (renders the actual keys), PianoKeymap
 * (the computer-keyboard label strip below them) and FallingNotes (the
 * Synthesia-style canvas above them) so all three stay aligned.
 *
 * Positions are fractions of the keyboard's total width (0–100), not fixed
 * pixels — the keyboard stretches to fill its container edge-to-edge at
 * whatever width the viewport gives it, and everything reading these
 * fractions (falling notes, the key strip) scales with it instead of
 * assuming a fixed key width.
 */
export const WHITE_SEMITONES = new Set([0, 2, 4, 5, 7, 9, 11]);
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midiNote) {
  return NOTE_NAMES[midiNote % 12] + (Math.floor(midiNote / 12) - 1);
}

export function isSharp(midiNote) {
  return !WHITE_SEMITONES.has(midiNote % 12);
}

// Piano ranges by key count: [minNote, maxNote]
export const RANGES = {
  49: [36, 84],  // C2–C6
  61: [36, 96],  // C2–C7
  76: [28, 103], // E1–G7
  88: [21, 108], // A0–C8
};

// Build sorted list of all notes in range with metadata (white index, or the
// white key a black key sits above).
export function buildKeyLayout(minNote, maxNote) {
  const keys = [];
  let whiteIdx = 0;
  for (let n = minNote; n <= maxNote; n++) {
    const isWhite = WHITE_SEMITONES.has(n % 12);
    keys.push({ note: n, isWhite, whiteIdx: isWhite ? whiteIdx : null });
    if (isWhite) whiteIdx++;
  }
  return keys.map(k => {
    if (k.isWhite) return k;
    const leftWhite = keys.find(w => w.isWhite && w.note === k.note - 1);
    return { ...k, leftWhiteIdx: leftWhite?.whiteIdx ?? 0 };
  });
}

/**
 * Build a Map<midiNote, {leftPct, widthPct, isWhite}> — each key's
 * horizontal position as a percentage of the full keyboard width. Multiply
 * by whatever the keyboard's actual rendered pixel width is (100% of its
 * container) to get real coordinates; that's what makes the same geometry
 * work whether the keyboard renders at 900px or 2200px wide.
 */
export function buildKeyFractions(minNote, maxNote) {
  const layout = buildKeyLayout(minNote, maxNote);
  const totalWhite = layout.filter(k => k.isWhite).length;
  const whiteWidthPct = 100 / totalWhite;
  const blackWidthPct = whiteWidthPct * 0.62;
  const positions = new Map();
  for (const k of layout) {
    if (k.isWhite) {
      positions.set(k.note, { leftPct: k.whiteIdx * whiteWidthPct, widthPct: whiteWidthPct, isWhite: true });
    } else {
      positions.set(k.note, {
        leftPct: (k.leftWhiteIdx + 1) * whiteWidthPct - blackWidthPct / 2,
        widthPct: blackWidthPct,
        isWhite: false,
      });
    }
  }
  return { positions, totalWhite, whiteWidthPct, blackWidthPct };
}
