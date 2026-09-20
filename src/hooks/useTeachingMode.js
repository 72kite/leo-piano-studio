/**
 * useTeachingMode — turns a loaded composition (built-in track, an
 * uploaded .mid file, or a Basic Pitch audio conversion — any source that
 * produces the same {midi,time,duration,velocity} note array) into a
 * self-paced "wait for the right key" practice mode.
 *
 * Notes within CHORD_TOLERANCE seconds of each other are grouped into one
 * step so chords are learned as a unit. Playback never auto-advances on a
 * clock — the only thing that moves the cursor forward is the learner
 * actually pressing every note in the current step (in any order, on MIDI
 * hardware or the keyboard fallback — both already funnel through the same
 * onNoteOn path in PianoMode).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

const CHORD_TOLERANCE = 0.06; // seconds — notes this close together count as one chord step

function groupIntoSteps(notes) {
  const sorted = [...notes].sort((a, b) => a.time - b.time);
  const steps = [];
  for (const n of sorted) {
    const last = steps[steps.length - 1];
    if (last && n.time - last.time <= CHORD_TOLERANCE) {
      if (!last.notes.includes(n.midi)) last.notes.push(n.midi);
    } else {
      steps.push({ time: n.time, notes: [n.midi] });
    }
  }
  return steps;
}

const INITIAL_PROGRESS = { stepIndex: 0, pressed: new Set() };

export function useTeachingMode(notes) {
  const steps = useMemo(() => groupIntoSteps(notes), [notes]);

  const [active, setActive]       = useState(false);
  // stepIndex and pressed always move together, so they live in one piece of
  // state updated in a single setState call — never call another setState
  // from inside this updater (React's StrictMode double-invokes updater
  // functions to check purity, so a nested setState would fire twice and
  // silently skip a step).
  const [progress, setProgress]   = useState(INITIAL_PROGRESS);
  const [missCount, setMissCount] = useState(0);

  // A freshly loaded (or re-loaded) composition always restarts the lesson.
  useEffect(() => {
    setProgress({ stepIndex: 0, pressed: new Set() });
    setMissCount(0);
  }, [notes]);

  const start = useCallback(() => {
    setProgress({ stepIndex: 0, pressed: new Set() });
    setMissCount(0);
    setActive(true);
  }, []);

  const stop = useCallback(() => setActive(false), []);

  const restart = useCallback(() => {
    setProgress({ stepIndex: 0, pressed: new Set() });
    setMissCount(0);
  }, []);

  const { stepIndex, pressed } = progress;
  const currentStep = active ? (steps[stepIndex] || null) : null;
  const done = active && steps.length > 0 && stepIndex >= steps.length;

  /** Feed one played note in. */
  const handleNote = useCallback((midiNote) => {
    if (!active) return;
    setProgress(prev => {
      const step = steps[prev.stepIndex];
      if (!step || !step.notes.includes(midiNote) || prev.pressed.has(midiNote)) return prev;
      const nextPressed = new Set(prev.pressed);
      nextPressed.add(midiNote);
      const complete = step.notes.every(n => nextPressed.has(n));
      return complete
        ? { stepIndex: prev.stepIndex + 1, pressed: new Set() }
        : { stepIndex: prev.stepIndex, pressed: nextPressed };
    });
    if (!(steps[stepIndex]?.notes.includes(midiNote))) setMissCount(m => m + 1);
  }, [active, steps, stepIndex]);

  const skipStep = useCallback(() => {
    if (!active) return;
    setProgress(prev => ({ stepIndex: Math.min(steps.length, prev.stepIndex + 1), pressed: new Set() }));
  }, [active, steps.length]);

  return {
    steps, active, done, stepIndex, currentStep, pressed, missCount,
    total: steps.length,
    progress: steps.length ? Math.min(stepIndex, steps.length) / steps.length : 0,
    start, stop, restart, skipStep, handleNote,
  };
}
