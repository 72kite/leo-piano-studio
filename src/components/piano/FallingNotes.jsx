/**
 * FallingNotes — Synthesia-style canvas: upcoming notes fall from the top
 * and land on the keyboard directly below, exactly at their key's x
 * position (shared geometry from pianoLayout.js keeps this aligned with
 * PianoKeys/PianoKeymap). Fluid-width — resizes with its container via
 * ResizeObserver so it stays edge-to-edge at whatever width the keyboard
 * ends up rendering at, the same way DotPianoCanvas/PianoCanvasMode do.
 * Reads `elapsedRef` every animation frame instead of a React prop, so it
 * stays smooth independent of how often the playback hook re-renders the
 * rest of the page.
 */
import { useRef, useEffect } from 'react';
import { buildKeyFractions, noteName } from '../../lib/pianoLayout.js';
import './FallingNotes.css';

const LOOKAHEAD_SEC = 3.2;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function FallingNotes({ notes, elapsedRef, minNote, maxNote, height = 220 }) {
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const notesRef   = useRef(notes);
  const fractionsRef = useRef(null);
  const cssWidthRef  = useRef(0);

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { fractionsRef.current = buildKeyFractions(minNote, maxNote); }, [minNote, maxNote]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      cssWidthRef.current = rect.width;
      canvas.width  = rect.width * dpr;
      canvas.height = height * dpr;
      canvas.style.width  = rect.width + 'px';
      canvas.style.height = height + 'px';
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);

    const ctx = canvas.getContext('2d');
    const pxPerSec = height / LOOKAHEAD_SEC;

    function draw() {
      const frac = fractionsRef.current;
      const w = cssWidthRef.current;
      if (!frac || !w) { rafRef.current = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, w, height);

      // Faint guide line at every C, for orientation while notes fall.
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      frac.positions.forEach((pos, midi) => {
        if (midi % 12 === 0 && pos.isWhite) {
          const x = (pos.leftPct / 100) * w;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, height);
          ctx.stroke();
        }
      });

      const elapsed = elapsedRef.current;
      const list = notesRef.current;
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        const pos = frac.positions.get(n.midi);
        if (!pos) continue;
        const dur = n.duration || 0.4;
        const tTop = n.time;
        const tBottom = n.time + dur;
        if (tBottom < elapsed - 0.02 || tTop > elapsed + LOOKAHEAD_SEC) continue;

        const x = (pos.leftPct / 100) * w;
        const barW = (pos.widthPct / 100) * w;
        // The note's onset (tTop, sooner) sits closer to the hit-line —
        // larger y — than its release (tBottom, later) — smaller y — since
        // notes fall downward as elapsed time approaches them. So the bar's
        // screen-top edge comes from tBottom and its screen-bottom edge
        // comes from tTop, not the other way around.
        const yOnsetRaw   = height - (tTop - elapsed) * pxPerSec;
        const yReleaseRaw = height - (tBottom - elapsed) * pxPerSec;
        const yBottom = Math.max(0, Math.min(height, yOnsetRaw));
        const yTop    = Math.max(0, Math.min(height, yReleaseRaw));
        const barH = Math.max(3, yBottom - yTop);

        const sounding = elapsed >= tTop && elapsed < tBottom;
        const rgb = pos.isWhite ? '232,212,77' : '91,138,245';
        ctx.fillStyle = `rgba(${rgb},${sounding ? 0.95 : 0.5})`;
        ctx.shadowColor = sounding ? `rgba(${rgb},0.85)` : 'transparent';
        ctx.shadowBlur  = sounding ? 14 : 0;
        roundRect(ctx, x, yTop, barW, barH, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Note-letter hint — only when the bar is big enough to hold it
        // legibly; skipped on tiny/just-clipped bars to avoid clutter.
        if (barH >= 13 && barW >= 9) {
          const fontSize = Math.max(7, Math.min(10, barW * 0.32));
          ctx.font = `700 ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = pos.isWhite ? 'rgba(20,15,0,0.82)' : 'rgba(255,255,255,0.92)';
          ctx.fillText(noteName(n.midi), x + barW / 2, yTop + barH / 2);
        }
      }

      // Hit line — sits exactly at the top edge of the keyboard below.
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height - 1);
      ctx.lineTo(w, height - 1);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [height, elapsedRef]);

  return <canvas ref={canvasRef} className="falling-notes-canvas" aria-hidden="true" />;
}
