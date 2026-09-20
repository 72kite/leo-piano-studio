import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const TEST_GLOBS = ['**/*.test.js', 'src/test/**/*.js'];

// Several modules deliberately use empty catch blocks for fire-and-forget
// network calls (see server/lib/db.js's write queue, store/index.js's
// settings sync) — don't flag the pattern itself, just genuinely empty
// non-catch blocks.
const BASE_RULES = { 'no-empty': ['error', { allowEmptyCatch: true }] };

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'server/data/**'] },

  // Frontend React source
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: TEST_GLOBS,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      // Cherry-picked rather than pulling in reactHooks.configs.recommended
      // wholesale — v7's "recommended" bundles the full React Compiler rule
      // set (immutability/purity/set-state-in-effect/refs/...), which this
      // codebase predates and isn't written against. The two classic rules
      // below catch real bugs (broken hook order, stale closures) without
      // demanding a compiler-driven rewrite just to get lint running in CI.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      ...BASE_RULES,
    },
  },

  // Backend (Express) — plain Node, no React/JSX
  {
    files: ['server/**/*.js'],
    ignores: TEST_GLOBS,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...BASE_RULES,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Root-level Node scripts/configs (vite.config.js, server.js, this file)
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: { ...js.configs.recommended.rules, ...BASE_RULES },
  },

  // Vitest suites (frontend + backend) — permissive union of both runtimes
  // plus vitest's injected globals (`globals: true` in vite.config.js means
  // describe/it/expect are never imported).
  {
    files: TEST_GLOBS,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...BASE_RULES,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
