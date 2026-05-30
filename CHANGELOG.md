# Changelog

All notable changes to CID are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0 and not yet
shipping versioned releases, so changes accrue under **Unreleased** until a release is cut.

> Maintenance note: keep entries human-meaningful (what changed and why it matters), not a
> commit dump. `git log` is the exhaustive record; this file is the curated summary.
> Each entry includes the UTC timestamp when the change landed.

## [Unreleased]

### Fixed

- `2026-05-29 21:51 UTC` — `settings:setDefaultTargetGrade` was silently broken:
  it did `require('../layers/l1-persistence/repositories')` from
  `src/lifecycle/ipc-handlers/`, which resolves to the non-existent
  `src/lifecycle/layers/…` — so changing the default target grade threw
  "Cannot find module" at runtime. Replaced the mis-pathed inline `require`
  with a top-level `CourseRepository` import (discovered during the ADR-0007
  migration of this handler).
- `2026-05-27 18:03 UTC` — Two silent course-visibility bugs (ADR-0007 PR-B).
  `data:getCourses` previously ran raw SQL filtering only `archived_at IS NULL
AND deleted_at IS NULL` — it was returning **hidden courses** and **ignoring
  term selection** entirely (`courseDataHandlers.ts:43`). The renderer's
  `fetchCourses` then **re-derived** term filtering with different math from
  the Oracle, so the same course could appear or disappear depending on which
  route loaded it (`coreDataSlice.ts:113`). Both bugs are now closed —
  `data:getCourses` routes through `VisibilityOracle.getVisibleCourseIds()` +
  the new `CourseReader.getByIds()`, and the renderer trusts the IPC's
  filtered list. Deletes the unused `localStorage`-fallback term-selection
  path that had been kept "during migration" since the move to SQLite. No
  user action needed.

### Changed

- `2026-05-30 02:13 UTC` — `backupScheduleHandlers` migrated off raw SQL (ADR-0007).
  `backup:getSchedule` reads `app_settings` via a new `AppSettingsReader`;
  `backup:setSchedule` writes (schedule + encryption password, or password
  delete) route through new `SetAppSettingCommand` / `DeleteAppSettingCommand`
  (L4); `backup:getHistory` reads via a new `ExportHistoryReader.getByType`.
  No `database.execute*` calls remain; the ceiling entry (was 3) is removed.
  (`app_settings` is a distinct key-value table from `user_preferences`, which
  keeps its own reader/command.)
- `2026-05-30 01:32 UTC` — `calendarMigrationUtils` relocated out of the IPC-handler
  folder (ADR-0007). `recomputeCalendarHashes` was never an IPC handler — it's a
  one-time calendar-hash migration utility — so it moved verbatim to
  `src/layers/l2-daemon/calendar/recomputeCalendarHashes.ts` (alongside
  `ICSParser`), where raw SQL is legitimately allowed (the daemon carve-out).
  This removes it from the ratchet's scope (ceiling entry deleted) without
  rewriting working migration logic. Added a first-time test suite for it
  during the move. Caller import updated; behavior unchanged.
- `2026-05-30 01:17 UTC` — `databaseExportHandlers` migrated off raw SQL (ADR-0007).
  `data:getDatabaseDiagnostics` reads (per-table row counts + imported-calendar
  detail + calendar-events-by-type) route through a new `DiagnosticsReader`
  (which owns its fixed table list so no table name is interpolated from input),
  and the pre-export WAL checkpoint uses `database.checkpoint()` instead of a raw
  `PRAGMA wal_checkpoint`. No `database.execute*` calls on the app DB remain
  (the import path's separate `better-sqlite3` connection on the _backup_ file
  is unaffected). The ceiling entry (was 1) is removed.
- `2026-05-30 01:04 UTC` — `data/courseAuthorityHandlers` migrated off raw SQL
  (ADR-0007). `data:getCourseAuthority` reads via a new
  `CourseReader.getAuthorityById`; `data:updateCourseAuthority` writes via a new
  `UpdateCourseAuthorityCommand` (L4). No `database.execute*` calls remain; the
  ceiling entry (was 1) is removed.
- `2026-05-29 23:09 UTC` — `courseExportHandlers` import pipeline migrated off raw
  SQL (ADR-0007). The entire `data:importCourseData` orchestration — 8 entity
  `upsert`s plus the old→new foreign-key remapping across courses / tasks /
  notifications / pages / policies / resources / syllabuses / grace tokens +
  usage — moved verbatim into a new `ImportCourseDataCommand` (L4); the handler
  is now a thin read-file → command → return adapter. The file's ceiling entry
  (was 9) is removed. The `data:exportCourseData` reads (generic-typed, so
  uncounted by the ratchet) remain and are tracked for a follow-up in
  `docs/FOLLOWUPS.md`. Import behavior preserved verbatim — including the exact
  `||`/`??` field-selection semantics.
