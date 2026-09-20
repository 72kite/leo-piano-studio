/**
 * Instrument registry — every voice implements `play(ctx, midiNote, velocity)
 * => { release() }`. Decay-only instruments (piano-family) return a no-op
 * release; sustained instruments (organ, pad) actually fade on release() and
 * require the caller to track voices per MIDI note and call it on note-off.
 * An instrument may optionally implement `preload(ctx)` (fire-and-forget) if
 * it has assets to fetch — called once when the Piano page mounts.
 * Add a new instrument by writing a module with this shape and listing it
 * here — nothing else in the app needs to change.
 */
import { grandPiano } from './grandPiano.js';
import { electricPiano } from './electricPiano.js';
import { organ } from './organ.js';
import { synthPad } from './synthPad.js';

export const INSTRUMENTS = [grandPiano, electricPiano, organ, synthPad];
export const DEFAULT_INSTRUMENT_ID = grandPiano.id;

export function getInstrument(id) {
  return INSTRUMENTS.find(i => i.id === id) || grandPiano;
}
