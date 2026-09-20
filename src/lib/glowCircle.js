/**
 * glowCircle — the "canvas mode" ambient light effect: a soft radial-
 * gradient disc that grows in, holds, then fades, additively blended
 * (ctx.globalCompositeOperation = 'lighter') so overlapping notes glow
 * brighter/whiter at their intersection instead of just occluding.
 * Shared by PianoCanvasMode (the full ambient view) and DotPianoCanvas
 * (the light layer behind Studio mode's keyboard) so both render played
 * notes the same way — light spreading across the stage rather than a
 * glow tied to each individual key.
 */
export const PALETTES = [
  { id: 'aurora', name: 'Aurora', colors: ['#6d5cf6', '#a78bfa', '#5b8af5', '#38bdf8', '#c084fc'] },
  { id: 'sunset', name: 'Sunset', colors: ['#f97316', '#fb923c', '#f43f5e', '#facc15', '#e879f9'] },
  { id: 'meadow', name: 'Meadow', colors: ['#4ade80', '#34d399', '#a3e635', '#2dd4bf', '#facc15'] },
  { id: 'nebula', name: 'Nebula', colors: ['#e879f9', '#818cf8', '#f472b6', '#22d3ee', '#a78bfa'] },
  { id: 'mono',   name: 'Mono',   colors: ['#e8e8ec', '#9ca3af', '#d1d5db', '#f3f4f6', '#6b7280'] },
];

const PIANO_MIN = 36, PIANO_MAX = 96;
export function noteXFraction(midiNote, min = PIANO_MIN, max = PIANO_MAX) {
  const clamped = Math.max(min, Math.min(max, midiNote));
  return (clamped - min) / (max - min);
}

export class GlowCircle {
  constructor(midiNote, velocity, color, canvasW, canvasH, opts = {}) {
    const { minNote = PIANO_MIN, maxNote = PIANO_MAX, originY = 0.5, ySpread = 0.3 } = opts;
    this.color = color;
    this.x = canvasW * noteXFraction(midiNote, minNote, maxNote);
    this.y = canvasH * (originY + (Math.random() - 0.5) * ySpread);
    const v = Math.max(0.15, velocity / 127);
    this.maxRadius   = Math.min(canvasW, canvasH) * (0.09 + v * 0.16);
    this.peakOpacity = 0.5 + v * 0.35;
    this.radius  = 0;
    this.opacity = 0;
    this.born    = performance.now();
    this.growMs  = 180;
    this.holdMs  = 260 + v * 200;
    this.fadeMs  = 900 + v * 500;
  }

  update(now) {
    const age = now - this.born;
    const total = this.growMs + this.holdMs + this.fadeMs;
    if (age < this.growMs) {
      const t = age / this.growMs;
      this.radius  = this.maxRadius * (1 - Math.pow(1 - t, 3));
      this.opacity = this.peakOpacity * t;
    } else if (age < this.growMs + this.holdMs) {
      this.radius  = this.maxRadius;
      this.opacity = this.peakOpacity;
    } else {
      const t = (age - this.growMs - this.holdMs) / this.fadeMs;
      this.radius  = this.maxRadius * (1 + t * 0.15);
      this.opacity = this.peakOpacity * Math.max(0, 1 - t);
    }
    return age < total;
  }

  draw(ctx) {
    if (this.opacity <= 0.002) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    grad.addColorStop(0, this.color);
    grad.addColorStop(1, `${this.color}00`); // hex color + alpha suffix
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }
}
