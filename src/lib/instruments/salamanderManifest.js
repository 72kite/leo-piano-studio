/**
 * "Salamander Grand Piano" samples by Alexander Holm (axeldenstore@gmail.com),
 * licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).
 * This is the reduced 30-note, single-velocity, mp3 subset that Tone.js's
 * example instruments ship (https://github.com/Tonejs/audio/tree/master/salamander)
 * — the same sample set dotpiano.com itself credits and uses. Sampled every
 * minor third (A0, C/D#/F#/A per octave) from A0 up to C8; the sampler
 * pitch-shifts to fill in the notes between via playback rate.
 */
export const SALAMANDER_SAMPLES = [
  { note: 'A0', midi: 21 },  { note: 'C1', midi: 24 },  { note: 'Ds1', midi: 27 }, { note: 'Fs1', midi: 30 },
  { note: 'A1', midi: 33 },  { note: 'C2', midi: 36 },  { note: 'Ds2', midi: 39 }, { note: 'Fs2', midi: 42 },
  { note: 'A2', midi: 45 },  { note: 'C3', midi: 48 },  { note: 'Ds3', midi: 51 }, { note: 'Fs3', midi: 54 },
  { note: 'A3', midi: 57 },  { note: 'C4', midi: 60 },  { note: 'Ds4', midi: 63 }, { note: 'Fs4', midi: 66 },
  { note: 'A4', midi: 69 },  { note: 'C5', midi: 72 },  { note: 'Ds5', midi: 75 }, { note: 'Fs5', midi: 78 },
  { note: 'A5', midi: 81 },  { note: 'C6', midi: 84 },  { note: 'Ds6', midi: 87 }, { note: 'Fs6', midi: 90 },
  { note: 'A6', midi: 93 },  { note: 'C7', midi: 96 },  { note: 'Ds7', midi: 99 }, { note: 'Fs7', midi: 102 },
  { note: 'A7', midi: 105 }, { note: 'C8', midi: 108 },
];

export const SAMPLE_BASE_URL = '/audio/salamander/';
export const SAMPLE_ATTRIBUTION = '"Salamander Grand Piano" samples by Alexander Holm, CC BY 3.0';
