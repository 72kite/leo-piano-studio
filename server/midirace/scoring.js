// Reuses the same flat, placement-based MMR/coin tables as typing race —
// they're generic by placement, not typing-specific.
export { eloDeltaForPlacement, coinsForPlacement } from '../race/scoring.js';

// A self-reported proficiency score is structurally bounded (0-100, and
// hits can never exceed the piece's own note count) in a way WPM isn't, so
// this is a validity check more than a plausibility cap — same spirit as
// race/scoring.js's sanitizeFinish, just different math for a different
// metric.
export function sanitizeFinish(score, hits, totalNotes) {
  const total = Math.max(0, Math.round(Number(totalNotes) || 0));
  const cappedHits = Math.min(Math.max(0, Math.round(Number(hits) || 0)), total);
  const cappedScore = Math.min(Math.max(0, Number(score) || 0), 100);
  const suspicious = Number(hits) > total || Number(score) > 100 || Number(score) < 0;
  return { score: cappedScore, hits: cappedHits, totalNotes: total, suspicious };
}
