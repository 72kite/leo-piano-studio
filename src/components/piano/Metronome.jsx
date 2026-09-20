/**
 * Metronome — audible click track, BPM/time-signature/volume controls.
 * Extracted from PianoMode.jsx so it can be reused inside the circular
 * quick-access trigger in PianoQuickBar (the trigger button opens a
 * popover containing this component, unchanged).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Music, Play, Square } from 'lucide-react';
import { getAudioCtx } from '../../lib/audioContext.js';

export function Metronome() {
  const [running,   setRunning]   = useState(false);
  const [bpm,       setBpm]       = useState(120);
  const [timeSig,   setTimeSig]   = useState(4);
  const [volume,    setVolume]    = useState(0.6);
  const [beat,      setBeat]      = useState(0);
  const beatRef   = useRef(0);
  const timerId   = useRef(null);

  const tick = useCallback(() => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const isDownbeat = beatRef.current % timeSig === 0;
    const freq = isDownbeat ? 1760 : 880;
    const vol  = volume * (isDownbeat ? 1 : 0.65);

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'square';
    gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);

    beatRef.current = (beatRef.current + 1) % timeSig;
    setBeat(beatRef.current);
  }, [bpm, timeSig, volume]);

  const start = useCallback(() => {
    beatRef.current = 0;
    setBeat(0);
    setRunning(true);
    tick();
    timerId.current = setInterval(tick, (60 / bpm) * 1000);
  }, [bpm, tick]);

  const stop = useCallback(() => {
    clearInterval(timerId.current);
    setRunning(false);
    beatRef.current = 0;
    setBeat(0);
  }, []);

  useEffect(() => {
    if (running) { stop(); start(); }
  }, [bpm, timeSig, volume]);

  useEffect(() => () => clearInterval(timerId.current), []);

  const dots = Array.from({ length: timeSig }, (_, i) => i);

  return (
    <div className="metronome">
      <div className="metro-title">
        <Music size={13} /> Metronome
      </div>
      <div className="metro-beats">
        {dots.map(i => (
          <div key={i} className={`metro-dot ${running && beat === i ? 'metro-dot-on' : ''} ${i === 0 ? 'metro-dot-down' : ''}`} />
        ))}
      </div>
      <div className="metro-controls">
        <label className="metro-field">
          <span>BPM</span>
          <input
            type="range" min={40} max={240} value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
          />
          <span className="metro-val">{bpm}</span>
        </label>
        <label className="metro-field">
          <span>Time</span>
          <select value={timeSig} onChange={e => setTimeSig(Number(e.target.value))}>
            {[2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}/4</option>)}
          </select>
        </label>
        <label className="metro-field">
          <span>Vol</span>
          <input
            type="range" min={0} max={1} step={0.05} value={volume}
            onChange={e => setVolume(Number(e.target.value))}
          />
          <span className="metro-val">{Math.round(volume * 100)}%</span>
        </label>
      </div>
      <button
        className={`metro-btn ${running ? 'metro-stop' : ''}`}
        onClick={running ? stop : start}
      >
        {running ? <><Square size={11} /> Stop</> : <><Play size={11} /> Start</>}
      </button>
    </div>
  );
}
