# Testing Guide

> How to run CanvasAssistant in a test environment and use the test suites.
> Canonical reference for the three test surfaces: **Jest** (unit/integration),
> **Playwright e2e** (the built app, driven by real keystrokes), and **manual app
> launch** against an isolated database. The enforced _protocol_ (§7) lives in
> [`.claude/rules/testing.md`](../.claude/rules/testing.md); this doc is the
> operational "how do I actually run it".

---

## 0. The one footgun: the native-ABI flip (read this first)

`better-sqlite3` is a native module compiled for **one** Node ABI at a time. The two
test surfaces want **different** ABIs:

| You are running…                     | Needs ABI    | How it's set                                              |
| ------------------------------------ | ------------ | --------------------------------------------------------- |
| `npm test` (Jest, plain Node runner) | **Node**     | `pretest` → `scripts/ensure-native-modules.js` (auto)     |
| `npm run test:e2e` / the real app    | **Electron** | `npm run rebuild` (= `electron-builder install-app-deps`) |

Running one right after the other **flips the ABI**, so the next run of the other
surface fails with `NODE_MODULE_VERSION` mismatch. The rule:

- **Before e2e or launching the app:** `npm run rebuild` (Electron ABI).
- **Before Jest:** nothing — `pretest` auto-rebuilds for Node ABI. But if you _just_
  ran e2e, the first `npm test` will spend ~30s rebuilding back to Node.
- **Never** interleave `npm test` and `npm run test:e2e` without expecting a rebuild
  in between.

> Symptom of a wrong ABI: `Error: The module '…better_sqlite3.node' was compiled
against a different Node.js version`. Fix: run the matching rebuild above.

---

## 1. Jest — unit & integration tests

The bread-and-butter suite. Two Jest _projects_ (see `jest.config.js`):

- **`node`** — main-process / backend layers (L0–L4): services, commands, readers,
  IPC handlers, migrations. Tests under `tests/l0…l4`, `tests/integration`, etc.
- **`jsdom`** — renderer / UI (L5–L6): React components, hooks, store. Tests under
  `tests/l5-presentation`, `tests/l6-ui`.

Tests mirror `src/` and are named `*.test.ts(x)` (or `*.spec.ts(x)`), under `tests/`.

### Commands

```bash
npm test                       # full suite (both projects). pretest auto-fixes ABI → Node.
npm run test:watch             # watch mode
npm test -- --coverage         # full suite + Istanbul coverage → coverage/coverage-final.json
npm test -- <path-or-pattern>  # a subset, e.g.:
npm test -- tests/l4-controller
npm test -- --selectProjects node      # only the main-process project
npm test -- --selectProjects jsdom     # only the renderer project
```

> **Performance note:** Jest is capped at `maxWorkers: 2` + `workerIdleMemoryLimit:
'512MB'` (the 32-core dev box OOMs on the default worker count — each worker loads
> ts-jest + better-sqlite3 + per-test in-memory DBs). Runs are slower by design. Bump
> `maxWorkers` in `jest.config.js` if you have memory headroom. CI runners are 2-core
> so they're unaffected.

### Coverage gates (mirror CI — see §6)

```bash
# 1. Produce coverage
npm test -- --coverage
# 2. Per-PR diff coverage: every added/modified src line must be exercised by a test.
node scripts/diff-coverage-check.js          # BASE defaults to origin/main
DIFF_BASE=main node scripts/diff-coverage-check.js   # override the base
```

- **Diff coverage** (`scripts/diff-coverage-check.js`) is the real per-PR gate: it reads
  `git diff --unified=0 origin/main -- src/` and fails if any added/modified executable
  line is uncovered. Carve-outs go in `.diffcov-allow.json` with a `_why_<file>` note.
- **Aggregate floor** (`coverageThreshold.global`) only applies on _full_ runs — it's
  gated behind `JEST_AGGREGATE_FLOOR=1`, which CI sets on push-to-main + infra PRs. Local
  partial runs skip it.

