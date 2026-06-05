# 0011 — Deterministic e2e seed (generated schema template + INSERT-only seed)

Status: Accepted

## Context

The Playwright e2e suite (`e2e/**`, local-only, off-CI) launches the built Electron
app against an isolated fixture profile. Until now the fixture (`e2e/fixtures/seed.ts`)
built that profile's database by **copying the dev machine's real
`database/canvas.db`**. That had three structural problems:

1. **Not portable.** A fresh clone or another machine has no populated `canvas.db`, so
   the fixture threw `e2e requires a populated local DB …`. The suite only ran on a
   machine that had already onboarded + synced.
2. **Not reproducible.** The copied DB's contents drifted with every sync, so a spec's
   data preconditions could pass today and fail tomorrow (a course archived, an
   announcement pruned, a term rolled over).
3. **Coverage silently eroded via skips.** Because no entity was _guaranteed_, ~8 specs
   carried data-tolerant `test.skip(...)` guards ("No course with announcements in the
   seeded DB", "No focusable rows", …). A spec that skipped looked green but asserted
   nothing — and nothing failed the run when a skip fired.

We want the suite to be **portable** (fresh clone runs green), **reproducible** (fixed
known dataset), and **skip-free** (every data-tolerant skip becomes a hard precondition).

The hard constraints:

- **Schema correctness.** Migrations alone are NOT a complete schema definition — the
  app self-heals runtime-only schema at startup (`pending_sync_conflicts`,
  `sync_preferences.prefer_canvas`/`expires_at`, `visibility_settings`, various
  `CREATE TABLE IF NOT EXISTS` / `ALTER`). A hand-rolled schema would drift on every
  migration. The seed must NOT hand-roll schema.
- **Native ABI trap.** `npm run test:e2e` launches the built Electron app, so the
  on-disk `better-sqlite3` addon is on the **Electron** ABI (`process.versions.modules
=== 143`). Playwright's runner is plain Node (ABI 137) and must never load the addon.
  A plain-Node seed subprocess throws on `new Database()`.

## Decision

**The e2e suite seeds a deterministic DB by (1) generating a schema TEMPLATE from the
app's own startup code path, then (2) per-test copying that template and INSERT-only
seeding a fixed dataset via an Electron-as-Node subprocess. One unified seed lib. No
copied real DB. A skip-guard reporter enforces 0 skips.**

### 1. Schema via app-self-healed template (approach A → template)

A Playwright `globalSetup` (`e2e/globalSetup.ts`) launches the built app **once per
run** against a throwaway EMPTY cwd. The app's own
`AppLifecycle.initialize()` → `MigrationRunner.runAll(coreMigrations)` (v1→v113) →
`verifyAndRepairSchema()` → runtime `ensureTable`/`ALTER` self-healing produces a
**current, complete, EMPTY** `canvas.db`. globalSetup polls `schema_version` until it
reaches the final migration, then copies that DB to a stable per-run template path
(`<os.tmpdir()>/cid-e2e-schema/canvas.db`).

Each test's `createFixture()` copies the template (cheap, no native module in the
Playwright runner — same copy mechanism as before) and INSERT-seeds the copy.

**Why this is self-maintaining:** the template is produced by the app's own code, so it
is definitionally current. When a migration lands (v114…), the template is regenerated
automatically on the next `test:e2e` run. Nothing is hand-maintained; nothing is checked
into git that can go stale.

> Verified empirically on the Windows dev machine (2026-06-05): a launch against a truly
> empty cwd reaches `schema_version` 113 cleanly; the onboarding/credential UI gate does
> NOT block migrations (they run during main-process init, before the renderer gate).
> If a future change ever blocked migrations on an empty DB, the documented fallback is a
> two-phase same-run launch in `createFixture` (still approach A, no template).

**Rejected — (B) a checked-in template DB:** goes stale on every migration; needs a
regeneration ritual + a drift guard. **Rejected — (C) seed via IPC/commands after
launch:** would need write IPC for every entity (notifications, queue, calendar, files),
much of which has no command surface, and couples the seed to the renderer being up.

