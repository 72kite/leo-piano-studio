# Leo: TypingHub & Composition Studio — Project Plan

A speed-typing trainer, real-time multiplayer typing race, and MIDI piano
composition studio, built as one React app. This doc tracks what's actually
built versus what's still UI-only, and lays out what's next.

**Stack:** React 19 · Zustand · Socket.io client · Web MIDI / Web Audio · Vite · Docker + nginx

---

## 1. Purpose

Three products sharing one shell, one design system, and one account. The
bet is that typing practice, competitive racing, and music composition are
all "keyboard input to skill feedback loop," so they belong together.

- **Typing Hub** — Monkeytype-style practice: time / words / quote / zen
  modes, funboxes, and word pools across English, Spanish, Arabic, and four
  programming languages. Feedback via live WPM and a post-run accuracy
  breakdown.
- **Race Mode** — turns typing into a 4-player live competition —
  matchmaking, text voting, a synchronized countdown, and anti-cheat payload
  withholding — with MMR and coin rewards on the line.
- **Piano Studio** — a lightweight DAW: play on real MIDI hardware or a
  mapped computer keyboard, see notes render to a staff live, keep time with
  a metronome, and import/export MusicXML.

---

## 2. What's built

The full frontend is implemented and runs standalone. Every module below is
real, working UI — the qualifier is whether it's wired to a live backend or
currently running against local fallbacks.

**Legend:** ✅ done, backend-independent · 🟡 UI complete, running on a local fallback

### ✅ Typing Engine
- State machine: idle → running → finished/failed
- Time / words / quote / zen modes, punctuation & numbers toggles
- 8 funboxes (mirror, earthquake, gibberish, polyglot, …)
- 8 word pools, incl. Python / C++ / Go / Rust

### ✅ Results & Analytics
- WPM / raw WPM / accuracy calculation
- Chart.js burst graph with error overlay
- Theme-aware chart colors

### ✅ Piano / Composition Studio
- Web MIDI hardware input + keyboard fallback mapping
- Live SVG staff rendering, metronome, 88-key display, Teaching Mode
  (wait-for-the-right-key practice against any loaded song)
