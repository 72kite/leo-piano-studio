/**
 * Organ — Hammond-style drawbar synthesis.
 *
 * The 9 classic drawbars (16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1') map to
 * these ratios of the fundamental (8'): [0.5, 3, 1, 2, 6, 4, 5, 6, 8].
 * Tonewheels are near-pure sine waves — unlike the piano/EP voices, this is
 * a genuinely *sustained* instrument: it holds at full volume for as long
 * as the key is down and only fades on release(), so it needs real
 * note-on/note-off voice tracking rather than a fire-and-forget envelope.
 */
import { getMasterBus } from '../audioContext.js';

const DRAWBAR_RATIOS = [0.5, 3, 1, 2, 6, 4, 5, 6, 8];
const DRAWBAR_GAINS  = [0.5, 0.15, 1, 0.4, 0.15, 0.25, 0.1, 0.08, 0.06];

export const organ = {
  id: 'organ',
  name: 'Organ',
  family: 'Organ',

  play(ctx, midiNote, velocity) {
    const now = ctx.currentTime;
    const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    // Real Hammonds barely respond to key velocity — keep it near-constant.
    const velNorm = Math.max(0.7, velocity / 127);
    const peak = velNorm * 0.22;

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(peak, now + 0.012); // near-instant attack

    // Key-click: a tiny broadband tick at note-on (contact bounce)
    const click = ctx.createGain();
    click.gain.setValueAtTime(0.05 * velNorm, now);
    click.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.value = freq * 8;
    clickOsc.connect(click);
    click.connect(getMasterBus(ctx));
    clickOsc.start(now);
    clickOsc.stop(now + 0.02);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5200;
    voice.connect(filter);
    filter.connect(getMasterBus(ctx));

    const oscs = DRAWBAR_RATIOS.map((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.value = DRAWBAR_GAINS[i];
      osc.connect(g);
      g.connect(voice);
      osc.start(now);
      return osc;
    });

    let released = false;
    function release() {
      if (released) return;
      released = true;
      const relNow = ctx.currentTime;
      voice.gain.cancelScheduledValues(relNow);
      voice.gain.setValueAtTime(voice.gain.value, relNow);
      voice.gain.exponentialRampToValueAtTime(0.0001, relNow + 0.12); // fast, percussive key-off
      oscs.forEach(o => o.stop(relNow + 0.15));
    }
    // Safety net — if a note-off is ever missed, this keeps the voice from
    // droning forever and leaking oscillator nodes.
    const maxHoldTimer = setTimeout(release, 15000);

    return { release: () => { clearTimeout(maxHoldTimer); release(); } };
  },
};