### 2. Electron-as-Node INSERT seed (the ABI mechanism)

The unified seed (`e2e/fixtures/seedDatabase.js`, CJS) runs in a **subprocess spawned
under Electron-as-Node** — the electron binary invoked with `ELECTRON_RUN_AS_NODE=1`.
With that flag the electron binary behaves like Node but exposes the Electron ABI, so
the Electron build of `better-sqlite3` loads cleanly. Seed + launched app share ONE ABI;
nothing is ever flipped. (Do NOT run `npm test` between `npm run rebuild` and
`npm run test:e2e` — Jest's pretest flips the addon to the Node ABI.) This mechanism was
already proven by the duplicate-warning seed; the unified seed reuses the exact spawn
path.

All INSERTs name **only** the columns they set (defaults fill the rest), keeping the
seed schema-version-agnostic.

### 3. One unified seed lib

`seedDatabase.js` is the single seed path. It inserts the deterministic courses A/B
(+ a 3rd course C purely to satisfy the Courses-grid keyboard nav), then imports and
applies the duplicate-warning matrix from `seedDuplicateWarning.js` via a new
`seedDuplicateMatrix(db, aId, bId)` export (the matrix is the single source for the dup
scenario — no duplication). `seedDuplicateWarning.js` keeps its standalone
`seedDuplicateWarning(dbPath)` wrapper + `require.main` subprocess entrypoint so the
manual-test CLI (`scripts/manual-test-duplicate-warning.js`) is unaffected. The old
opt-in `seedDuplicates` fixture flag is retired — the matrix is always present.

### 4. Date determinism

Status-deriving `tasks` rows use dates RELATIVE to seed-time `now` (a fixed absolute
date would drift a "Pending" task into the past, flipping its filter bucket). The dup
matrix keeps its fixed absolute dates — safe, because its specs assert on modal presence
/ focus / scroll, never on date text or buckets.

### 5. Deterministic visibility

The seed sets `visibility_settings.term_selection = 'all'`, because the
`VisibilityOracle` default `'auto'` filters courses to active enrollment terms — and the
deterministic courses carry no term. `'all'` reduces visibility to (not hidden / not
deleted / not archived), exactly the invariant the specs rely on.

### 6. Skip-visibility guard (0-skip policy)

A custom Playwright reporter (`e2e/skipGuard.reporter.ts`, wired in
`playwright.config.ts`) fails the run if any test reports `status === 'skipped'` and is
not on an explicit, `why:`-justified allow-list (currently empty — the whole point is 0
skips). This is the regression net that stops seed-driven coverage from silently eroding:
any future `test.skip` that fires turns the run red with the spec name + location.

## Consequences

- The e2e suite is portable along the **DB axis** — it no longer depends on the dev's real
  `canvas.db` (proven by renaming the real DB aside and running the full suite green),
  reproducible, and skip-free (33/33 specs pass, 0 skips, across repeated runs). One
  prerequisite is unchanged: the suite still requires the app to have been **onboarded once
  on the machine** (a Canvas token in the OS keychain — `isAuthenticated` derives from
  `hasCredential()`, which is global to the machine, not per-profile). So a truly-from-zero
  clone with no keychain token still hits the onboarding gate; this PR removes only the _DB_
  dependency, not the keychain prerequisite.
- ~8 data-tolerant `test.skip(...)` guards became hard preconditions; `files.spec.ts`'s
  data-tolerant branch became a hard files-present assertion.
- Maintenance is near-zero: the schema template regenerates from the app each run; the
  seed's named-column INSERTs are migration-agnostic. The only seed maintenance is when a
  spec needs a _new kind_ of entity.
- Test-infra only — no production `src/**` change.
- A latent Courses-grid keyboard quirk surfaced (the first directional press lands on
  index 1 because `moveFocus` treats an unset focus as index 0 + delta), worked around in
  the dataset (course C) rather than changing production code; noted for a future fix.