### When to add a test (enforced — §7)

| Change            | Requirement             |
| ----------------- | ----------------------- |
| New public method | unit test               |
| Bug fix           | regression test         |
| Behaviour change  | update existing tests   |
| New file          | corresponding test file |

Never modify L3 (`src/layers/l3-intelligence/**`) without reading its tests first
(`/l3-checklist`). Never commit failing tests.

---

## 2. Playwright e2e — the built app, real keystrokes

Drives the **built** Electron app with real keyboard input against an isolated,
offline, **deterministically-seeded** profile. Specs live in `e2e/*.spec.ts`.
Full detail in [`e2e/README.md`](../e2e/README.md); the strategy is recorded in
[ADR-0011](adr/0011-deterministic-e2e-seed.md).

### Run

```bash
npm run rebuild        # FIRST — flip better-sqlite3 to Electron ABI (see §0)
npm run test:e2e       # = npm run build && playwright test --config e2e/playwright.config.ts
```

`test:e2e` builds (`tsc && vite build`) then launches Playwright. To run a subset:

```bash
npx playwright test --config e2e/playwright.config.ts e2e/visibility.spec.ts
```

> If you forget `npm run rebuild`, the app fails to open its DB. If you just ran
> `npm test`, the ABI is on Node — rebuild first.

### What makes it portable (ADR-0011)

You do **not** need a populated `database/canvas.db`. The suite generates its own
deterministic dataset:

1. **`globalSetup.ts`** runs once: launches the app against an empty cwd so the app's
   own startup (`MigrationRunner` v1→latest + schema self-heal) produces a current,
   complete **empty** DB, copied to a schema _template_ in the OS temp dir. (Self-healing,
   so a new migration flows in automatically — nothing schema-shaped is checked in.)
2. **`fixtures/seed.ts`** per test: copies the template, points Canvas at the mock,
   then INSERT-seeds a fixed dataset by running `fixtures/seedDatabase.js` through an
   **Electron-as-Node** subprocess (`ELECTRON_RUN_AS_NODE=1`, so the Electron-ABI
   `better-sqlite3` loads even though the Playwright runner is plain Node).

The **only** remaining prerequisite is that the app has been **onboarded once on this
machine** (a Canvas token in the OS keychain — `isAuthenticated` derives from
`hasCredential()`; the mock answers token validation, so the token's real validity is
irrelevant).

### Skip-guard & failure artifacts

- **Skip-guard** (`skipGuard.reporter.ts`): the run **fails** if any test reports
  `skipped` (allow-list is empty). The deterministic seed guarantees every spec's data,
  so there should be **0 skips** — a skip means a coverage hole, not data-tolerance.
- **On failure**, a Playwright `trace.zip` + screenshot are written under
  `test-results/` (both gitignored) and attached to the HTML report at
  `playwright-report/index.html`. Green runs leave nothing. View a trace:
  `npx playwright show-trace test-results/<…>/trace.zip`.

### Type-checking the specs

`e2e/**` is in neither base tsconfig, so it has its own:

```bash
npm run typecheck:e2e          # tsc -p tsconfig.e2e.json (run after editing any spec)
```

> e2e is **local-only** (off CI) — it needs Electron + a display + the keychain. CI does
> _not_ run it; the green bar comes from a local run. Run it locally before a
> keyboard/modal/visibility change.

---

## 3. Manual app testing against an isolated DB

To click through the real UI without touching your real `database/canvas.db`.

### Easiest: the `/manual-test-launch` skill

Invoke the **`manual-test-launch`** skill (`/manual-test-launch`). It kills stale
processes, flips the native ABI to Electron, seeds a fresh temp environment (the
duplicate-warning scenarios), rebuilds, and launches the app in the background against
the isolated DB. Use it when you want to "launch the test app" / "manual test" / "run
the app".

### Manual, step-by-step (duplicate-warning scenario)

`scripts/manual-test-duplicate-warning.js` seeds an **isolated copy** of the DB — your
real DB is never touched. Two-step (run in your own terminal):

