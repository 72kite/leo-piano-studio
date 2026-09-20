/**
 * Loads and plays the Salamander Grand Piano sample set (see
 * salamanderManifest.js for sourcing/license). A singleton — samples are
 * fetched once per page load and shared by every voice.
 *
 * Notes between sampled pitches are reached by pitch-shifting the nearest
 * sample via playbackRate — safe here because the samples are spaced every
 * minor third, so the largest shift needed is ±1.5 semitones.
 */
import { SALAMANDER_SAMPLES, SAMPLE_BASE_URL } from './salamanderManifest.js';
import { getMasterBus } from '../audioContext.js';

const buffers = new Map(); // midi -> AudioBuffer
let loadingPromise = null;
let ready = false;

function loadAll(ctx) {
  if (loadingPromise) return loadingPromise;
  loadingPromise = Promise.all(
    SALAMANDER_SAMPLES.map(async ({ note, midi }) => {
      try {
        const res = await fetch(`${SAMPLE_BASE_URL}${note}.mp3`);
        if (!res.ok) throw new Error(`${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        buffers.set(midi, audioBuffer);
      } catch {
        // One missing/failed sample shouldn't sink the whole set — the
        // nearest-neighbor lookup below just has one fewer candidate.
      }
    })
  ).then(() => {
    ready = buffers.size > 0;
  });
  return loadingPromise;
}

function nearestSample(midiNote) {
  let best = null, bestDist = Infinity;
  for (const [midi, buffer] of buffers) {
    const dist = Math.abs(midi - midiNote);
    if (dist < bestDist) { bestDist = dist; best = { midi, buffer }; }
  }
  return best;
}

export const salamanderSampler = {
  isReady() { return ready; },
  /** Fire-and-forget — call once (e.g. on Piano page mount) to start loading. */
  preload(ctx) { loadAll(ctx); },

  /** Returns a voice, or null if no sample is available yet (caller should fall back). */
  play(ctx, midiNote, velocity) {
    const sample = nearestSample(midiNote);
    if (!sample) return null;

    const now = ctx.currentTime;
    const rate = Math.pow(2, (midiNote - sample.midi) / 12);

    const source = ctx.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.value = rate;

    const velNorm = Math.max(0.05, velocity / 127);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(velNorm ** 1.2 * 0.9, now);

    source.connect(gain);
    gain.connect(getMasterBus(ctx));
    source.start(now);

    // Real piano samples carry their own natural decay/tail, so this stays a
    // *much* longer tail than the synth voices' release() (a struck string
    // keeps ringing after the key comes up) — but it can't be truly
    // unbounded. The samples run several seconds long; without an eventual
    // stop, a fast or dense passage piles up dozens of concurrent full-tail
    // AudioBufferSourceNodes (one per note, never released), which is heard
    // as growing distortion as they all sum at destination, and can bring
    // the audio graph down hard enough to go silent until playback is
    // stopped and restarted. MAX_TAIL is a hard ceiling even if release()
    // never fires (note.duration missing/huge); RELEASE_TAIL is the normal
    // path, triggered by useCompositionPlayback's per-note release timer.
    const MAX_TAIL = 6;
    const RELEASE_TAIL = 0.4;
    source.stop(now + MAX_TAIL);

    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + RELEASE_TAIL);
        source.stop(t + RELEASE_TAIL + 0.05);
      },
    };
  },
};
