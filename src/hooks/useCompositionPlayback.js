/**
 * useCompositionPlayback — the single playback engine behind Composition
 * Studio: schedules note-on/off audio, tracks transport time, and exposes
 * seek()/rewind() so playback can be "pressed to stop or rolled back"
 * instead of only ever running forward.
 *
 * Two different update channels on purpose:
 *  - `elapsedRef` is a mutable ref updated every animation frame. FallingNotes
 *    reads it directly inside its own rAF draw loop, so the falling bars are
 *    buttery-smooth without forcing 60fps React re-renders.
 *  - `elapsed` (state) is throttled to ~12fps — cheap enough for the
 *    transport bar's numeric readout and progress-fill width.
 * activeMidi is event-driven (set exactly when a note starts/stops), not
 * polled every frame, so it stays cheap and — unlike the old single-note
 * `onActiveNote` — correctly reports every note in a chord at once.
 */
import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { getAudioCtx } from '../lib/audioContext.js';
import { getInstrument } from '../lib/instruments/index.js';

const UI_TICK_MS = 80;

export function useCompositionPlayback(notes, instrumentId) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeMidi, setActiveMidi] = useState([]);

  const elapsedRef      = useRef(0);
  const startRef         = useRef(0);
  const rafRef            = useRef(null);
  const uiIntervalRef     = useRef(null);
  const noteTimersRef     = useRef([]);
  const activeVoicesRef   = useRef(new Set());
  const activeMidiSetRef  = useRef(new Set());

  const totalDuration = useMemo(() => (
    notes.length > 0 ? Math.max(...notes.map(n => n.time + (n.duration || 0.5))) : 0
  ), [notes]);

  const pushActiveMidi = useCallback((midi) => {
    activeMidiSetRef.current.add(midi);
    setActiveMidi([...activeMidiSetRef.current]);
  }, []);
  const popActiveMidi = useCallback((midi) => {
    activeMidiSetRef.current.delete(midi);
    setActiveMidi([...activeMidiSetRef.current]);
  }, []);

  const silenceAll = useCallback(() => {
    activeVoicesRef.current.forEach(v => v.release());
    activeVoicesRef.current.clear();
    activeMidiSetRef.current.clear();
    setActiveMidi([]);
  }, []);

  const clearTimers = useCallback(() => {
    noteTimersRef.current.forEach(clearTimeout);
    noteTimersRef.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (uiIntervalRef.current) clearInterval(uiIntervalRef.current);
    uiIntervalRef.current = null;
  }, []);

  const stopAtEnd = useCallback(() => {
    clearTimers();
    silenceAll();
    setPlaying(false);
    setElapsed(0);
    elapsedRef.current = 0;
  }, [clearTimers, silenceAll]);

  const rafLoop = useCallback(() => {
    const t = (performance.now() - startRef.current) / 1000;
    elapsedRef.current = t;
    if (t >= totalDuration) {
      stopAtEnd();
      return;
    }
    rafRef.current = requestAnimationFrame(rafLoop);
  }, [totalDuration, stopAtEnd]);

  const playFrom = useCallback((t) => {
    clearTimers();
    startRef.current = performance.now() - t * 1000;
    elapsedRef.current = t;
    setElapsed(t);
    setPlaying(true);

    const ctx = getAudioCtx();
    const instrument = getInstrument(instrumentId);

    notes.forEach(note => {
      const delay = note.time - t;
      if (delay < 0) return;
      noteTimersRef.current.push(setTimeout(() => {
        const voice = instrument.play(ctx, note.midi, note.velocity ?? 80);
        activeVoicesRef.current.add(voice);
        pushActiveMidi(note.midi);
        const releaseTimer = setTimeout(() => {
          voice.release();
          activeVoicesRef.current.delete(voice);
          popActiveMidi(note.midi);
        }, (note.duration || 0.4) * 1000);
        noteTimersRef.current.push(releaseTimer);
      }, delay * 1000));
    });

    rafRef.current = requestAnimationFrame(rafLoop);
    uiIntervalRef.current = setInterval(() => {
      setElapsed(elapsedRef.current);
    }, UI_TICK_MS);
  }, [notes, instrumentId, clearTimers, rafLoop, pushActiveMidi, popActiveMidi]);

  const play = useCallback(() => playFrom(elapsedRef.current), [playFrom]);

  const pause = useCallback(() => {
    clearTimers();
    silenceAll();
    setPlaying(false);
  }, [clearTimers, silenceAll]);

  const stop = useCallback(() => {
    clearTimers();
    silenceAll();
    setPlaying(false);
    setElapsed(0);
    elapsedRef.current = 0;
  }, [clearTimers, silenceAll]);

  const seek = useCallback((t) => {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    silenceAll();
    if (playing) {
      playFrom(clamped);
    } else {
      elapsedRef.current = clamped;
      setElapsed(clamped);
    }
  }, [playing, playFrom, totalDuration, silenceAll]);

  const rewind = useCallback((sec = 5) => seek(elapsedRef.current - sec), [seek]);

  // A newly loaded (or replaced) composition always resets playback.
  useEffect(() => { stop(); }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearTimers(); silenceAll(); }, [clearTimers, silenceAll]);

  return {
    playing, elapsed, totalDuration, activeMidi, elapsedRef,
    play, pause, stop, seek, rewind,
  };
}
