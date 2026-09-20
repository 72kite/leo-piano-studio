/**
 * PianoCanvasMode — ambient full-canvas visualizer, in the spirit of
 * dotpiano.com (Alex Chen & Yotam Mann): played notes spawn large, soft
 * glowing circles positioned by pitch and additively blended where they
 * overlap, colored by a selectable palette, with no on-screen keyboard —
 * "the instrument as light" rather than a DAW.
 *
 * Unlike DotPiano, recordings aren't shared via a server-hosted link (that
 * needs real backend storage/streaming — out of scope here). Instead a
 * recording captures the session into the same {midi,time,duration,velocity}
 * shape the rest of Composition Studio already speaks, so "Save to
 * Composition" hands it straight to the existing player/staff/MusicXML
 * export pipeline in Studio mode.
 */
import { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Disc, Square, Trash2 } from 'lucide-react';
import { GlowCircle, PALETTES } from '../../lib/glowCircle.js';
import './PianoCanvasMode.css';

export { PALETTES };

export const PianoCanvasMode = forwardRef(function PianoCanvasMode({ onSaveRecording }, ref) {
  const canvasRef   = useRef(null);
  const circles     = useRef([]);
  const rafRef      = useRef(null);
  const isRunning   = useRef(false);
  const paletteRef  = useRef(PALETTES[0]);
  const noteColorRef = useRef(new Map()); // stable color-per-note-class within a palette

  const [palette, setPalette] = useState(PALETTES[0]);
  paletteRef.current = palette;

  const [recording, setRecording]   = useState(false);
  const [elapsed, setElapsed]       = useState(0);
  const [lastTake, setLastTake]     = useState(null); // { notes, duration } once stopped
  const recordStartRef = useRef(null);
  const recordedRef    = useRef([]);
  const openNotesRef    = useRef(new Map()); // midi -> { time, velocity } while held, during recording
  const elapsedTimerRef = useRef(null);

  const colorForNote = useCallback((midiNote) => {
    const key = `${paletteRef.current.id}:${midiNote}`;
    if (!noteColorRef.current.has(key)) {
      noteColorRef.current.set(key, paletteRef.current.colors[midiNote % paletteRef.current.colors.length]);
    }
    return noteColorRef.current.get(key);
  }, []);

  function startLoop() {
    isRunning.current = true;
    function loop() {
      const canvas = canvasRef.current;
      if (!canvas) { isRunning.current = false; return; }
      const ctx = canvas.getContext('2d');
      const now = performance.now();
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        circles.current = circles.current.filter(c => {
          const alive = c.update(now);
          if (alive) c.draw(ctx);
          return alive;
        });
      } catch (err) {
        console.error('[PianoCanvasMode] frame draw failed:', err);
        circles.current = [];
      }
      if (circles.current.length > 0) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        isRunning.current = false;
        rafRef.current = null;
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  useImperativeHandle(ref, () => ({
    spawnNote(midiNote, velocity) {
      const canvas = canvasRef.current;
      if (canvas) {
        circles.current.push(new GlowCircle(midiNote, velocity, colorForNote(midiNote), canvas.width, canvas.height));
        if (!isRunning.current) startLoop();
      }
      if (recordStartRef.current !== null) {
        openNotesRef.current.set(midiNote, { time: (Date.now() - recordStartRef.current) / 1000, velocity });
      }
    },
    noteOff(midiNote) {
      if (recordStartRef.current === null) return;
      const open = openNotesRef.current.get(midiNote);
      if (!open) return;
      openNotesRef.current.delete(midiNote);
      const now = (Date.now() - recordStartRef.current) / 1000;
      recordedRef.current.push({
        midi: midiNote,
        time: open.time,
        duration: Math.max(0.08, now - open.time),
        velocity: open.velocity,
      });
    },
  }), [colorForNote]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
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

  const startRecording = useCallback(() => {
    recordedRef.current = [];
    openNotesRef.current = new Map();
    recordStartRef.current = Date.now();
    setLastTake(null);
    setElapsed(0);
    setRecording(true);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed((Date.now() - recordStartRef.current) / 1000);
    }, 100);
  }, []);

  const stopRecording = useCallback(() => {
    clearInterval(elapsedTimerRef.current);
    // Any notes still physically held when recording stops get a nominal duration.
    const tailNow = (Date.now() - recordStartRef.current) / 1000;
    openNotesRef.current.forEach((open, midi) => {
      recordedRef.current.push({ midi, time: open.time, duration: Math.max(0.08, tailNow - open.time), velocity: open.velocity });
    });
    openNotesRef.current.clear();
    const notes = [...recordedRef.current].sort((a, b) => a.time - b.time);
    setRecording(false);
    setLastTake(notes.length ? { notes, duration: tailNow } : null);
  }, []);

  useEffect(() => () => clearInterval(elapsedTimerRef.current), []);

  const clearCanvas = () => { circles.current = []; };

  const saveTake = () => {
    if (!lastTake) return;
    onSaveRecording?.(lastTake.notes, `Canvas recording — ${new Date().toLocaleTimeString()}`);
    setLastTake(null);
  };

  return (
    <div className="canvas-mode">
      <div className="canvas-toolbar">
        <div className="canvas-palettes">
          {PALETTES.map(p => (
            <button
              key={p.id}
              className={`canvas-palette-btn ${palette.id === p.id ? 'active' : ''}`}
              onClick={() => setPalette(p)}
              title={p.name}
            >
              <span className="canvas-palette-swatch" style={{ background: `conic-gradient(${p.colors.join(',')})` }} />
            </button>
          ))}
        </div>
        <button className="canvas-clear-btn" onClick={clearCanvas} title="Clear canvas">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="canvas-surface-wrap">
        <canvas ref={canvasRef} className="canvas-mode-surface" aria-hidden="true" />
        {circles.current.length === 0 && !recording && (
          <div className="canvas-hint">Play using your computer keys or a MIDI keyboard.</div>
        )}
      </div>

      <div className="canvas-record-row">
        <button
          className={`canvas-record-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          title={recording ? 'Stop recording' : 'Record this session'}
        >
          {recording ? <Square size={18} /> : <Disc size={18} />}
        </button>
        <span className="canvas-record-label">
          {recording ? `Recording… ${elapsed.toFixed(1)}s` : 'Record'}
        </span>
        {lastTake && !recording && (
          <button className="canvas-save-btn" onClick={saveTake}>
            Save {lastTake.notes.length} note{lastTake.notes.length === 1 ? '' : 's'} to Composition
          </button>
        )}
      </div>
    </div>
  );
});
