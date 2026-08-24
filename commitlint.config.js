/**
 * Conventional commits.
 *
 * The value here is not the format itself — it is that several AI agents and
 * two humans commit into this repo, and a scannable history is the only way to
 * reconstruct what changed when a game's metrics move. See docs/workflow.md.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // new player-facing capability
        'fix', // bug fix
        'perf', // performance or build size
        'refactor', // no behaviour change
        'docs', // documentation only
        'test', // tests only
        'build', // build system, dependencies
        'ci', // CI configuration
        'chore', // everything else
        'game', // work scoped to a single game's content or tuning
        'portal', // portal adapter / SDK integration work
      ],
    ],
    // Long enough for a real sentence, short enough to read in a log.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
  },
};
