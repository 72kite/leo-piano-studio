import { eloDeltaForPlacement } from './scoring.js';

/**
 * Pure placement/reward computation — kept separate from the socket wiring
 * so it can be unit tested without spinning up real connections.
 *
 * @param {Array<{userId:string, username:string, mmr?:number, isGuest?:boolean}>} players
 * @param {Map<string, {wpm:number, accuracy:number, finishedAt:number}>} finishes
 * @returns {Array<{userId:string, username:string, wpm:number, accuracy:number, placement:number, eloDelta:number}>}
 */
export function computeResults(players, finishes) {
  const finished = players.filter(p => finishes.has(p.userId))
    .sort((a, b) => finishes.get(a.userId).finishedAt - finishes.get(b.userId).finishedAt);
  const unfinished = players.filter(p => !finishes.has(p.userId));

  const ordered = [...finished, ...unfinished];

  return ordered.map((p, i) => {
    const placement = i + 1;
    const f = finishes.get(p.userId);
    return {
      userId: p.userId,
      username: p.username,
      wpm: f ? f.wpm : 0,
      accuracy: f ? f.accuracy : 0,
      placement,
      eloDelta: p.isGuest ? 0 : eloDeltaForPlacement(placement),
    };
  });
}
