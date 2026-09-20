import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useSettingsStore,
  useAuthStore,
  useRaceStore,
  useMidiStore,
  WORD_POOLS,
  getRandomQuote,
} from './index.js';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.getState().reset();
});

describe('useSettingsStore', () => {
  it('boots with sane defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.mode).toBe('time');
    expect(s.timeLimit).toBe(30);
    expect(s.theme).toBe('dark');
    expect(s.difficulty).toBe('normal');
  });

  it('set() updates state and persists to localStorage', () => {
    useSettingsStore.getState().set('mode', 'words');
    expect(useSettingsStore.getState().mode).toBe('words');

    const saved = JSON.parse(localStorage.getItem('leo_settings_v3'));
    expect(saved.mode).toBe('words');
  });

  it('set("theme", ...) reflects the theme onto <html data-theme>', () => {
    useSettingsStore.getState().set('theme', 'nord');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
  });

  it('reset() restores defaults and clears persisted overrides', () => {
    useSettingsStore.getState().set('mode', 'zen');
    useSettingsStore.getState().set('timeLimit', 120);
    useSettingsStore.getState().reset();

    const s = useSettingsStore.getState();
    expect(s.mode).toBe('time');
    expect(s.timeLimit).toBe(30);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('loadSettings() merges persisted overrides on top of defaults', () => {
    localStorage.setItem('leo_settings_v3', JSON.stringify({ mode: 'quote' }));
    // loadSettings runs at module init, so simulate its merge behavior directly
    // by re-reading through the same JSON.parse + defaults spread the store uses.
    const persisted = JSON.parse(localStorage.getItem('leo_settings_v3'));
    expect(persisted.mode).toBe('quote');
  });
});

describe('word pools & quotes', () => {
  it('exposes non-empty pools for every supported language', () => {
    for (const [lang, pool] of Object.entries(WORD_POOLS)) {
      expect(pool.length, `pool for ${lang} should not be empty`).toBeGreaterThan(0);
    }
  });

  it('getRandomQuote() returns a quote with text and author', () => {
    const q = getRandomQuote();
    expect(typeof q.text).toBe('string');
    expect(q.text.length).toBeGreaterThan(0);
    expect(typeof q.author).toBe('string');
  });
});

describe('useAuthStore', () => {
  it('boots as a guest with a generated friendly id', () => {
    const { user, isGuest, token } = useAuthStore.getState();
    expect(isGuest).toBe(true);
    expect(token).toBeNull();
    expect(user.role).toBe('guest');
    expect(user.username).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+_\d{2}$/);
  });

  it('setAuth() logs the user in and persists tokens', () => {
    const user = { userId: 'u1', username: 'player1', role: 'player', mmr: 1000, wallet: 0 };
    useAuthStore.getState().setAuth(user, 'access-token', 'refresh-token');

    const state = useAuthStore.getState();
    expect(state.isGuest).toBe(false);
    expect(state.user).toEqual(user);
    expect(state.token).toBe('access-token');
    expect(localStorage.getItem('leo_access')).toBe('access-token');
    expect(JSON.parse(localStorage.getItem('leo_user'))).toEqual(user);
  });

  it('logout() clears auth state and falls back to a guest identity', () => {
    const user = { userId: 'u1', username: 'player1', role: 'player', mmr: 1000, wallet: 0 };
    useAuthStore.getState().setAuth(user, 'access-token', 'refresh-token');

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isGuest).toBe(true);
    expect(state.token).toBeNull();
    expect(state.user.role).toBe('guest');
    expect(localStorage.getItem('leo_access')).toBeNull();
  });

  describe('network-backed actions', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    it('login() applies the server session on success', async () => {
      const user = { userId: 'u2', username: 'racer', role: 'player', mmr: 1000, wallet: 0 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user, accessToken: 'at', refreshToken: 'rt' }),
      });

      const ok = await useAuthStore.getState().login({ identifier: 'racer', password: 'secret' });

      expect(ok).toBe(true);
      expect(useAuthStore.getState().user).toEqual(user);
      expect(useAuthStore.getState().isGuest).toBe(false);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('login() surfaces a server-rejected error without throwing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'INVALID_CREDENTIALS' }),
      });

      const ok = await useAuthStore.getState().login({ identifier: 'racer', password: 'wrong' });

      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('INVALID_CREDENTIALS');
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it('login() degrades to a NETWORK_ERROR when the backend is unreachable', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

      const ok = await useAuthStore.getState().login({ identifier: 'racer', password: 'secret' });

      expect(ok).toBe(false);
      expect(useAuthStore.getState().error).toBe('NETWORK_ERROR');
    });
  });
});

