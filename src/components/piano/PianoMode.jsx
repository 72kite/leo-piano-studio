/**
 * PianoMode — Composition Studio
 * Focus: professional DAW-lite experience.
 * Features: virtual piano, MIDI hardware support (Steinway & Sons branding),
 * metronome, audio-to-MIDI (Basic Pitch), community tracks, MusicXML viewer.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import { Midi } from '@tonejs/midi';
import { useMidi }        from '../../hooks/useMidi.js';
import { useTeachingMode } from '../../hooks/useTeachingMode.js';
import { useMicPitch }    from '../../hooks/useMicPitch.js';
import { useCompositionPlayback } from '../../hooks/useCompositionPlayback.js';
import { useMidiStore, useSettingsStore, useViewStore } from '../../store/index.js';
import { PianoKeys, noteName } from './PianoKeys.jsx';
import { DotPianoCanvas } from './DotPianoCanvas.jsx';
import { PianoCanvasMode } from './PianoCanvasMode.jsx';
import { FallingNotes }   from './FallingNotes.jsx';
import { PianoQuickBar }  from './PianoQuickBar.jsx';
import { SheetMusic }     from './SheetMusic.jsx';
import { MusicXMLViewer } from './MusicXMLViewer.jsx';
import { PianoKeymap }    from './PianoKeymap.jsx';
import { toast }          from '../ui/Toast.jsx';
import { getAudioCtx }    from '../../lib/audioContext.js';
import { INSTRUMENTS, getInstrument } from '../../lib/instruments/index.js';
import { COMMUNITY_MIDI_TRACKS } from '../../lib/communityMidiManifest.js';
import { BUILTIN_PIECES } from '../../lib/builtInPieces.js';
import {
  Loader2, RefreshCw, Play, Upload, Flag,
  Music, Mic, MicOff, FileMusic, Share2, Lock, Globe, FileCode2,
  GraduationCap, SkipForward, X, PartyPopper,
} from 'lucide-react';
import './PianoMode.css';

// ── Audio-to-MIDI (Basic Pitch) ───────────────────────────────
function AudioToMidi({ onLoad }) {
  const [processing, setProcessing] = useState(false);

  const handleAudioUpload = async () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.mp3,.wav,.ogg,.flac';
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      setProcessing(true);
      try {
        // new Function bypasses Vite's static import-analysis so the missing
        // package never causes a dev-server error; the runtime catch handles it.
        const bp = await new Function('p', 'return import(p)')('@spotify/basic-pitch').catch(() => null);
        if (!bp) {
          toast('Basic Pitch not installed. Run: npm install @spotify/basic-pitch', 'warn');
          setProcessing(false);
          return;
        }
        const { BasicPitch, noteFramesToTime, addPitchBendsToNoteEvents, outputToNotesPoly } = bp;
        const audioCtx = getAudioCtx();
        const arrayBuf = await file.arrayBuffer();
        const decoded  = await audioCtx.decodeAudioData(arrayBuf);

        const frames = [], onsets = [], contours = [];
        const model  = new BasicPitch('/basic-pitch-model/model.json');
        await model.evaluateModel(
          decoded,
          (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
          () => {}
        );
        const rawNotes = noteFramesToTime(
          addPitchBendsToNoteEvents(contours, outputToNotesPoly(frames, onsets, 0.25, 0.25, 5, false))
        );
        const notes = rawNotes.map(n => ({
          midi: n.pitchMidi, time: n.startTimeSeconds,
          duration: n.durationSeconds, velocity: Math.round((n.amplitude ?? 0.8) * 127),
        })).sort((a, b) => a.time - b.time);
        onLoad(notes, file.name.replace(/\.[^.]+$/, '') + ' (converted)');
        toast(`Converted ${notes.length} notes from ${file.name}`, 'success');
      } catch (err) {
        toast('Audio conversion failed: ' + (err.message || 'Unknown error'), 'error');
      }
      setProcessing(false);
    };
    inp.click();
  };

  return (
    <button className="audio-midi-btn" onClick={handleAudioUpload} disabled={processing} title="Convert MP3/WAV to MIDI via Basic Pitch">
      {processing
        ? <><Loader2 size={12} className="spin" /> Analyzing audio…</>
        : <><Mic size={12} /> Audio → MIDI</>
      }
    </button>
  );
}

// ── Community Tracks ──────────────────────────────────────────
// Hand-built pieces now live in src/lib/builtInPieces.js, shared with
// MidiRacePage.jsx (a MIDI Race assigns players a piece by id).
const BUILTIN_TRACKS = BUILTIN_PIECES;

// Shared by the .mid upload button and "Your Library" rows — parses raw
// MIDI bytes into the app's flat {midi,time,duration,velocity} note array.
function parseMidiBuffer(buf) {
  const midi = new Midi(buf);
  return midi.tracks.flatMap(t =>
    t.notes.map(n => ({ midi: n.midi, time: n.time, duration: n.duration, velocity: Math.round(n.velocity * 127) }))
  ).sort((a, b) => a.time - b.time);
}

// The inverse of parseMidiBuffer — builds a real, standard MIDI file from
// the app's note array so "Share My Composition" is an actual .mid export
// (open it in any DAW, re-upload it here, send it to someone) rather than
// a stub. @tonejs/midi's Note.velocity is normalized 0-1 on the way in and
// out, unlike the 0-127 this app stores internally elsewhere.
function notesToMidiBlob(notes, title) {
  const midi = new Midi();
  const name = title || 'Leo Composition';
  midi.header.name = name;
  const track = midi.addTrack();
  track.name = name;
  notes.forEach(n => {
    track.addNote({
      midi: n.midi,
      time: n.time,
      duration: n.duration || 0.4,
      velocity: Math.max(0, Math.min(1, (n.velocity ?? 80) / 127)),
    });
  });
  return new Blob([midi.toArray()], { type: 'audio/midi' });
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function CommunityTracks({ onLoad, compNotes, compTitle }) {
  const [activeId, setActiveId] = useState(null);
  const [visibility, setVisibility] = useState({});
  const [loadingId, setLoadingId] = useState(null);

  const loadTrack = (track) => {
    setActiveId(track.id);
    onLoad(track.notes, `${track.composer} — ${track.title}`);
    toast(`Loaded: ${track.title}`, 'success');
  };

  const loadMidiTrack = async (track) => {
    setLoadingId(track.id);
    try {
      const res = await fetch(track.file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const notes = parseMidiBuffer(await res.arrayBuffer());
      setActiveId(track.id);
      onLoad(notes, `${track.composer} — ${track.title}`);
      toast(`Loaded: ${track.title} (${notes.length} notes)`, 'success');
    } catch (err) {
      toast(`Could not load ${track.title}: ${err.message}`, 'error');
    }
    setLoadingId(null);
  };

  const toggleVisibility = (id) => {
    setVisibility(v => ({ ...v, [id]: v[id] === 'public' ? 'private' : 'public' }));
  };

  return (
    <div className="track-list">
      <div className="track-list-head">
        <span><FileMusic size={13} /> Community Library</span>
        <div className="track-head-actions">
          <AudioToMidi onLoad={onLoad} />
          <button className="track-upload-btn" onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.mid,.midi';
            inp.onchange = async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              try {
                const notes = parseMidiBuffer(await file.arrayBuffer());
                onLoad(notes, file.name);
                toast(`Loaded: ${file.name} (${notes.length} notes)`, 'success');
              } catch { toast('Could not parse MIDI file', 'error'); }
            };
            inp.click();
          }}>
            <Upload size={12} /> .mid
          </button>
        </div>
      </div>

      <div className="track-section-label">Royalty-Free Tracks</div>
      {BUILTIN_TRACKS.map(t => (
        <div key={t.id} className={`track-row ${activeId === t.id ? 'track-active' : ''}`}>
          <button className="track-play-btn" onClick={() => loadTrack(t)} title="Load track">
            <Play size={11} />
          </button>
          <div className="track-info">
            <div className="track-title">{t.title}</div>
            <div className="track-meta">{t.composer} · {t.era}</div>
          </div>
          <button
            className={`track-vis-btn ${(visibility[t.id] || 'public') === 'public' ? 'vis-pub' : 'vis-priv'}`}
            onClick={() => toggleVisibility(t.id)}
            title={`Mark as ${(visibility[t.id] || 'public') === 'public' ? 'private' : 'public'}`}
          >
            {(visibility[t.id] || 'public') === 'public'
              ? <Globe size={10} />
              : <Lock size={10} />
            }
          </button>
        </div>
      ))}

      {COMMUNITY_MIDI_TRACKS.length > 0 && (
        <>
          <div className="track-section-label">Your Library — rights-cleared uploads</div>
          {COMMUNITY_MIDI_TRACKS.map(t => (
            <div key={t.id} className={`track-row ${activeId === t.id ? 'track-active' : ''}`}>
              <button
                className="track-play-btn"
                onClick={() => loadMidiTrack(t)}
                disabled={loadingId === t.id}
                title="Load track"
              >
                {loadingId === t.id ? <Loader2 size={11} className="spin" /> : <Play size={11} />}
              </button>
              <div className="track-info">
                <div className="track-title">{t.title}</div>
                <div className="track-meta">{t.composer} · {t.era}</div>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="track-share-row">
        <button
          className="track-share-btn"
          disabled={!compNotes || compNotes.length === 0}
          title={!compNotes || compNotes.length === 0 ? 'Play or load a composition first' : 'Download as a standard .mid file'}
          onClick={() => {
            const safeName = (compTitle || 'leo-composition').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'leo-composition';
            downloadBlob(`${safeName}.mid`, notesToMidiBlob(compNotes, compTitle));
            toast(`Exported ${compNotes.length} notes to ${safeName}.mid`, 'success');
          }}
        >
          <Share2 size={12} /> Share My Composition
        </button>
      </div>
    </div>
  );
}

// ── Teaching Mode panel ─────────────────────────────────────────
function TeachingPanel({ teaching, onExit }) {
  const { currentStep, stepIndex, total, progress, done, missCount, restart, skipStep } = teaching;

  if (done) {
    return (
      <div className="teach-panel teach-done">
        <div className="teach-done-row">
          <PartyPopper size={18} />
          <div className="teach-done-text">Song complete — {total} step{total === 1 ? '' : 's'}, {missCount} miss{missCount === 1 ? '' : 'es'}.</div>
        </div>
        <div className="teach-panel-actions">
          <button className="comp-btn" onClick={restart} title="Restart lesson"><RefreshCw size={14} /></button>
          <button className="comp-btn" onClick={onExit} title="Exit teaching mode"><X size={14} /></button>
        </div>
      </div>
    );
  }

  const names = currentStep
    ? [...currentStep.notes].sort((a, b) => a - b).map(noteName).join('  ·  ')
    : '—';

  return (
    <div className="teach-panel">
      <div className="teach-panel-top">
        <span className="teach-panel-label"><GraduationCap size={13} /> Teaching Mode</span>
        <span className="teach-step-count">step {Math.min(stepIndex + 1, total)} / {total}</span>
      </div>
      <div className="teach-progress-wrap">
        <div className="teach-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="teach-next-notes">Play: <strong>{names}</strong></div>
      <div className="teach-panel-actions">
        <button className="comp-btn" onClick={skipStep} title="Skip this note/chord"><SkipForward size={14} /></button>
        <button className="comp-btn" onClick={restart} title="Restart lesson"><RefreshCw size={14} /></button>
        <button className="comp-btn" onClick={onExit} title="Exit teaching mode"><X size={14} /></button>
      </div>
    </div>
  );
}

// ── Mic Input panel — pitch detection for real acoustic instruments ──
// Lets someone play a real woodwind (or voice) into the mic instead of a
// MIDI keyboard; the detected note feeds the same teaching/visual pipeline,
// so Teaching Mode's "follow along" loop works with a real instrument.
function MicPitchPanel({ onDetectedNote }) {
  const mic = useMicPitch({ onNoteChange: onDetectedNote });
  const { status, currentNote, cents } = mic;

  const tuning = currentNote !== null
    ? (Math.abs(cents) <= 8 ? 'in-tune' : cents < 0 ? 'flat' : 'sharp')
    : null;

  return (
    <div className="mic-panel">
      <div className="mic-panel-top">
        <span className="mic-panel-label"><Mic size={13} /> Mic Input — Woodwinds &amp; Voice</span>
        <button
          className={`mic-toggle-btn ${status === 'listening' ? 'active' : ''}`}
          onClick={status === 'listening' ? mic.stop : mic.start}
          disabled={status === 'requesting'}
        >
          {status === 'requesting' && <><Loader2 size={12} className="spin" /> Requesting…</>}
          {status === 'listening'  && <><MicOff size={12} /> Stop</>}
          {(status === 'idle' || status === 'error') && <><Mic size={12} /> Start Listening</>}
        </button>
      </div>

      {status === 'error' && (
        <div className="mic-hint mic-error">Microphone access denied or unavailable.</div>
      )}

      {status === 'listening' && (
        currentNote !== null ? (
          <div className="mic-readout">
            <span className={`mic-note-name ${tuning}`}>{noteName(currentNote)}</span>
            <div className="mic-tuner-track">
              <div className="mic-tuner-zero" />
              <div
                className={`mic-tuner-needle ${tuning}`}
                style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }}
              />
            </div>
            <span className={`mic-cents ${tuning}`}>{cents > 0 ? '+' : ''}{cents}¢</span>
          </div>
        ) : (
          <div className="mic-hint">Play a note on your instrument…</div>
        )
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export function PianoMode() {
  const canvasRef       = useRef(null); // small canvas behind the keys, Studio mode
  const ambientRef      = useRef(null); // full-bleed ambient canvas, Canvas mode
  const fullscreenRef   = useRef(null); // wraps the whole page — target of the Fullscreen API
  const activeVoicesRef = useRef(new Map()); // midiNote -> voice handle, for sustained instruments' note-off
  const midiStore  = useMidiStore();
  const setPage    = useViewStore(s => s.setPage);
  const { pianoOctave, pianoSubMode, pianoInstrument, set: setSetting } = useSettingsStore();
  const isCanvasMode = pianoSubMode === 'canvas';
  const instrumentId = pianoInstrument;

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      fullscreenRef.current?.requestFullscreen?.().catch(() => toast('Fullscreen not available in this browser', 'warn'));
    }
  }, []);

  const [compNotes,   setCompNotes]   = useState([]);
  const [compTitle,   setCompTitle]   = useState('');
  // Toggle between MIDI note-head view and MusicXML rendered score
  const [showMusicXML, setShowMusicXML] = useState(false);
  // Notes of the currently selected chord (Chord Selector), highlighted on
  // the keyboard in purple regardless of what else is happening.
  const [chordHighlight, setChordHighlight] = useState([]);

  const teaching = useTeachingMode(compNotes);
  // Single playback engine for the loaded composition — shared by the
  // quickbar's transport controls and the falling-notes canvas below so
  // both are always reading the exact same clock.
  const playback = useCompositionPlayback(compNotes, instrumentId);

  // Kick off any instrument asset loading (e.g. the Grand Piano's real
  // sample set) as soon as the page mounts, not on first note-on — avoids
  // a silent/synth-fallback first note while samples are still fetching.
  useEffect(() => {
    const ctx = getAudioCtx();
    INSTRUMENTS.forEach(inst => inst.preload?.(ctx));
  }, []);

  const handleNoteOn = useCallback((midiNote, velocity) => {
    const ctx = getAudioCtx();
    // Re-triggering a note that's still sounding (e.g. a sustained organ
    // voice under a stuck key) releases the old voice first rather than
    // stacking a second one on top of it.
    activeVoicesRef.current.get(midiNote)?.release();
    activeVoicesRef.current.set(midiNote, getInstrument(instrumentId).play(ctx, midiNote, velocity));
    canvasRef.current?.spawnNote(midiNote, velocity);
    ambientRef.current?.spawnNote(midiNote, velocity);
    teaching.handleNote(midiNote);
  }, [teaching, instrumentId]);

  const handleNoteOff = useCallback((midiNote) => {
    activeVoicesRef.current.get(midiNote)?.release();
    activeVoicesRef.current.delete(midiNote);
    ambientRef.current?.noteOff(midiNote);
  }, []);

  // A note detected from the microphone is the user's own real instrument
  // sounding — drive the same visual/teaching feedback as MIDI input, but
  // skip playing a synthesized voice over their live sound.
  const handleMicNote = useCallback((midiNote) => {
    canvasRef.current?.spawnNote(midiNote, 90);
    ambientRef.current?.spawnNote(midiNote, 90);
    teaching.handleNote(midiNote);
    midiStore.pressKey(midiNote);
    setTimeout(() => midiStore.releaseKey(midiNote), 250);
  }, [teaching, midiStore]);

  const saveCanvasRecording = useCallback((notes, title) => {
    setCompNotes(notes);
    setCompTitle(title);
    setSetting('pianoSubMode', 'composition');
    toast(`Saved ${notes.length}-note recording to Composition Studio`, 'success');
  }, [setSetting]);

  const toggleTeaching = useCallback(() => {
    if (teaching.active) { teaching.stop(); return; }
    if (compNotes.length === 0) { toast('Load or upload a song first', 'warn'); return; }
    setShowMusicXML(false);
    playback.stop();
    teaching.start();
  }, [teaching, compNotes.length, playback]);

  // While teaching, the sheet music / staff tracks the current expected
  // step instead of composition-playback position.
  const teachTargetNote = teaching.active
    ? (teaching.currentStep ? Math.min(...teaching.currentStep.notes) : null)
    : (playback.activeMidi.length ? Math.min(...playback.activeMidi) : null);
  const teachNextNotes = teaching.active && teaching.currentStep
    ? teaching.currentStep.notes.filter(n => !teaching.pressed.has(n))
    : [];
  const teachCorrectNotes = teaching.active ? [...teaching.pressed] : [];

  // init is now returned so the Retry button can call it directly
  const { status, deviceName, init: retryMidi } = useMidi({
    onNoteOn:  handleNoteOn,
    onNoteOff: handleNoteOff,
  });

  const isMidiConnected = status === 'connected';

  const statusText = {
    loading   : <><Loader2 size={13} className="spin" /> Probing for MIDI hardware…</>,
    connected : `${deviceName} · Steinway & Sons`,
    fallback  : `Keyboard mode (z/x/c… rows) · octave ${pianoOctave}`,
    error     : 'MIDI error — using keyboard',
    idle      : '',
  }[status] || '';

  const statusClass = status === 'connected' ? 'ok' : status === 'fallback' ? 'warn' : '';

  const keyCount = midiStore.keyCount || 61;
  const [minNote, maxNote] = keyCount <= 49 ? [36, 84] : keyCount <= 61 ? [36, 96] : keyCount <= 76 ? [28, 103] : [21, 108];

  const octaveControls = status === 'fallback' && (
    <div className="octave-controls">
      <button className="oct-btn" onClick={() => setSetting('pianoOctave', Math.max(1, pianoOctave - 1))}>
        ← Oct {pianoOctave - 1}
      </button>
      <span className="oct-label">Octave {pianoOctave}</span>
      <button className="oct-btn" onClick={() => setSetting('pianoOctave', Math.min(7, pianoOctave + 1))}>
        Oct {pianoOctave + 1} →
      </button>
    </div>
  );
  const statusLine = <div className={`midi-status-line ${statusClass}`}>{statusText}</div>;

  const showFalling = !isCanvasMode && !teaching.active;

  return (
    <div className="piano-mode" ref={fullscreenRef}>
      {/* ── Quick bar: sticky right under TopNav — play, quick instrument
          setting, and the circular Metronome/Chords triggers, so none of
          it requires scrolling to reach. Replaces the old static
          "composition studio" tag and the boxy mode-switch row. ── */}
      <PianoQuickBar
        isCanvasMode={isCanvasMode}
        setSetting={setSetting}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        playback={playback}
        instrumentId={instrumentId}
        onChordHighlight={setChordHighlight}
      />

      {/* ── Black zone: down through the keys, one continuous full-bleed
          black surface with no seam — Studio mode only. ── */}
      {isCanvasMode ? (
        <div className="piano-page-inner">
          <PianoCanvasMode ref={ambientRef} onSaveRecording={saveCanvasRecording} />
        </div>
      ) : (
        <div className="piano-black-zone">
          {isMidiConnected && (
            <div className="piano-page-inner">
              <div className="midi-brand-header">
                <div className="midi-brand-logo">
                  <span className="midi-brand-name">Steinway &amp; Sons</span>
                  <span className="midi-brand-tagline">Est. 1853 · Hamburg &amp; New York</span>
                </div>
                <div className="midi-brand-device">{deviceName}</div>
              </div>
            </div>
          )}

          {/* ── Compact controls, right above the piano ── */}
          <div className="piano-page-inner">
            <div className="comp-section-head">
              <div className="comp-view-toggle">
                <button
                  className={`comp-view-btn ${!showMusicXML ? 'active' : ''}`}
                  onClick={() => setShowMusicXML(false)}
                  title="MIDI note-head view"
                >
                  <Music size={11} /> Notes
                </button>
                <button
                  className={`comp-view-btn ${showMusicXML ? 'active' : ''}`}
                  onClick={() => setShowMusicXML(true)}
                  title="MusicXML rendered score (requires opensheetmusicdisplay)"
                >
                  <FileCode2 size={11} /> MusicXML
                </button>
              </div>
              <button
                className={`comp-view-btn teach-toggle-btn ${teaching.active ? 'active' : ''}`}
                onClick={toggleTeaching}
                disabled={compNotes.length === 0}
                title={compNotes.length === 0 ? 'Load or upload a song first' : 'Learn this song one note/chord at a time'}
              >
                <GraduationCap size={11} /> {teaching.active ? 'Exit Learn' : 'Learn'}
              </button>
            </div>

            {teaching.active && <TeachingPanel teaching={teaching} onExit={teaching.stop} />}
            {compTitle && <div className="comp-title">{compTitle}</div>}
          </div>

          {/* ── Falling notes + full keyboard — same black surface, no border ── */}
          <div className="piano-immersive">
            <div className="piano-immersive-visual">
              <DotPianoCanvas ref={canvasRef} />
              {showFalling && (
                <FallingNotes
                  notes={compNotes}
                  elapsedRef={playback.elapsedRef}
                  minNote={minNote}
                  maxNote={maxNote}
                  height={220}
                />
              )}
            </div>

            <div className="piano-keys-wrap">
              <PianoKeys
                keyCount={keyCount}
                size="large"
                highlightNotes={teaching.active ? [] : playback.activeMidi}
                teachNotes={teachNextNotes}
                teachCorrect={teachCorrectNotes}
                chordNotes={teaching.active ? [] : chordHighlight}
              />
              <PianoKeymap minNote={minNote} maxNote={maxNote} />
            </div>
          </div>
        </div>
      )}

      <div className="piano-page-inner">
        {!isCanvasMode && (
          <div className="comp-section">
            {showMusicXML
              ? <MusicXMLViewer activeNote={teachTargetNote} />
              : <SheetMusic notes={compNotes} activeNote={teachTargetNote} />
            }
          </div>
        )}

        {!isCanvasMode && <MicPitchPanel onDetectedNote={handleMicNote} />}

        {!isCanvasMode && instrumentId === 'grand-piano' && (
          <div className="sample-credit">
            Grand Piano: "Salamander Grand Piano" samples by Alexander Holm, CC BY 3.0
          </div>
        )}

        {octaveControls}
        {statusLine}
        <div className="piano-actions">
          {/* Retry now calls init() directly — midiStore.reset() alone never re-probed */}
          <button className="piano-action-btn" onClick={retryMidi}>
            <RefreshCw size={13} /> Retry MIDI
          </button>
          <button className="piano-action-btn primary" onClick={() => setPage('midirace')}>
            <Flag size={13} /> Join MIDI Race
          </button>
        </div>

        {!isCanvasMode && (
          <div className="piano-bottom-panel">
            <CommunityTracks
              onLoad={(notes, title) => { setCompNotes(notes); setCompTitle(title); }}
              compNotes={compNotes}
              compTitle={compTitle}
            />
          </div>
        )}
      </div>
    </div>
  );
}
