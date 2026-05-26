# Changelog

All notable changes to CID are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0 and not yet
shipping versioned releases, so changes accrue under **Unreleased** until a release is cut.

> Maintenance note: keep entries human-meaningful (what changed and why it matters), not a
> commit dump. `git log` is the exhaustive record; this file is the curated summary.
> Each entry includes the UTC timestamp when the change landed.

## [Unreleased]

### Added

- `2026-05-26 17:10 UTC` — Per-field merge selection in the duplicate-warning modal. When
  linking a queued Canvas task to an existing user task, conflicting fields (title, due
  date, type) now render as a side-by-side picker — click either cell to choose which value
  wins. Non-conflicting fields show once below as a quiet summary (weight & notes are
  always preserved). In bulk-accept mode each conflicting row gets a `[⚙ Customize
fields]` button that opens the same picker in a child modal layered above the list. The
  backend `MergeQueuedTaskCommand` already supported per-field `keepFromUser`; this exposes
  it. New `FieldMergeEditor` component lifted from the previously-unwired
  `TaskLinkDialog` Step-2 layout.
- `2026-05-26 03:37 UTC` — Duplicate warning gate on Canvas task acceptance. Exact title
  matches show a "Duplicate found" dialog; fuzzy matches (≥ 70% similarity) show "May
  match". The dialog compares incoming Canvas fields against the existing task side by side
  and lets the user link them (merging via the existing COALESCE logic, preserving weight
  and notes) or keep them separate. Bulk accept shows a multi-select list with per-item
  link/separate radio; items with no duplicate are auto-accepted silently. Full keyboard
  nav (A select-all, ↑↓ Space L S Enter Esc). Wired into the queue section and Updates page.
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

- `2026-05-26 18:56 UTC` — `ConfirmDialog` (used in 58 call sites) migrated to the shared
  `Modal` primitive (`Modal.Header` + `Modal.Content` + manual right-aligned footer for
  the action buttons). Public API unchanged — no call-site touched. Preserves the existing
  autofocus-on-confirm behaviour and the custom Escape handler that uses `stopPropagation`
  in capture phase so a `ConfirmDialog` stacked on top of another modal closes only itself
  on Esc.
- `2026-05-26 02:50 UTC` — Files page: bulk-download no longer triggers a per-file UI
  refetch (suppressed + debounced), so the file tree stops "refreshing" mid-download.
- `2026-05-26 02:50 UTC` — CI now runs the unit-test suite as a blocking gate (Jest
  baseline is green). `tests/` is tracked in git so CI can run it; lint-staged runs ESLint
  on `src/`+`e2e/` only.

### Removed

- `2026-05-26 18:56 UTC` — Dead `TaskMergeDialog` component (`src/layers/l6-ui/components/Queue/TaskMergeDialog.tsx`,
  ~451 lines) and its associated state/JSX in `CourseDetail.tsx`. The component was
  imported and rendered conditionally but the trigger (`setMergeDialogState({isOpen: true, ...})`)
  was never called from anywhere — leftover scaffolding from a precursor design.
- `2026-05-26 02:50 UTC` — Orphaned `priorities:*` and `intelligence:*` IPC channels (no
  backend handlers, no callers) from `preload.ts` and the IPC contract. See ADR 0003 for
  the broader L3-intelligence removal.
- `2026-05-26 02:50 UTC` — Dead duplicate `CalendarPage` component tree
  (`src/layers/l6-ui/components/pages/Calendar*`) that was never routed; the live calendar
  is `components/Calendar/index.tsx`.

### Fixed

- `2026-05-26 17:35 UTC` — Keyboard shortcuts in the bulk-accept duplicate-warning modal
  no longer leak into the underlying queue section. `CanvasUpdatesSection`'s `useHotkeys`
  (`a` / `shift+a` / `r` / `l`) and `useFocusedItem` arrow keys now suppress while the
  modal is open (gated via `gateState == null`). Previously, pressing `L` in the modal
  also opened the section's link dialog behind it.
- `2026-05-26 17:35 UTC` — Customize-fields child modal is now fully keyboard-driven.
  New shortcuts: `↑↓` walk conflict fields (focused row gets a navy outline), `←/1` pick
  Canvas, `→/2` pick Your task, `Q` snap all to Canvas, `W` snap all to Your task. `Enter`
  saves, `Esc` cancels (existing).
- `2026-05-26 17:10 UTC` — Clicking the green ✓ on a no-match queued task (e.g. "Lecture
  Reflection 1") now removes it from the queue list on the first click. Was silently
  failing because `CourseDetail` held `queuedTasks` in local React `useState` while the
  duplicate-gate hook called the store action directly — the store updated but the
  parent's local copy didn't, so the UI showed stale data and the second-and-later clicks
  hit "queue row already accepted" and were swallowed. Fix: `CourseDetail.queuedTasks` is
  now a `useStore` selector + `useMemo` filtered by `courseId`. Eliminates the entire
  state-duplication bug class for queued tasks.
- `2026-05-26 17:10 UTC` — Bulk-accept no longer blocks no-match items behind the modal.
  `gatedBulkAccept` now opens the bulk modal immediately (matched items get attention
  right away), then fires no-match auto-accepts in parallel via `Promise.allSettled` —
  items drop out of the queue list behind the modal as their store updates land, and a
  single failed accept doesn't strand its siblings.
- `2026-05-26 17:10 UTC` — Bulk-mode conflict summary dates were rendering as raw ISO
  strings (`2026-06-15T23:59:00Z → —`). Now formatted via `formatSmartDate` for due dates
  and `getTaskTypeLabel` for task types, matching single-mode display.
- `2026-05-26 17:10 UTC` — `DuplicateWarningModal` migrated to the shared `Modal` primitive
  (header/content/footer compound). Removes ~80 lines of handwritten overlay/dialog/
  header/footer chrome from the file. Fixes a latent footer layout bug where Cancel +
  Confirm could split across rows when many items were present.
- `2026-05-26 17:10 UTC` — Confirm button in the bulk modal was rendering invisibly:
  `var(--color-primary)` (used by `s.btn('primary')`) doesn't exist in the theme — only
  `--color-navy` does. Replaced 11 stale `--color-primary*` references with the actual
  theme variables (`--color-navy`, `--color-info-bg`).
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