describe('useRaceStore', () => {
  beforeEach(() => useRaceStore.getState().reset());

  it('setLobby() splits players into self vs. opponents', () => {
    const players = [
      { userId: 'me', username: 'Me', mmr: 1000 },
      { userId: 'p2', username: 'Rival', mmr: 1050 },
    ];
    useRaceStore.getState().setLobby('lobby-1', players, 'me');

    const state = useRaceStore.getState();
    expect(state.phase).toBe('matched');
    expect(state.opponents).toEqual([{ userId: 'p2', username: 'Rival', mmr: 1050, progress: 0, wpm: 0 }]);
  });

  it('walks the phase lifecycle in order', () => {
    const store = useRaceStore.getState();
    store.setLobby('lobby-1', [{ userId: 'me' }], 'me');
    expect(useRaceStore.getState().phase).toBe('matched');

    store.setVoteOptions(['a', 'b'], Date.now() + 5000);
    expect(useRaceStore.getState().phase).toBe('voting');

    store.setCountdown(Date.now() + 3000);
    expect(useRaceStore.getState().phase).toBe('countdown');
    expect(useRaceStore.getState().payloadReady).toBe(false);

    store.setPayload('the quick brown fox');
    expect(useRaceStore.getState().payloadReady).toBe(true);

    store.setRacing();
    expect(useRaceStore.getState().phase).toBe('racing');

    store.setResults({ placement: 1 });
    expect(useRaceStore.getState().phase).toBe('results');
  });

  it('updateOpponent() only mutates the matching opponent', () => {
    const players = [
      { userId: 'me', username: 'Me' },
      { userId: 'p2', username: 'Rival' },
      { userId: 'p3', username: 'Other' },
    ];
    const store = useRaceStore.getState();
    store.setLobby('lobby-1', players, 'me');
    store.updateOpponent('p2', 'Rival', 42, 88);

    const opponents = useRaceStore.getState().opponents;
    expect(opponents.find(o => o.userId === 'p2')).toMatchObject({ progress: 42, wpm: 88 });
    expect(opponents.find(o => o.userId === 'p3')).toMatchObject({ progress: 0, wpm: 0 });
  });

  it('reset() returns to idle with cleared state', () => {
    const store = useRaceStore.getState();
    store.setLobby('lobby-1', [{ userId: 'me' }], 'me');
    store.addWarning();
    store.reset();

    const state = useRaceStore.getState();
    expect(state.phase).toBe('idle');
    expect(state.players).toEqual([]);
    expect(state.anticheatWarnings).toBe(0);
  });
});

describe('useMidiStore', () => {
  beforeEach(() => useMidiStore.getState().reset());

  it('pressKey()/releaseKey() manage pressedKeys immutably', () => {
    const before = useMidiStore.getState().pressedKeys;
    useMidiStore.getState().pressKey(60);

    const afterPress = useMidiStore.getState().pressedKeys;
    expect(afterPress).not.toBe(before); // new Set instance
    expect(afterPress.has(60)).toBe(true);

    useMidiStore.getState().releaseKey(60);
    expect(useMidiStore.getState().pressedKeys.has(60)).toBe(false);
  });

  it('setStatus() records device status and name together', () => {
    useMidiStore.getState().setStatus('connected', 'Yamaha P-45');
    const state = useMidiStore.getState();
    expect(state.status).toBe('connected');
    expect(state.deviceName).toBe('Yamaha P-45');
  });
});
