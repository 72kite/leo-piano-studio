/**
 * Synth Pad — warm analog-style sustained pad.
 *
 * Two detuned sawtooths (±4 cents — subtle, not full "supersaw" width) plus
 * a sub triangle layer for warmth, run through a low-pass filter whose
 * cutoff sweeps open slowly on attack. Sustained like the organ — needs
 * real note-on/note-off tracking.
 */
import { getMasterBus } from '../audioContext.js';

export const synthPad = {
  id: 'synth-pad',
  name: 'Synth Pad',
  family: 'Synth',

  play(ctx, midiNote, velocity) {
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    const velNorm = Math.max(0.2, velocity / 127);
    const peak = velNorm ** 1.2 * 0.28;

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.5); // slow attach

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.linearRampToValueAtTime(2400, now + 0.8); // brightens in as it swells

    voice.connect(filter);
    filter.connect(getMasterBus(ctx));

    const saw1 = ctx.createOscillator(); saw1.type = 'sawtooth'; saw1.frequency.value = freq * (1 - 0.00023);
    const saw2 = ctx.createOscillator(); saw2.type = 'sawtooth'; saw2.frequency.value = freq * (1 + 0.00023);
    const sub  = ctx.createOscillator(); sub.type  = 'triangle'; sub.frequency.value  = freq / 2;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    sub.connect(subGain);
    subGain.connect(voice);
    saw1.connect(voice);
    saw2.connect(voice);

    saw1.start(now); saw2.start(now); sub.start(now);

    let released = false;
    function release() {
      if (released) return;
      released = true;
      const relNow = ctx.currentTime;
      voice.gain.cancelScheduledValues(relNow);
      voice.gain.setValueAtTime(voice.gain.value, relNow);
      voice.gain.exponentialRampToValueAtTime(0.0001, relNow + 0.7); // slow release matches slow attack
      const stopAt = relNow + 0.75;
      saw1.stop(stopAt); saw2.stop(stopAt); sub.stop(stopAt);
    }
    const maxHoldTimer = setTimeout(release, 10000);

    return { release: () => { clearTimeout(maxHoldTimer); release(); } };
  },
};
