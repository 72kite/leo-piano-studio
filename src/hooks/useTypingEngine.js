/**
 * useTypingEngine — custom hook
 * Manages all typing state reactively.
 * No manual DOM touches. Everything flows through React state.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore, WORD_POOLS, getRandomQuote } from '../store/index.js';
import { playKeySound } from '../lib/keySound.js';

const FUNBOX = {
  mirror:       w => w.split('').reverse().join(''),
  earthquake:   w => w.split('').map(c => Math.random() > .5 ? c.toUpperCase() : c).join(''),
  choo_choo:    (w, i) => i % 3 === 2 ? w + 'choo' : w,
  gibberish:    w => w.replace(/[aeiou]/gi, () => 'aeiou'[Math.floor(Math.random() * 5)]),
  no_backspace: w => w,
};

const MAX_EXTRA_CHARS = 10; // cap on extra characters past word end

function buildWords(mode, wordCount, settings, forcedQuote) {
  try {
    // `britishEn` is a modifier on plain English rather than its own
    // language — only kicks in when language is 'en'; picking the
    // 'en-british' language directly already gets the same pool.
    const poolKey = (settings.language === 'en' && settings.britishEn) ? 'en-british' : settings.language;
    const pool = WORD_POOLS[poolKey] || WORD_POOLS['en'];
    const pick = () => pool[Math.floor(Math.random() * pool.length)];

    if (mode === 'quote') {
      const q = forcedQuote || getRandomQuote();
      return { words: q.text.split(' '), meta: { author: q.author, isQuote: true, quote: q } };
    }

    const count  = mode === 'time' ? 250 : wordCount;
    const funbox = settings.funbox && settings.funbox !== 'none' ? settings.funbox : null;

    const words = Array.from({ length: count }, (_, i) => {
      let w = pick();
      if (settings.punctuation && Math.random() < 0.15) w += ',';
      if (settings.numbers     && Math.random() < 0.10) w = String(Math.floor(Math.random() * 100));
      if (funbox === 'polyglot') {
        const packs = Object.values(WORD_POOLS);
        const pack  = packs[Math.floor(Math.random() * packs.length)];
        w = pack[Math.floor(Math.random() * pack.length)];
      } else if (funbox && FUNBOX[funbox]) {
        w = FUNBOX[funbox](w, i);
      }
      return w;
    });
    return { words, meta: {} };
  } catch {
    // fallback to English if pool lookup fails
    const pool = WORD_POOLS['en'];
    const words = Array.from({ length: wordCount }, () => pool[Math.floor(Math.random() * pool.length)]);
    return { words, meta: {} };
  }
}

/**
 * @param {{ text?: string }} [opts] - When `text` is a non-empty string, the
 *   engine types exactly that passage (used for race tracks, where every
 *   player must type the same voted-on text) instead of generating random
 *   words from the current typing-hub settings. Finishes the same way quote
 *   mode does — on completing the last word — regardless of `settings.mode`.
 */
