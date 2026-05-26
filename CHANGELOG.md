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

- `2026-05-26 22:30 UTC` — `TaskLinkDialog` (the two-step Canvas → user task linker, last
  actively-used handwritten modal) migrated to the shared `<Modal>` primitive (sectioned
  shape, `size="xl"`, `zIndex={1100}`). Step 2's hand-rolled per-field picker is now a
  `<FieldMergeEditor>` instance — the same component PR #16 introduced for the
  duplicate-warning flow — fed by a synthesized `DuplicateCheckResult` whose
  `conflictingFields` are computed from value comparison. Fields that already agree now
  collapse into the quiet "kept as-is" summary instead of rendering an empty picker.
  Public prop contract preserved (no caller changes). FOLLOWUPS batch 3 / final; all
  actively-used handwritten modals are now on the primitive.
- `2026-05-26 21:05 UTC` — CourseDetail announcements now read from the Zustand
  `state.notifications` store via a memoized selector instead of a parallel `useState`
  list hydrated by a separate IPC fetch. Archived courses (which the store filters out
  via `VisibleDataProvider`) keep a small `archivedCourseAnnouncements` local state,
  mirroring the `archivedCourseTasks` pattern. Eliminates the latent "store write
  doesn't reflect in the announcements card" desync bug class (per CLAUDE.md §2
  "Single source of truth for domain data"). Followup #1 from `docs/FOLLOWUPS.md`.
- `2026-05-26 19:24 UTC` — Duplicate-warning Customize child modal now uses `Q` / `E`
  (matching CourseDetail's existing `Q` = section-back / `E` = section-forward navigation
  pair) for "use all Canvas" / "use all Local" instead of `Q` / `W`. Mnemonic aligns with
  the app's broader left/right keyboard convention.
- `2026-05-26 18:56 UTC` — `ConfirmDialog` (used in 58 call sites) migrated to use the
  shared `Modal` primitive for its structural concerns (backdrop, centering, sizing,
  escape, body-scroll-lock, z-index stacking). The visual chrome (icon, title, message,
  action buttons) is rendered as a single padded block inside the modal — deliberately
  _not_ using `Modal.Header` / `Modal.Footer` because their `borderBottom` / `borderTop`
  dividers look heavy on a compact confirmation prompt. Public API unchanged — no
  call-site touched. Preserves the existing autofocus-on-confirm behaviour and the custom
  Escape handler that uses `stopPropagation` in capture phase so a `ConfirmDialog`
  stacked on top of another modal closes only itself on Esc.
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

- `2026-05-26 22:00 UTC` — Manual-test seed scripts (`scripts/manual-test-duplicate-warning.js`,
  `scripts/seed-duplicate-test.js`) now write a full Canvas-assignment-shaped JSON into
  `canvas_task_queue.canvas_data` instead of the previous `{id, name}` stub. The merge
  command (`MergeQueuedTaskCommand`) reads its merge inputs from the blob (via
  `mapAssignment`), while the modal display reads the queue's separate _columns_ — so the
  old stub let the modal show the right Canvas due-date / type while the merge silently
  wrote `null`. New `buildCanvasBlob` helper in each script keeps blob and columns
  consistent; per-scenario `description`, `due_at`, `points_possible`, and
  `submission_types` are now real. This unblocks end-to-end verification of the duplicate
  warning + TaskLinkDialog field-pick paths.
- `2026-05-26 19:24 UTC` — CourseDetail's page-level navigation hotkeys (`Q`/`E` section
  cycle, `G` back-nav, `T` target-grade edit, `Shift+O` open-on-Canvas, `Mod+E` settings
  toggle, `Mod+S` save settings, `Mod+Shift+A` archive course) no longer fire while the
  Canvas Updates duplicate-warning modal is on screen. Previously, `useKeymap` attached
  listeners at the document level, so e.g. pressing `Q` in the Customize child modal
  (to "use all Canvas") would also cycle CourseDetail's section focus behind the modal,
  and `Mod+Shift+A` would stack the archive `ConfirmDialog` _on top of_ the duplicate
  modal. `CanvasUpdatesSection` now exposes an `onModalStateChange` callback;
  CourseDetail uses it to gate the `useKeymap<'nav'>` scope via its `when` callback.
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