- `2026-05-29 22:48 UTC` — `htmlExportHandlers` migrated off raw SQL (ADR-0007).
  `pages:exportHtml` / `html:exportBatch` / `html:getExports` now read course
  info via `CourseReader` and `html_exports` rows via a new `HtmlExportReader`,
  and the export upsert routes through a new `UpsertHtmlExportCommand` (L4). No
  `database.execute*` calls remain; the ceiling entry (was 2) is removed.
- `2026-05-29 22:35 UTC` — `exportHandlers` migrated off raw SQL (ADR-0007).
  Selective-export and scheduled-backup history writes now route through the
  shared `RecordExportHistoryCommand` (extended to cover the full
  `export_history` column set — encrypted, courses_included, files_exported,
  error_message); `data:getExportHistory` reads through a new
  `ExportHistoryReader`; and the pre-backup WAL checkpoint uses the existing
  `database.checkpoint()` instead of a raw `PRAGMA wal_checkpoint`. No
  `database.execute*` calls remain; the ceiling entry (was 4) is removed.
- `2026-05-29 22:20 UTC` — `csvExportHandlers` migrated off raw SQL (ADR-0007).
  The export-history logging in `data:exportTasksCsv` / `data:exportGradesCsv`
  now routes through a new reusable `RecordExportHistoryCommand` (L4) instead of
  a raw `INSERT INTO export_history`. No `database.execute*` calls remain; the
  ceiling entry (was 2) is removed. The command is shared infrastructure the
  remaining export handlers (`exportHandlers`, `courseExportHandlers`,
  `htmlExportHandlers`, `databaseExportHandlers`) can adopt as they migrate.
- `2026-05-29 21:51 UTC` — `settingsHandlers` migrated off raw SQL (ADR-0007).
  The `user_preferences` key-value reads/writes (`localHtmlPathsSettings`,
  `academicSettings`/default target grade, `canvasTimezone`) now route through a
  new `UserPreferencesReader` (L1) + `SetUserPreferenceCommand` (L4); the
  per-course `course:getSettings` / `course:updateSettings` route through
  `CourseReader.getSettingsById` + a new `UpdateCourseSettingsCommand`. No
  `database.execute*` calls remain; the ceiling entry (was 4) is removed.
  Renderer response shapes unchanged.
- `2026-05-29 20:35 UTC` — `taskLinkHandlers` migrated off raw SQL (ADR-0007).
  The link-suggestion / manual-linking IPC handlers (`data:getLinkSuggestions`,
  `:acceptLinkSuggestion`, `:rejectLinkSuggestion`, `:getPendingSuggestionCount`,
  `:getCanvasTasksForLinking`, `:manuallyLinkTasks`, `:unlinkTasks`) now route
  reads through a new `LinkSuggestionReader` (L1) + `TaskReader.findUnlinkedCanvasTasksInCourse`,
  and the four write paths through new L4 commands (`AcceptLinkSuggestion`,
  `RejectLinkSuggestion`, `ManuallyLinkTasks`, `UnlinkTasks`). No `database.execute*`
  calls remain in the handler file; its ceiling entry (was 9) is removed and locked
  at zero. Renderer response shapes unchanged. New `LinkSuggestionWithTasksRow`
  join-projection type in `DatabaseRowTypes.ts`. Covered by reader unit tests,
  a `LinkCommands` suite, and a `taskLinkHandlers` integration test.
- `2026-05-29 20:14 UTC` — `taskTypesHandlers` migrated off raw SQL (ADR-0007).
  The custom-task-type IPC handlers (`taskTypes:getAll` / `:create` / `:delete`)
  now route reads through a new `TaskTypeReader` (L1) and writes through new
  `CreateTaskTypeCommand` / `DeleteTaskTypeCommand` (L4) — no `database.execute*`
  calls remain in the handler file, so its ceiling entry is removed and locked
  at zero. Renderer-facing DTO shapes are unchanged. New `CustomTaskTypeRow`
  added to `DatabaseRowTypes.ts`. Covered by `TaskTypeReader` unit tests,
  Create/DeleteTaskType command tests, and a `taskTypesHandlers` integration test.
