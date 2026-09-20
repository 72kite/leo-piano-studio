import { eloDeltaForPlacement, coinsForPlacement } from './scoring.js';

/**
 * Pure placement/reward computation for a MIDI Race — ranked by proficiency
 * score descending (unlike typing race's finishedAt-ascending: everyone
 * plays the same piece for the same fixed duration, so "who finished first"
 * carries no signal — "who played it best" does). Kept separate from the
 * socket wiring so it can be unit tested without spinning up real
 * connections, same as server/race/results.js.
 *
 * @param {Array<{userId:string, username:string, isGuest?:boolean}>} players
 * @param {Map<string, {score:number, hits:number, totalNotes:number, finishedAt:number}>} finishes
 * @returns {Array<{userId:string, username:string, score:number, hits:number, totalNotes:number, placement:number, eloDelta:number, coins:number}>}
 */
export function computeResults(players, finishes) {
  const finished = players.filter(p => finishes.has(p.userId))
    .sort((a, b) => finishes.get(b.userId).score - finishes.get(a.userId).score);
  const unfinished = players.filter(p => !finishes.has(p.userId));

  const ordered = [...finished, ...unfinished];

  return ordered.map((p, i) => {
    const placement = i + 1;
    const f = finishes.get(p.userId);
    return {
      userId: p.userId,
      username: p.username,
      score: f ? f.score : 0,
      hits: f ? f.hits : 0,
      totalNotes: f ? f.totalNotes : 0,
      placement,
      eloDelta: p.isGuest ? 0 : eloDeltaForPlacement(placement),
      coins: p.isGuest ? 0 : coinsForPlacement(placement),
    };
  });
}
