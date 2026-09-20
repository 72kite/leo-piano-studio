/**
 * TypingCanvas — the main typing area
 * - Text floats directly on background (no card/container)
 * - Fixed 3-line viewport: active line centered, lines scroll up
 * - Blur overlay on focus loss
 * - "Press any key" or click to focus
 * - Distraction-free: no live stats shown while typing
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '../../store/index.js';
import './TypingCanvas.css';

function escapeChar(c) {
  if (c === '<') return '&lt;';
  if (c === '>') return '&gt;';
  if (c === '&') return '&amp;';
  return c;
}

export function TypingCanvas({ engine, onFinish }) {
  const { blindMode, caretStyle, quickRestart, language, mode } = useSettingsStore();
  const isRTL = language === 'ar';
  const containerRef = useRef(null);
  const [focused, setFocused]     = useState(true);
  const [started, setStarted]     = useState(false);

  const {
    words, meta, wordIdx, charIdx, curInput, typedWords,
    status, handleKey, reset,
  } = engine;

  // ── Focus management ──────────────────────────────────────────
  const focusCanvas = useCallback(() => {
    setFocused(true);
    containerRef.current?.focus();
  }, []);

  // "Press any key to focus" — global listener that fires when NOT in an input
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Tab' || e.key === 'Escape') return;
      focusCanvas();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focusCanvas]);

  // ── Key handler ───────────────────────────────────────────────
  useEffect(() => {
    if (!focused) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Quick restart binds
      const qr = quickRestart;
      if ((qr === 'tab'   && e.key === 'Tab')   ||
          (qr === 'esc'   && e.key === 'Escape') ||
          (qr === 'enter' && e.key === 'Enter')) {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === 'Escape' && qr !== 'esc') return; // let CLI handle it
      if (e.key === 'Tab') { e.preventDefault(); reset(); return; }
      // Allow Ctrl+Backspace for word deletion; block other ctrl combos
      if ((e.ctrlKey || e.metaKey) && e.key !== 'Backspace') return;
      if (e.altKey) return;
      if (e.key.startsWith('F') && e.key.length > 1) return;

      e.preventDefault();
      if (!started && e.key.length === 1) setStarted(true);
      handleKey(e.key, words, wordIdx, charIdx, curInput, typedWords, e.ctrlKey || e.metaKey);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focused, words, wordIdx, charIdx, curInput, typedWords, handleKey, reset, quickRestart, started]);

  // Call onFinish when engine finishes
  useEffect(() => {
    if (status === 'finished' || status === 'failed') onFinish?.();
  }, [status]);

  // ── Render the visible text window ───────────────────────────
  // We show a window of words. We always keep the active word in the
  // second row (index 1) so text scrolls upward — "line centering".
  const WORDS_PER_LINE = 9;
  const LINES_BEFORE   = 1; // lines above the active line to show

  // Build a flat list of (wordIndex, charIndex) spans
  const renderWords = () => {
    // Determine which words are visible based on line breaks
    // We lazily estimate line breaks by grouping WORDS_PER_LINE words per row
    const activeRow  = Math.floor(wordIdx / WORDS_PER_LINE);
    const startRow   = Math.max(0, activeRow - LINES_BEFORE);
    const startWord  = startRow * WORDS_PER_LINE;
    const endWord    = startWord + WORDS_PER_LINE * 3; // show 3 rows

    const spans = [];
    for (let wi = startWord; wi < Math.min(endWord, words.length); wi++) {
      const word   = words[wi];
      const typed  = wi < wordIdx
        ? (typedWords[wi] || [])
        : wi === wordIdx
          ? curInput
          : [];

      for (let ci = 0; ci < word.length; ci++) {
        // Caret
        if (wi === wordIdx && ci === charIdx) {
          spans.push(<span key={`c-${wi}-${ci}`} className={`caret caret-${caretStyle}`} aria-hidden="true" />);
        }
        const tc = typed[ci];
        let cls = 'ch-pending';
        if (tc !== undefined) {
          if (blindMode) {
            cls = 'ch-ok'; // blind mode: everything looks correct
          } else {
            cls = tc === word[ci] ? 'ch-ok' : 'ch-err';
          }
        }
        spans.push(
          <span key={`${wi}-${ci}`} className={cls} data-char={word[ci]}>
            {word[ci]}
          </span>
        );
      }
      // Caret at end of active word
      if (wi === wordIdx && charIdx >= word.length) {
        spans.push(<span key={`c-${wi}-end`} className={`caret caret-${caretStyle}`} aria-hidden="true" />);
      }
      // Extra typed chars beyond word length
      if (wi === wordIdx) {
        for (let ei = word.length; ei < curInput.length; ei++) {
          spans.push(<span key={`extra-${ei}`} className="ch-extra">{curInput[ei]}</span>);
        }
      }
      // Space between words
      spans.push(<span key={`sp-${wi}`} className="ch-pending"> </span>);
    }
    return spans;
  };

  return (
    <div
      className={`typing-canvas ${!focused ? 'unfocused' : ''} ${blindMode ? 'blind-mode' : ''}`}
      ref={containerRef}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => { if (status === 'running' || status === 'idle') setFocused(false); }}
      onClick={focusCanvas}
      role="textbox"
      aria-multiline="true"
      aria-label="Typing area — click or press any key to focus"
    >
      <div className="typing-text" aria-hidden="true" dir={isRTL ? 'rtl' : 'ltr'}>
        {words.length > 0 && renderWords()}
      </div>

      {/* Quote attribution */}
      {mode === 'quote' && meta?.isQuote && meta?.author && status !== 'idle' && (
        <div className="quote-attribution" aria-label={`Quote by ${meta.author}`}>
          — {meta.author}
        </div>
      )}

      {/* Blur overlay */}
      {!focused && (
        <div className="typing-blur-overlay" onClick={focusCanvas} aria-hidden="true">
          <span className="blur-label">click or press any key to focus</span>
        </div>
      )}
    </div>
  );
}