- MusicXML import/export
- **Canvas mode** (2026-08-25) — a second `pianoSubMode`, alongside the
  existing "Studio" DAW view: an ambient full-canvas visualizer inspired by
  [dotpiano.com](https://dotpiano.com) (Alex Chen & Yotam Mann) — played
  notes spawn large soft glowing circles positioned by pitch, additively
  blended (`lighter` composite) where they overlap, across 5 selectable
  color palettes, with no on-screen keyboard. Recording captures the
  session into the same note shape the rest of Composition Studio speaks,
  so "Save to Composition" hands it straight to the existing
  player/staff/MusicXML pipeline — the practical analog of DotPiano's
  record-and-share, without needing new backend storage.
  `pianoSubMode` itself was a pre-existing setting (in `DEFAULTS` and the
  server's settings whitelist) that nothing had ever actually read — now
  wired up.
- **Fullscreen** (2026-08-25) — a toggle on the mode-switch row uses the
  real Fullscreen API (`requestFullscreen`) on the whole page, not just a
  wider CSS layout; `piano-mode:fullscreen` gets its own background/padding
  so it doesn't inherit the browser's default black-fullscreen backdrop.
- **Multi-instrument synth architecture** (2026-08-25) — `src/lib/instruments/`
  is a small registry (`play(ctx, midiNote, velocity) => { release() }`);
  adding a voice means writing one module in that shape and listing it.
  Four voices ship today, each built from a researched real technique
  rather than guessed at:
  - **Grand Piano** — 5 additive partials with Fletcher stretch-tuning
    (`fₙ = n·f0·√(1+B·n²)`, B rising bass→treble) instead of pure-integer
    ratios, plus a filtered noise-burst hammer transient and ~3-cent
    stereo width.
  - **Electric Piano** — FM synthesis, the DX7 "E.PIANO 1" recipe: a 1:1
    carrier:modulator body tone plus a 14:1 modulator pair for the
    percussive tine "bite," both with independently fast-decaying
    modulation index.
  - **Organ** — Hammond drawbar synthesis: 9 sine partials at the classic
    16'/5⅓'/8'/4'/2⅔'/2'/1⅗'/1⅓'/1' ratios `[0.5,3,1,2,6,4,5,6,8]`, a
    key-click transient, near-instant attack, fast percussive release.
  - **Synth Pad** — two ±4-cent-detuned sawtooths + a sub triangle, slow
    filter-opening attack, slow release.

  Piano/EP are decay-only (fire-and-forget, like the real instruments —
  they keep decaying even while held); Organ/Pad are genuinely sustained,
  which needed real note-on/note-off voice tracking that didn't exist
  before (a `Map<midiNote, voice>` in `PianoMode`, released on note-off or
  on re-trigger). `CompositionPlayer` schedules each note's own release at
  `note.duration`, and a hard Stop force-releases everything immediately
  instead of waiting out each note's natural fade.
- **Mic Input — pitch detection for real instruments** (2026-08-25) — lets
  someone play a real woodwind (or voice) into the microphone and have the
  detected note drive the same teaching/visual pipeline MIDI input already
  does, so Teaching Mode's "follow along" loop works with a real
  instrument. `src/hooks/useMicPitch.js` implements YIN (de Cheveigné &
  Kawahara) pitch detection — not naive autocorrelation, which was the
  first thing tried and immediately caught misreading a deliberately
  detuned A4 (+30¢) as C2, a textbook octave error from picking the
  strongest correlation peak instead of the shortest lag that clears
  threshold. Verified with synthesized WAV tones fed through Chromium's
  fake-audio-capture device (not just eyeballed): exact-cents accuracy
  from G2 to G6, including the detuned case, after the YIN fix.
- **Real sampled Grand Piano** (2026-08-25) — replaced the synth-only Grand
  Piano with the actual "Salamander Grand Piano" sample set (Alexander
  Holm, CC BY 3.0) — the same one dotpiano.com itself credits and uses.
  Sourced legitimately from the sample's own public distribution (the
  30-note, single-velocity mp3 subset Tone.js ships), not scraped from
  dotpiano's site — `public/audio/salamander/` (30 files, ~2MB total),
  loaded and pitch-shifted (nearest sample ± up to a minor third) by
  `src/lib/instruments/salamanderSampler.js`. `grandPiano.js` is now a thin
  wrapper: real samples once loaded, falling back to the additive synth
  voice (moved to `grandPianoSynth.js`) while they're still fetching or if
  loading fails — so the instrument is never silent. CC BY attribution
  shown in the UI whenever Grand Piano is selected, per the license.
  Verified live: all 30 sample requests 200, zero console errors.
- **Für Elise (Theme)** added to the Community Library — public domain
  (Beethoven, 1810), the same short-motif treatment as the existing Ode to
  Joy / Nocturne entries. The other 7 songs requested in this pass
  (contemporary copyrighted tracks) were **not** added — transcribing a
  song's melody/harmony into playable note data reproduces the protected
  musical composition itself, the same reason commercial practice apps
  license their libraries rather than transcribe them in-house. The
  existing `.mid` upload button already works for anyone who has legally
  obtained MIDI files of a song they own the rights to.
- **Full-width falling-notes stage + Chord Selector** (2026-08-25) — Studio
  mode's keyboard now sits in an edge-to-edge, full-bleed black stage
  (`.piano-immersive` in `PianoMode.css`; `app-main-wide` in `App.css`
  dropped its `max-width` so the page itself can break out) instead of a
  boxed card, with a Synthesia-style falling-notes canvas
  (`FallingNotes.jsx`) above the keys as the composition's dynamic "sheet
  music" — bars fall toward a hit-line exactly aligned to each key's x
  position via shared layout math (`src/lib/pianoLayout.js`, now the single
  source of truth PianoKeys/PianoKeymap/FallingNotes all read from).
  Playback itself was extracted out of the transport UI into
  `useCompositionPlayback.js`, a single engine shared by the transport bar
  and the falling-notes canvas so they're always reading the same clock —
  the transport's progress bar is click-to-seek and there's now a Rewind
  5s button, so playback can be paused or rolled back mid-song, not just
  run forward to the end. Also added a **Chord Selector**
  (`ChordSelector.jsx`, `src/lib/chords.js`) — pick a root + one of 14
  qualities, see the voicing highlighted in purple on the keyboard, play it
  as a block chord on whichever instrument is selected; automatically
  suppressed during Teaching Mode so it can't visually compete with the
  blue "play this note" cue. Canvas mode and the rest of the page
  (transport, tracks, metronome, mic input) are unchanged — the full-bleed
  treatment is scoped to the keyboard/falling-notes stage specifically, not
  the whole page. Verified live via a headless-Chromium pass: falling notes
  animate in sync with playback and land on the correct keys, chord
  highlighting updates live, Teaching Mode's cue reads unambiguously, and
  Canvas mode is unaffected — zero console errors across all three.
- **Seamless full-bleed stage + edge-to-edge keyboard + shared light effect**
  (2026-08-25) — three follow-up refinements to the above. (1) The whole top
  half of Studio mode (toolbar, sheet music, transport, mic input) now sits
  on the same continuous black background as the falling notes and keys —
  previously it was a separate section with a border seam; now it's one
  `.piano-black-zone` with no dividing line, so the page reads as one
  surface from the nav bar down to the keyboard. (2) The keyboard itself is
  now fluid-width instead of a fixed pixel size — `pianoLayout.js`'s
  geometry is percentages of total width, not px, so PianoKeys/PianoKeymap/
  FallingNotes all stretch to fill the container exactly, edge-to-edge at
  any viewport width, with FallingNotes resizing live via ResizeObserver the
  same way DotPianoCanvas already did. (3) Studio mode's per-key "lights"
  (small dots rising from wherever a key was pressed) were replaced with
  Canvas mode's ambient `GlowCircle` effect — soft, additively-blended discs
  that grow/hold/fade — extracted into a shared `src/lib/glowCircle.js` so
  both modes render played notes identically instead of two different
  effects. Verified at 1024px through 1800px viewports and re-checked
  Teaching Mode + Canvas Mode for regressions: zero console errors.
- **"Your Library" — user-supplied MIDI tracks** — a second Community
  Library section, separate from the hand-built public-domain motifs above,
  for real MIDI files the user has obtained the rights to and supplies
  directly (as opposed to a transcription written by the assistant, which
  raises different copyright questions than the user importing their own
  legally-obtained file). `src/lib/communityMidiManifest.js` lists
  `{id, title, composer, era, file}` entries pointing at
  `public/community-midi/*.mid`; each row fetches + parses the file on
  click via the same `@tonejs/midi` pipeline the manual `.mid` upload
  button already used (now factored into a shared `parseMidiBuffer()`).
  First entry: "Empty" by Juice WRLD (2018), a full 2,774-note piano-cover
  transcription the user supplied — verified end-to-end (fetch → parse →
  falling notes → sheet music) with zero console errors. Labeled "rights-
  cleared uploads" rather than "Public Domain," since that's not the same
  claim. To add another: drop the `.mid` file in `public/community-midi/`
  and add one entry to the manifest.
- **Piano-first layout + falling-note letter hints** (2026-08-25) — the
  piano was buried below a tall sheet-music box, transport, and mic panel;
  reordered so the Notes/MusicXML + Learn toggle and the transport/teaching
  feedback sit in a compact bar directly above the keyboard, with the sheet-
  music view and mic input moved below the fold as secondary/reference
  material. At a typical 1440×900 viewport the full keyboard is now visible
  with zero scrolling (verified: keyboard bounds 583–751px, well inside the
  900px viewport). Also added note-letter labels ("C4", "A#3", …) directly
  on each falling bar in `FallingNotes.jsx` — while implementing this,
  caught and fixed a real bug in the falling-notes math: the onset/release
  edges were swapped, so every bar's height was silently clamped to a 3px
  floor regardless of the note's actual duration (bars always looked like
  thin ticks). Fixing the edge assignment made both the new letter hints
  legible and the bars correctly duration-proportional. Verified via a
  zoomed canvas screenshot showing legible, correctly-sized, colored labels.
