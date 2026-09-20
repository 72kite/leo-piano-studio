/**
 * The app's hand-built, public-domain community-library pieces — shared
 * between PianoMode.jsx's Community Tracks list and MidiRacePage.jsx (a
 * MIDI Race needs every player racing the same piece assigned by id, and
 * this is the one note-data source both the client and the "which piece
 * did the server assign" lookup can share without the server needing to
 * know anything about note data itself).
 */
export const BUILTIN_PIECES = [
  {
    id: 'bach-prelude',
    title: 'Prelude in C Major',
    composer: 'J.S. Bach',
    era: 'Baroque · Public Domain',
    notes: (() => {
      const pattern = [60,64,67,72,67,64];
      const out = [];
      for (let bar = 0; bar < 8; bar++) {
        pattern.forEach((midi, i) => {
          out.push({ midi, time: bar * 2.4 + i * 0.4, duration: 0.38, velocity: 72 });
        });
      }
      return out;
    })(),
  },
  {
    id: 'beethoven-ode',
    title: 'Ode to Joy (Theme)',
    composer: 'L.v. Beethoven',
    era: 'Classical · Public Domain',
    notes: (() => {
      const melody = [
        64,64,65,67, 67,65,64,62, 60,60,62,64, 64,62,62,
        64,64,65,67, 67,65,64,62, 60,60,62,64, 62,60,60,
      ];
      return melody.map((midi, i) => ({ midi, time: i * 0.5, duration: 0.45, velocity: 80 }));
    })(),
  },
  {
    id: 'chopin-nocturne',
    title: 'Nocturne in E♭ (Theme)',
    composer: 'F. Chopin',
    era: 'Romantic · Public Domain',
    notes: (() => {
      const melody = [75,79,82,79,82,84,82,79,82,84,86,84,82,79,75];
      const bass   = [51,55,58,51,55,58,51,55,58,51,55,58,51,55,58];
      const out = [];
      melody.forEach((m, i) => {
        out.push({ midi: m,       time: i * 0.7, duration: 0.65, velocity: 75 });
        out.push({ midi: bass[i], time: i * 0.7, duration: 0.65, velocity: 50 });
      });
      return out.sort((a,b) => a.time - b.time);
    })(),
  },
  {
    id: 'beethoven-fur-elise',
    title: 'Für Elise (Theme)',
    composer: 'L.v. Beethoven',
    era: 'Classical · Public Domain',
    notes: (() => {
      // The famous opening motif (WoO 59), repeated — same simplified,
      // "(Theme)"-scoped treatment as the Ode to Joy / Nocturne entries
      // above, not a full transcription of the piece.
      const motif = [76,75,76,75,76,71,74,72,69];
      const out = [];
      for (let rep = 0; rep < 4; rep++) {
        motif.forEach((midi, i) => {
          out.push({ midi, time: rep * motif.length * 0.3 + i * 0.3, duration: 0.28, velocity: 78 });
        });
      }
      return out;
    })(),
  },
];

export function getBuiltInPiece(id) {
  return BUILTIN_PIECES.find(p => p.id === id) || null;
}
