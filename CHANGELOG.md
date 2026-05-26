# Changelog

All notable changes to CID are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0 and not yet
shipping versioned releases, so changes accrue under **Unreleased** until a release is cut.

> Maintenance note: keep entries human-meaningful (what changed and why it matters), not a
> commit dump. `git log` is the exhaustive record; this file is the curated summary.
> Each entry includes the UTC timestamp when the change landed.

## [Unreleased]

### Added

- `2026-05-26 02:50 UTC` — Playwright + Electron end-to-end harness (`e2e/`) that drives
  Course-Detail keyboard navigation against the built app offline (mock Canvas + copied DB
  - isolated profile).
- `2026-05-26 02:50 UTC` — Course-Detail keyboard navigation: section cycling (Q/E), task
  focus nav, edit-mode field jumps (Alt+key), filter shortcuts, Queue/Announcements nav,
  Escape cascade.
- `2026-05-26 02:50 UTC` — Calendar quick-filter keyboard shortcuts: Alt+Shift+D
  (deadline/overdue), Alt+Shift+P (high priority), Alt+Shift+C (clear all), Alt+1–9
  (toggle course filter by position).
- `2026-05-26 02:50 UTC` — E2e keyboard-nav coverage expanded to Courses, Tasks,
  Announcements, and Updates pages; calendar filter-badge spec added
  (`data-testid="calendar-filter-active"`).
- `2026-05-26 02:50 UTC` — 30 sync pipeline integration tests covering the full Canvas → DB
  flow: new-task queuing (D4), accepted/rejected/pending queue paths (D1–D2), conflict
  detection (D3), title-match merge variants (B1–B7), fuzzy linking via TaskMatcher
  (F1–F5), and multi-step accept→resync flows (G1–G3). Shared seed/read helpers in
  `tests/test-utils/`.
- `2026-05-26 02:50 UTC` — `CHANGELOG.md` moved to project root and tracked in git so it
  appears in PRs and CI can check it. Architecture Decision Records, onboarding guide, and
  detailed private docs remain in `docs/` (local-only, pushed at handoff).

### Changed

- `2026-05-26 02:50 UTC` — Files page: bulk-download no longer triggers a per-file UI
  refetch (suppressed + debounced), so the file tree stops "refreshing" mid-download.
- `2026-05-26 02:50 UTC` — CI now runs the unit-test suite as a blocking gate (Jest
  baseline is green). `tests/` is tracked in git so CI can run it; lint-staged runs ESLint
  on `src/`+`e2e/` only.

### Removed

- `2026-05-26 02:50 UTC` — Orphaned `priorities:*` and `intelligence:*` IPC channels (no
  backend handlers, no callers) from `preload.ts` and the IPC contract. See ADR 0003 for
  the broader L3-intelligence removal.
- `2026-05-26 02:50 UTC` — Dead duplicate `CalendarPage` component tree
  (`src/layers/l6-ui/components/pages/Calendar*`) that was never routed; the live calendar
  is `components/Calendar/index.tsx`.

### Fixed

- `2026-05-26 02:50 UTC` — Task sync no longer merges a Canvas assignment into an arbitrary
  local task when two user tasks in a course share the same title; the ambiguous case is
  skipped (and logged) so the assignment lands as its own task instead of orphaning a
  duplicate.
- `2026-05-26 02:50 UTC` — Soft-deleted user tasks no longer match in title-based sync
  (missing `deleted_at IS NULL` filter meant a deleted task could be resurrected by an
  incoming Canvas assignment).
- `2026-05-26 02:50 UTC` — Updates page action items now show a keyboard focus outline;
  `getFocusProps` was wired up so the focus-navigation system can highlight rows (was
  visually broken before).