- `2026-05-27 22:08 UTC` — Visibility-defense filtering moved into centralized
  Zustand selectors (ADR-0007 PR-C). Components no longer re-derive the
  `notifications.filter(n => courseMap.has(n.courseId))` defense inline — they
  call `useStore(selectors.visibleNotifications)` / `selectors.visibleTasks`.
  The selectors close the brief staleness window between `fetchCourses` and the
  entity-specific re-fetches after a visibility change. Dashboard migrated;
  CLAUDE.md §8's "Correct Pattern (L6 UI Component)" example updated to point
  at the selectors. Other components that use `courseMap` for lookup (course
  color/code on a card, not for filtering) are unaffected — lookup stays local.
- `2026-05-27 18:03 UTC` — Architecture refactor: new `src/layers/l1-persistence/readers/`
  directory introduces the **Reader** pattern (per [ADR-0007](docs/adr/0007-ipc-handlers-thin-adapters.md)).
  `CourseReader` is the first; it owns all SQL touching the `courses` table.
  `VisibilityOracle` is narrowed to a pure visibility-state oracle — its
  row-returning methods (`getVisibleCourses`, `getVisibleTasks`,
  `getVisibleIncompleteTasks`, `getArchivedCourses`) are removed (they had no
  production callers). `data:getCourse` and `data:getArchivedCourses` IPC
  handlers also migrated to the new pattern (thin adapter → Oracle + Reader
  - `courseMapper`). Subsequent PRs (C..N of ADR-0007) migrate the other
    handler families one at a time.

### Added

