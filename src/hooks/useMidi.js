/**
 * useMidi — React hook wrapping the Web MIDI API
 *
 * Supports full note range (any MIDI note 0-127), and binds to every
 * currently-connected MIDI input — not just the first one the browser
 * happens to enumerate. `MIDIAccess.onstatechange` stays wired for the
 * whole session, so a device plugged in after load (or a second device
 * alongside the first) is picked up too, instead of only ever listening
 * to whichever port was first at probe time.
 * Falls back to a multi-octave keyboard mapping when no MIDI device found.
 *
 * Keyboard mapping (base octave = 4 by default):
 *   Lower row white:  z x c v b n m , . /   → C4-E5
 *   Lower row black:  a s   d f g   h j      → C#4-D#5
 *   Upper row white:  q w e r t y u i o p   → C5-E6
 *   Upper row black:  1 2   4 5 6   8 9     → C#5-D#6
 */
import { useEffect, useRef, useCallback } from 'react';
import { useMidiStore, useSettingsStore } from '../store/index.js';

const KB_BASE = {
  // Lower row white keys → C D E F G A B C D E  (relative to base)
  'z':  0, 'x':  2, 'c':  4, 'v':  5, 'b':  7, 'n':  9, 'm': 11, ',': 12, '.': 14, '/': 16,
  // Lower row black keys → C# D# F# G# A# C# D#
  'a':  1, 's':  3,           'd':  6, 'f':  8, 'g': 10,           'h': 13, 'j': 15,
  // Upper row white keys → C D E F G A B C D E  (+12 from lower)
  'q': 12, 'w': 14, 'e': 16, 'r': 17, 't': 19, 'y': 21, 'u': 23, 'i': 24, 'o': 26, 'p': 28,
  // Upper row black keys → C# D# F# G# A# C# D#
  '1': 13, '2': 15,           '4': 18, '5': 20, '6': 22,           '8': 25, '9': 27,
};

const STARTUP_CHIME = [60, 62, 64, 65];
const DEVICE_WAIT_MS = 4000;

function estimateKeyCount(minNote, maxNote) {
  const range = maxNote - minNote + 1;
  if (range <= 49) return 49;
  if (range <= 61) return 61;
  if (range <= 76) return 76;
  return 88;
}

