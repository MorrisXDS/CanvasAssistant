# 0007 — IPC handlers are thin adapters; no raw DB access

Status: Accepted (2026-05-28 via Final enforcement PR)

> Migration train shipped as PR-A (rename) → PR-B (CourseReader exemplar) →
> PR-C (selector migration) → PR-D (TaskReader / CanvasTaskQueueReader) →
> PR-E (NotificationReader) → PR-F.1/F.2/F.3 (FileEntity contract +
> provider + handler migration) → PR-H (PolicyReader) → Final
> (enforcement test). 4 of 19 IPC handler files are fully migrated;
> the remaining 15 are ratcheted via `.adr-0007-handler-sql-ceiling.json`
> so no new violations can land. Earlier draft of this ADR left
> enforcement and several sub-decisions TBD; the grilling on 2026-05-27
> resolved them and they are inline below.

## Context

CLAUDE.md §8 ("MANDATORY: Course Visibility Filtering") declares that all code
querying course-scoped tables (courses, tasks, notifications, calendar events,
files) MUST route through [`VisibleDataProvider`](../../src/layers/l1-persistence/VisibleDataProvider.ts).
It documents the correct pattern for IPC handlers as: _get the visible course
IDs, then run raw SQL filtered to those IDs_.

That rule is enforced by **convention** — there is no structural barrier to
bypassing it. The `/improve-codebase-architecture` v2 review (May 2026) surfaced
two concrete silent-correctness bugs that escape the rule today:

1. **[`courseDataHandlers.ts:43`](../../src/lifecycle/ipc-handlers/courseDataHandlers.ts:43)**
   — the `data:getCourses` IPC handler runs
   `SELECT * FROM courses WHERE archived_at IS NULL AND deleted_at IS NULL` directly.
   This bypasses two of the four canonical visibility filters: `is_hidden = 0` and
   the term-selection filter. The handler returns hidden courses, and ignores term
   selection entirely.

2. **[`coreDataSlice.ts:113-134`](../../src/layers/l5-presentation/store/slices/coreDataSlice.ts:113)**
   — the renderer's `fetchCourses` action re-derives term filtering from
   `getEnrollmentTerms` + a local `getCurrentTermIds()` helper, with a localStorage
   fallback if the IPC is unavailable. This computes "active term" with different
   math than `VisibleDataProvider`'s SQL. Two implementations, two answers.

Different routes through the app render different course sets _today_. The rule
exists; it's just not load-bearing.

Audit of the IPC handler surface confirms the bypass is concentrated:

- `taskDataHandlers`, `notificationDataHandlers`, `fileDataHandlers`,
  `syncUpdatesHandlers`, `policyHandlers`, `settingsHandlers` — all already call
  `visibleDataProvider.getVisibleCourseIds()` before any course-scoped read.
- **Only `courseDataHandlers.ts` bypasses** at the course-table layer.
- Many other IPC handlers under `src/lifecycle/ipc-handlers/**` call
  `database.executeRead*` for tables that aren't course-scoped. They are
  correct today but the _capability_ to bypass exists across the board.

The candidate deepening is to remove the bypass capability structurally, not to
patch the two specific sites.

## Decision

**IPC handlers under `src/lifecycle/ipc-handlers/**`may not call`database.executeRead`, `database.executeReadOne`, `database.executeWrite`, or
`database.upsert` directly.\*\* They are thin adapters that translate IPC requests
into calls on named services in lower layers:

- **L1 readers** — new directory `src/layers/l1-persistence/readers/`,
  one file per course-scoped table (`CourseReader`, `TaskReader`,
  `NotificationReader`, `FileReader`, …). Each reader is stateless, returns raw
  DB rows in snake_case, and exposes a small named-intent API
  (`getById`, `getByIds`, `getByCourseIds`, plus table-specific helpers).
- **`VisibilityOracle`** (renamed from `VisibleDataProvider` in PR-A) — owns
  the visibility-state question. Shrunk to a pure visibility-state oracle: no
  row-returning methods, only `getVisibleCourseIds() / getArchivedCourseIds() /
isCourseVisible(id) / isCourseArchived(id) / getTermSelection() /
setTermSelection() / notifyVisibilityChanged()` plus events. List-IPC handlers
  compose `Oracle.getVisibleCourseIds()` + `Reader.getByCourseIds(ids)`.
- **L4 commands via `CommandDispatcher`** — for writes.

Snake_case → camelCase DTO mapping happens in **the IPC handler layer** via small
mapper functions colocated with handlers (e.g.
`src/lifecycle/ipc-handlers/mappers/courseMapper.ts`). Readers stay pure (rows
in, rows out). The IPC handler's earned job IS the translation between the DB
vocabulary and the IPC/UI vocabulary.

### Sub-decisions (resolved during the 2026-05-27 grilling)

**Single-id getters bypass visibility.** `CourseReader.getById(id)` returns the
row regardless of visibility state. The IPC handler does not wrap in
`isCourseVisible(id)`. Visibility is a list-filter concept (decluttering the
dashboard), not a per-item access gate. Internally consistent with the existing
`getTasksForArchivedCourse(id)` pattern. **List endpoints filter; single-id
endpoints don't.**