```bash
# 1. Seed an isolated temp copy (prints the temp dir path)
node scripts/manual-test-duplicate-warning.js --seed

# 2. Rebuild for Electron, then launch against that temp dir
npm run rebuild
node scripts/manual-test-duplicate-warning.js --launch C:\path\to\cid-dup-test-XXXXX
# Ctrl+C when done — the temp dir is cleaned up automatically.
```

One-shot (only when better-sqlite3 is _already_ on Electron ABI):

```bash
node scripts/manual-test-duplicate-warning.js --launch-fresh
```

> The duplicate-warning seed matrix lives in `e2e/fixtures/seedDuplicateWarning.js` and
> is **shared** by both this CLI and the e2e fixture, so they seed identically.

### Running the app normally (dev)

```bash
npm run dev     # main (tsc -w) + renderer (vite :5173) + electron (electronmon)
```

`predev` checks the Node version and rebuilds native modules for Electron. This runs
against your **real** `database/canvas.db` — not a test environment.

---

## 4. Quick reference (cheat sheet)

```bash
# Unit/integration
npm test                                   # full Jest (auto Node ABI)
npm test -- tests/l4-controller            # subset
npm test -- --coverage && node scripts/diff-coverage-check.js   # PR coverage gates

# e2e (always rebuild first)
npm run rebuild && npm run test:e2e        # full suite
npm run typecheck:e2e                       # type-check the specs
npx playwright show-trace test-results/<…>/trace.zip   # debug a failure

# Manual app on an isolated DB
/manual-test-launch                         # (skill) one-shot seeded launch
node scripts/manual-test-duplicate-warning.js --seed   # then --launch <dir>

# ABI fix if something says NODE_MODULE_VERSION mismatch
npm run rebuild        # → Electron (for app/e2e)
npm test              # pretest → Node (for Jest)
```

---

## 5. Common failures

| Symptom                                                  | Cause / fix                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `NODE_MODULE_VERSION` / "compiled against a different…"  | ABI flip. `npm run rebuild` for app/e2e; `npm test` re-Nodes it. (§0)                         |
| e2e: "requires a populated DB" / app won't open DB       | Forgot `npm run rebuild` before e2e, OR (old behaviour) — now ADR-0011 self-seeds.            |
| e2e run fails with a _skipped_ test                      | Skip-guard tripped — the seed didn't cover that spec's data; fix the seed, don't `test.skip`. |
| e2e: "onboarding"/welcome guide blocks the app           | Machine never onboarded — no keychain token. Onboard the real app once.                       |
| Jest "Test suite failed to run" importing an IPC handler | Mock `electron` BEFORE importing the handler (or anything pulling in `ipcMain`).              |
| Diff-coverage gate fails                                 | Added src line isn't tested. Add a test, or carve out in `.diffcov-allow.json` with `_why_`.  |

---

## 6. CI scope (what actually gates a PR)

CI (`.github/workflows/ci.yml`) is **build + lint + Jest** — **e2e never runs in CI**.

- **Ordinary PR** → _affected_ Jest only (`--changedSince=origin/main`) + per-PR
  diff-coverage. A green PR ≠ the full suite passed.
- **PR touching shared test infra** (jest/tsconfig/lockfile/setup/test-utils/mocks/CI/
  diff-cov) **or push-to-main** → **full** suite + aggregate coverage floor.

Before a risky cross-cutting change, run the **full** `npm test` locally. Before a
keyboard/modal/visibility change, run the **e2e** suite locally (CI can't).

---

## See also

- [`e2e/README.md`](../e2e/README.md) — e2e fixture/seed internals + per-spec coverage
- [`.claude/rules/testing.md`](../.claude/rules/testing.md) — the enforced §7 protocol
- [ADR-0011](adr/0011-deterministic-e2e-seed.md) — the deterministic e2e seed strategy
- `docs/ONBOARDING.md` — first-time setup / running the app
