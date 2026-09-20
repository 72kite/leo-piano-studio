/**
 * MusicXMLViewer — renders MusicXML scores using OpenSheetMusicDisplay (OSMD).
 *
 * OSMD is loaded lazily from jsDelivr CDN the first time this component is
 * opened, so no npm install is required. Once cached by the browser the load
 * is instant on subsequent opens.
 *
 * Accepts:
 *   activeNote  — MIDI number (reserved for future cursor integration)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import './MusicXMLViewer.css';

const OSMD_CDN =
  'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.8.9/build/opensheetmusicdisplay.min.js';

// A one-bar demo score so the viewer shows something on first open
const DEMO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

// Inject the OSMD UMD script from CDN once and resolve when ready.
// Subsequent calls return the already-loaded class immediately.
function loadOSMDClass() {
  if (window.__osmdClass) return Promise.resolve(window.__osmdClass);

  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${OSMD_CDN}"]`)) {
      // Script tag already inserted — wait for global to appear
      let attempts = 0;
      const poll = setInterval(() => {
        const ns = window.opensheetmusicdisplay;
        if (ns?.OpenSheetMusicDisplay) {
          clearInterval(poll);
          window.__osmdClass = ns.OpenSheetMusicDisplay;
          resolve(window.__osmdClass);
        } else if (++attempts > 50) {
          clearInterval(poll);
          reject(new Error('OSMD did not load in time.'));
        }
      }, 100);
      return;
    }

    const script   = document.createElement('script');
    script.src     = OSMD_CDN;
    script.async   = true;
    script.onload  = () => {
      const ns = window.opensheetmusicdisplay;
      if (!ns?.OpenSheetMusicDisplay) {
        reject(new Error('OSMD global not found after script load.'));
        return;
      }
      window.__osmdClass = ns.OpenSheetMusicDisplay;
      resolve(window.__osmdClass);
    };
    script.onerror = () => reject(new Error('Failed to load OSMD from CDN. Check internet connection.'));
    document.head.appendChild(script);
  });
}

export function MusicXMLViewer({ activeNote }) {
  const containerRef = useRef(null);
  const osmdRef      = useRef(null);

  const [status,   setStatus]   = useState('idle');   // idle | loading | loaded | error
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState(null);

  const renderXML = useCallback(async (xmlText, name) => {
    if (!containerRef.current) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const OSMD = await loadOSMDClass();

      if (!osmdRef.current) {
        osmdRef.current = new OSMD(containerRef.current, {
          autoResize:   true,
          backend:      'svg',
          drawTitle:    true,
          drawSubtitle: false,
        });
      }

      await osmdRef.current.load(xmlText);
      osmdRef.current.render();
      setFileName(name ?? 'score');
      setStatus('loaded');
    } catch (err) {
      setErrorMsg(err.message ?? 'Failed to render MusicXML.');
      setStatus('error');
    }
  }, []);

  // Show the built-in demo on first open
  useEffect(() => {
    renderXML(DEMO_XML, 'Demo — C major scale');
  }, []);

  const handleFilePick = useCallback(() => {
    const inp    = document.createElement('input');
    inp.type     = 'file';
    inp.accept   = '.xml,.musicxml,.mxl';
    inp.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      renderXML(text, file.name);
    };
    inp.click();
  }, [renderXML]);

  return (
    <div className="musicxml-viewer">
      <div className="musicxml-toolbar">
        <button
          className="musicxml-btn"
          onClick={handleFilePick}
          disabled={status === 'loading'}
        >
          {status === 'loading'
            ? <><Loader2 size={11} className="spin" /> Rendering…</>
            : <><Upload size={11} /> Load MusicXML</>
          }
        </button>
        {fileName && (
          <span className="musicxml-filename" title={fileName}>{fileName}</span>
        )}
      </div>

      {status === 'error' && (
        <div className="musicxml-error">
          <AlertCircle size={13} />
          <pre>{errorMsg}</pre>
        </div>
      )}

      {/* OSMD renders its SVG directly into this div */}
      <div
        ref={containerRef}
        className="musicxml-canvas"
        style={{ display: status === 'error' ? 'none' : 'block' }}
      />
    </div>
  );
}