- **Sticky quick bar + liquid-glass style + circular Metronome/Chords**
  (2026-08-25) — removed the static "composition studio" tag and replaced
  the boxy mode-switch row with `PianoQuickBar.jsx`: a slim bar, sticky
  directly under the app's TopNav (`position: sticky; top: 3.25rem`), that
  holds the Studio/Canvas/Fullscreen switch, transport (rewind/play/stop +
  a slim progress bar), the instrument picker, and two circular trigger
  buttons for the Metronome and Chord Selector — each opens a small glass
  popover containing the existing component unchanged. The popovers stay
  mounted at all times and are hidden with CSS (`display:none`) rather than
  conditionally rendered, on purpose: unmounting `ChordSelector` would fire
  its cleanup effect and clear the keyboard highlight the instant you close
  the popover, and unmounting `Metronome` would kill a running click track.
  `Metronome` was extracted from PianoMode.jsx into its own file so
  PianoQuickBar could reuse it. Because the quickbar is sticky, the piano
  is reachable immediately and stays reachable even scrolled down to the
  sheet music or Community Library.
  New "liquid glass" style (`.glass-btn`, `.glass-panel` in
  `PianoQuickBar.css`) replaces the old solid-fill highlighted-box active
  state everywhere on the piano page's switcher-style controls (quickbar
  buttons, the Notes/MusicXML/Learn toggle) with a translucent,
  backdrop-blurred surface and an accent *ring* instead of a filled
  background when active. Scoped to the Piano page's own controls, not the
  typing/race/settings pages. Verified via headless-Chromium across Studio,
  Canvas, and Teaching Mode, plus opening/closing both popovers and
  confirming the sticky bar stays pinned on scroll — zero console errors.
- *Note: Audio-to-MIDI (basic-pitch) is wired but ships as an optional install.*

### ✅ Settings & Themes
- 7 themes as CSS variable sets, live-switchable
- CLI command palette (`theme dracula`, `mode words 50`)
- Font, language, sound preferences persisted locally

### ✅ Race Mode
- Full phase lifecycle UI: queue → vote → countdown → race → results
- Real matchmaking, voting, and JIT anti-cheat payload delivery via
  [`server/race/`](server/race/) — no sign-in required, guests race same as anyone
- Opponent progress bars, placement + coin payout screen
- Falls back to generated local bots if no players queue within 8s, or the
  race server is unreachable — same graceful-degradation the bot names
  already implied, now actually optional rather than the only path

### ✅ Auth & Profiles
- Login / register pages, guest identity generation
- Token refresh lifecycle in `useAuthStore`, now backed by a real rotating-refresh-token API
- Role support: student / educator
- Server: [`server/`](server/) — see step 1 in the roadmap below for what's implemented

### ✅ Educator Dashboard
- Real per-student roster data via `/api/teacher` (see step 5 below) — join
  code, aggregate WPM/accuracy, CSV export
- Focus (mode-lock broadcast) and Accounts (bulk credential generator) tabs
  remain client-only stubs — no server handler for `session:*` events, no
  `/api/teacher/accounts/bulk` endpoint

### ✅ Deployment
- Multi-stage Docker build → nginx static serve
- docker-compose with `leo-app` + `leo-server`, and an optional
  Compose-profile-gated `postgres` service (off by default — see step 2
  below) for durable storage instead of the JSON-file default

---

## 3. The gap

