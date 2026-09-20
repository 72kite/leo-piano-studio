import { describe, it, expect } from 'vitest';
import { computeResults } from './results.js';

const players = [
  { userId: 'a', username: 'Alice', isGuest: false },
  { userId: 'b', username: 'Bob', isGuest: false },
  { userId: 'c', username: 'Carol', isGuest: true },
];

describe('computeResults', () => {
  it('places finishers ahead of non-finishers, ordered by finish time', () => {
    const finishes = new Map([
      ['b', { wpm: 80, accuracy: 96, finishedAt: 2000 }],
      ['a', { wpm: 90, accuracy: 98, finishedAt: 1000 }],
    ]);
    const results = computeResults(players, finishes);

    expect(results.map(r => r.userId)).toEqual(['a', 'b', 'c']);
    expect(results[0].placement).toBe(1);
    expect(results[1].placement).toBe(2);
    expect(results[2].placement).toBe(3);
  });

  it('gives non-finishers zero wpm/accuracy', () => {
    const finishes = new Map([['a', { wpm: 90, accuracy: 98, finishedAt: 1000 }]]);
    const results = computeResults(players, finishes);
    const carol = results.find(r => r.userId === 'c');
    expect(carol.wpm).toBe(0);
    expect(carol.accuracy).toBe(0);
  });

  it('awards guests zero MMR delta regardless of placement', () => {
    const finishes = new Map([
      ['c', { wpm: 100, accuracy: 100, finishedAt: 500 }], // guest finishes 1st
      ['a', { wpm: 90, accuracy: 98, finishedAt: 1000 }],
    ]);
    const results = computeResults(players, finishes);
    const carol = results.find(r => r.userId === 'c');
    expect(carol.placement).toBe(1);
    expect(carol.eloDelta).toBe(0);
  });

  it('gives registered players non-zero MMR deltas by placement', () => {
    const finishes = new Map([
      ['a', { wpm: 90, accuracy: 98, finishedAt: 1000 }],
      ['b', { wpm: 80, accuracy: 96, finishedAt: 2000 }],
    ]);
    const results = computeResults(players, finishes);
    expect(results.find(r => r.userId === 'a').eloDelta).toBeGreaterThan(0);
    expect(results.find(r => r.userId === 'b').eloDelta).toBeLessThan(results.find(r => r.userId === 'a').eloDelta);
  });
});