function describeInputs(inputs) {
  const names = inputs.map(i => i.name).filter(Boolean);
  if (names.length === 0) return 'MIDI device';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1} more`;
}

export function useMidi({ onNoteOn, onNoteOff } = {}) {
  const midi     = useMidiStore();
  const settings = useSettingsStore();

  const accessRef       = useRef(null);
  const inputsRef        = useRef(new Map()); // id -> MIDIInput currently bound
  const loopRef          = useRef(null);
  const kbDownRef        = useRef(null);
  const kbUpRef          = useRef(null);
  const activeNotes      = useRef(new Set());
  const noteRangeRef     = useRef({ min: 127, max: 0, count: 0 });
  const fallbackTimerRef = useRef(null);

  // Always-current callback refs — updated synchronously each render.
  // This lets handleMidiMessage stay stable ([] deps) while always
  // calling the latest onNoteOn/onNoteOff passed by the consumer.
  const onNoteOnRef      = useRef(onNoteOn);
  onNoteOnRef.current    = onNoteOn;
  const onNoteOffRef     = useRef(onNoteOff);
  onNoteOffRef.current   = onNoteOff;
  // Same pattern for pianoOctave so keyboard fallback stays stable too.
  const pianoOctaveRef   = useRef(settings.pianoOctave);
  pianoOctaveRef.current = settings.pianoOctave;

  // ── Loading chase loop ────────────────────────────────────────
  const startLoop = useCallback(() => {
    let step = 0;
    midi.setLoopStep(0);
    loopRef.current = setInterval(() => {
      step = (step + 1) % 4;
      midi.setLoopStep(step);
    }, 200);
  }, []);

  const stopLoop = useCallback(() => {
    if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
    midi.setLoopStep(-1);
  }, []);

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) { clearTimeout(fallbackTimerRef.current); fallbackTimerRef.current = null; }
  }, []);

  // ── MIDI message handler — stable ([] deps, reads latest callbacks from refs)
  const handleMidiMessage = useCallback((ev) => {
    const [status, note, velocity] = ev.data;
    const isNoteOn  = (status & 0xF0) === 0x90 && velocity > 0;
    const isNoteOff = (status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0);

    if (isNoteOn) {
      const r = noteRangeRef.current;
      r.min = Math.min(r.min, note);
      r.max = Math.max(r.max, note);
      r.count++;
      if (r.count > 5) midi.setKeyCount(estimateKeyCount(r.min, r.max));

      activeNotes.current.add(note);
      midi.pressKey(note);
      onNoteOnRef.current?.(note, velocity);
    }
    if (isNoteOff) {
      activeNotes.current.delete(note);
      midi.releaseKey(note);
      onNoteOffRef.current?.(note);
    }
  }, []); // stable — never recreated; reads live values from refs above

  // ── Keyboard listener teardown (shared by init/activateMidiInputs/unmount) ──
  const removeKeyboardListeners = useCallback(() => {
    if (kbDownRef.current) { document.removeEventListener('keydown', kbDownRef.current); kbDownRef.current = null; }
    if (kbUpRef.current)   { document.removeEventListener('keyup',   kbUpRef.current);   kbUpRef.current = null; }
  }, []);

  // ── Keyboard fallback — stable (reads octave from ref, not closure) ──
  const activateKeyboardFallback = useCallback((reason) => {
    stopLoop();
    midi.setStatus('fallback', reason);
    removeKeyboardListeners();

    kbDownRef.current = (e) => {
      if (e.repeat) return;
      const offset = KB_BASE[e.key.toLowerCase()];
      if (offset === undefined) return;
      const baseNote = 60 + (pianoOctaveRef.current - 4) * 12; // always current octave
      const midiNote = Math.max(0, Math.min(127, baseNote + offset));
      if (activeNotes.current.has(midiNote)) return;
      e.preventDefault();
      activeNotes.current.add(midiNote);
      midi.pressKey(midiNote);
      onNoteOnRef.current?.(midiNote, 80);
    };

    kbUpRef.current = (e) => {
      const offset = KB_BASE[e.key.toLowerCase()];
      if (offset === undefined) return;
      const baseNote = 60 + (pianoOctaveRef.current - 4) * 12;
      const midiNote = Math.max(0, Math.min(127, baseNote + offset));
      activeNotes.current.delete(midiNote);
      midi.releaseKey(midiNote);
      onNoteOffRef.current?.(midiNote);
    };

    document.addEventListener('keydown', kbDownRef.current);
    document.addEventListener('keyup',   kbUpRef.current);
  }, [stopLoop, removeKeyboardListeners]); // stable

  // ── Bind/unbind individual MIDI ports — stable ────────────────
  const bindInput = useCallback((input) => {
    if (!input || inputsRef.current.has(input.id)) return;
    input.onmidimessage = handleMidiMessage;
    inputsRef.current.set(input.id, input);
  }, [handleMidiMessage]);

  const unbindInput = useCallback((port) => {
    if (!port) return;
    const bound = inputsRef.current.get(port.id);
    if (!bound) return;
    bound.onmidimessage = null;
    inputsRef.current.delete(port.id);
  }, []);

  // ── Activate one or more MIDI inputs — stable ─────────────────
  const activateMidiInputs = useCallback((inputs) => {
    stopLoop();
    removeKeyboardListeners();
    clearFallbackTimer();

    inputs.forEach(bindInput);
    const bound = [...inputsRef.current.values()];
    midi.setStatus('connected', describeInputs(bound));

    STARTUP_CHIME.forEach(n => midi.pressKey(n));
    setTimeout(() => { STARTUP_CHIME.forEach(n => midi.releaseKey(n)); }, 600);
  }, [stopLoop, removeKeyboardListeners, clearFallbackTimer, bindInput]);

  // ── After a wait with no input bound, fall back to keyboard ───
  const scheduleFallback = useCallback((reason) => {
    clearFallbackTimer();
    fallbackTimerRef.current = setTimeout(() => {
      fallbackTimerRef.current = null;
      if (inputsRef.current.size === 0) activateKeyboardFallback(reason);
    }, DEVICE_WAIT_MS);
  }, [clearFallbackTimer, activateKeyboardFallback]);

  // ── Persistent MIDIAccess.onstatechange — handles every connect/disconnect
  // for the whole session, not just the initial "no device yet" window. ──
  const handleAccessStateChange = useCallback((ev) => {
    const port = ev.port;
    if (port.type !== 'input') return;

    if (port.state === 'connected') {
      const hadNone = inputsRef.current.size === 0;
      bindInput(port);
      if (hadNone || useMidiStore.getState().status !== 'connected') {
        activateMidiInputs([...inputsRef.current.values()]);
      } else {
        midi.setStatus('connected', describeInputs([...inputsRef.current.values()]));
      }
    } else if (port.state === 'disconnected') {
      unbindInput(port);
      if (inputsRef.current.size === 0) {
        midi.setStatus('loading', 'Device disconnected — searching…');
        startLoop();
        scheduleFallback('Device disconnected. Using keyboard.');
      }
    }
  }, [bindInput, unbindInput, activateMidiInputs, startLoop, scheduleFallback]);

  // ── Main init (also exported for Retry button) ────────────────
  const init = useCallback(async () => {
    // Tear down any previous connection cleanly before re-initialising
    inputsRef.current.forEach(input => { input.onmidimessage = null; });
    inputsRef.current.clear();
    if (accessRef.current) accessRef.current.onstatechange = null;
    removeKeyboardListeners();
    clearFallbackTimer();
    stopLoop();

    midi.setStatus('loading', 'Probing for MIDI hardware…');
    startLoop();

    if (!navigator.requestMIDIAccess) {
      activateKeyboardFallback('Web MIDI not supported (Chrome/Edge only). Using keyboard.');
      return;
    }

    let access;
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      activateKeyboardFallback('MIDI permission denied. Using keyboard.');
      return;
    }

    accessRef.current = access;
    // Wired for the life of this access session — covers hot-plugged and
    // multiple simultaneous devices, not just whichever port enumerates first.
    access.onstatechange = handleAccessStateChange;

    const connected = [...access.inputs.values()].filter(i => i.state === 'connected');
    if (connected.length > 0) {
      activateMidiInputs(connected);
      return;
    }

    midi.setStatus('loading', 'No device found — waiting or use keyboard…');
    scheduleFallback('No MIDI device found. Using keyboard.');
  }, [activateMidiInputs, activateKeyboardFallback, startLoop, stopLoop, removeKeyboardListeners, clearFallbackTimer, handleAccessStateChange, scheduleFallback]);

  // ── Mount/unmount ─────────────────────────────────────────────
  useEffect(() => {
    init();
    return () => {
      stopLoop();
      clearFallbackTimer();
      inputsRef.current.forEach(input => { input.onmidimessage = null; });
      inputsRef.current.clear();
      if (accessRef.current) accessRef.current.onstatechange = null;
      removeKeyboardListeners();
    };
  }, []);

  return { init, status: midi.status, deviceName: midi.deviceName };
}
