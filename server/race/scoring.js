// Flat placement-based MMR deltas — intentionally simple (no opponent-strength
// weighting yet). Good enough for the "plain" tier; revisit alongside real
// ranked infrastructure if/when that becomes a priority.
const PLACEMENT_DELTA = { 1: 15, 2: 5, 3: -5, 4: -15 };
const PLACEMENT_COINS = { 1: 120, 2: 60, 3: 30, 4: 10 };

export function eloDeltaForPlacement(placement) {
  return PLACEMENT_DELTA[placement] ?? -20;
}

export function coinsForPlacement(placement) {
  return PLACEMENT_COINS[placement] ?? 5;
}

// A finish reported well above realistic human typing speed is far more
// likely spoofed than genuine — cap what counts for placement/rewards
// instead of trusting the client's self-reported number outright.
export const MAX_PLAUSIBLE_WPM = 250;

export function sanitizeFinish(wpm, accuracy) {
  const cappedWpm = Math.min(Math.max(0, Number(wpm) || 0), MAX_PLAUSIBLE_WPM);
  const cappedAcc = Math.min(Math.max(0, Number(accuracy) || 0), 100);
  const suspicious = Number(wpm) > MAX_PLAUSIBLE_WPM;
  return { wpm: cappedWpm, accuracy: cappedAcc, suspicious };
}