**Resolved 2026-08-19.** `server.js` used to be a loader that searched for
`leo-server.js` / `leo-server-redis.js` / `leo-server-postgres.js` **one
directory above this repo** — a location that turned out to be a bare,
untracked folder with nothing in it. That convention has been replaced: the
backend now lives in-repo at [`server/`](server/), and `server.js` at the
root simply boots it, so `node server.js` still works as documented below.
`docker-compose.yml`'s `leo-server` service now builds `server/Dockerfile`
from this repo instead of mounting an external directory.

Everything past "guest, offline typing" was blocked on this piece —
auth, race, and typing-hub stats persistence are now all unblocked.

---

## 4. Backend build-out — complete

All seven steps below are done. Ordered by dependency: each step unblocked
specific frontend code that was already written and waiting. What's left
across the whole project — social auth, Redis (deferred, see step 2), the
remaining piano stubs — lives in section 5.

1. ✅ **Core API + auth service** — done
   Implemented in [`server/`](server/): Express, JWT access tokens (15 min,
   above the client's 14-minute freshness window) plus rotating refresh
   tokens with reuse detection (a replayed refresh token revokes its whole
   session family), bcrypt password hashing, Zod-validated input, a
   timing-safe login path (no user-enumeration via response latency), rate
   limiting on `/api/auth/*`, Helmet + a CORS origin whitelist, and
   `/api/auth/register` / `login` / `refresh` / `logout` +
   `/api/profile/settings`. Storage is a JSON file (`server/lib/db.js`) —
   intentionally the "plain" tier from step 2 below, swappable without
   touching the routes. Covered by 25 tests in `server/app.test.js`.
   *Unblocks: `useAuthStore`, `AuthPages.jsx` — done*

2. ✅ **Persistence layer** — done (Postgres; Redis explicitly deferred, see below)
   `server/lib/pgDb.js` — a drop-in replacement for JsonDb, same async
   method-for-method interface, so every route talks to it exactly as
   before with zero route-level changes. Structured fields (username,
   email, role, mmr, wallet…) are real indexed columns; the variable-shaped
   ones (`settings`, `runs`, `roster`) stay JSONB columns on the same row
   rather than being normalized into their own tables — `runs` in
   particular is capped at 500 and only ever read back whole for one user,
   never joined/queried across users, so a relational runs table would add
   migration overhead without buying anything this app needs yet.
   `refresh_tokens` *is* a real table though (unlike JSONB for everything
   else) — it's looked up by hash on every token refresh, a hot,
   security-sensitive path that wants a real index instead of a full JSONB
   scan. `addRun`'s cap-and-append is one atomic SQL statement (not a
   read-modify-write) so concurrent writers can't race — verified with 30
   concurrent `addRun` calls landing all 30 with nothing dropped or
   duplicated. Schema bootstraps itself lazily (idempotent
   `CREATE TABLE IF NOT EXISTS` on first query, cached after) — no separate
   migration tool, matching JsonDb's "plain tier" philosophy.

   Selected via `DATABASE_URL` in `server/index.js` — unset (the default),
   JsonDb keeps running exactly as it always has, so this is purely
   additive to every existing deployment. `docker-compose.yml` gets a
   `postgres` service gated behind Compose's `profiles: ["postgres"]` so it
   never starts on a plain `docker compose up` (verified: `docker compose
   config` resolves cleanly with and without `--profile postgres`, and a
   real rebuild+redeploy of the live stack confirmed the log line still
   reads "using JSON-file storage" and existing data was untouched).
   `server/scripts/migrate-json-to-pg.js` is a one-time, idempotent,
   deliberately-not-automatic helper for actually cutting an existing
   deployment's data over when that's wanted (skips users already present
   in the target rather than duplicating/overwriting) — refresh-token
   sessions are the one thing it doesn't carry over (they're short-lived by
   design; affected users just log in again rather than the script taking
   on reuse-detection/family-chain migration for something that self-heals
   in one request).

   Verified at three layers, not just unit tests: (1) `server/pgDb.test.js`
   — 9 tests exercising the full method surface against a real throwaway
   Postgres container, `describe.skipIf`'d so `npm test` needs no Postgres
   and CI is unaffected; (2) the actual Express app (`createApp({db})`)
   driven over real HTTP against Postgres — register educator, register
   student, fetch join code, join, post a run, confirm the teacher's
   roster shows the correctly aggregated real numbers; (3) the migration
   script run against a hand-built fixture JSON file, output verified
   field-by-field including nested `roster`/`settings`/`runs`, then
   re-run to confirm it skips already-migrated users instead of
   duplicating them.

   **Redis (matchmaking queues/session-presence) was deliberately not
   built.** It only earns its complexity at a scale this deployment doesn't
   have — multiple server instances needing to share lobby state. The race
   server's current in-memory state is correct and sufficient for the
   single-instance docker-compose deployment this actually runs as; adding
   a pub/sub coordination layer for a scaling problem that doesn't exist
   yet would be complexity with no present payoff. Revisit if/when this
   ever runs as more than one `leo-server` instance.
   *Unblocks: `user.mmr`, `user.wallet` — done (Postgres); Redis — deferred*

