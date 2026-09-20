/**
 * Grand Piano — the "grand-piano" instrument entry every other module
 * refers to. Plays the real Salamander sample set once it's loaded;
 * transparently falls back to the additive synth voice (grandPianoSynth.js)
 * before samples finish loading, or if loading fails outright (offline,
 * blocked request, etc.) — so the instrument never goes silent.
 */
import { additiveGrandPiano } from './grandPianoSynth.js';
import { salamanderSampler } from './salamanderSampler.js';

export const grandPiano = {
  id: 'grand-piano',
  name: 'Grand Piano',
  family: 'Piano',

  preload(ctx) {
    salamanderSampler.preload(ctx);
  },

  play(ctx, midiNote, velocity) {
    if (salamanderSampler.isReady()) {
      const voice = salamanderSampler.play(ctx, midiNote, velocity);
      if (voice) return voice;
    }
    return additiveGrandPiano.play(ctx, midiNote, velocity);
  },
};