export function useTypingEngine({ text } = {}) {
  const settings = useSettingsStore();
  const isFixedText = typeof text === 'string' && text.trim().length > 0;

  const [words, setWords]           = useState([]);
  const [meta, setMeta]             = useState({});
  const [wordIdx, setWordIdx]       = useState(0);
  const [charIdx, setCharIdx]       = useState(0);
  const [typedWords, setTypedWords] = useState([]);
  const [curInput, setCurInput]     = useState([]);
  const [status, setStatus]         = useState('idle'); // idle|running|finished|failed
  const [failReason, setFailReason] = useState('');
  const [timeLeft, setTimeLeft]     = useState(30);
  const [wpm, setWpm]               = useState(0);
  const [rawWpm, setRawWpm]         = useState(0);
  const [accuracy, setAccuracy]     = useState(100);
  const [wordBursts, setWordBursts] = useState([]);

  const startTime    = useRef(null);
  const endTime      = useRef(null);
  const timerRef     = useRef(null);
  const correctChars = useRef(0);
  const keystrokes   = useRef([]);
  const lastQuoteRef = useRef(null); // held across resets so "repeat quote" can reuse it

  // ── helpers ───────────────────────────────────────────────────
  const calcWpm = useCallback(() => {
    if (!startTime.current) return 0;
    const mins = ((endTime.current || Date.now()) - startTime.current) / 60000;
    return mins > 0 ? Math.round((correctChars.current / 5) / mins) : 0;
  }, []);

  const calcRaw = useCallback(() => {
    if (!startTime.current) return 0;
    const mins = ((endTime.current || Date.now()) - startTime.current) / 60000;
    return mins > 0 ? Math.round((keystrokes.current.length / 5) / mins) : 0;
  }, []);

  const calcAcc = useCallback(() => {
    const t = keystrokes.current.length;
    return t === 0 ? 100 : Math.round((correctChars.current / t) * 1000) / 10;
  }, []);

  const updateStats = useCallback(() => {
    setWpm(calcWpm());
    setRawWpm(calcRaw());
    setAccuracy(calcAcc());
  }, [calcWpm, calcRaw, calcAcc]);

  const failWith = useCallback((reason) => {
    clearInterval(timerRef.current);
    endTime.current = Date.now();
    setFailReason(reason);
    setStatus('failed');
  }, []);

  // ── init / reset ──────────────────────────────────────────────
  const reset = useCallback(() => {
    clearInterval(timerRef.current);
    startTime.current    = null;
    endTime.current      = null;
    correctChars.current = 0;
    keystrokes.current   = [];
    const wantsRepeat = !isFixedText && settings.mode === 'quote' && settings.repeatQuote;
    const { words: w, meta: m } = isFixedText
      ? { words: text.trim().split(/\s+/), meta: { isRaceText: true } }
      : buildWords(settings.mode, settings.wordCount, settings, wantsRepeat ? lastQuoteRef.current : null);
    if (!isFixedText && settings.mode === 'quote') lastQuoteRef.current = m.quote || lastQuoteRef.current;
    setWords(w);
    setMeta(m);
    setWordIdx(0);
    setCharIdx(0);
    setTypedWords([]);
    setCurInput([]);
    setStatus('idle');
    setFailReason('');
    setTimeLeft(settings.timeLimit);
    setWpm(0); setRawWpm(0); setAccuracy(100);
    setWordBursts([]);
  }, [settings, isFixedText, text]);

  useEffect(() => {
    reset();
  }, [settings.mode, settings.timeLimit, settings.wordCount, settings.language, settings.funbox, settings.punctuation, settings.numbers, isFixedText, text]);

  // ── start engine ──────────────────────────────────────────────
  const start = useCallback(() => {
    startTime.current = Date.now();
    setStatus('running');
    // Fixed-text passages (race tracks) finish on the last word, never on a clock.
    if (settings.mode === 'time' && !isFixedText) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); finish(); return 0; }
          return t - 1;
        });
        updateStats();
      }, 1000);
    }
  }, [settings.mode, settings.timeLimit, isFixedText]);

  // ── finish ────────────────────────────────────────────────────
  const finish = useCallback(() => {
    clearInterval(timerRef.current);
    endTime.current = Date.now();
    setStatus('finished');
    setWpm(calcWpm());
    setRawWpm(calcRaw());
    setAccuracy(calcAcc());
  }, [calcWpm, calcRaw, calcAcc]);

  // ── check thresholds ─────────────────────────────────────────
  const checkThresholds = useCallback((currentWpm, currentAcc) => {
    if (settings.minSpeed    > 0 && currentWpm > 0 && currentWpm < settings.minSpeed) {
      failWith(`speed below ${settings.minSpeed} wpm`);
      return true;
    }
    if (settings.minAccuracy > 0 && currentAcc > 0 && currentAcc < settings.minAccuracy) {
      failWith(`accuracy below ${settings.minAccuracy}%`);
      return true;
    }
    return false;
  }, [settings.minSpeed, settings.minAccuracy, failWith]);

  // ── key handler (exposed to TypingCanvas) ─────────────────────
  const handleKey = useCallback((key, wordsArr, wordIdxVal, charIdxVal, curInputVal, typedWordsVal, ctrlKey = false) => {
    if (status === 'finished' || status === 'failed') return;
    if (status === 'idle' && key.length === 1) start();
    if (status !== 'running' && status !== 'idle') return;

    const diff = settings.difficulty;

    // ── Backspace ──────────────────────────────────────────────
    if (key === 'Backspace') {
      if (settings.funbox === 'no_backspace') return;

      if (ctrlKey) {
        playKeySound(settings.soundType, settings.soundVolume, true);
        // Ctrl+Backspace: delete entire current word input
        if (curInputVal.length > 0) {
          const removed = keystrokes.current.splice(
            keystrokes.current.length - curInputVal.length,
            curInputVal.length
          );
          const removedCorrect = removed.filter(k => k.correct).length;
          correctChars.current -= removedCorrect;
          setCurInput([]);
          setCharIdx(0);
          updateStats();
        }
        return;
      }

      playKeySound(settings.soundType, settings.soundVolume, true);

      // Single char backspace
      if (curInputVal.length > 0) {
        const last = keystrokes.current.pop();
        if (last?.correct) correctChars.current--;
        setCurInput(curInputVal.slice(0, -1));
        setCharIdx(Math.max(0, charIdxVal - 1));
      } else if (wordIdxVal > 0) {
        const prev = typedWordsVal[wordIdxVal - 1] || [];
        setWordIdx(wordIdxVal - 1);
        setTypedWords(typedWordsVal.slice(0, -1));
        setCurInput(prev);
        setCharIdx(prev.length);
      }
      updateStats();
      return;
    }

    // ── Space: commit word ────────────────────────────────────
    if (key === ' ') {
      if (!curInputVal.length) return;

      playKeySound(settings.soundType, settings.soundVolume, true);

      if (diff === 'expert') {
        const targetWord = wordsArr[wordIdxVal] || '';
        const wrong = curInputVal.some((c, i) => c !== targetWord[i]) || curInputVal.length !== targetWord.length;
        if (wrong) { failWith('expert mode — word must be correct'); return; }
      }

      const mins = (Date.now() - (startTime.current || Date.now())) / 60000;
      if (mins > 0) {
        setWordBursts(b => [...b, {
          word: wordsArr[wordIdxVal],
          wpm: Math.round((correctChars.current / 5) / mins),
          ts:  Date.now(),
        }]);
      }

      const committed = [...typedWordsVal, curInputVal];
      setTypedWords(committed);
      setCurInput([]);
      setCharIdx(0);
      const nextIdx = wordIdxVal + 1;
      setWordIdx(nextIdx);
      if (!isFixedText && settings.mode === 'words' && nextIdx >= settings.wordCount) { finish(); return; }
      if ((isFixedText || settings.mode === 'quote') && nextIdx >= wordsArr.length)   { finish(); return; }
      updateStats();
      return;
    }

    if (key.length !== 1) return;

    // Hard cap on extra characters
    const targetWord = wordsArr[wordIdxVal] || '';
    if (curInputVal.length >= targetWord.length + MAX_EXTRA_CHARS) return;

    const targetChar = targetWord[charIdxVal] || '';
    const correct    = key === targetChar;

    if (diff === 'master' && !correct) {
      failWith('master mode — no mistakes allowed');
      return;
    }

    keystrokes.current.push({ char: key, correct, ts: Date.now() });
    if (correct) correctChars.current++;
    playKeySound(settings.soundType, settings.soundVolume, correct);
    setCurInput([...curInputVal, key]);
    setCharIdx(charIdxVal + 1);

    const w = calcWpm(), a = calcAcc();
    if (checkThresholds(w, a)) return;

    updateStats();

    // Quote/words/fixed-text auto-finish on last char of last word
    const newInput = [...curInputVal, key];
    if ((isFixedText || ['quote', 'words'].includes(settings.mode)) &&
        wordIdxVal === wordsArr.length - 1 &&
        newInput.length === targetWord.length &&
        newInput.join('') === targetWord) {
      finish();
    }
  }, [status, settings, isFixedText, start, finish, failWith, updateStats, checkThresholds, calcWpm, calcAcc]);

  return {
    words, meta, wordIdx, charIdx, curInput, typedWords,
    status, failReason, timeLeft, wpm, rawWpm, accuracy, wordBursts,
    handleKey, reset, finish,
    getDuration:   () => endTime.current && startTime.current
      ? Math.round((endTime.current - startTime.current) / 1000) : 0,
    getKeystrokes: () => keystrokes.current,
  };
}
