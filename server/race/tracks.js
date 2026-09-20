// Race track pool — text options players vote on. Kept short (typing races
// are short bursts, not full passages) and free of anything license-encumbered.
export const TRACK_POOL = [
  {
    id: 'prose-1', type: 'prose', title: 'Fox & Forest', author: 'Leo',
    content: 'the quick brown fox jumps over the lazy dog and then runs away into the forest where it finds a hidden treasure chest',
  },
  {
    id: 'prose-2', type: 'prose', title: 'Morning Coffee', author: 'Leo',
    content: 'she poured the coffee slowly watching steam rise into the cold morning air before the city outside began to wake up',
  },
  {
    id: 'code-1', type: 'code', title: 'Binary Search', author: 'Leo',
    content: 'function search(arr, target) { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] === target) return mid; if (arr[mid] < target) lo = mid + 1; else hi = mid - 1; } return -1; }',
  },
  {
    id: 'code-2', type: 'code', title: 'Fibonacci', author: 'Leo',
    content: 'def fibonacci(n): a, b = 0, 1; for _ in range(n): a, b = b, a + b; return a',
  },
  {
    id: 'quote-1', type: 'quote', title: 'On Simplicity', author: 'Antoine de Saint-Exupery',
    content: 'perfection is achieved not when there is nothing more to add but when there is nothing left to take away',
  },
  {
    id: 'quote-2', type: 'quote', title: 'On Persistence', author: 'Samuel Beckett',
    content: 'ever tried ever failed no matter try again fail again fail better',
  },
];

export function pickVoteOptions(count = 3) {
  const shuffled = [...TRACK_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function trackById(id) {
  return TRACK_POOL.find(t => t.id === id) || null;
}
