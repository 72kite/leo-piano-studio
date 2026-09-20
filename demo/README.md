# Project Leo — Demo

A full-stack web app combining a competitive typing trainer, real-time
multiplayer typing races, and a MIDI piano composition studio — one React
frontend, one Express/Socket.io backend, built to show the same account
working across genuinely different product surfaces rather than three
disconnected demos glued together.

**Live areas covered below:** Typing Hub · Race Mode · Piano Studio ·
Educator Dashboard · Stats. See the main [README](../README.md) for full
architecture docs and [ROADMAP](../ROADMAP.md) for build history.

---

## What it demonstrates

- **Full-stack, not a frontend mock** — every screen below is backed by a
  real Express API (JWT auth with rotating refresh tokens, bcrypt,
  rate limiting) and a real Socket.io server (live matchmaking, not
  simulated). Swap the storage backend from a JSON file to PostgreSQL with
  one environment variable — no route changes.
- **Real-time systems** — the race lobby, countdown, and opponent progress
  bars are driven by actual server-relayed Socket.io events between
  multiple browser sessions, with the race payload deliberately withheld
  until the countdown ends (basic anti-cheat).
- **Web Audio / Web MIDI from scratch** — four synthesized/sampled piano
  instrument voices, a Synthesia-style falling-notes renderer built on
  shared geometry math (not a canvas library), and YIN pitch detection
  running on live microphone input to follow along on a real acoustic
  instrument.
- **Product thinking, not just code** — guests get full functionality
  everywhere (type, race, play piano) with zero signup; an account only
  buys you *persistence* (stats history, MMR, a teacher roster). That
  split is enforced consistently across every route, not just in the UI.

---

## Tour

### Typing Hub
Time/words/quote/zen modes, funboxes, live WPM, multi-language word pools
(including 4 programming languages).

![Typing Hub](screenshots/typing-hub.png)
![Typing in progress](screenshots/typing-in-progress.png)

### Race Mode
Real matchmaking via Socket.io — text voting, a withheld-until-countdown
passage, live opponent progress relayed from the server.

![Race in progress](screenshots/race-active-typing.png)

### Piano / Composition Studio
Falling notes with letter hints, a sticky quick-access bar (instrument
picker, transport, circular Metronome/Chord Selector popovers), a real
sampled Grand Piano, and a chord picker that highlights the voicing live
on the keyboard.

![Falling notes + quick bar](screenshots/piano-falling-notes.png)
![Chord Selector](screenshots/piano-chord-selector.png)

### Educator Dashboard
A teacher gets a real join code; students who enter it appear with live
aggregate stats — no mock data.

![Educator roster](screenshots/educator-roster.png)

### Stats
Server-persisted run history with a WPM trend chart, gated behind
sign-in (there's nothing to show a guest — nothing's persisted for one).

![Stats page](screenshots/stats-page.png)

---

## Tech Stack

| | |
|---|---|
| **Frontend** | React 19, Zustand, Vite, Chart.js |
| **Real-time** | Socket.io (client + server) |
| **Backend** | Express, JWT + rotating refresh tokens, bcrypt, Zod validation |
| **Persistence** | JSON file by default; PostgreSQL as a drop-in opt-in swap, identical interface |
| **Audio/MIDI** | Web Audio API (4 synthesized/sampled instrument voices), Web MIDI API, YIN pitch detection from the mic |
| **Testing** | Vitest + Testing Library + Supertest, ~100 tests across frontend and server |
| **Deploy** | Docker Compose (nginx + Node), GitHub Actions CI |

---

## Run it yourself

```bash
git clone <repo-url>
cd LEO_R
cp .env.example .env          # fill in JWT_SECRET
docker compose build
docker compose up -d
# → frontend http://localhost, API http://localhost:3001
```

Or without Docker:

```bash
npm install
npm run dev                   # frontend, guest mode works immediately
npm run server                # optional — real accounts, race matchmaking
```

No sign-in needed to try Typing Hub, Race Mode, or the Piano Studio —
everything above works as a guest.
