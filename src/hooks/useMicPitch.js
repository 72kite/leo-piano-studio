/**
 * useMicPitch — real-time monophonic pitch detection from the microphone.
 *
 * Lets someone play a real acoustic instrument (flute, clarinet, sax,
 * recorder, voice — anything monophonic) and have the detected note feed
 * into the same note pipeline MIDI/keyboard input already drives, so
 * Teaching Mode's "follow along" loop works with a real instrument instead
 * of only a MIDI keyboard.
 *
 * Pitch detection uses the YIN algorithm (de Cheveigné & Kawahara, 2002):
 * a cumulative-mean-normalized difference function, walked from the
 * shortest lag upward to the first dip below threshold. That "shortest lag
 * first" rule is the important part — plain autocorrelation picks the
 * lag with the single strongest correlation, but a pure/near-pure tone
 * correlates strongly at every integer multiple of its true period too, so
 * naive peak-picking routinely locks onto a subharmonic (an octave or more
 * too low). YIN's threshold-based search from the low end avoids that
 * class of octave error, which is what a first (autocorrelation-only)
 * version of this hook actually shipped with and got caught misreading a
 * detuned A4 as C2 during testing. Intentionally monophonic — a woodwind
 * or voice only ever sounds one pitch at a time, so this doesn't attempt
 * polyphonic (chord) detection.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { getAudioCtx } from '../lib/audioContext.js';

const MIN_FREQ = 60;    // ~B1 — below the lowest woodwind fundamentals in practice
const MAX_FREQ = 2200;  // covers the practical range of flute/clarinet/sax/voice
const RMS_THRESHOLD = 0.012; // ignore near-silence / room noise
const YIN_THRESHOLD = 0.15;  // standard YIN absolute-threshold value
const STABLE_FRAMES = 3;     // consecutive frames a note must hold before it "fires"
const FRAME_INTERVAL_MS = 33; // ~30fps — plenty for pitch tracking, kinder on CPU than 60fps

function detectPitchYin(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < RMS_THRESHOLD) return -1;

  const minTau = Math.max(1, Math.floor(sampleRate / MAX_FREQ));
  const maxTau = Math.min(SIZE - 1, Math.ceil(sampleRate / MIN_FREQ));
  if (maxTau <= minTau) return -1;

  // Step 1 — difference function d(tau) = Σ (x[i] - x[i+tau])²
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < SIZE - maxTau; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Step 2 — cumulative mean normalized difference function
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += d[tau];
    cmnd[tau] = runningSum > 0 ? d[tau] * tau / runningSum : 1;
  }

  // Step 3 — first tau (from the short end) that dips below threshold,
  // walked forward to its local minimum. This "shortest first" search is
  // what keeps YIN from locking onto a subharmonic.
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return -1; // no sufficiently periodic pitch found

  // Step 4 — parabolic interpolation around tau for sub-sample precision
  const x0 = tau > minTau ? tau - 1 : tau;
  const x2 = tau < maxTau ? tau + 1 : tau;
  let refinedTau = tau;
  if (x0 !== tau && x2 !== tau) {
    const s0 = cmnd[x0], s1 = cmnd[tau], s2 = cmnd[x2];
    const denom = 2 * s1 - s2 - s0;
    if (denom !== 0) refinedTau = tau + (s2 - s0) / (2 * denom);
  }

  return refinedTau > 0 ? sampleRate / refinedTau : -1;
}

function freqToMidiFloat(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function useMicPitch({ onNoteChange } = {}) {
  const [status, setStatus]   = useState('idle'); // idle | requesting | listening | error
  const [display, setDisplay] = useState({ note: null, cents: 0 });

  const streamRef        = useRef(null);
  const analyserRef      = useRef(null);
  const rafRef           = useRef(null);
  const bufRef           = useRef(null);
  const lastFrameTimeRef = useRef(0);
  const stableNoteRef    = useRef(null);
  const stableCountRef   = useRef(0);
  const firedNoteRef     = useRef(null);
  const onNoteChangeRef  = useRef(onNoteChange);
  onNoteChangeRef.current = onNoteChange;

  const loop = useCallback((ts) => {
    if (!analyserRef.current) return;
    if (ts - lastFrameTimeRef.current < FRAME_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    lastFrameTimeRef.current = ts;

    const analyser = analyserRef.current;
    const buf = bufRef.current;
    analyser.getFloatTimeDomainData(buf);
    const freq = detectPitchYin(buf, getAudioCtx().sampleRate);

    if (freq === -1) {
      stableNoteRef.current = null;
      stableCountRef.current = 0;
      firedNoteRef.current = null;
      setDisplay({ note: null, cents: 0 });
    } else {
      const midiFloat = freqToMidiFloat(freq);
      const midiNote  = Math.round(midiFloat);
      const cents     = Math.round((midiFloat - midiNote) * 100);
      setDisplay({ note: midiNote, cents });

      if (stableNoteRef.current === midiNote) {
        stableCountRef.current++;
      } else {
        stableNoteRef.current = midiNote;
        stableCountRef.current = 1;
      }

      if (stableCountRef.current >= STABLE_FRAMES && firedNoteRef.current !== midiNote) {
        firedNoteRef.current = midiNote;
        onNoteChangeRef.current?.(midiNote);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = getAudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      setStatus('listening');
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setStatus('error');
    }
  }, [loop]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    stableNoteRef.current = null;
    stableCountRef.current = 0;
    firedNoteRef.current = null;
    setStatus('idle');
    setDisplay({ note: null, cents: 0 });
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { status, currentNote: display.note, cents: display.cents, start, stop };
}
