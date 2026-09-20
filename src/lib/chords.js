/**
 * chords — small chord-spelling library for the Chord Selector.
 * Intervals are semitones from the root; buildChord() returns MIDI notes.
 */
export const CHORD_QUALITIES = [
  { id: 'maj',    label: 'Major',        symbol: '',      intervals: [0, 4, 7] },
  { id: 'min',    label: 'Minor',        symbol: 'm',     intervals: [0, 3, 7] },
  { id: 'dim',    label: 'Diminished',   symbol: 'dim',   intervals: [0, 3, 6] },
  { id: 'aug',    label: 'Augmented',    symbol: 'aug',   intervals: [0, 4, 8] },
  { id: 'sus2',   label: 'Sus2',         symbol: 'sus2',  intervals: [0, 2, 7] },
  { id: 'sus4',   label: 'Sus4',         symbol: 'sus4',  intervals: [0, 5, 7] },
  { id: '6',      label: '6th',          symbol: '6',     intervals: [0, 4, 7, 9] },
  { id: 'm6',     label: 'Minor 6th',    symbol: 'm6',    intervals: [0, 3, 7, 9] },
  { id: 'maj7',   label: 'Major 7th',    symbol: 'maj7',  intervals: [0, 4, 7, 11] },
  { id: 'min7',   label: 'Minor 7th',    symbol: 'm7',    intervals: [0, 3, 7, 10] },
  { id: 'dom7',   label: 'Dominant 7th', symbol: '7',     intervals: [0, 4, 7, 10] },
  { id: 'dim7',   label: 'Diminished 7', symbol: 'dim7',  intervals: [0, 3, 6, 9] },
  { id: 'm7b5',   label: 'Half-Dim 7',   symbol: 'm7b5',  intervals: [0, 3, 6, 10] },
  { id: 'add9',   label: 'Add9',         symbol: 'add9',  intervals: [0, 4, 7, 14] },
];

export const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function getChordQuality(id) {
  return CHORD_QUALITIES.find(q => q.id === id) || CHORD_QUALITIES[0];
}

/** rootPitchClass: 0-11 (C=0). octave: which octave the root lands in (4 = middle C octave). */
export function buildChord(rootPitchClass, qualityId, octave = 4) {
  const quality = getChordQuality(qualityId);
  const rootMidi = (octave + 1) * 12 + rootPitchClass;
  return quality.intervals.map(iv => rootMidi + iv);
}

export function chordName(rootPitchClass, qualityId) {
  const quality = getChordQuality(qualityId);
  return `${ROOT_NAMES[rootPitchClass]}${quality.symbol}`;
}
