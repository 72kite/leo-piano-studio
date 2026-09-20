/**
 * Grand Piano synth voice — additive synthesis, no samples.
 *
 * This is the fallback used before the real Salamander samples finish
 * loading (or if they fail to load at all) — see grandPiano.js, which picks
 * between this and the sampled voice. Techniques (see ROADMAP.md for the
 * research this is based on):
 *  - Fletcher stretch-tuning: fₙ = n·f0·√(1 + B·n²), with B rising from bass
 *    to treble (real piano strings are stiffer/shorter up top, so higher
 *    notes' partials splay sharper — pure-integer partials are the #1 tell
 *    of a "cheap" synthesized piano).
 *  - A short bandpass-filtered noise burst under the attack simulates the
 *    hammer strike — otherwise absent from pure-tone synthesis.
 *  - Per-partial independent decay (highs die faster than the fundamental)
 *    plus a velocity-responsive low-pass (harder hits ring brighter).
 *  - A second, ~3-cent-detuned copy of the tone panned oppositely gives
 *    subtle natural width without full chorus/phasing.
 */
import { getMasterBus } from '../audioContext.js';

const PARTIALS = [
  { ratio: 1, gain: 1.00, decay: 1.4 },
  { ratio: 2, gain: 0.5,  decay: 0.85 },
  { ratio: 3, gain: 0.26, decay: 0.55 },
  { ratio: 4, gain: 0.16, decay: 0.35 },
  { ratio: 6, gain: 0.07, decay: 0.22 },
];

// B (inharmonicity coefficient) interpolated bass→treble across the 88-key range.
function inharmonicityB(midiNote) {
  const t = Math.min(1, Math.max(0, (midiNote - 21) / (108 - 21)));
  return 0.00008 + t * 0.02;
}

let _noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (_noiseBuffer && _noiseBuffer.sampleRate === ctx.sampleRate) return _noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  _noiseBuffer = buf;
  return buf;
}

function playHammerNoise(ctx, now, velNorm, freq) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = Math.min(6000, freq * 3);
  bandpass.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12 * velNorm, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
  noise.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(getMasterBus(ctx));
  noise.start(now);
  noise.stop(now + 0.03);
}

export const additiveGrandPiano = {
  id: 'grand-piano-synth',
  name: 'Grand Piano (synth)',
  family: 'Piano',

  play(ctx, midiNote, velocity) {
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const velNorm = Math.max(0.05, velocity / 127);
    const velGain = velNorm ** 1.5 * 0.5;
    const decayMul = 0.75 + velNorm * 0.5;
    const B = inharmonicityB(midiNote);

    playHammerNoise(ctx, now, velNorm, freq);

    const voice = ctx.createGain();
    voice.gain.value = velGain;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600 + velNorm * 3400;
    filter.Q.value = 0.3;
    voice.connect(filter);
    filter.connect(getMasterBus(ctx));

    const oscs = [];
    [-1, 1].forEach(side => {
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.12;
      pan.connect(voice);

      PARTIALS.forEach(({ ratio, gain, decay }) => {
        const stretched = ratio * Math.sqrt(1 + B * ratio * ratio);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq * stretched * (1 + side * 0.00025); // ~2-3 cent width

        const partialGain = ctx.createGain();
        const life = decay * decayMul;
        partialGain.gain.setValueAtTime(0, now);
        partialGain.gain.linearRampToValueAtTime(gain * 0.5, now + 0.006);
        partialGain.gain.exponentialRampToValueAtTime(Math.max(gain * 0.0005, 0.0001), now + life);

        osc.connect(partialGain);
        partialGain.connect(pan);
        osc.start(now);
        osc.stop(now + life + 0.15);
        oscs.push(osc);
      });
    });

    // Naturally decaying — release() is a no-op, a struck string keeps
    // decaying even while the key stays down.
    return { release() {} };
  },
};
