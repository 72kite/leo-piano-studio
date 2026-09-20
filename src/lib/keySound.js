/**
 * Lightweight Web Audio typing-sound effects — backs the "Key sound"
 * setting (off / click / pop / soft), which previously had a full chip
 * selector + volume slider in Settings/CLI but no playback code anywhere.
 */
let _ctx = null;
function getAudioCtx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _ctx;
}

const PRESETS = {
  click: { freq: 1600, wave: 'square',   decay: 0.03, gain: 0.5 },
  pop:   { freq: 320,  wave: 'sine',     decay: 0.09, gain: 0.6 },
  soft:  { freq: 700,  wave: 'triangle', decay: 0.05, gain: 0.35 },
};

/**
 * @param {string} type - 'off' | 'click' | 'pop' | 'soft'
 * @param {number} volumePct - 0-100, from settings.soundVolume
 * @param {boolean} correct - incorrect keystrokes get a slightly lower pitch
 */
export function playKeySound(type, volumePct, correct = true) {
  const preset = PRESETS[type];
  if (!preset || !volumePct) return;
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = preset.wave;
    osc.frequency.value = correct ? preset.freq : preset.freq * 0.72;

    const gain = ctx.createGain();
    const peak = (volumePct / 100) * preset.gain;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.decay);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + preset.decay + 0.02);
  } catch {}
}