**Renderer-side `courseMap.has` filter moves to Zustand selectors.** The
per-component filter currently mandated by CLAUDE.md §8 ("Correct Pattern (L6
UI Component)") becomes redundant once the IPC is tight, _but_ defense-in-depth
is still valuable against the store-staleness window (between
`fetchCourses` and `fetchTasks` re-fetches after a visibility change). The
filter lives in _one_ place — `src/layers/l5-presentation/store/selectors.ts`
exposes `selectVisibleTasks`, `selectVisibleNotifications`, etc. Components
read via `useStore(selectVisibleX)`. CLAUDE.md §8's UI pattern is updated
accordingly. (Selector migration lands in PR-C, not PR-B.)

**Readers do not cache. `VisibilityOracle` keeps its 5s cache + event
invalidation.** SQLite with WAL + `mmap_size: 256MB` reads from memory — `SELECT
… WHERE id IN (…)` is sub-millisecond. The Oracle's cache earns its keep
because `getVisibleCourseIds()` is called by every visibility-aware IPC call
and includes a term-derivation join that's worth memoizing. Reader caches would
multiply invalidation surface for no measured perf win.

**Term-selection localStorage fallback is deleted in PR-B.** The fallback in
`coreDataSlice.ts:88-103` exists for "backwards compatibility during
migration." The migration window has closed for the only user; defaulting to
`'auto'` on IPC failure is benign. Keeping a third source of truth contradicts
the bug PR-B closes. The localStorage key can be cleaned up by any future PR
that notices.

### Why this rather than a lint rule on SQL contents

The alternative considered was an ESLint rule that pattern-matches `FROM
<course-scoped-table>` inside string literals across the codebase, with file
allowlists for legitimate carve-outs (sync code, migrations,
`VisibleDataProvider` itself). That rule would have caught the two known bugs
and any future analog. But:

- It treats the _symptom_ (raw SQL in the wrong place) rather than the _cause_
  (the wrong place has raw-SQL capability at all). The IPC handler layer is an
  adapter layer per the [7-layer architecture in ADR-0001](0001-seven-layer-architecture.md);
  raw SQL is not its job.
- It requires SQL-aware pattern matching, which is fragile around JOINs,
  subqueries, and CTEs. The "raw access in this folder" rule needs no SQL
  parsing at all.
- The carve-outs (sync code, migrations) live _outside_ `src/lifecycle/ipc-handlers/`,
  so a folder-scoped rule needs zero exception lists. A SQL-content rule needs
  dozens of `// eslint-disable-next-line` comments scattered across legitimate
  bypass sites.

### Carve-outs

None within `src/lifecycle/ipc-handlers/**`. Code that legitimately reads tables
without visibility filtering (sync engine, migrations, export, archive
commands, schema self-healing) does not live in IPC handlers and is unaffected
by this rule. The carve-outs are _the folder boundary itself_ — not in-file
disable-comments.

## Migration plan (Option 5 — exemplar-then-propagate)

- **PR-A — Pure rename.** `VisibleDataProvider → VisibilityOracle` across all
  31 referencing files. No behavior change. Pre-existing tests pass unchanged.
  Lowest reviewer cost; lands first.
- **PR-B — Exemplar + bug fix.** Introduce `src/layers/l1-persistence/readers/`
  and `CourseReader` (the first reader). Narrow `VisibilityOracle` by removing
  its row-returning methods (`getVisibleCourses`, `getVisibleTasks`,
  `getArchivedCourses`, `getTasksForArchivedCourse`) once `courseDataHandlers`
  no longer uses them. Migrate `courseDataHandlers.ts` to the new pattern
  (`oracle.getVisibleCourseIds()` + `courseReader.getByIds(ids)` + mapper).
  Delete `coreDataSlice.ts:75-134`'s re-derivation block AND the localStorage
  fallback. **This PR closes both known bugs** and establishes the pattern that
  every subsequent PR copies.
- **PR-C — Selector migration.** Introduce
  `src/layers/l5-presentation/store/selectors.ts` with `selectVisibleTasks` /
  `selectVisibleNotifications` / etc. Migrate the ~5-10 components currently
  doing inline `courseMap.has` filters. Update CLAUDE.md §8's "Correct Pattern
  (L6 UI Component)" example. No reader/Oracle changes; pure renderer-layer
  refactor.
- **PR-D through PR-N — One IPC handler family per PR.** Each PR introduces
  the reader its handler needs (`TaskReader`, `NotificationReader`,
  `FileReader`, …) and re-shapes the handler to compose
  `oracle.getVisibleCourseIds()` + `reader.…()` + mapper. Following PR-B's
  template; each PR is small and reviewable in isolation. Mergeable in any
  order.
- **Final PR — Enforcement.** Add the Jest fitness-function test (below). Its
  allowlist Set starts empty — there should be no offenders left. Future PRs
  that add raw `database.execute*` to `src/lifecycle/ipc-handlers/**` fail CI.

