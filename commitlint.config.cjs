/**
 * commitlint config — Conventional Commits enforcement (PR-Gate-2 slice 1).
 *
 * Activated by .husky/commit-msg → runs `commitlint --edit "$1"` on every
 * commit. Blocks commits that don't follow the type-scope-subject shape.
 *
 * Existing project commits since this session (40+ commits) all already
 * follow this format manually — formalizing the discipline rather than
 * imposing a new one.
 *
 * Allowed types are the standard Conventional Commits set. If a future
 * change needs a type not here (e.g. a new build tooling category), add
 * it deliberately rather than reaching for `chore:` as a catch-all.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allowed change-type prefixes. Aligned with how this project's recent
    // commits actually break down.
    'type-enum': [
      2,
      'always',
      [
        'feat', // new user-visible functionality
        'fix', // bug fix
        'refactor', // internal restructure, no behaviour change
        'perf', // performance optimization
        'test', // test-only change
        'docs', // docs only
        'style', // formatting / whitespace, no code-meaning change
        'chore', // tooling, deps, build infra, anything not user-facing
        'ci', // CI pipeline / GitHub Actions
        'build', // build system, bundler config
        'revert', // git revert commit
      ],
    ],
    // Subject is required — `feat:` with empty subject is meaningless.
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    // Default header-max-length is 72; project's recent commits frequently
    // run longer (ADR/PR-slice references). 100 is a reasonable compromise.
    'header-max-length': [2, 'always', 100],
    // Same logic for body lines — recent commits include code snippets that
    // would otherwise be hard-wrapped awkwardly. 120 is permissive but bounded.
    'body-max-line-length': [2, 'always', 120],
    // Footer holds Co-Authored-By trailers; same allowance.
    'footer-max-line-length': [2, 'always', 120],
  },
};
