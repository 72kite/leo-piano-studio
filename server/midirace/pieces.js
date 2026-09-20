// Mirrors src/lib/builtInPieces.js's ids exactly — the server only needs to
// pick and announce which piece a lobby is racing, never the actual note
// data (that's already on the client, same as every other Composition
// Studio track). Keep these two id lists in sync if a piece is added.
export const PIECE_POOL = [
  { id: 'bach-prelude',        title: 'Prelude in C Major',    composer: 'J.S. Bach' },
  { id: 'beethoven-ode',       title: 'Ode to Joy (Theme)',    composer: 'L.v. Beethoven' },
  { id: 'chopin-nocturne',     title: 'Nocturne in E♭ (Theme)', composer: 'F. Chopin' },
  { id: 'beethoven-fur-elise', title: 'Für Elise (Theme)',     composer: 'L.v. Beethoven' },
];

export function pickPiece() {
  return PIECE_POOL[Math.floor(Math.random() * PIECE_POOL.length)];
}
