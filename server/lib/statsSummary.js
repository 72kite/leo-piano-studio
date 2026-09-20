/**
 * summarizeRuns — pure aggregation over a user's stored runs. Shared by
 * /api/stats/summary (a user's own stats) and /api/teacher/roster (an
 * educator's view of each roster student's stats) so both compute the
 * exact same numbers from the exact same logic.
 */
const TREND_POINTS = 20;

export function summarizeRuns(runs, total) {
  if (total === 0) {
    return { totalRuns: 0, bestWpm: 0, avgWpm: 0, avgAccuracy: 0, trend: [], lastRunAt: null };
  }

  const bestWpm     = Math.max(...runs.map(r => r.wpm));
  const avgWpm      = Math.round(runs.reduce((s, r) => s + r.wpm, 0) / total);
  const avgAccuracy = Math.round((runs.reduce((s, r) => s + r.accuracy, 0) / total) * 10) / 10;
  const lastRunAt   = Math.max(...runs.map(r => r.createdAt));
  const trend = [...runs]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-TREND_POINTS)
    .map(r => ({ createdAt: r.createdAt, wpm: r.wpm, accuracy: r.accuracy }));

  return { totalRuns: total, bestWpm, avgWpm, avgAccuracy, trend, lastRunAt };
}