- `2026-05-28 05:34 UTC` — **ADR-0007 enforcement** — final PR of the migration train. New Jest fitness function `tests/integration/ipc-handlers-no-raw-sql.test.ts` walks `src/lifecycle/ipc-handlers/**` and fails if any file's raw-SQL violation count exceeds the per-file ceiling in `.adr-0007-handler-sql-ceiling.json`. Strategy is **ratchet**, not all-or-nothing — the 5-PR migration train (PR-B/C/D/E/F.3/H) shipped 4 of 19 handler files clean; the remaining 15 have a snapshot ceiling so **no new `database.execute*` / `database.upsert` calls** can land. Removing a call requires decrementing the ceiling in the same PR (exact-match, not ≤). Fully-migrated files have their entry removed and stay locked at zero. ADR-0007 status flipped from Proposed to Accepted. CLAUDE.md §2 updated to point at the enforcement test and ratchet file. 3 new tests.
- `2026-05-28 04:59 UTC` — `PolicyReader` (ADR-0007 PR-H), plus the migration of `policyHandlers.ts` to use it. Stateless L1 reader for the `course_policies` table; PR-B / PR-D / PR-E pattern. Two methods: `getByCourseId` (single course, bypasses visibility per ADR-0007 α) and `getByCourseIds` (list scope; caller composes Oracle). Excludes inactive rows (`is_active = 0`) at the SQL layer. `policyHandlers.ts` now has **zero `database.execute*` calls** — both handlers route through the reader. Behavioural surface preserved verbatim. Note: `course_policies` is a zombie table per ADR-0003 (no live writers; both handlers return [] in production today). Migration closes the ADR-0007 raw-SQL violation regardless. 14 new tests (7 reader + 7 handler integration).
- `2026-05-28 04:50 UTC` — `NotificationReader` (ADR-0007 PR-E), plus the migration of `notificationDataHandlers.ts` to use it. Stateless L1 reader for the `notifications` table; PR-B / PR-F.2 / PR-D pattern. Three methods: `getById` (single-id, bypasses visibility), `getByCourseId` (one course, no visibility filter — matches legacy archived/hidden-course view behaviour), `getByCourseIdsIncludingSystem` (list-scope, always includes `course_id IS NULL` system notifications regardless of the visible-course set). `notificationDataHandlers.ts` now has **zero `database.execute*` calls** — all 3 handlers route through the reader. Behavioural surface preserved verbatim — visibility composition, system-notifications-always-included contract, and `published_at DESC` ordering all unchanged. 23 new tests across the reader and handler integration suites.
- `2026-05-28 04:35 UTC` — `TaskReader` + `CanvasTaskQueueReader` (ADR-0007 PR-D), plus the migration of `taskDataHandlers.ts` to use them. Two stateless L1 readers for the `tasks` and `canvas_task_queue` tables, both following PR-B / PR-F.2's pattern (snake_case rows out, no visibility filtering — caller composes via `VisibilityOracle`). TaskReader: `getById` / `getByCourseIds` (with optional `includeDeleted`) / `findUnlinkedUserTasksInCourse` (merge-candidate set for the queue duplicate-warning flow) / `getAll` (debug only). CanvasTaskQueueReader: `getByCourseIds` (default order `due_at ASC, first_seen_at ASC` — urgency first) / `countByCourseIds` (with optional `status`) / `getAll` (debug only). `CourseReader.getAll` also added for the debug-handler use case. Re-exported from `src/layers/l1-persistence/index.ts`. `taskDataHandlers.ts` now has **zero `database.execute*` calls** — all 13 handlers route through L1 readers or L4 commands (the existing `DeleteTaskCommand({force:true})` covers the `debug:forceDeleteTask` path, which previously open-coded a hard DELETE; folding it in also cleans up dangling `link_suggestions`). The behavioural surface is preserved verbatim — `data:getTasks` still applies visibility, `data:getTasksForArchivedCourse` still includes soft-deleted rows, `data:getTaskQueue` still defaults to `status='pending'`, `data:checkQueueDuplicates` still returns the same exact/fuzzy results from the same candidate set (the case-insensitive exact match moved from SQL to JS over the reader's returned rows; semantics unchanged). 44 new tests across the readers and the handler integration suite.
- `2026-05-28 04:09 UTC` — Three forward-facing FileEntity IPC channels (ADR-0008 PR-F.3): `data:getFileEntity(canvasId)`, `data:getFileEntitiesByCourse(courseId)`, `data:getFileEntitiesForVisibleCourses()`. Exposed in preload as `window.api.getFileEntity*`. The list-scope channel composes `VisibilityOracle.getVisibleCourseIds()` per ADR-0007; single-id and single-course lookups bypass visibility (sub-decision α). `FileEntityProvider` is wired into `IpcContext` at AppLifecycle boot. Legacy `data:getFiles` / `data:getCourseFiles` still return the older `FilesData` shape (page-type and notification-title joins need PageResourceReader + NotificationReader to migrate cleanly — those land with PR-E). `data:getAttachments` migrated off raw SQL onto `AnnouncementAttachmentReader.getByNotificationId` (new method). 15 new tests (12 handler + 3 reader).
- `2026-05-28 03:42 UTC` — `FileEntityProvider` + `CanvasFileReader` + `AnnouncementAttachmentReader` (ADR-0008 PR-F.2 — ADR flipped to **Accepted**). The provider composes the two readers into the FileEntity wire shape from PR-F.1 (no backing table — synthesized at read time, keyed by Canvas File ID). API: `findByCanvasId` / `findByCanvasIds` / `findByCourseIds`. Canonical-field sourcing rule applies (`canvasFile` presence wins on filename / size / content-type disagreement); divergence is logged via the injected `ComponentLogger` so a sync bug becomes visible in `.logs/` rather than silently masked. Migration **v104** adds `idx_notification_attachments_external_id` so the per-blob lookup is `SEARCH` instead of `SCAN`. 32 new tests (10 + 8 + 14). PR-F.3 still needs to migrate `fileDataHandlers.ts` and wire Issue [#29](https://github.com/MorrisXDS/CanvasAssistant/issues/29)'s announcement-body renderer; the provider has no consumer yet.
- `2026-05-28 03:26 UTC` — `FileEntity` IPC contract type (ADR-0008 PR-F.1 — Status: Proposed). A unified read-time view of a Canvas-side file blob, keyed by Canvas File ID (`canvasId`), with canonical fields once at the top level (`filename`, `displayName`, `sizeBytes`, `contentType`, `uuid`, `courseId`) plus a `presences` record collapsing the two physical row sources — `canvasFile` (nullable; the `resources` row when present) and `attachments` (array; one entry per announcement that attaches the blob). A Zod refinement enforces "at least one presence is populated" at parse time. **Contract-only this PR** — `FileEntityProvider` and the IPC handlers that produce/consume these land in PR-F.2 and PR-F.3 respectively. Unblocks Issue [#29](https://github.com/MorrisXDS/CanvasAssistant/issues/29) (clickable announcement-body file links). CONTEXT.md updated to define the term and supersede the "same blob, two entities" open ambiguity.
- `2026-05-27 04:30 UTC` — Domain glossary at `CONTEXT.md` (repo root). ~52 canonical terms
  across 9 sections (cross-cutting states, courses, files & references, tasks & accept
  queue, announcements, sync, grades, calendar, course content) plus a "settings, coordination,
  exports, credentials" section and a zombie-schema inventory. Captures every production
  table in the schema (live and dead), 6 flagged ambiguities, the self-healing schema
  pattern, and an example dev↔domain-expert dialogue. Produced via `/grill-with-docs` and
  audited against the full migration history. Intended as input for `/improve-codebase-architecture`
  and as durable disambiguation between overloaded terms (Notification / Conflict /
  CanvasFile / etc.).
- `2026-05-27 04:30 UTC` — Matt Pocock agent-skills configuration wired up. Added
  `CLAUDE.md` §10 "Agent skills" pointing at three per-repo config files under `docs/agents/`
  (local-only): `issue-tracker.md` (GitHub via `gh`), `triage-labels.md` (5 canonical labels),
  `domain.md` (single-context layout pointing at `CONTEXT.md` + `docs/adr/`). Created the
  four missing triage labels on `MorrisXDS/CanvasAssistant`: `needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human` (the fifth, `wontfix`, was already present).
- `2026-05-27 04:30 UTC` — `docs/FOLLOWUPS.md` gained 5 investigation sections produced
  during the `/grill-with-docs` pass: Canvas file-ID stability (potential `CanvasBlob`
  unification ADR), `FileReference` table redundancy (announcement_file_references vs
  content_file_references), orphaned `policy_announcements` writes + broader L3-zombie
  schema audit, dual Task-grouping mechanism (`course_task_groups` vs `canvas_assignment_groups`),
  and `field_notification_suppressions` / `field_modifications` zombie cleanup.
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

- `2026-05-27 02:00 UTC` — Keyboard shortcuts are now modal-stack-aware (ADR-0006). Page-level
  hotkeys (Q/E section cycling, ↑↓ list nav, filter shortcuts, etc.) auto-suppress while
  any modal is open above them, eliminating the bug class where pressing a key inside a
  modal also fired the underlying page's handler. Nested modals also work correctly:
  parent modal's keymap suppresses while a child modal is on top. The `?` help menu
  surfaces the _topmost_ modal's keyboard interface in Tab 1 instead of the underlying
  page's (e.g. DuplicateWarningModal shows L/S/A/↑↓/C, Customize child shows Q/E/←→/↑↓).
  Browser default scroll on ↑/↓/PageUp/PageDown/Home/End is also suppressed while a
  modal is open so focus on a parent-modal button doesn't scroll its scrollable list
  while the user is typing into the child. Implemented via a new `ModalStackContext`
  - `<Modal shortcuts={…}>` registration + two hook wrappers
    (`useStackAwareHotkeys` for page-level, `useModalHotkeys` for in-modal). 52 sites
    migrated across `UnifiedTaskList`, `CoursesPage`, the Dashboard cluster, `CourseDetail`,
    `CanvasUpdatesSection`, and the `useFocusedItem` / `useMultiSelect` hooks. Global
    navigation shortcuts (`Mod+1..5` in `useAppShortcuts`) intentionally bypass the gate.
    Two e2e anchor tests added (help-menu-shows-modal-shortcuts; arrow-scroll-suppressed);
    deeper bug-class regression coverage tracked in `docs/FOLLOWUPS.md`.
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

- `2026-05-27 03:00 UTC` — Recovery of two TaskLinkDialog regressions from PR #23 that
  were fixed locally but never made it to `main` (fix commit landed ~8 minutes after the
  PR merge): (1) toggling the "Type" picker to "Your task" in Step 2 silently dropped
  the choice — `keepFromUser.taskType` wasn't in the merge payload, so the merge always
  picked Canvas's value regardless of user selection. (2) The "Local Tasks" candidate
  list didn't constrain its height — the two-column grid had no `maxHeight` and the
  flex columns had no `minHeight: 0`, so with many candidates the list overflowed the
  modal instead of scrolling inside its column. Cherry-picked the original fix commit
  onto its own branch and re-merged.
- `2026-05-27 02:00 UTC` — In the duplicate-warning Customize child modal, ↑/↓ now walks
  conflict fields in the visual order they're rendered (title → due date → type) instead
  of the backend's `computeConflictingFields` order (due date → title → type). Pre-existing
  bug from PR #16 — the field-walk indexed into `editingConflictFields` directly, so the
  highlight moved correctly idx-wise but appeared visually flipped because the backend's
  array order didn't match the renderer's FIELD_DEFS order. `editingConflictFields` is now
  sorted to FIELD_DEFS order before being indexed.
- `2026-05-27 02:00 UTC` — `KeyboardShortcutsModal` (the `?` help) now opens at
  `zIndex={1500}` instead of the primitive default `1000`, so it always sits above any
  other modal it's invoked from (DuplicateWarningModal=1100, its Customize child=1200,
  ConfirmDialog=1100). Previously the help was buried under the modal it was supposed to
  describe.
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
