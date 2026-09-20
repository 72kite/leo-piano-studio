/**
 * DotPianoCanvas — the ambient light layer behind Studio mode's keyboard.
 * Uses the same GlowCircle effect as Canvas mode (soft, additively-blended
 * discs that grow/hold/fade) instead of small dots rising from each key, so
 * a played note reads as light spreading across the black stage rather than
 * a per-key spark. Full-bleed, pointer-events: none — never blocks the UI.
 */
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { GlowCircle, PALETTES } from '../../lib/glowCircle.js';
import './DotPianoCanvas.css';

const PIANO_MIN = 36, PIANO_MAX = 96;
const palette = PALETTES[0]; // Aurora — matches Canvas mode's default look
const noteColorCache = new Map();

function colorForNote(midiNote) {
  if (!noteColorCache.has(midiNote)) {
    noteColorCache.set(midiNote, palette.colors[midiNote % palette.colors.length]);
  }
  return noteColorCache.get(midiNote);
}

// ── Component ─────────────────────────────────────────────────
export const DotPianoCanvas = forwardRef(function DotPianoCanvas(props, ref) {
  const canvasRef = useRef(null);
  const circles   = useRef([]);
  const rafRef    = useRef(null);
  const isRunning = useRef(false);

  // Expose spawnNote() to parent
  useImperativeHandle(ref, () => ({
    spawnNote(midiNote, velocity) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      circles.current.push(new GlowCircle(
        midiNote, velocity, colorForNote(midiNote), canvas.width, canvas.height,
        { minNote: PIANO_MIN, maxNote: PIANO_MAX, originY: 0.55, ySpread: 0.5 }
      ));
      if (!isRunning.current) startLoop();
    },
  }));

  // ── RAF animation loop ────────────────────────────────────────
  function startLoop() {
    isRunning.current = true;
    function loop() {
      const canvas = canvasRef.current;
      if (!canvas) { isRunning.current = false; return; }
      const ctx = canvas.getContext('2d');
      const now  = performance.now();

      // A single bad frame (e.g. a draw() throwing) must never permanently
      // kill the loop — rescheduling happens in `finally` no matter what.
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        circles.current = circles.current.filter(c => {
          const alive = c.update(now);
          if (alive) c.draw(ctx);
          return alive;
        });
      } catch (err) {
        console.error('[DotPianoCanvas] frame draw failed:', err);
        circles.current = [];
      }

      if (circles.current.length > 0) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        isRunning.current = false;
        rafRef.current    = null;
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect  = canvas.parentElement.getBoundingClientRect();
      canvas.width  = rect.width;
      canvas.height = rect.height;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="dot-piano-canvas"
      aria-hidden="true"
    />
  );
});
