/**
 * Electric Piano — FM synthesis, Rhodes/DX7 "E.PIANO 1" recipe.
 *
 *  - Carrier:modulator ratio 1:1 for the body tone — modulation index starts
 *    high and decays fast (~200ms), giving the characteristic bright "bark"
 *    on attack that mellows into a near-sine sustain.
 *  - A second FM pair at a 14:1 ratio (the documented DX7 EP1 operator
 *    ratio) with a very fast decay (~80ms) supplies the inharmonic
 *    bell/tine "bite" that's the signature of an electric (vs. acoustic)
 *    piano attack.
 *  - No sustain plateau — like the acoustic piano, it's a decaying
 *    instrument even while the key is held.
 */
import { getMasterBus } from '../audioContext.js';

export const electricPiano = {
  id: 'electric-piano',
  name: 'Electric Piano',
  family: 'Piano',

  play(ctx, midiNote, velocity) {
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const velNorm = Math.max(0.05, velocity / 127);
    const velGain = velNorm ** 1.3 * 0.45;
    const bodyLife = 2.0 + velNorm * 1.0;

    const voice = ctx.createGain();
    voice.gain.value = velGain;
    voice.connect(getMasterBus(ctx));

    // ── Body: 1:1 FM pair ──
    const carrier   = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq; // 1:1 ratio

    const modGain = ctx.createGain(); // modulation index, decays fast
    modGain.gain.setValueAtTime(freq * 1.8, now);
    modGain.gain.exponentialRampToValueAtTime(Math.max(freq * 0.02, 1), now + 0.22);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(0.85, now + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + bodyLife);
    carrier.connect(bodyGain);
    bodyGain.connect(voice);

    carrier.start(now); modulator.start(now);
    carrier.stop(now + bodyLife + 0.2);
    modulator.stop(now + bodyLife + 0.2);

    // ── Tine bite: 14:1 FM pair, fast decay ──
    const biteCarrier = ctx.createOscillator();
    biteCarrier.type = 'sine';
    biteCarrier.frequency.value = freq;
    const biteMod = ctx.createOscillator();
    biteMod.type = 'sine';
    biteMod.frequency.value = freq * 14;

    const biteModGain = ctx.createGain();
    biteModGain.gain.setValueAtTime(freq * 3.5 * velNorm, now);
    biteModGain.gain.exponentialRampToValueAtTime(Math.max(freq * 0.01, 1), now + 0.07);
    biteMod.connect(biteModGain);
    biteModGain.connect(biteCarrier.frequency);

    const biteGain = ctx.createGain();
    biteGain.gain.setValueAtTime(0, now);
    biteGain.gain.linearRampToValueAtTime(0.4 * velNorm, now + 0.002);
    biteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    biteCarrier.connect(biteGain);
    biteGain.connect(voice);

    biteCarrier.start(now); biteMod.start(now);
    biteCarrier.stop(now + 0.12);
    biteMod.stop(now + 0.12);

    return { release() {} };
  },
};
