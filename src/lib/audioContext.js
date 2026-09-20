/** Shared Web Audio context — one per page, reused by every instrument voice and effect. */
let _ctx = null;
let _masterBus = null;

export function getAudioCtx() {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _masterBus = null; // a new context needs a new compressor node too
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * Every instrument voice should connect here instead of ctx.destination
 * directly. A dense passage (fast runs, chords, or several overlapping
 * long-tail sample voices — see salamanderSampler.js) can otherwise sum past
 * 0dBFS and hard-clip at the destination, which is heard as distortion and,
 * once the graph is loaded up enough, glitching/dropouts. A gentle limiter
 * catches that without being audible on normal single-note playing.
 */
export function getMasterBus(ctx) {
  if (_masterBus) return _masterBus;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 12;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);
  _masterBus = compressor;
  return _masterBus;
}