3. ✅ **Socket.io race server** — done
   Implemented in [`server/race/`](server/race/): the exact event contract
   the client already spoke (`race:queue` → `race:matched` →
   `race:vote_start` → `race:countdown_start` → `race:payload` withheld
   until T-2500ms → `race:start` → `race:opponent_update` → `race:over`),
   in-memory matchmaking/lobby state (the same "plain" tier as `db.js`),
   flat MMR deltas + coin payouts on placement, and a WPM sanity cap
   (`MAX_PLAUSIBLE_WPM`) that flags implausible finishes instead of trusting
   the client outright. Guests race exactly like signed-in players — only
   MMR/wallet persistence is skipped for them. Covered by an integration
   test that drives two real `socket.io-client` connections through the
   full lobby lifecycle (`server/race/socket.test.js`).

   Building this surfaced a real, separate frontend bug: the race track
   text delivered via `race:payload` was never actually wired into the
   typing engine — `TypingCanvas` was generating unrelated random words
   regardless of what track got voted on, in both real races and bot
   races. Fixed alongside this: `useTypingEngine` now accepts a `text`
   override so a race types the exact voted-on passage.
   *Unblocks: `useSocket.js`, `RacePage.jsx`, `useRaceStore` — done*

4. ✅ **Stats & profile persistence** — done
   Race MMR/wallet updates persist server-side (see step 3). Added
   `/api/stats/runs` (POST to save a completed typing-hub run, GET for
   paginated history) and `/api/stats/summary` (best/avg WPM, avg accuracy,
   a 20-point trend) in [`server/routes/stats.routes.js`](server/routes/stats.routes.js),
   backed by a capped per-user run list in `server/lib/db.js` (same JSON
   "plain" tier as everything else — 500 runs/user). Only genuinely
   *finished* runs are saved (not failed/threshold runs), and only for
   signed-in users — guests race and type same as anyone but nothing
   persists for them, consistent with race MMR/wallet. Covered by
   `server/stats.test.js`.

   Frontend: `TypingHub` (`App.jsx`) POSTs a run once per finish via the new
   `useStatsStore`, and a new **Stats** page (`src/components/stats/`),
   reachable from the profile dropdown, renders the summary tiles, WPM
   trend chart, and paginated run history — gated behind sign-in for
   guests. `computeConsistency` was pulled out of `ResultsScreen.jsx` into
   `src/lib/` so both places share one calculation.
   *Unblocks: `ResultsScreen.jsx`, profile dropdown — done*

