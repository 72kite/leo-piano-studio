/** Consistency score (0-100) from per-word WPM burst variance — lower spread scores higher. */
export function computeConsistency(wordBursts) {
  if (wordBursts.length <= 1) return 100;
  const mean = wordBursts.reduce((s, b) => s + b.wpm, 0) / wordBursts.length;
  if (mean === 0) return 100;
  const sd = Math.sqrt(wordBursts.reduce((s, b) => s + (b.wpm - mean) ** 2, 0) / wordBursts.length);
  return Math.max(0, Math.round(100 - (sd / mean) * 100));
}
