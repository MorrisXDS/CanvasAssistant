# 0015 — Term-aware grade history (unified term-linger buffer + past-terms grade breakdown)

Status: Proposed

## Context

Finished courses behaved incoherently across the app's two timing seams:

- **Auto-archive** (`SyncCourseOperations.autoArchiveExpiredCourses()`) fired at
  `et.end_at < now` — a **0-day** buffer.
- The **'auto' term filter** (`VisibilityOracle`, `termEndBufferDays: 30`) hid courses at
  `end_at <= now - 30 days`.

So a just-finished course was yanked out of the dashboard average ~30 days **before** the
filter would have hidden it — a limbo gap where final grades post but the course is already
gone from the average. The two thresholds were independent magic numbers that disagreed.

Separately, the app **threw away academic history** the instant a term ended: once a course
auto-archived it dropped out of every visible-courses view, and the grade modal only showed
the current term. The Courses-page Archived drawer was a flat, ungrouped dump.

Three coupled needs: unify the timing, surface past-term grade history, and group the
archived list by term. While verifying, a **latent JOIN bug** surfaced (Decision 5).

## Decision

### 1 — Unified term-linger buffer

Auto-archive and the 'auto' term filter share ONE constant,
`TERM_END_BUFFER_DAYS = 30` (`src/layers/l1-persistence/constants/termLinger.ts`). Auto-archive
switches from `et.end_at < now` to `datetime(et.end_at) < datetime('now', '-30 days')` — the
**exact** comparison form the Oracle uses. Archive threshold == filter threshold → a course
is _either_ visible _or_ archived, never both/neither. This RESTORES the term filter's
intended ~30-day linger that the 0-buffer auto-archive was silently overriding.

Rejected alternative: a separate archive grace window — recreates a limbo gap and ripples
through every visible-courses feature.

### 2 — Grade history is task-derived + credit-weighted cumulative

Past-term averages are computed from **task grades** (the same weighted formula as L5's
`courseGradesCache`: `sum((grade/100)*weight)/sum(weight)*100`), NOT `courses.current_grade`
(which is null/unused). The cumulative across past terms is credit-weighted and **flattened**
across all past-term courses (`sum(courseAvg*credits)/sum(credits)`, credits default 1.0) —
flattening, not averaging the per-term averages, so a 5-course term isn't weighted the same
as a 1-course term.

The grouping + weighting math lives in ONE pure helper,
`src/shared/grades/termGrouping.ts` (layer-neutral, alongside `ipc-contract.ts`), imported by
both the main-side reader and the renderer components.

### 3 — Past-terms data isolated from the visible store (hard constraint)

A new thin IPC reader (`PastTermGradesReader` → `data:getPastTermGrades`) computes the entire
breakdown **main-side**; only aggregated numbers + course display fields cross IPC. Archived
tasks NEVER reach the renderer, so they cannot leak into `state.courses` / `state.tasks` and
resurface in the Tasks page / Calendar / queue / badges / dashboard average. The grade modal
fetches modal-scoped and holds the result in LOCAL component state (UI-ephemeral — allowed by
the single-source-of-truth rule because it is NOT global domain data the rest of the app
reads). Guarded by `tests/integration/pastTermGrades-store-isolation.test.ts`.

### 4 — Courses-page Archived grouped by term

`ArchivedCoursesSection` becomes collapsible per-term subgroups (newest first; header = term
name + per-term credit-weighted average + course count; rows keep color bar / code / name /
Restore). The Active grid is unchanged. Grouping reuses the same pure helper.

### 5 — JOIN affinity normalization

`courses.enrollment_term_id` (INTEGER) stores **Canvas's term id**, which sync writes into
`enrollment_terms.external_id` (TEXT). The proven-correct join is
`c.enrollment_term_id = CAST(et.external_id AS INTEGER)` (matching the Oracle). This ADR fixes
the latent `CourseReader.getArchivedSortedByTermEnd()` join that used the numeric PK `et.id`
(only correct when the autoincrement PK happened to equal the Canvas id). The auto-archive
query is normalized to the same CAST form.

## Consequences

- Finished courses linger ~30 days in **every** feature keyed off `getVisibleCourseIds()`
  (Dashboard average + stats, Tasks, Calendar, Notifications, Files, Export, sidebar,
  selectors). **Intended** — it restores the filter's original window; final grades now post
  while the course is still in the average.
- Grade history is surfaced (modal Past-terms section + cumulative; archived list grouped by
  term).
- The per-course weighted-average formula is duplicated across the L1 reader and L5's
  `courseGradesCache` (layer boundary: L1 cannot import L5). Both are ~6 lines and pinned by
  tests on both sides so they cannot silently diverge.
- The archived term grouping is now correct (was potentially mis-grouped by the `et.id` join).
