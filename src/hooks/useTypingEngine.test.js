import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTypingEngine } from './useTypingEngine.js';
import { useSettingsStore, WORDS_BRIT } from '../store/index.js';

function setSettings(overrides) {
  const { set, reset } = useSettingsStore.getState();
  reset();
  Object.entries(overrides).forEach(([k, v]) => set(k, v));
}

/** Drives handleKey the same way TypingCanvas does: feed it the engine's own current state. */
function press(result, key, ctrl = false) {
  act(() => {
    const s = result.current;
    s.handleKey(key, s.words, s.wordIdx, s.charIdx, s.curInput, s.typedWords, ctrl);
  });
}

function typeWord(result, word, { corruptLast = false } = {}) {
  const chars = word.split('');
  chars.forEach((c, i) => {
    const isLast = i === chars.length - 1;
    const key = isLast && corruptLast ? (c === 'q' ? 'w' : 'q') : c;
    press(result, key);
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe('useTypingEngine — words mode', () => {
  it('generates exactly wordCount words with no punctuation/numbers/funbox', () => {
    setSettings({ mode: 'words', wordCount: 3, punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());

    expect(result.current.words).toHaveLength(3);
    expect(result.current.status).toBe('idle');
  });

  it('completes a full run, committing each word and auto-finishing on the last', () => {
    setSettings({ mode: 'words', wordCount: 3, punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());
    const words = result.current.words;

    typeWord(result, words[0]);
    press(result, ' ');
    expect(result.current.wordIdx).toBe(1);
    expect(result.current.typedWords).toHaveLength(1);

    typeWord(result, words[1]);
    press(result, ' ');
    expect(result.current.wordIdx).toBe(2);

    typeWord(result, words[2]); // last char of last word auto-finishes, no trailing space needed

    expect(result.current.status).toBe('finished');
    expect(result.current.accuracy).toBe(100);
    expect(result.current.getKeystrokes().length).toBeGreaterThan(0);
  });

  it('backspace undoes the last keystroke and decrements correctChars', () => {
    setSettings({ mode: 'words', wordCount: 3, punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());
    const word = result.current.words[0];

    press(result, word[0]);
    expect(result.current.curInput).toEqual([word[0]]);

    press(result, 'Backspace');
    expect(result.current.curInput).toEqual([]);
    expect(result.current.charIdx).toBe(0);
  });

  it('funbox "no_backspace" blocks the Backspace key entirely', () => {
    setSettings({ mode: 'words', wordCount: 3, funbox: 'no_backspace' });
    const { result } = renderHook(() => useTypingEngine());
    const word = result.current.words[0];

    press(result, word[0]);
    press(result, 'Backspace');

    expect(result.current.curInput).toEqual([word[0]]);
  });

  it('expert mode fails a run when a committed word does not match exactly', () => {
    setSettings({ mode: 'words', wordCount: 3, difficulty: 'expert', punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());
    const word = result.current.words[0];

    typeWord(result, word, { corruptLast: true });
    press(result, ' ');

    expect(result.current.status).toBe('failed');
    expect(result.current.failReason).toMatch(/expert mode/);
  });

  it('master mode fails a run on the very first mistyped character', () => {
    setSettings({ mode: 'words', wordCount: 3, difficulty: 'master', punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());
    const targetChar = result.current.words[0][0];
    const wrongChar = targetChar === 'q' ? 'w' : 'q';

    press(result, wrongChar);

    expect(result.current.status).toBe('failed');
    expect(result.current.failReason).toMatch(/master mode/);
  });

  it('reset() clears state and rebuilds a fresh word list', () => {
    setSettings({ mode: 'words', wordCount: 3, punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());
    const firstWord = result.current.words[0];

    press(result, firstWord[0]);
    expect(result.current.status).toBe('running');

    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.wordIdx).toBe(0);
    expect(result.current.curInput).toEqual([]);
    expect(result.current.words).toHaveLength(3);
  });
});

describe('useTypingEngine — quote mode', () => {
  it('builds words from the quote text and flags meta.isQuote', () => {
    setSettings({ mode: 'quote' });
    const { result } = renderHook(() => useTypingEngine());

    expect(result.current.meta.isQuote).toBe(true);
    expect(result.current.words.length).toBeGreaterThan(0);
    expect(result.current.words.join(' ').length).toBeGreaterThan(0);
  });

  it('repeatQuote keeps the same quote across reset() calls', () => {
    setSettings({ mode: 'quote', repeatQuote: true });
    const { result } = renderHook(() => useTypingEngine());
    const first = result.current.words.join(' ');

    // Run several resets — with repeatQuote on, the text must never change.
    for (let i = 0; i < 5; i++) {
      act(() => result.current.reset());
      expect(result.current.words.join(' ')).toBe(first);
    }
  });

  it('without repeatQuote, reset() is free to pick a different quote', () => {
    setSettings({ mode: 'quote', repeatQuote: false });
    const { result } = renderHook(() => useTypingEngine());

    // Reset many times and collect distinct quotes seen — with repeatQuote
    // off this should surface more than one of the pool's quotes.
    const seen = new Set([result.current.words.join(' ')]);
    for (let i = 0; i < 20; i++) {
      act(() => result.current.reset());
      seen.add(result.current.words.join(' '));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('useTypingEngine — britishEn', () => {
  it('mixes British-spelling words into the pool when language is en and britishEn is on', () => {
    setSettings({ mode: 'time', language: 'en', britishEn: true, punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());

    // 'time' mode generates 250 words from a ~167-word pool (147 English +
    // 20 British-only). Checking for ANY of the 20 British words — not one
    // specific word — keeps this astronomically unlikely to flake: missing
    // one specific word in 250 draws is ~22% likely on its own, but missing
    // all 20 simultaneously is ~(147/167)^250 ≈ 1e-14.
    expect(result.current.words.some(w => WORDS_BRIT.includes(w))).toBe(true);
  });

  it('leaves the plain English pool alone when britishEn is off', () => {
    setSettings({ mode: 'time', language: 'en', britishEn: false, punctuation: false, numbers: false, funbox: 'none' });
    const { result } = renderHook(() => useTypingEngine());

    expect(result.current.words.some(w => WORDS_BRIT.includes(w))).toBe(false);
  });
});