5. ✅ **Educator dashboard data** — done
   No teacher-student linkage existed anywhere in the schema, so this
   needed designing from scratch: a roster now hangs off the teacher's own
   user record (`{ joinCode, studentIds: [] }`, same pattern as `runs`
   hanging off a student's) rather than a separate classes/cohorts
   collection — one roster per teacher, which is all the dashboard's UI
   actually needed. `server/lib/db.js` adds `getOrCreateJoinCode`,
   `joinRoster` (idempotent, self-join rejected), `getRosterStudents`.
   New `/api/teacher` router (`server/routes/teacher.routes.js`):
   `GET /roster` (educator-only — returns the join code plus every roster
   student's aggregate stats) and `POST /roster/join` (student-only, by
   code). The aggregation math (`bestWpm`/`avgWpm`/`avgAccuracy`/`trend`)
   was extracted from `/api/stats/summary` into a shared, pure
   `summarizeRuns()` (`server/lib/statsSummary.js`, now also returns
   `lastRunAt`) so a teacher's view of a student's stats and the student's
   own view are computed by the exact same code, not two copies that could
   drift. Both endpoints are role-gated server-side via `req.userRole`
   (`requireAuth` already decodes it from the JWT) — access control isn't
   only a client-side check anymore for this data. 14 new tests in
   `server/teacher.test.js` covering role gates, join-code creation/reuse,
   idempotent joins, case-insensitive codes, and roster isolation between
   teachers.

   Frontend: new `useTeacherStore` (`fetchRoster`, `joinClass`) following
   the existing `useStatsStore` pattern. `EducatorDashboard.jsx`'s
   `MOCK_STUDENTS` is gone — the former "Monitor" tab (fake live-typing
   dots, a `setInterval` random-walking WPM, per-student lock buttons with
   no server enforcement behind them) is now **Roster**: the real join
   code, class-wide avg WPM/accuracy tiles, and a real per-student table
   (runs, best/avg WPM, avg accuracy, last-active relative time). Removed
   the fabricated "typing now" / lock UI entirely rather than fake it on
   top of real data — there's no live-session tracking to back it, and the
   ROADMAP already separately tracks that as a distinct unbuilt piece
   (`session:*` socket events with no server handler). Reports tab and CSV
   export updated to the same real fields. A new "Classroom" section in
   Settings (`SettingsPage.jsx`, students only) lets a student enter a
   join code. Focus and Accounts tabs are untouched — still their
   pre-existing stubs, out of scope here.
   Verified live end-to-end (not just unit tests): registered an educator
   and a student in separate browser contexts, read the real join code off
   the dashboard, joined via the Settings UI, posted two runs through the
   student's own token, and confirmed the teacher's Roster/Reports tabs
   showed the correct aggregated numbers after a refresh — zero console
   errors throughout.
   *Unblocks: `EducatorDashboard.jsx` — done*

6. ✅ **Tests + CI** — done
   Vitest + React Testing Library (frontend) and an integration suite
   covering auth, race lobby lifecycle, and stats persistence (server) —
   75 tests across 7 files, all running through one `npm test` (Vitest
   picks up both sides). Added [`eslint.config.js`](eslint.config.js) —
   there wasn't one, so `npm run lint` had never actually run; the
   `react-hooks` plugin's v7 "recommended" bundles the full React
   Compiler rule set (purity/immutability/refs/...), which this codebase
   predates, so only the two classic rules (`rules-of-hooks`,
   `exhaustive-deps`) are wired in rather than adopting that wholesale.
   Lint is clean: 0 errors, 35 pre-existing `exhaustive-deps`/unused-var
   warnings left as warnings, not blockers.
   [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint,
   build, and test on every push to `main` and every PR.
   *Unblocks: repo-wide — done*

7. ✅ **Production hardening** — done
   Rate limiting on `/api/auth/*` was already in place from step 1
   (`server/routes/auth.routes.js`'s `authLimiter`, tighter than the global
   `/api` limiter) — just verified, not re-built. Two things actually were
   missing:
   - **Env-driven API base URL** — `src/store/index.js`'s hardcoded
     `http://localhost:3001` is now `import.meta.env.VITE_API_URL ||
     'http://localhost:3001'`. Since the frontend is a static nginx-served
     bundle with no server-side runtime, this has to be baked in at build
     time, not read at container startup — `Dockerfile` gets a
     `VITE_API_URL` build `ARG` (default unchanged), and
     `docker-compose.yml`'s `leo-app` passes it through from the host env.
     Omitting it changes nothing; it only matters if the API and frontend
     ever end up on different hosts instead of one docker-compose stack.
   - **Structured error logging** — `server/middleware/errorHandler.js`'s
     bare `console.error(err)` is now one JSON line per unexpected (5xx)
     error with method, path, `userId` (when authenticated), message, and
     stack — grep-able today, and the single function 4xx errors never
     reach (expected validation/auth failures aren't logged as errors) is
     the one place to swap in a real APM/error-tracking SDK call later
     without touching any route.
   *Unblocks: `store/index.js` — done*

---

## 5. Also worth doing

Smaller, independent of the backend build-out — pick up opportunistically.

- **Social auth** — Google/Apple buttons exist but are disabled placeholders.
  Blocked on external action, not code: needs real OAuth app registrations
  with Google/Apple (client ID/secret) that only the project owner can
  create — not something achievable from inside this environment.
- **Audio-to-MIDI** — already reasonably gated: `AudioToMidi` dynamically
  imports `@spotify/basic-pitch` and toasts install instructions if it's
  missing, rather than a hard crash. Bundling it by default is a ~size
  tradeoff call, not a bug.
- ✅ **dist/ tracking (2026-08-25)** — `dist/index.html` was tracked despite
  `dist/` being gitignored (a stale commit from before the ignore rule).
  Untracked it (`git rm --cached`) — the file stays on disk, `.dockerignore`
  already excludes `dist/` from the build context entirely since the image
  regenerates it via `npm run build`, so nothing outside git tracking
  changes.
- ✅ **API base URL (2026-08-25)** — done, see step 7 above.
- ✅ **Orphaned settings wired up (2026-08-25)** — `soundType`/`soundVolume` had
  a full chip selector + volume slider in Settings/CLI but no playback code;
  added [`src/lib/keySound.js`](src/lib/keySound.js) (Web Audio click/pop/soft)
  and wired it into `useTypingEngine.js`'s key handler. `repeatQuote` now
  actually keeps the same quote across resets. `britishEn` (previously
  CLI-only and silently doing nothing) now mixes `WORDS_BRIT` into the pool
  when language is `en`, and got a Settings-page toggle it never had. Also
  wired the Educator Reports "Export CSV" button to a real client-side CSV
  download (was a `toast('Exporting CSV…')` stub). Covered by 4 new tests in
  `useTypingEngine.test.js`, verified live in-browser (Playwright: sound
  plays with no console errors, CSV downloads with correct content).
  Still stubbed at the time: `showKeymap`, "Join MIDI Race", and Focus-tab
  enforcement — all three closed out below (2026-08-26).
- ✅ **"Share My Composition" (2026-08-25)** — real `.mid` export, replacing
  the `toast('Share feature coming soon...')` stub. `notesToMidiBlob()` in
  `PianoMode.jsx` is the inverse of the existing `parseMidiBuffer()` (uses
  `@tonejs/midi`'s `Midi`/`Track.addNote` builder API), triggering a real
  browser download via the same blob-download pattern already used for CSV
  exports. Verified via a genuine round-trip in the browser: exported the
  loaded "Ode to Joy" composition, re-uploaded the downloaded file through
  the existing `.mid` upload button, and confirmed all 30 notes came back
  matching exactly — not just "a file downloaded," but that it's a valid,
  correct standard MIDI file any DAW could open.
- ✅ **Educator Accounts tab — real bulk account creation (2026-08-25)** —
  the last educator-dashboard stub. New `POST /api/teacher/accounts/bulk`
  (educator-only, its own rate limiter — bcrypt-hashing N passwords is
  expensive and abuse-prone the same way auth endpoints are) generates N
  real student accounts with unambiguous-alphabet usernames/passwords,
  hashes and persists each one, and adds it directly to the caller's
  roster via a new `addStudentToRoster()` (both `db.js` and `pgDb.js` —
  same roster mutation as `joinRoster()`'s join-code flow, just teacher-
  initiated instead of student-initiated, so it skips the join code
  entirely). `AccountsTab` now calls the real endpoint instead of a
  client-only fake preview, shows the real generated credentials (once —
  they can't be recovered after, only bcrypt hashes are stored), exports
  them to CSV, and refreshes the Roster tab so new students appear
  immediately. 6 new server tests, plus a Postgres-specific test for
  `addStudentToRoster`.

  Building this surfaced a real bug, not just a stub: a burst of rapid
  sequential writes (create account → add to roster, ×N in a row) threw
  `EPERM` on `JsonDb`'s file rename step on Windows — something
  (antivirus/search indexing) transiently holding a handle on the
  destination path right as it's renamed onto. POSIX rename doesn't have
  this problem, so it never reproduces on the Linux container this
  actually deploys in, but it's a real failure for local Windows dev, and
  the fix (a short bounded retry on `EPERM`/`EBUSY`, the same mitigation
  the `write-file-atomic` package uses) matters regardless of where it was
  found. Structured error logging (this same session's hardening pass)
  is what surfaced the actual cause immediately instead of a bare stack
  dump. 4 new tests in `server/db.test.js`: two mock transient/permanent
  rename failures deterministically, one proves a *real* 20-write burst
  (no mocking) survives without dropping or duplicating anything.
  Verified live end-to-end after the fix: created 5 real accounts through
  the actual UI, confirmed one logs in with its generated password, roster
  count updated correctly — zero console errors.
- ✅ **Focus-tab enforcement (2026-08-26)** — the last real Educator Dashboard
  gap. New `server/session/socket.js` adds `session:*` handlers onto the
  same shared `io` instance the race server already owns (its `io.use()`
  identity middleware already runs for every connecting socket regardless
  of which module's `io.on('connection', ...)` consumes it, so this didn't
  need its own `Server()`). An educator's `session:set_modes` broadcast
  (`lockedModes`, `screenLocked`, `maskUsernames`, `chatDisabled`) is
  validated (`sessionLockSchema`, `server/lib/validation.js`), role-gated
  server-side, and delivered only to that teacher's own currently-connected
  roster students (`socketsByUser: Map<userId, Set<socketId>>`) — not
  persisted, not re-sent on reconnect, an intentional scope cut documented
  in the file. `FocusTab`'s `ALL_MODES` used placeholder strings
  (`'waterfall'` isn't a real mode, `'🎹 piano'` mixed a page with typing
  submodes) that never matched anything enforceable — replaced with real
  ids shared against the server's `LOCKABLE_MODES` enum.

  Client enforcement: `useSessionLockStore` (new) + a `session:modes_locked`
  listener in `useSocket.js`. `ModeToolbar.jsx` disables locked typing
  modes/funbox and force-switches off one that becomes locked mid-session;
  `TopNav.jsx` disables/redirects away from a locked page (`piano`/`race`,
  and transitively `midirace` — see below); a new `SessionLockOverlay.jsx`
  full-screens `screenLocked`; `RacePage.jsx` masks opponent usernames
  (`src/lib/maskName.js`) when `maskUsernames` is set. `chatDisabled` is
  wired through end-to-end but has nothing to enforce yet — there's no chat
  feature anywhere in the app to disable; not fabricating one just to give
  the toggle a consumer.

  This surfaced a real, separate bug: `useSocket()` only ever connected
  when a component that called it — Race or Educator Dashboard — happened
  to be mounted, so a student just sitting on Type/Piano had no socket
  connection at all and could never receive a lock. Fixed by connecting
  once at the app root (`App.jsx`). That in turn exposed a second bug in
  the same hook: reconnection was guarded by `if (_socket?.connected)
  return`, so a socket that connected as a guest *before* login never
  upgraded to the real identity after signing in — any component mounted
  post-login just kept talking to the stale guest connection forever.
  Fixed by tracking which token the live socket was authenticated with and
  reconnecting when it no longer matches. 4 new integration tests in
  `server/session/socket.test.js` (real two-socket connections, not
  mocked): scoped broadcast, non-educator sender rejected, invalid payload
  ignored, cross-teacher roster isolation. Verified live end-to-end in two
  real browser contexts (teacher + student, both actually logged in): the
  screen-lock overlay and nav lock both appeared on the student's screen
  within a second of the teacher clicking "Broadcast to class" — zero
  console errors on either side.
- ✅ **On-screen keymap for Typing Hub (2026-08-26)** — `showKeymap` had a
  working Settings toggle and nothing reading it. New
  `src/components/typing/VirtualKeymap.jsx`: a QWERTY layout (number row +
  three letter rows + space bar) that highlights the single physical key
  `useTypingEngine` expects next (`words[wordIdx][charIdx]`, or the space
  bar at a word boundary) — the same "highlight one key at a time"
  convention `PianoKeymap.jsx` already established for the piano page, just
  mirrored for a normal keyboard instead of piano-note labels. Self-gates
  on the setting internally (renders `null` when off) so `App.jsx` just
  always mounts it. Verified live: toggling the setting shows/hides it
  immediately, and the highlighted key advances correctly as you type,
  independent of whether the keystroke was correct — it always shows what
  to press *next*, not a judgment on what you just pressed.
- ✅ **"Join MIDI Race" — proficiency-based piano race (2026-08-26)** — the
  design question this was blocked on ("what would piano-based racing
  actually score?") is resolved as: proficiency, not speed. Everyone in a
  lobby is assigned the same piece (`server/midirace/pieces.js` picks one
  of the four built-in Community Library tracks, now factored out to
  `src/lib/builtInPieces.js` so both the library UI and the race share one
  copy instead of two) and plays it once, at the same tempo, for the same
  fixed duration — ranking is by how well each player played it, not who
  finished first, which is why `server/midirace/results.js` sorts by score
  descending instead of typing race's finishedAt-ascending.

  Unlike typing race there's no vote phase and no JIT payload
  withholding — prior familiarity with a piece is normal earned skill, not
  a client-side unfair advantage the way pre-reading withheld race text
  would be, so the assigned piece is just announced at match time.
  `server/midirace/socket.js` otherwise mirrors `server/race/socket.js`'s
  shape closely (queue/lobby/matchmake, reusing the exact same
  `eloDelta`/`coinsForPlacement` tables since those are generic by
  placement, not typing-specific) and adds its handlers onto the same
  shared `io` the session server also uses.

  Client: `MidiRacePage.jsx` reuses the existing piano-input pipeline
  (`useMidi` for real MIDI/keyboard-fallback input, `useCompositionPlayback`
  for the shared clock, `FallingNotes`/`PianoKeys` for the visual stage —
  no new rendering primitives needed) and scores locally: for each of the
  player's own note-on events, the nearest not-yet-matched expected note of
  the same pitch within ±350ms counts as a hit; an unmatched press counts
  against a capped wrong-note penalty. `score = round(hitRatio*100 -
  min(30, wrong))`, clamped again server-side
  (`server/midirace/scoring.js`'s `sanitizeFinish`, same spirit as typing
  race's WPM cap — a validity check on a metric that's structurally bounded,
  more than a plausibility guess). 2 new integration tests in
  `server/midirace/socket.test.js`: full lifecycle with a real score-based
  winner (not finish-order), and a clamped/flagged over-100 self-report.

  Two real bugs surfaced building this, both in the new page, not the
  reused hooks: (1) `piece?.notes || []` handed
  `useCompositionPlayback` a *new* empty-array reference every render
  while no piece was assigned yet, and that hook's own `useEffect(() =>
  stop(), [notes])` treats a changed reference as "notes changed" — every
  single render — calling `setState` in a loop (React's "Maximum update
  depth exceeded"). Fixed with a module-level stable empty-array constant.
  (2) The piece-finished detector checked `!playback.playing &&
  playback.elapsed > 0`, but `stopAtEnd()` resets `elapsed` to 0 in the
  *same* batch as setting `playing=false` — so "just finished" and "never
  started" looked identical from state alone, and the finish event never
  fired. Fixed by watching for the `playing` true→false edge directly via a
  ref instead of also gating on `elapsed`. Verified live end-to-end in two
  real (guest) browser contexts across several different randomly-assigned
  pieces: queue → matched → countdown → playing → results completed
  correctly every time with zero console errors, including a genuine
  score-based (not finish-order) placement and a correct 0-0 tie.

- ✅ **Two production-only bugs, found while testing the above (2026-08-26)**
  — neither was part of the three gaps, both reported live by the project
  owner mid-session:
  - **Piano audio distortion that goes silent until paused and replayed** —
    `salamanderSampler.js`'s sample voices never called `.stop()`; each
    note's real (multi-second) sample tail played out in full regardless of
    the note's actual duration, since `release()` was a deliberate no-op
    ("let it ring like a real string"). In a real piece that piles up dozens
    of concurrent full-gain `AudioBufferSourceNode`s summing at the
    destination — heard as growing distortion, and severe enough eventually
    to overload the graph into near-silence. Fixed with a bounded release
    (a real, if generous, fade + stop) and a hard safety ceiling regardless.
    Added a shared `DynamicsCompressorNode` master bus
    (`getMasterBus()` in `audioContext.js`) that all four instruments now
    route through instead of `ctx.destination` directly, as defense in
    depth against any future voice pileup clipping the same way. Verified
    live by patching `AudioBufferSourceNode`/`OscillatorNode.start` to count
    concurrently-live voices while playing a full community track through
    to the end: stayed at a steady 2 throughout instead of climbing, back to
    0 the moment the piece ended.
  - **Blank screen with no results after a timed typing test** —
    `ResultsScreen.jsx`'s error-overlay chart used `type: 'scatter'`
    without registering Chart.js's `ScatterController`. The dev server
    tolerated it (something else happens to pull in Chart.js's full
    registry first); a production build tree-shakes it away, and Chart.js
    throws synchronously on mount with no error boundary catching it — the
    whole results screen rendered blank instead of just the chart failing.
    Only reproduced against a real `vite build` + `vite preview`, not the
    dev server — a reminder that "works in dev" isn't sufficient proof for
    anything touching a chart/plugin registry. Fixed by registering
    `ScatterController` alongside the rest.

---

*Last updated: 2026-08-26 (Focus-tab enforcement, on-screen keymap, MIDI Race)*