The enforcement test is the **last** PR by design: it lands clean (no
grandfathering, no "this is allowed for now" exceptions). If a migration PR
needs to ship before its handler is fully clean, the enforcement PR simply
waits.

## Enforcement

A Jest "fitness function" test in `tests/integration/` (or a dedicated
`tests/architecture/` if we want a new home) that walks
`src/lifecycle/ipc-handlers/**/*.ts` and fails if a forbidden call expression
appears:

```ts
// Shape (final PR will polish):
test('IPC handlers do not call database.execute*/upsert directly', () => {
  const files = glob.sync('src/lifecycle/ipc-handlers/**/*.ts');
  const offenders: { file: string; line: number; call: string }[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const pattern = /\b\w+\.(executeRead|executeReadOne|executeWrite|upsert)\s*\(/g;
    for (const m of [...text.matchAll(pattern)]) {
      const line = text.slice(0, m.index!).split('\n').length;
      offenders.push({ file, line, call: m[0] });
    }
  }
  // ALLOWLIST is intentionally empty after Option 5 finishes.
  expect(offenders).toEqual([]);
});
```

Chosen over a custom ESLint rule because:

- No new infra category — project already uses Jest.
- Centralized allowlist (if any future case ever needs one) lives in one file,
  not scattered as `// eslint-disable-next-line` comments.
- Better failure message: full Jest output enumerates every offender with
  file:line.
- The "editor squiggle" argument for ESLint is weak — the bug class is
  "fresh raw SQL added to a handler"; CI catching it in `npm test` is fine.

The regex matcher catches `database.executeRead`, `db.executeRead`,
`this.database.executeRead`, etc. — anything ending in `.execute*(`/`upsert(`.
If a false positive emerges in practice, the test can upgrade to a `ts-morph`
AST walk in another ~20 lines.

## Consequences

### Improves

- **Closes the active bug class.** `courseDataHandlers.ts:43` and any analog
  cannot exist after the enforcement test lands — the IPC handler can no
  longer write the bypassing SQL.
- **One place to read each table.** The reader layer becomes the single answer
  to "where does SQL for table X live?" Today that answer is "look at the IPC
  handler, look at L4 commands, look at L3 services if they read, look at the
  provider, hope they agree."
- **Deletion test passes harder on the IPC layer.** After this rule, deleting
  an IPC handler removes only IPC wiring + a snake→camel mapper; the read
  logic has its own consumers via the named reader.
- **`VisibilityOracle` becomes genuinely deep.** Eight methods hiding term-math,
  cache, invalidation events, settings persistence. Today's `VisibleDataProvider`
  has 14 methods spanning visibility logic AND row marshaling — broad and
  shallow. Narrowing it is the deepening.
- **AI-navigability.** A future Claude session asked "how are courses read for
  the UI?" gets one answer (`CourseReader.getById/getByIds`), not three.

### Costs

- **Migration is non-trivial.** Compliant IPC handlers today still embed raw
  SQL (e.g. `taskDataHandlers.ts` does `SELECT * FROM canvas_task_queue WHERE
course_id IN (...)` after correctly fetching the visible IDs). They satisfy
  the _visibility_ rule but violate the _thin adapter_ rule. All need to be
  re-shaped to call named readers. Roughly **6 handler files, ~40-60 handler
  functions**.
- **One mapper file per entity.** `mapCourseRowToDto`, `mapTaskRowToDto`,
  etc. Small files, but real ones. Live alongside the IPC handlers in
  `src/lifecycle/ipc-handlers/mappers/`.
- **Test re-shape.** Per CLAUDE.md §7, the test surface migrates: today's IPC
  handlers have integration-style coverage; after the rule, the readers hold
  the read-path tests and the IPC handlers become trivial enough to test with
  a one-line stub. Selectors get their own unit tests.

### Risks

- **PR sequencing matters.** PR-A (rename) must land before PR-B because PR-B
  references `VisibilityOracle`, not `VisibleDataProvider`. Subsequent PRs
  (C/D/E…) can land in any order once the pattern is established. The
  enforcement PR must land last.
- **Renderer-side staleness window.** After dropping the per-component filter
  in PR-C, the `selectVisibleX` selector becomes the only defense against the
  brief window where `state.tasks` is fresh but `state.courses` is stale (or
  vice versa). Selector unit tests must cover this case.

## Related

- [ADR-0001](0001-seven-layer-architecture.md) — the 7-layer architecture this
  rule sharpens. L1 owns data; IPC handlers are infrastructure glue, not L1.
- [CLAUDE.md §2](../../CLAUDE.md) — "IPC handlers are thin adapters" invariant
  (the _rule_; this ADR is the _why_).
- [CLAUDE.md §8](../../CLAUDE.md) — "MANDATORY: Course Visibility Filtering".
  Its "Correct Pattern (IPC Handler)" example becomes obsolete after PR-B;
  its "Correct Pattern (L6 UI Component)" example becomes obsolete after
  PR-C. Both will be replaced in those PRs.
- [`/improve-codebase-architecture` v2 review](../../tmp/architecture-review-20260527-050021.html)
  (transient, in OS temp dir) — Candidate 1 that motivated this ADR.
