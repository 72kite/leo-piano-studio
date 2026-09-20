import { z } from 'zod';

// Mirrors the client-side rules in src/pages/AuthPages.jsx so a request that
// passes the form never bounces off the server, plus the hardening the
// client doesn't (and shouldn't have to) enforce itself.
const username = z.string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(24, 'Username must be at most 24 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, underscores and hyphens')
  .refine(v => !v.toLowerCase().startsWith('guest_'), 'Username cannot start with "guest_"');

const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);

const password = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

const role = z.enum(['student', 'educator']);

export const registerSchema = z.object({
  username,
  email: email.optional().or(z.literal('')).transform(v => (v ? v : undefined)),
  password,
  role: role.default('student'),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Required').max(254),
  password: z.string().min(1, 'Required').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const SETTINGS_KEYS = new Set([
  'mode', 'timeLimit', 'wordCount', 'difficulty', 'language', 'funbox',
  'punctuation', 'numbers', 'britishEn', 'quickRestart', 'blindMode',
  'repeatQuote', 'minSpeed', 'minAccuracy', 'theme', 'font', 'caretStyle',
  'showKeymap', 'soundType', 'soundVolume', 'pianoSubMode', 'pianoOctave',
  'pianoInstrument',
]);

// The client PUTs one `{ [key]: value }` pair per change — keep the value
// permissive (it's user preference data, not something we branch logic on)
// but reject unknown keys and oversized payloads outright.
export const settingsPatchSchema = z.record(z.string(), z.unknown())
  .refine(obj => Object.keys(obj).length === 1, 'Expected exactly one setting per request')
  .refine(obj => SETTINGS_KEYS.has(Object.keys(obj)[0]), 'Unknown setting key')
  .refine(obj => {
    const v = Object.values(obj)[0];
    return v === null || ['string', 'number', 'boolean'].includes(typeof v);
  }, 'Setting value must be a string, number, or boolean');

// A run reported well above realistic human typing speed is far more likely
// a bug or spoofed client than genuine — mirrors the race server's sanity
// cap (server/race/scoring.js) rather than trusting the client outright.
const MAX_PLAUSIBLE_WPM = 350;

export const runSchema = z.object({
  mode:        z.enum(['time', 'words', 'quote', 'zen']),
  wpm:         z.number().min(0).max(MAX_PLAUSIBLE_WPM),
  rawWpm:      z.number().min(0).max(MAX_PLAUSIBLE_WPM),
  accuracy:    z.number().min(0).max(100),
  duration:    z.number().min(0).max(3600),
  timeLimit:   z.number().int().min(1).max(3600).optional(),
  wordCount:   z.number().int().min(1).max(1000).optional(),
  language:    z.string().max(20).optional(),
  consistency: z.number().min(0).max(100).optional(),
});

export const joinCodeSchema = z.object({
  joinCode: z.string().trim().min(4).max(12),
});

export const bulkAccountsSchema = z.object({
  count: z.number().int().min(1).max(100),
  prefix: z.string().trim().min(1).max(20).regex(/^[a-zA-Z0-9_-]+$/, 'Prefix may only contain letters, numbers, underscores and hyphens').optional(),
});

// Mirrors ALL_MODES in EducatorDashboard.jsx's FocusTab — real typing modes,
// funbox as one lockable unit, and the two other top-level pages.
export const LOCKABLE_MODES = ['time', 'words', 'quote', 'zen', 'funbox', 'piano', 'race'];

export const sessionLockSchema = z.object({
  lockedModes: z.array(z.enum(LOCKABLE_MODES)).max(LOCKABLE_MODES.length),
  screenLocked: z.boolean(),
  maskUsernames: z.boolean(),
  chatDisabled: z.boolean(),
});

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const message = result.error.issues[0]?.message || 'Invalid request';
  return { ok: false, message };
}
