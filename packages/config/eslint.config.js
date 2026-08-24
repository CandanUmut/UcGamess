import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Every npm package that ships a portal SDK, plus the deep paths inside
 * @ucgames/portal that would let a game bypass the adapter interface.
 *
 * The whole point of packages/portal is that a game's source is portal-neutral:
 * one codebase, N builds. A direct SDK import silently breaks that, and it will
 * not fail until a build for a *different* portal reaches submission. So it
 * fails at lint time instead.
 */
const PORTAL_SDK_PACKAGES = [
  '@poki/sdk',
  'poki-sdk',
  '@crazygames/sdk',
  'crazygames-sdk',
  'gamedistribution',
  '@gamedistribution/sdk',
  'gamepix-sdk',
  '@yandex-games/sdk',
];

const PORTAL_INTERNAL_PATTERNS = [
  '@ucgames/portal/src/*',
  '@ucgames/portal/dist/*',
  '**/portal/src/adapters/*',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.min.js',
      '**/stats.html',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  // ---------------------------------------------------------------------
  // Baseline for all TypeScript in the repo.
  // ---------------------------------------------------------------------
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // ---------------------------------------------------------------------
  // Games: the portal firewall.
  // ---------------------------------------------------------------------
  {
    files: ['games/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: PORTAL_SDK_PACKAGES.map((name) => ({
            name,
            message:
              'Games must not import a portal SDK directly. Code against the PortalAdapter interface from @ucgames/portal — see CLAUDE.md.',
          })),
          patterns: [
            {
              group: PORTAL_INTERNAL_PATTERNS,
              message:
                'Import the public @ucgames/portal entry point, not an adapter directly. Which adapter is used is a build-time decision (PORTAL env var).',
            },
          ],
        },
      ],

      // Catches `window.PokiSDK.gameplayStart()` and friends — the other way
      // a game could reach an SDK without an import statement at all.
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'PokiSDK',
          message:
            'Never touch a portal SDK global from a game. Use the PortalAdapter from @ucgames/portal.',
        },
        {
          object: 'window',
          property: 'CrazyGames',
          message:
            'Never touch a portal SDK global from a game. Use the PortalAdapter from @ucgames/portal.',
        },
        {
          object: 'window',
          property: 'gdsdk',
          message:
            'Never touch a portal SDK global from a game. Use the PortalAdapter from @ucgames/portal.',
        },
      ],

      // Games must not run their own ad timers — portals control ad frequency
      // and a self-managed ad timer is a documented rejection cause on both
      // Poki and CrazyGames. Raw wall-clock timers are also the usual way a
      // game accidentally couples logic to render rate instead of the fixed
      // timestep. Phaser's this.time.addEvent covers the legitimate cases.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='setInterval']",
          message:
            'Do not use setInterval in a game. If this is an ad timer: portals control ad frequency, the game only signals lifecycle events (see docs/portal-requirements.md). If it is gameplay timing: use this.time.addEvent or the fixed-timestep update from @ucgames/core so it stays correct on 144 Hz displays.',
        },
        {
          selector: "CallExpression[callee.name='requestAnimationFrame']",
          message:
            'Do not drive your own rAF loop. Phaser owns the render loop and @ucgames/core owns the fixed-timestep simulation loop — a second loop desynchronises them.',
        },
      ],
    },
  },

  // ---------------------------------------------------------------------
  // packages/portal is the ONLY place allowed to touch a real SDK.
  // ---------------------------------------------------------------------
  {
    files: ['packages/portal/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-properties': 'off',
      // Portal SDK globals are untyped third-party surfaces; casting is
      // unavoidable here and only here.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ---------------------------------------------------------------------
  // Node-side tooling: scripts, devtools, config files.
  // ---------------------------------------------------------------------
  {
    files: [
      'scripts/**/*.ts',
      'packages/devtools/**/*.ts',
      '**/*.config.ts',
      '**/*.config.js',
      'packages/config/**/*.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // ---------------------------------------------------------------------
  // Tests.
  // ---------------------------------------------------------------------
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
