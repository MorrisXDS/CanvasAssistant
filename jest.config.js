module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Memory containment (2026-06-01): Jest defaults to (cores - 1) workers — on
  // a 32-core dev box that's 31 worker processes, each loading ts-jest + the
  // full module graph + native better-sqlite3 + per-test in-memory DBs, which
  // spikes RAM hard enough to OOM the machine. Cap the pool to 2 workers and
  // recycle any worker that grows past 512 MB. Trade-off is a slower run; that
  // is intentional. Bump `maxWorkers` (e.g. to 4) if you have memory headroom
  // and want more speed. CI runners are 2-core, so this does not slow CI.
  maxWorkers: 2,
  workerIdleMemoryLimit: '512MB',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**/*',
  ],
  // Coverage thresholds — these are FLOORS, not goals.
  //
  // Calibrated to current reality (PR-Gate-1, 2026-05-28): when this gate was
  // enabled in CI, the actual numbers were statements 27.75% / branches 17.63%
  // / functions 20.85% / lines 28.27%. The floor sits slightly below each, so
  // a small regression catches the build BEFORE it lands a `.5%` drop nobody
  // would notice in review.
  //
  // RATCHET POLICY: when sustained coverage rises by ~5 points for a metric
  // (e.g., statements goes from 28% → 35%), bump the floor for that metric
  // by ~5 points in a follow-up PR. The diff-coverage check (per-PR strict
  // gate) is the engine that drives coverage upward; this aggregate floor
  // catches catastrophic regressions only.
  //
  // DELETION CALIBRATION: when removing a heavily-tested feature, the
  // aggregate can drop legitimately. In the SAME PR, lower the affected
  // metric's floor to (new-actual rounded down). Same one-line change as a
  // ratchet, opposite direction.
  //
  // SCOPE GATE (2026-06-02): the aggregate floor is only meaningful over the
  // WHOLE suite. CI runs the full suite (and sets `JEST_AGGREGATE_FLOOR=1`)
  // only on push-to-main and on PRs that touch shared test infra; ordinary PRs
  // run `--changedSince=origin/main` (affected tests only), where a partial
  // coverage report would make this floor meaningless. So the floor is applied
  // only when the env var is set — see `.github/workflows/ci.yml`. The per-PR
  // diff-coverage gate (scripts/diff-coverage-check.js) still runs on every PR.
  coverageThreshold: process.env.JEST_AGGREGATE_FLOOR
    ? {
        global: {
          branches: 17,
          functions: 20,
          lines: 28,
          statements: 27,
        },
      }
    : undefined,
  // Use jsdom for React component tests
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/bootstrap/**/*.test.ts',
        '<rootDir>/tests/l0-utilities/**/*.test.ts',
        '<rootDir>/tests/l1-persistence/**/*.test.ts',
        '<rootDir>/tests/l2-daemon/**/*.test.ts',
        '<rootDir>/tests/l3-intelligence/**/*.test.ts',
        '<rootDir>/tests/l4-controller/**/*.test.ts',
        '<rootDir>/tests/l5-presentation/**/*.test.ts',
        '<rootDir>/tests/integration/**/*.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
      },
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/tests/l6-ui/**/*.test.tsx',
        '<rootDir>/tests/l6-ui/**/*.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
      },
      // Stub CSS-module imports (`import styles from './X.module.css'`) — the
      // Vite CSS-modules transform isn't available under jest. The mock returns
      // each class name verbatim so tests can assert applied class names.
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup-jsdom.ts'],
    },
  ],
};
