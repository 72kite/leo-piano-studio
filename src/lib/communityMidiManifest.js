/**
 * communityMidiManifest — real MIDI transcriptions supplied directly by the
 * user (as opposed to the short public-domain motifs hand-built in
 * PianoMode.jsx's BUILTIN_TRACKS). Each entry points at a .mid file served
 * from public/community-midi/ and is fetched + parsed on demand when its
 * row is clicked, the same @tonejs/midi pipeline the .mid upload button
 * already uses.
 *
 * To add a song: drop the .mid file in public/community-midi/, add one
 * entry below with its file name — nothing else needs to change.
 */
export const COMMUNITY_MIDI_TRACKS = [
  {
    id: 'juice-wrld-empty',
    title: 'Empty',
    composer: 'Juice WRLD',
    era: 'Hip-Hop · 2018',
    file: '/community-midi/juice-wrld-empty.mid',
  },
  {
    id: 'kwn-do-what-i-say',
    title: 'Do What I Say',
    composer: 'kwn',
    era: 'Hip-Hop',
    file: '/community-midi/kwn-do-what-i-say.mid',
  },
];
