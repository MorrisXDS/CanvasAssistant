# Changelog

All notable changes to CID are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); this project is pre-1.0 and not yet
shipping versioned releases, so changes accrue under **Unreleased** until a release is cut.

> Maintenance note: keep entries human-meaningful (what changed and why it matters), not a
> commit dump. `git log` is the exhaustive record; this file is the curated summary.
> Each entry includes the UTC timestamp when the change landed.

## [Unreleased]

### Added

- `2026-06-07 19:21 UTC` — **Due-date reminders and grade alerts are now real.** When "Due date
  reminders" is on, an hourly background scan sends a desktop notification for any incomplete
  assignment in a visible course that is due within 24 hours (deduped — you won't be re-pinged
  for the same due date). When "Grade alerts" is on, a single batched notification ("N new grades
  posted") fires after a sync posts new grades. Both honor the battery-power quiet setting and
  flow through the same suppression seam (ADR-0016).

- `2026-06-07 19:21 UTC` — **Notification settings groundwork: a single suppression seam.**
  Every desktop notification now funnels through one show seam in `CanvasClientManager`
  gated by a pure, unit-tested `shouldSuppressNotification` predicate. "Pause notifications
  on battery power" is now real — when the toggle is on and you're unplugged, notifications
  are suppressed (ADR-0016).

### Removed

- `2026-06-07 19:21 UTC` — **Dropped two un-implementable notification toggles + a dead
  setting.** Removed `quietWhenFullscreen` (Electron can only detect our own window, not a
  foreign fullscreen app) and `quietWhenBusy` (no portable Do-Not-Disturb API) from the
  Notifications settings — they were dead toggles. Also removed the vestigial `aiConfig`
  setting end-to-end (leftover from the removed L3 AI layer, ADR-0003). All localStorage-only,
  so no migration — old saved values are simply ignored.

- `2026-06-06 07:57 UTC` — **Grade history across past terms.** The dashboard Grade Breakdown
  modal now groups your current courses by term (overlap-safe: two concurrently-running terms
  stay separate) and adds a collapsible **Past terms** section — archived courses grouped by
  term (newest first, per-term average) plus a **credit-weighted cumulative** across all past
  terms. The Courses-page Archived drawer is likewise grouped into collapsible per-term
  subgroups (term name + per-term average + count; Restore preserved). Grades are task-derived
  (not the unused `current_grade`), and the past-terms breakdown is computed entirely main-side
  (`data:getPastTermGrades`) so archived tasks never cross IPC into the visible store
  (ADR-0015).

### Changed

- `2026-06-06 07:57 UTC` — **Just-finished courses no longer vanish from your average early.**
  Auto-archive and the "auto" term filter now share one 30-day linger buffer (`TERM_END_BUFFER_DAYS`),
  so a course stays visible until ~30 days after its term ends — enough for final grades to
  post — then archives, instead of being yanked out of the dashboard average the moment the
  term ended (ADR-0015). Also fixes a latent term-JOIN bug that could mis-group the archived
  course list.

- `2026-06-06 05:33 UTC` — **Course cards on the Courses page are now sensibly sized.** Cards
  scale at a 4:3 aspect-ratio of their (responsive) width and rows pack to the top, instead of
  a sparse grid (e.g. a single course) stretching one card to fill the entire page. Long course
  names still grow the card rather than clipping.

- `2026-06-06 03:35 UTC` — **Unified the app name to `canvas-assistant` with a fail-safe
  first-run data migration** (ADR-0014, targets v1.1.4): the internal npm `name` is now
  `canvas-assistant` (brand `Canvas Assistant` and bundle id `com.canvasassistant.app`
  unchanged). Because the name drives the per-user data directory, a one-time, fail-safe
  migration relocates your existing data dir on first launch after upgrade so **no install
  loses its database, settings, or saved credentials** (atomic move with a cross-device
  copy-then-verify fallback; never merges into or clobbers an existing dir; leaves the old
  dir intact if anything fails). Also fixes the Linux `apt remove` package name and the
  Windows uninstaller-filename lookup, and makes `.deb` upgrades cleanly supersede the old
  `canvas-integration-dashboard` package.

### Fixed

- `2026-06-07 23:43 UTC` — **New Canvas announcements now appear in the Updates feed and
  notification badge.** The sync commit phase checked whether an announcement was already stored
  using `source_type='announcement'`, an impossible value — the `notifications` table CHECK
  constraint only allows `'canvas'` or `'system'`, and `mapAnnouncement` stores them as `'canvas'`.
  So the existence check always returned null, the "new announcement" branch was never entered, and
  `recordSyncUpdate` never fired — new announcements were silently dropped from the Updates feed,
  unseen-updates dot, and badge count. Fixed both predicates in `SyncCommitPhase` to `'canvas'`;
  re-syncing the same announcement remains idempotent (no duplicate updates recorded).

### Added

- `2026-06-06 04:13 UTC` — **Added Linux `.rpm` (Fedora/RHEL/openSUSE) and `pacman`
  (`.pacman`, Arch/Manjaro) install targets** alongside the existing `.deb` + AppImage
  (targets v1.1.4). The in-app uninstall dialog now detects how the app was installed (by
  asking `dpkg`/`rpm`/`pacman` which one owns the running binary) and shows the matching
  removal command (`sudo apt remove` / `sudo dnf remove` / `sudo pacman -R`), falling back to
  a safe default when no package manager claims it. README gains install instructions for both
  new formats.

- `2026-06-06 03:30 UTC` — **Deferrable re-auth with app-wide sync gating** (ADR-0013, frontend):
  the Canvas "token expired" prompt now has a **Later** button — defer reconnecting and keep
  using the app with your imported data. While re-auth is deferred, **every Sync button is greyed
  out app-wide** (Dashboard, Files) with a tooltip pointing back to reconnect, and the Dashboard
  sync button re-opens the prompt. The Settings → Account badge is now three-state: **Connected**,
  **Token Expired** (with a Reconnect button), or **Offline** ("last checked …"). A successful
  reconnect re-enables sync automatically.

- `2026-06-06 02:10 UTC` — **Offline-safe Canvas auth + deferrable re-auth** (ADR-0013, backend):
  Canvas token validity is now **tri-state** (valid / invalid / unknown). Being **offline no
  longer invalidates a good token** — only a real 401/403 (revoked / no access) does; a network
  failure, timeout, or server error keeps you signed in. The renderer also learns token validity
  at startup via a new race-free `auth:getStatus` pull (plus a window-ready replay), so a revoked
  token correctly prompts re-auth instead of landing on a dead dashboard. (Frontend gating + the
  "Later" re-auth flow land in the next entry.)

- `2026-06-06 00:36 UTC` — **Opt-in update channel** (ADR-0012): a new Settings → Updates
  section lets you enable automatic background checks against GitHub Releases on a chosen
  interval (daily / weekly / on launch only). When a newer version is found, a notice
  appears with a **compatibility verdict** — a major-version bump is flagged as potentially
  breaking (forward-only DB migrations mean there is no rollback after updating). Notify-
  first only; no silent install (builds are unsigned). Off by default — no outbound network
  until you opt in.

### Changed

- `2026-06-05 22:23 UTC` — **Windows uninstaller now asks two separate keep/delete choices** instead of one
  all-or-nothing prompt: (1) keep your **downloaded course files** and (2) keep your
  **settings & data** (app settings + local database + saved Canvas sign-in). Each is
  independent; default is keep. Also **fixed** the downloads cleanup path — it targeted the
  install dir but packaged builds store downloads under `Documents\CanvasAssistant\Downloads`
  (via `MyDocuments`, so it respects a redirected/OneDrive Documents), so the real files were
  never removed before.

### Fixed

- `2026-06-07 00:00 UTC` — **Sync now honors the Sync-files / Sync-announcements toggles (were
  persisted but ignored).** The two Settings switches were saved to `syncPreferences` but never
  read back, so turning either off had no effect. `SyncEngine.syncAll` now folds the persisted
  setting into the fetch options (explicit per-call option wins; the setting fills unset keys;
  default stays on), so both manual and auto-sync skip files/announcements when toggled off.
- `2026-06-06 05:09 UTC` — **Settings → Updates: the "Check now" button is no longer cut off.**
  Accordion sections pin their height for the expand animation and measured it only once; the
  Updates section loads its data asynchronously and grows from a short loading state to its full
  height after that measurement, so its last control was clipped by the section's `overflow:
hidden`. The Accordion primitive now re-measures via a `ResizeObserver` when its content
  resizes, so any async-growing section expands to fit.

- `2026-06-06 02:34 UTC` — **App now exits cleanly on Linux.** On some Linux setups (no/limited GPU
  acceleration or a sandboxed/systemd-managed session) a wedged GPU/utility child process kept the
  main process alive after the window closed, so the app never fully quit and had to be killed with
  Ctrl+C. Shutdown now force-terminates after all cleanup has completed (background services stopped,
  pending downloads saved, database closed, logs flushed), making exit deterministic across platforms.

### Removed

- `2026-06-05 21:03 UTC` — **Repo cleanup: dropped redundant tracked files.** `SETUP.md` (superseded by the
  README "Build from source" + `CONTRIBUTING.md`, and stale on Node version);
  `scripts/seed-duplicate-test.js` (superseded by the shared `e2e/fixtures/seedDuplicateWarning.js`);
  three unreferenced one-off dev probes (`scripts/test-canvas-api.ts`,
  `scripts/test-canvas-timezone.ps1`, `scripts/test-notification-dots.ts`); and four unused
  image assets (`assets/image copy.png`, `day.png`, `icon.png`, `icon.ico` — the build uses
  `app.ico` + `app.iconset/*`).

### Docs

- `2026-06-05 21:38 UTC` — **Added `docs/USER-GUIDE.md`** — a page-by-page user walkthrough (Dashboard,
  Calendar, Courses, Course Detail, Files, Tasks, Announcements, Updates, Settings) focused
  on workflows + non-obvious behaviors, deferring exact shortcuts to the in-app `?` help so
  it can't drift. Published like the other docs; linked from the README Features section.

- `2026-06-05 20:46 UTC` — **README: added a "Build for production" section** (compile + `npm run package`
  per-platform + the `v*`-tag release flow) and **removed the Project status and Author
  sections.**

- `2026-06-05 20:37 UTC` — **Added `docs/ARCHITECTURE.md` + `CONTRIBUTING.md`.** ARCHITECTURE
  is a holistic tour (7-layer stack, process/IPC model, sync data flow, persistence, the
  course-visibility invariant, and the fitness-function tests that enforce the rules) that
  ties the published ADRs together; published via `.gitignore` like the ADRs/TESTING guide.
  CONTRIBUTING covers setup, the native-ABI footgun, the PR gates, conventions, and the
  light-maintenance status. README now links both.

- `2026-06-05 20:10 UTC` — **Regenerated the README screenshots from synthetic demo data**
  (no real Canvas account / personal info). Added a realistic demo seed
  (`e2e/fixtures/seedDatabaseDemo.js`) + a `screenshots` Playwright project + a
  `capture:screens` script that launches the seeded app and captures all five page
  screenshots into `assets/screenshots/`. Replaces the previously-masked real-data images.

- `2026-06-05 19:50 UTC` — **Rewrote the root `README.md`** (product + portfolio framing:
  hero, features, keyboard-first section, tech stack, 7-layer architecture, testing) and
  **published the ADRs + testing guide** to the repo. `docs/` was a nested local-only git
  repo; un-nested it so `docs/adr/` (11 ADRs) and `docs/TESTING.md` are now tracked and
  linkable from the README, while `CLAUDE.md` and the internal docs (FOLLOWUPS, handoffs,
  agent notes) stay gitignored/private. Corrected stale feature claims against the code
  (notably: the Dashboard queue is a triage queue, not a priority-ranked list — the
  intelligence layer was removed in ADR-0003).

### Added

- `2026-06-05 19:23 UTC` — **e2e sync-pull spec (`--project sync`) + mock Canvas endpoint.**
  A new `sync-current-term.spec.ts` exercises the real `syncCourses()` IPC against a mock
  Canvas that serves one course with a current enrollment term — proving the sync→visibility
  pipeline works end-to-end without a real Canvas account. Runs under a separate Playwright
  project (`npm run test:e2e:sync`) so the default 40-spec deterministic-seed suite stays
  clean. Also added `.codex/`, `AGENTS.md`, `.jest-cache/` to `.gitignore`.

### Changed

- `2026-06-05 02:45 UTC` — **e2e suite now runs against a deterministic generated seed —
  portable and skip-free.** The suite no longer copies the dev machine's real `canvas.db`
  (which made it non-portable to a fresh clone and let data drift silently erode coverage via
  data-tolerant `test.skip`). Instead a Playwright `globalSetup` builds the schema once from an
  empty DB via the app's own migrations + runtime self-heal (launching the built app against an
  empty cwd, polling `schema_version` to the final migration), then each test copies that schema
  template and INSERT-seeds a fixed known dataset through an Electron-as-Node subprocess (one
  unified seed lib, sharing the duplicate-warning matrix). Every data-tolerant `test.skip`
  became a hard precondition assertion, enforced going forward by a custom skip-guard reporter
  that fails the run on any unexpected skip. Verified locally: 33/33 specs pass, 0 skipped,
  deterministic across 4 runs; portability proven by renaming the real `canvas.db` aside and
  running the full suite green (real DB restored intact by checksum). Test-infra only; no
  `src/**`, schema, or IPC impact; e2e stays local-only (off CI). See ADR-0011.

### Added

- `2026-06-05 16:14 UTC` — **e2e coverage breadth — visibility invariant, the two remaining
  ADR-0006 deep modal-stack specs, calendar CRUD, and conflict rendering.** Five new specs on the
  deterministic seed (ADR-0011): an end-to-end **course-visibility invariant** check (a hidden
  course D and an archived course E are absent from `getCourses()` and the Courses grid but E
  surfaces in `getArchivedCourses()`, and tasks on D/E are filtered out of the visible task set —
  the `courseDataHandlers` hidden/archived/term-filter bug class CLAUDE.md §2/§8 names by name);
  the **two deferred ADR-0006 modal-stack specs** — nested Customize-child key-leak (a child-owned
  key is handled by the child with both modals still stacked and the page two layers down
  un-cycled) and `useModalHotkeys` AND-composition (a `when`-gated + stack-gated parent key fires
  only when its predicate is true AND it is topmost); a **calendar event create→read-back→delete**
  round-trip via the stable calendar IPC (+ `n` opens/Escape closes the EventFormModal); and an
  **updates-conflict** render spec asserting a seeded `sync_updates` conflict row renders a
  `ConflictItem`. Adds one isolated conflict row + the D/E courses/tasks to the seed (named-column
  inserts, isolated to non-visible courses so the pre-existing suite is unperturbed). Suite 33→40
  tests across 21 spec files, still **0 skips** (skip-guard enforced); deterministic across two
  full local runs. Test-infra only; no `src/**`, schema, or IPC impact; e2e stays local-only (off
  CI). Under the already-Accepted ADR-0011 strategy.

- `2026-06-05 01:58 UTC` — **e2e harness now captures failure diagnostics and runs an HTML
  report.** On a failing spec the Electron fixture stops + saves a Playwright trace
  (`trace.zip`) and a screenshot, both attached to the run and written under `test-results/`
  (gitignored) — making local e2e failures debuggable without a re-run. Green runs leave no
  artifacts (tracing stops without saving), so there's no disk bloat. Also adds the `html`
  reporter (`open: 'never'` → `playwright-report/index.html`) and `forbidOnly: !!process.env.CI`
  as a stray-`.only` guard, and removes a dead `duplicateSeed` fixture key from the default
  (un-seeded) fixture path. Test-tooling only; no `src/**`, schema, or IPC impact; e2e stays
  local-only (off CI). Verified: 33/33 e2e green twice locally and failure-artifact capture
  confirmed on a forced failure.

- `2026-06-05 01:29 UTC` — **Expanded the local e2e suite from 20 to 33 specs — route-coverage gaps,
  mutation round-trips, and deep ADR-0006 modal-stack regressions.** Three batches: (1) **route-gap
  specs** for previously-uncovered pages — Dashboard, Files, Settings, Announcement Detail — plus
  **global page-navigation** (`Mod+1..5`) and **uniform `Alt+1..N` section-jump** coverage; (2)
  **mutation flows with IPC read-back** — add-task, archive-course, and change-a-setting all assert
  the write actually persisted via a follow-up read, not just an optimistic UI flip; (3) the
  **deep modal-stack page-leak / scroll-suppression specs (ADR-0006 specs 1 & 3)** that the bug-class
  needed but couldn't have without a deterministic seed — landed on a new shared
  `e2e/fixtures/seedDuplicateWarning.js` Electron-as-Node seed library (the duplicate-warning matrix
  extracted from `scripts/manual-test-duplicate-warning.js`, which now consumes the same lib so the
  manual-test path and the e2e fixture share one source of truth). Also hardens a pre-existing flaky
  one-shot `textContent()` assertion in `e2e/modal-stack.spec.ts` to a retrying `toHaveText(...)`.
  Verified green locally — **33/33 passed, 0 skipped, deterministic across two real runs** on this
  Windows machine; e2e stays local-only (off CI per repo convention), so the green is from the local
  run, not CI. Test-only change; no `src/**`, schema, or IPC impact.

- `2026-06-04 18:39 UTC` — **Standing CI guard against new raw `useHotkeys` (ADR-0006 step 3).**
  Added `tests/integration/no-raw-usehotkeys.test.ts`, a fitness function that fails the suite
  if any `src/layers/l6-ui/**` file imports `useHotkeys` as a VALUE from `react-hotkeys-hook`
  outside a tiny `why:`-justified allowlist (the sanctioned wrapper + the intentional-global
  `Mod+1..5` page-nav) — permanently closing the document-level keystroke-leak class by forcing
  every new page/modal consumer through the stack-aware wrappers. Test-only; no production
  behavior change. Type-only imports are correctly not flagged.

- `2026-06-04 03:48 UTC` — **Updates page row-navigation now also accepts `W`/`S` and `↑`/`↓` as
  aliases for the existing `J`/`K` (and `←`/`→`), aligning it with the app-wide row-nav
  convention.** `J`/`K` still work — this is additive, so there is zero muscle-memory break.
  Implemented via a new opt-in `bindBothNavAxes` flag on the shared `useFocusedItem` hook
  (default off); all 11 other consumers are byte-for-byte unchanged. The `?` help registry now
  honestly lists every alias for both directions.

- `2026-06-03 22:02 UTC` — **Section-navigation foundation (no-op infra, ADR-0010 Phase 0).**
  Added a reusable `useSectionScope` hook (`Q`/`E` cycle + uniform `Alt+1..N` direct-jump to the
  Nth available section + re-scope-on-unavailable + broadcast to `KeyboardScopeContext`), a
  presentational `SectionBar` indicator primitive, a backward-compatible `activeSections`
  extension to `KeyboardScopeContext`, and a "This page's sections" block in the `?` help modal
  (dormant until a page sets it). **No page is migrated and nothing changes visually** — this PR
  only ships the building blocks for the uniform in-page section-navigation scheme; CourseDetail /
  Calendar / CoursesPage keep their current inline keymaps untouched, and the Calendar `Alt+1-9`
  course-filter rebind is deferred to Phase 2. See `docs/adr/0010-section-nav-direct-jump-modifier.md`.

### Changed

- `2026-06-04 19:42 UTC` — **De-duplicated the section-nav `Alt+1..N` rows in the `?` Help
  modal — the dynamic "This page's sections" block is now the sole source.** The Calendar,
  Courses, and Course Detail static `Alt+1`/`Alt+2`/`Alt+1–N` "jump to section" rows in the
  keyboard registry were listed a second time by the live `useSectionScope` broadcast, so Help
  showed each section-jump shortcut twice. Removed the static duplicates; the dynamic block
  (which names each AVAILABLE section with its current slot) loses no information and is strictly
  more accurate on Course Detail. The Calendar event-form `Alt+1`/`Alt+2` rows and the
  `Alt+Shift+1..9` course-filter row are unrelated and untouched.

- `2026-06-04 01:01 UTC` — **CoursesPage now uses the shared section-nav scheme — completes the
  ADR-0010 rollout (Phase 3 + codification).** CoursesPage joins the uniform in-page section-nav
  scheme: `Alt+1` jumps to the Courses grid, `Alt+2` to the Filter panel (while it is open), and a
  `SectionBar` indicator appears below the header once the filter panel is open (click a chip to
  jump). Pressing `F` now both opens AND focuses the filter panel. No rebind was needed here — only
  `Alt+Shift+*` quick-filters exist on this page, so plain `Alt+1`/`Alt+2` were already free
  (unlike Calendar, which had to move its course-filter toggle). `Q`/`E` stay owned by the filter
  panel's in-panel section walk (`enableCycle: false`). Internally CoursesPage keeps its two
  per-scope `useKeymap` keymaps but now mirrors the shared `useSectionScope` `active` state as the
  single source of truth (one-directional bridge); the keymaps are otherwise unchanged. This is the
  **third and final** sectioned-page migration: the pattern is now codified as a CLAUDE.md §2
  invariant ("Section navigation for multi-section pages") and **ADR-0010 is flipped
  `Proposed → Accepted`** (the target scheme is now the realized scheme across CourseDetail,
  Calendar, and CoursesPage). See `docs/adr/0010-section-nav-direct-jump-modifier.md`.

- `2026-06-04 00:27 UTC` — **Calendar now uses the shared section-nav scheme + course-filter
  shortcut rebind (ADR-0010 Phase 2).** Calendar joins the uniform in-page section-nav scheme:
  `Alt+1` jumps to the Calendar grid, `Alt+2` to the Filter panel (while it is open), and a
  `SectionBar` indicator appears below the header once the filter panel is open (showing which
  section keyboard input drives; click a chip to jump). Pressing `F` now both opens AND focuses the
  filter panel. **One-time muscle-memory change: the course-filter toggle moved from `Alt+1..9` to
  `Alt+Shift+1..9`** to free plain `Alt+1..9` for section navigation — plain `Alt+1..9` no longer
  toggles a course filter. (Internally, Calendar keeps its two intricate per-scope keymaps via
  `useKeymap` but now mirrors the shared `useSectionScope` `active` state as the single source of
  truth; the events keymap is otherwise unchanged.) `Q`/`E` are intentionally NOT bound to section
  cycle on Calendar — they remain owned by the grid (prev/next day column, edit event). See
  `docs/adr/0010-section-nav-direct-jump-modifier.md`.

- `2026-06-03 23:07 UTC` — **CourseDetail now uses the shared section-nav scheme (ADR-0010 Phase 1).**
  Replaced CourseDetail's hand-rolled `sectionFocus` state machine (local `useState` + a `cycleSection`
  callback + a re-scope effect + page-level `Q`/`E` bindings) with a single `useSectionScope` call.
  Users now see a visible `SectionBar` indicator below the course header (rendered only when more than
  one section is available) showing which section keyboard input is driving, can click a chip to jump,
  and gain `Alt+1..N` direct-jump to the Nth available section on top of the existing `Q`/`E` cycle.
  `E` still edits the focused task while the Tasks section is active (the hook suppresses its forward
  cycle there). First real consumer of the section-nav foundation shipped in Phase 0.

- `2026-06-03 21:17 UTC` — **Fixed page-scoped keyboard help on Course-Detail / Announcement-Detail
  and made Announcement-Detail nav modal-aware.** Fixed a pre-existing `getScopeForPath` trailing-slash
  bug: the `/course/` and `/announcement/` route-scope keys carried a trailing slash that broke the
  sub-path match, so `/course/:id` and `/announcement/:id` always resolved to `null` and the `?` Help
  modal showed only global shortcuts on those two pages — it now resolves and shows their page-specific
  sections. Migrated Announcement-Detail's keyboard nav (↑/W·↓/S scroll, V view-on-Canvas) from a raw
  `document` keydown listener to the centralized `useKeymap` hook, so it now respects the ADR-0006
  modal-stack gate (keys no longer fire over an open modal); behaviour otherwise unchanged. Relabeled
  the Settings-scope Esc help entry from `'Clear search, then close'` to the honest `'Close'`, and
  removed three unimplemented Dashboard help entries (`` ` `` switch-row, `Tab` cycle-lists,
  `Shift+Tab` cycle-backward). Zero change to any working shortcut's behaviour.
- `2026-06-03 20:22 UTC` — **Consolidated the duplicate `app_settings` settings table into
  `user_preferences`; dropped the duplicate.** `app_settings` (v75) and `user_preferences` (v7)
  had structurally-identical key-value schemas with disjoint keys; `app_settings` existed only to
  hold backup config (`exportSchedule`, `backupEncryptionPassword`). Migration 112 copies those two
  rows into `user_preferences` (reversible `down`) and drops `app_settings`. Deleted
  `AppSettingsReader` / `SetAppSettingCommand` / `DeleteAppSettingCommand` (added
  `DeleteUserPreferenceCommand`); repointed the backup-schedule IPC handler and `BackupManager` at
  the `UserPreferences*` reader/commands. `exportSchedule` is now unambiguously SQL-authoritative —
  removed its latent `localStorage` write path from `SETTINGS_DEFAULTS`/`SETTINGS_SCHEMAS` (the
  Settings UI already read/wrote it via the `backup:getSchedule`/`backup:setSchedule` IPC). Removed
  the dead `settings:getCanvasTimezone` read route + preload binding (the active timezone _writer_
  is untouched, deferred to FOLLOWUPS). Removed the now-stale `DELETE FROM app_settings` line from
  the reset path. CLAUDE.md §8 updated to a two-store boundary. One settings table, one
  reader/command family, no dual-store.
- `2026-06-03 07:10 UTC` — **Keyboard-shortcuts help is now accurate.** Five registry fixes so the
  Help modal matches what the app actually does (zero key-behaviour change): added the missing `C`
  (Customize merge fields) key + aligned the `A` label in the duplicate-warning section; removed two
  dead Calendar entries (`Shift+W`/`Shift+S` and a phantom filter-panel `Enter`) that documented
  behaviour the keymap never had; documented `Backspace` as the existing delete alias on Calendar and
  CourseDetail. Rebinds + implement-vs-remove items (Announcement-Detail scope, Settings Esc, Dashboard
  row-nav, Updates J/K→W/S) are parked for review.
- `2026-06-03 05:33 UTC` — **Centralized straggler storage keys and color maps into existing modules** — the final safe chunk of the hardcoded-values audit. Three groups of literals that pre-dated or were missed when the centralized modules were first built are now routed through their single source of truth: (1) `syncSlice.ts` `'timezoneSettings'` → `STORAGE_KEYS.TIMEZONE`; (2) inline hex color maps in `NotificationDot.tsx` and `FileListItem.tsx` relocated to named exports (`UPDATE_TYPE_COLORS`, `UPDATE_TYPE_FALLBACK_COLOR`, `CONTENT_CATEGORY_COLORS`, `DEFAULT_COURSE_COLOR`) in `src/layers/l6-ui/constants/colors.ts`; (3) eight drag-drop/files `localStorage` key constants spread across five hooks and two utils files added to `STORAGE_KEYS` with byte-identical string values (no persisted-state reset). The `SettingsTypeMap` was extended for the new keys — reviewed and confirmed runtime-inert (read-only cache load, no schema, no default, no write). Zero behavior change throughout; all string values are verbatim copies of the literals they replace. Closes the user-approved scope of the hardcoded-values audit (Cat 5 hex→theme-vars + Cat 6 date formatters remain descoped).

### Removed

- `2026-06-04 05:39 UTC` — **Dead L3 `Constants.ts` + dead `getUrgencyColor` formatter (no
  behaviour change).** Deleted `src/layers/l3-intelligence/domain/Constants.ts` (389 lines) — all
  17 of its exported constants (`HOURS`, `MS`, `DAY_NAMES`, effort/workload/weight/insight/
  recommendation/behavior thresholds, task-type sets, `ORCHESTRATOR_DEFAULTS`, `GRADE_THRESHOLDS`)
  became zero-consumer after the L3 priority/ROI/policy/recommendation systems were removed
  (ADR-0003); the surviving Calendar `HOURS` is an unrelated local constant. Removed its two barrel
  re-export blocks (`l3-intelligence/index.ts`, `domain/index.ts`) and the now-stale catalog entry
  in CLAUDE.md §8 + `.claude/rules/centralized-modules.md`. Separately deleted the unused
  `getUrgencyColor` export in `formatters/fieldFormatters.ts` (its would-be consumer `TaskItem.tsx`
  uses its own local copy) and its two re-export lines. `getUrgencyLevel` (a tested sibling export)
  is unaffected.

- `2026-06-04 04:30 UTC` — **Two dead-code cleanups (no behaviour change).** (1) Removed the
  unreachable `CalendarGridContext` event-detail quick-view path — `renderDetailModal()`, the
  `detailModal`/`setDetailModal`/`DetailState` state, the `onEventClick`-absent `else` branch in
  `handleEventClick`, and the three `{renderDetailModal()}` call sites in Month/Week/Day views. The
  sole `<CalendarGrid>` consumer always passes `onEventClick` (clicks route to `TaskDetailModal`),
  so this branch never fired in production; `handleEventClick` now simply delegates to the prop.
  Also dropped the now-orphaned detail-modal-only styles. (2) Removed the dead
  `ExportSchedule.destination` field (backups always target `BACKUP_DIR`; nothing read it) from the
  zod schema, `DEFAULT_EXPORT_SCHEDULE`, the `preload` IPC contract types, and the Settings
  `BackupScheduleSection` interface/default. Parse-safe — the schema is never `.parse()`d for
  persisted schedules and `z.object()` strips unknown keys, so a stored schedule with a stale
  `destination` key keeps working.

- `2026-06-04 02:11 UTC` — **Dead write-only `canvasTimezone` SQL path.** The
  `settings:syncCanvasTimezone` IPC handler wrote a `canvasTimezone` row into `user_preferences` on
  every full sync, but nothing read it — its read route (`settings:getCanvasTimezone`) was removed in
  migration 112's PR, and the live Canvas timezone is mirrored to `localStorage` (read by
  `useSettings`' timezone cascade). Removed the handler, the `preload` binding, and the now-orphaned
  `api.syncCanvasTimezone(...)` call in the L5 syncSlice; the localStorage mirror (the live path) is
  untouched. Migration 113 deletes the stale row. No user-facing behaviour change — the timezone
  cascade (userOverride → canvasTimezone → local) is unaffected.

### Fixed

- `2026-06-06 00:55 UTC` — **Fixed a Linux startup crash: downloaded files now go to a user-writable
  location on every packaged platform.** `FILES_DIR` resolved to the install dir on
  Linux/Windows (only macOS used Documents); on a Linux `.deb` that's `/opt/<App>` (root-owned)
  → `mkdir` EACCES in the `FileDownloadManager` constructor → the app crashed at launch.
  Packaged builds now write to `~/Documents/CanvasAssistant/Downloads` on all OSes (dev keeps
  Downloads next to the app). Also hardened: a non-writable downloads dir no longer crashes
  startup — it's logged and retried lazily per download.

- `2026-06-05 22:53 UTC` — **Sidebar no longer shows "Not Synced" after a successful sync when all courses are
  hidden/archived.** The status was derived only from VISIBLE courses, so an account with
  every course hidden or archived (e.g. after graduating) read 0 synced courses → "Not Synced"
  despite a real sync. Now it also honors the store-level `lastSyncedAt` (logic extracted to a
  unit-tested `resolveLastSync` helper).

- `2026-06-05 00:04 UTC` — **e2e suite: corrected a stale Calendar keyboard spec + closed the
  type-check blind spot that let it rot.** `e2e/calendar-keyboard.spec.ts` still asserted that
  plain `Alt+1` toggles a course filter, but ADR-0010 / #114 moved that to `Alt+Shift+1` and
  reserved `Alt+1..N` for `useSectionScope` section direct-jump — so the spec would have failed on
  next run. Fixed the binding and added a companion spec asserting plain `Alt+1` has no filter side
  effect. Root cause: `e2e/**` is excluded from both tsconfigs, so no `tsc` ever checked it — added
  `tsconfig.e2e.json` + a `typecheck:e2e` npm script (local-only; deliberately not wired into CI,
  since the rest of `test:e2e` needs Electron + a populated DB). The new gate immediately caught two
  pre-existing unsafe `window as {…}` casts (`smoke`/`calendar` specs) — fixed to the safe
  `as unknown as` form the other specs already use. Also refreshed `e2e/README.md` Coverage to list
  all 8 specs. e2e is local-only; no CI/runtime behavior change.

- `2026-06-04 19:42 UTC` — **`Alt+digit` / `Alt+Shift+digit` shortcuts now fire on macOS and
  international glyph-composing keyboard layouts.** Both the `useSectionScope` section direct-jump
  (`Alt+1..N`) and the Calendar course-filter toggle (`Alt+Shift+1..9`) read the pressed digit
  with `parseInt(e.key)`, which returns `NaN` when Option/Alt composes the digit into a
  typographic glyph (e.g. `¡`, `›`) — so the shortcut silently no-op'd on those layouts. Added a
  layout-independent fallback to the physical key via `e.code` (`Digit1`/`Numpad1`) at both sites,
  consulted only when `e.key` is not a plain digit so standard QWERTY is byte-for-byte unchanged.
  A glyph with no recoverable `e.code` still no-ops (no behavior regression).

- `2026-06-04 05:39 UTC` — **Dashboard row-navigation shortcuts were missing from the `?` Help
  registry.** PR #111 removed the Dashboard backtick / `Tab` / `Shift+Tab` row-nav entries from the
  keyboard registry as "unimplemented", but they are genuinely implemented and working in
  `Dashboard.tsx` — so the Help modal silently omitted 3 working shortcuts. Re-added accurate
  entries: `` ` `` switches between the top (stats) and bottom (lists) row; `Tab` cycles stat cards
  on the top row / cycles lists on the bottom row; `Shift+Tab` cycles backward. Registry-only
  honesty fix — no runtime behaviour changed.

- `2026-06-04 03:31 UTC` — **Calendar's `Alt+Shift` cross-scope shortcuts fired over open modals (ADR-0006).**
  Calendar's `Alt+Shift+D`/`Alt+Shift+P` filter cycles, `Alt+Shift+C` clear, and `Alt+Shift+1-9`
  course-filter toggles ran off a raw `document` `keydown` listener gated by a hand-maintained
  `isAnyModalOpenRef`. Migrated them to `useStackAwareHotkeys`, which natively self-gates to the
  modal stack — the shortcuts no longer fire while any modal is open, replacing the brittle manual
  ref aggregation. Behaviour is otherwise unchanged (same cycle orders, same `Alt+1-9` vs
  `Alt+Shift+1-9` separation from section direct-jump, same form-field/modifier suppression).

- `2026-06-04 03:30 UTC` — **TaskDetailModal (Calendar event detail) keystrokes leaked to the page
  and fired under stacked modals (ADR-0006).** The modal's `Esc`/`E`/`G`/`X`/`Delete`·`Backspace`
  shortcuts ran off a raw `document` `keydown` listener, so they stayed live whenever any other modal
  (including the modal's own delete-confirm dialog) was stacked above, and could leak to the page.
  Migrated to `useModalHotkeys`, which self-gates to the topmost modal on the stack — the keys now
  fire only when TaskDetailModal is on top, and no longer leak. Behaviour is otherwise unchanged
  (same five keys, same form-field/modifier-key suppression, same delete-confirm precedence).

- `2026-06-04 02:11 UTC` — **Invisible UI accents that referenced the nonexistent `--color-primary`
  CSS variable.** `--color-primary` (and its `-dark` sibling) is not defined in `theme.css` — the
  project's primary accent is `--color-navy`. Twenty-two bare, fallback-less `var(--color-primary)` /
  `var(--color-primary-dark)` references across 14 L6 files were therefore invalid at runtime and
  rendered with no accent: the `KeyboardShortcutsModal` active tab had no highlight, the FilesPage
  "content changed" warning button was white-on-transparent (effectively invisible), and Updates /
  Settings / Sidebar / Layout accents silently dropped. All bare forms are now `--color-navy`
  (`-dark` → `--color-navy-dark`); the `var(--color-primary*, <fallback>)` form is left untouched
  (it renders its fallback). A hard-zero CI guard (`tests/integration/no-undefined-color-primary.test.ts`)
  fails the suite if any bare `var(--color-primary*)` is reintroduced under `src/layers/l6-ui/**`.

### Added

- `2026-06-03 04:12 UTC` — **Centralized `Z_INDEX` stacking scale + a CI guard against stray high
  z-indexes** — new `src/layers/l6-ui/constants/zIndex.ts` exports a single ascending `Z_INDEX` scale
  with named, well-spaced bands (`base` → `raised` → `elevated` → `stickyHeader` → `sidebar` →
  `overlayChrome` → `modal` 1100 → `modalChild` 1200 → `titleBar` 1300 → `infoTrigger` 1400 →
  `help` 1500), giving the whole renderer one source of truth for "what sits above what". The modal
  tier keeps its established literal values verbatim, so the change is a no-op for actual modal
  rendering. ~26 modal-tier and mid-tier z-index literals were converted to `Z_INDEX.*`. A new
  fitness-function test (`tests/integration/no-stray-high-zindex.test.ts`, modelled on
  `ipc-handlers-no-raw-sql.test.ts`) is a **hard-zero gate**: it fails the suite if any `zIndex`
  literal ≥ 1100 is reintroduced anywhere under `src/layers/l6-ui/**/*.{ts,tsx}` (so a future
  `zIndex: 9999` gets caught), making "nothing non-modal sits above the modal tier" machine-enforced.
  `titleBar: 1300` is the one deliberate, documented non-modal-above-modal exception (window controls
  must stay grabbable above ordinary modals; still below Help).

- `2026-06-03 03:03 UTC` — **CI guard against new handwritten modals** — a fitness-function test
  (`tests/integration/no-handwritten-modals.test.ts`, modelled on `ipc-handlers-no-raw-sql.test.ts`)
  that fails the suite if any file under `src/layers/l6-ui/components/**` reintroduces the
  handwritten-modal backdrop signature (`position:'fixed'` + a `background`/`backgroundColor` set to
  black `rgba(0,0,0,α)` with α ≥ 0.3) without an explicit, `why:`-justified allowlist entry. The
  allowlist holds exactly one entry — the `<Modal>` primitive itself, which owns the canonical
  backdrop. This makes the §2 "all dialogs MUST use the `<Modal>` primitive" rule **machine-enforced**
  rather than reviewer-only, locking in the now-complete 8-modal cleanup (#94–#102). The α ≥ 0.3 floor
  is the single discriminator that excludes non-modal `fixed`+rgba surfaces (TitleBar 0.05 hover tint,
  ColorPicker 0.2 swatch overlay) and all `boxShadow`/`border`/`textShadow` rgba. Documented tripwire
  limits (deliberate false negatives, with the §2 human reviewer-checklist as backstop): an 8-digit-hex
  backdrop (`#00000080`) and a CSS-module/Tailwind class-based overlay are not caught. Test-only; a pure
  detector + a test-of-the-test keep the guard's own logic under test.

### Fixed

- `2026-06-03 06:40 UTC` — **"Reset all data" now clears the backup schedule + encryption password.**
  `resetAppState` deleted `user_preferences` but never `app_settings`, so after a full reset the backup
  scheduler woke up and resumed from the surviving schedule row. Added `DELETE FROM app_settings` to the
  reset transaction. (Also codified the three-store settings boundary — `user_preferences` vs
  `app_settings` vs `localStorage` — in CLAUDE.md §8 so new settings stop being placed arbitrarily.)
- `2026-06-03 06:05 UTC` — **macOS sleep/wake no longer leaves the app inactive or wedged.** The
  `IdleStateManager` (suspend/resume protector that pauses sync + the file watcher and checkpoints the
  WAL on sleep, resumes them on wake) was dead code — defined but never wired in — so the app had zero
  power-state handling. It is now constructed and started in `AppLifecycle`. Also fixed a state-machine
  deadlock: when macOS froze the process mid-suspend the state stuck at `'suspending'`, and the resume
  handler's `!== 'suspended'` guard then skipped resume entirely (sync/watchers never restarted); the
  guard now resumes from both `'suspending'` and `'suspended'`. Plus `AutoSyncManager` wraps `syncAll()`
  in a 5-minute liveness timeout so a sync in flight when the Mac slept can't hang the scheduler on wake.
  macOS-only; verify on a real sleep/wake cycle.
- `2026-06-03 04:12 UTC` — **Dropdowns, tooltips, the title bar, and the first-run guide can no longer
  paint over open modals (including the always-on-top Help modal).** Four non-modal elements were
  sitting at or above the modal/Help tier with raw `9999`/`10000` z-indexes: the dashboard
  ImportantWorksFilter popover (`10000`), the InfoTrigger hover tooltip (`9999`), the TitleBar
  (`9999`), and the WelcomeGuide first-run overlay (`9999`). Because `<Modal>` is not portaled, those
  literals competed directly with modal backdrops in the same stacking context, so an open popover or
  tooltip could occlude a dialog — including Help (1500). They are now rebanded via the new `Z_INDEX`
  scale: popover/tooltip/welcome-guide drop to `overlayChrome` (1000, below every modal), and the
  TitleBar moves to the new `titleBar` band (1300, above ordinary/child modals so window controls stay
  grabbable, but below Help).
- `2026-06-03 03:37 UTC` — **Manually-triggered scheduled backups now save to the canonical backup
  directory** (`BACKUP_DIR`), so they show up in backup management and are pruned by rotation. The
  `data:runScheduledBackup` handler was writing to a hardcoded `~/Documents/CanvasAssistant/backups`
  path that the backup-list UI never reads and rotation never prunes — manual backups reported success
  but were orphaned there and accumulated unbounded. It now uses the same `ctx.getBackupDir()` accessor
  the automatic `BackupManager`, the list UI, and rotation all use, restoring the "manual == automatic"
  invariant.
- `2026-06-02 23:40 UTC` — **"Select None" is clickable again in the Custom Export dialog** (and a
  0-course export is now reachable). Migrating `ExportDialog` to read courses via
  `selectors.visibleCourses` briefly broke deselection: that selector returns a fresh array on every
  call, so passing it straight to `useStore(...)` handed the component a new `courses` reference each
  render, which re-fired the "select all courses" init effect on every render where the selection was
  empty — clicking "Select None" was immediately undone. Fixed by subscribing to the store and
  memoizing the selector against the stable `state.courses` reference
  (`useMemo(() => selectors.visibleCourses(state), [state.courses])`), the same §8 pattern Dashboard
  already uses for `selectors.visibleNotifications`.

### Changed

- `2026-06-03 02:47 UTC` — Migrated the handwritten **event-detail quick-view modal in
  `CalendarGridContext`** (`src/layers/l6-ui/components/Calendar/CalendarGridContext.tsx`'s
  `renderDetailModal()`) to the `<Modal>` primitive (custom colored header + `Modal.Content`,
  `size="md"`, `zIndex={1100}`). This is the **8th — and another previously-untracked — handwritten
  modal**, found by the same `position:'fixed'` + `rgba(0,0,0,0.5)` backdrop guard sweep (the
  hand-maintained "named consumer modals" list never enumerated it). Behaviour is preserved in place:
  every detail row, both `isTask` branches, the line-through-on-completed title + `(Completed)`
  suffix, and both `Go to … →` course-nav links are byte-identical; the quick-view's state shape and
  the `handleEventClick` fallback contract are untouched. Two small, intentional deltas: **Esc now
  closes** (the old overlay had no Esc handler — gained from the primitive's default `closeOnEscape`),
  and the whole-card `0.85` completed-opacity dim was **dropped** (the primitive owns the card; the
  line-through title remains the completion signal). 6 dead modal-chrome style keys removed from
  `CalendarGridStyles.ts` (3 `detail*` header keys added; the 6 detail-row keys kept). The quick-view
  is currently unreachable in production (the sole `<CalendarGrid>` consumer always passes
  `onEventClick` → `TaskDetailModal`); a dedup-vs-`TaskDetailModal` decision is deferred (see
  `docs/FOLLOWUPS.md`). New test `tests/l6-ui/components/Calendar/CalendarGridContext.test.tsx` (11
  cases). With this 8th modal done, the backdrop sweep now shows only the `Modal` primitive itself —
  so the pending CI grep-guard can land with an allowlist of just `Modal.tsx`.
- `2026-06-03 02:27 UTC` — Migrated the handwritten **Add-Task dialog on the Tasks page**
  (`src/layers/l6-ui/components/pages/TasksPage.tsx`) to the `<Modal>` primitive
  (`Modal.Header`/`Content`/`Footer`, `size="md"`, `zIndex={1100}`; Cancel/Create rebuilt on the
  `Button` primitive). This is the **7th — and another previously-untracked — handwritten modal**,
  surfaced by the same modal-guard sweep that found `InfoTrigger`: the original "5 named consumer
  modals" cleanup list was incomplete, and the `position:'fixed'` + `rgba(0,0,0,0.5)` backdrop sweep
  keeps turning up modals the named list never enumerated. Behaviour is preserved byte-for-byte —
  the `window.api.dispatch('CreateTask', …)` payload, the reset-then-close order, and the
  `!title.trim() || !courseId` disabled predicate are unchanged. The migration also **gains
  ADR-0006 modal-stack hotkey suppression for free**: the dialog now registers on `ModalStackContext`,
  so the page's `useKeymap` `'main'` shortcuts (`1-4`/`n`/`x`/`Enter`) correctly stop firing while it
  is open (the handwritten overlay was never on the stack, so those shortcuts could leak through if
  focus escaped the form). `useKeymap` was not touched. 7 dead modal-chrome style keys were removed
  from `TasksPage.styles.ts`; new test `tests/l6-ui/pages/TasksPage.addTask.test.tsx` (7 cases:
  open / fields / disabled predicate / dispatch+close / cancel / Esc / backdrop).
- `2026-06-03 02:01 UTC` — Migrated the handwritten `InfoModal` inside the shared `InfoTrigger`
  affordance (`src/layers/l6-ui/components/shared/InfoTrigger.tsx`) to the `<Modal>` primitive
  (`Modal.Header`/`Content`/`Footer`, `size="md"`, `zIndex={1400}`). This is the **6th — and
  previously-missed — handwritten modal**: `InfoTrigger` was earlier mis-triaged as a "tooltip false
  positive" in the handwritten-modal cleanup, but only its hover _tooltip_ is a non-modal disclosure
  affordance; the popup it opened on click was a genuine hand-rolled `position:'fixed'` + `rgba`
  overlay (own Esc listener, backdrop-close, header/content/footer). The tooltip portal is left
  entirely untouched; only the click-popup migrated. Also **fixes the modal's stacking order**: the old
  `InfoModal` sat at `zIndex:10000` — _above_ the Help modal (`KeyboardShortcutsModal` @ `1500`),
  violating the documented Help-always-on-top invariant. It now sits at `1400` (above the normal
  1100/1200 modal tier so an `(i)` embedded inside a host modal still pops above it, but below Help).
  The hand-rolled Esc `useEffect` (now primitive-owned), the orphaned `X` import, and 7 dead
  modal-chrome style keys were removed; public `InfoTriggerProps` unchanged. New test
  `tests/l6-ui/InfoTrigger.test.tsx` (8 cases, incl. the Esc-replacement + tooltip-untouched contracts).
- `2026-06-03 01:39 UTC` — Migrated the **three nested Settings sub-dialogs** inside
  `SettingsModalContent` (Token Replacement, Encrypted-Backup Password, post-import Restart) from their
  handwritten `position:'fixed'` + `rgba` overlay chrome to the shared `<Modal>` primitive
  (`Modal.Header`/`Content`/`Footer`, `size="md"`, `zIndex={1200}` so they stack above the overlay-mode
  SettingsModal at 1100). Token-replace and password dialogs are dismissible (backdrop / header-X / Esc —
  Esc is a faithful upgrade, the old overlays had no keydown listener); the **Restart dialog stays
  NON-dismissible** (`closeOnEscape={false}`, `closeOnBackdropClick={false}`, `showCloseButton={false}`,
  no `onClose`) so the "you must restart" gate cannot be dismissed — only the "Restart Now" button exits.
  The in-input Enter→decrypt handler is preserved verbatim. 6 dead chrome style keys were trimmed from
  `SettingsModalStyles.ts` (`tokenModalDesc` kept — it styles the description body, not chrome). Behaviour
  and public props are otherwise unchanged. **This closes the final carve-out of the codebase-wide
  handwritten-modal cleanup — the nested Settings sub-dialogs deferred when SettingsModal itself migrated
  (#95).** Extended `tests/l6-ui/SettingsModal.test.tsx` (+24 cases, incl. the load-bearing
  Restart-non-dismissible contract).
- `2026-06-03 01:12 UTC` — Migrated the **Event/Coursework form dialog** (`EventFormModal`, the
  909-line calendar create/edit form) to the shared `<Modal>` primitive
  (`Modal.Header`/`Content`/`Footer`, `size="md"`, `zIndex={1100}`), replacing its hand-rolled
  overlay/box/header/footer chrome. The `<form>` now wraps BOTH `Modal.Content` and `Modal.Footer`
  so the `type="submit"` Save button and the Ctrl/Cmd+Enter → `requestSubmit()` shortcut keep
  working through the primitive split; `closeOnEscape={false}` plus the component's own keydown
  handler means Esc still closes the form exactly once (no double-close), and a
  `if (showDeleteConfirm || validationAlert) return;` keyboard-yield guard lets the stacked
  delete-confirm / validation-alert `ConfirmDialog`s own the keyboard while open. 7 dead chrome
  style objects were trimmed from `eventFormModalStyles.ts`; behaviour and public props are
  otherwise unchanged. **This is the fifth and final consumer-modal migration — it completes the
  codebase-wide handwritten-modal → `<Modal>` primitive cleanup tracked in `docs/FOLLOWUPS.md`
  (0 actively-used handwritten modals remain).** Added `tests/l6-ui/EventFormModal.test.tsx`
  (22 cases) for the previously-untested component.
- `2026-06-02 23:40 UTC` — Migrated the **Custom Export dialog** (`ExportDialog`) to the shared
  `<Modal>` primitive (`Modal.Header`/`Content`/`Footer`, `size="lg"`), replacing its hand-rolled
  overlay/box/header/footer chrome. Because this dialog is rendered as a **child stacked above the
  Settings modal**, it uses `zIndex={1200}` (one tier above the parent's `1100`) plus
  `closeOnEscape={false}` and a single **capture-phase** `document` Escape listener that
  `stopPropagation()`s before closing — so Escape closes only the export dialog, not the Settings
  modal underneath (a genuine fix over the old bubble-phase listener, which let both close). The
  course subscription now reads via the centralized `selectors.visibleCourses` (§8); 7 dead chrome
  style objects were trimmed. Behaviour and public props are otherwise unchanged. Fourth of the
  remaining handwritten-modal migrations tracked in `docs/FOLLOWUPS.md` (1 consumer modal left:
  `EventFormModal`). Added `tests/l6-ui/ExportDialog.test.tsx` (26 cases) for the previously-untested
  component.
- `2026-06-02 23:02 UTC` — Migrated the **Sync Conflict dialog** (`SyncConflictModal`) to the
  shared `<Modal>` primitive (`Modal.Header`/`Content`/`Footer`, `size="lg"`, `zIndex={1100}`),
  replacing its hand-rolled overlay/box chrome and removing the hand-rolled `document` Escape
  listener (the primitive now owns backdrop, Esc, body-scroll-lock, and z-index stacking). The
  progress bar moved to the top of `Modal.Content`; the bulk-resolve buttons render in a
  conditional `Modal.Footer` (only when more than one conflict). Behaviour and public props are
  unchanged; 8 now-dead chrome style objects were trimmed. Not user-visible yet — the component
  has no active consumer (the `Layout.tsx` render site is commented out; conflicts are currently
  handled on the Updates page) — so this is §2-compliance plus future-reuse readiness. Third of
  the remaining handwritten-modal migrations tracked in `docs/FOLLOWUPS.md` (2 consumer modals
  left: `ExportDialog`, `EventFormModal`). Added `tests/l6-ui/SyncConflictModal.test.tsx`
  (17 cases) covering the previously-untested component.
- `2026-06-02 20:01 UTC` — Migrated the **Settings dialog** (`SettingsModal`) to the shared
  `<Modal>` primitive. The overlay (non-full-page) branch now renders inside
  `<Modal><Modal.Content padded={false} scrollable={false}>` — the primitive owns the
  backdrop, Escape, body-scroll-lock, sizing, and z-index, while `SettingsModalContent` keeps
  its own header/search/footer chrome. The full-page branch (the route rendered by
  `SettingsPage`) is unchanged, and its hand-rolled Escape listener is now gated to that branch
  only so the overlay's Esc no longer double-fires `onClose`. Behaviour and public props are
  unchanged; 2 dead chrome style objects were trimmed. Second of the remaining handwritten-modal
  migrations tracked in `docs/FOLLOWUPS.md` (3 consumer modals left).
- `2026-06-02 19:33 UTC` — Migrated the calendar **Import Confirmation dialog** to the
  shared `<Modal>` primitive (`Modal.Header`/`Content`/`Footer`, `size="lg"`,
  `zIndex={1100}`), replacing its hand-rolled overlay/box chrome and removing the
  hand-rolled `document` Escape listener (the primitive now owns backdrop, Esc,
  body-scroll-lock, and z-index stacking). Behaviour and public props are unchanged;
  10 now-dead chrome style objects were trimmed. First of the 5 remaining
  handwritten-modal migrations tracked in `docs/FOLLOWUPS.md`.
- `2026-06-02 05:00 UTC` — **CI runs affected tests only on ordinary PRs** instead of
  the full ~2300-test suite. `jest --changedSince=origin/main` runs every test whose
  module graph reaches a changed/created/deleted file (its transitive dependents). The
  **full suite + aggregate coverage floor** still runs on **push-to-main** (post-merge
  safety net) and on PRs that touch shared test infra (`jest.config`, `tsconfig*`,
  `package(-lock).json`, `tests/setup-*`, `tests/test-utils/**`, `tests/__mocks__/**`,
  `scripts/diff-coverage-check.js`, `.diffcov-allow.json`, `ci.yml`). The aggregate
  floor is now gated behind `JEST_AGGREGATE_FLOOR` so it only applies to full runs; the
  per-PR diff-coverage gate still runs on every PR. Trade-off: a green PR no longer
  guarantees the full suite passed — a graph-missed regression is caught post-merge on
  `main`.

### Removed

- `2026-06-02 17:47 UTC` — Dropped the three dead `notifications` policy columns —
  `is_policy_related`, `policy_keywords`, `priority_level` — via an FK-off table rebuild
  (migration 111, ADR-0009), and removed their stale entries from
  `NOTIFICATION_CANVAS_FIELDS`. These columns went unwritten/unread after the
  policy-detection removal (#82); this finishes the ADR-0003 schema-zombie cleanup.
  `priority_score` (a live REAL column, distinct from the dropped `priority_level` TEXT
  enum) is unaffected.
- `2026-06-02 04:30 UTC` — Swept the dead policy code left behind by the
  `course_policies` drop (#85) and the policy-detection removal (#82): deleted the
  now-unconsumed `Policy` Zod schema/type, `PolicyRow`/`PolicyRowMinimal` row types,
  `mapPolicyRowToEntity`, and the dead `DaemonConfig.PolicyDetectionConfig` (interface +
  default + re-export). All confirmed to have zero remaining importers/callers.

### Added

- `2026-06-02 04:00 UTC` — **Announcement file references can jump to the Files page**
  ([#29](https://github.com/MorrisXDS/CanvasAssistant/issues/29)). A resolved file
  reference in an announcement body now shows a small "reveal in Files" button
  (folder icon) next to it; left-click still downloads/opens the file inline, the new
  button navigates to the Files page and scrolls to + briefly highlights that file's
  row (expanding its course/folders and clearing a hiding filter as needed). Built on
  the existing `data-file-key` (`getCanonicalFileId`) row keys; the reveal logic lives
  in a unit-tested `useFileReveal` hook (pure `planFileReveal` + DOM scroll). Also
  added a CSS-module stub for jsdom component tests (`tests/__mocks__/styleMock.js`).

### Removed

- `2026-06-02 03:00 UTC` — Dropped the `course_policies` zombie table (migration 110,
  ADR-0003 cleanup) — the **first real use** of the ADR-0009 foreign-key-off rebuild.
  `course_policies` never had a live INSERT writer; dropping it required first rebuilding
  `notifications` (a flagged `disableForeignKeys` migration) to remove its only live
  inbound FK, `linked_policy_id`. Also removed: `MarkSyllabusReviewedCommand`'s dead
  `course_policies` UPDATE (its real work — marking `course_syllabuses` reviewed — is
  unchanged), the `policies` branches in both export collectors + the import restore, and
  the `policies` export-bundle field. The `Policy` Zod type + `mapPolicyRowToEntity` are
  now unused leftovers (micro-followup). `course_task_groups` is the last remaining zombie
  table (needs a `tasks` rebuild).

### Added

- `2026-06-02 02:30 UTC` — **Migration engine can now do foreign-key-off table
  rebuilds** (ADR-0009). A migration may set `disableForeignKeys: true`;
  `MigrationRunner` then runs it (and its `down`) with `PRAGMA foreign_keys = OFF`
  (toggled outside the transaction — where it's otherwise a no-op — and restored in a
  `finally`) plus a `PRAGMA foreign_key_check` after the body that aborts the migration
  if the rebuild left any dangling references. Unflagged migrations are unchanged. This
  unblocks the SQLite "12-step" rebuilds that were previously impossible — dropping a
  column that participates in a foreign key (`notifications.linked_policy_id`,
  `tasks.task_group_id`) or widening a CHECK (`resources.context_type`) — and so clears
  the path to drop the last zombie tables (`course_policies`, `course_task_groups`).

### Removed

- `2026-06-02 00:30 UTC` — Removed the dead announcement policy-keyword detection
  (ADR-0003 cleanup, completes the #76 micro-followup). The keyword scan in the
  announcement mapper produced three notification columns — `is_policy_related`,
  `policy_keywords`, and a `priority_level` "high" bump — **all of which were
  unconsumed** (no reader anywhere). Deleted the detection block, the
  `policyDetection.ts` module (`POLICY_KEYWORDS` + the never-called
  `detectPolicyKeywords`/`calculatePolicyConfidence`), the `DataMappers`
  re-exports, and the three fields from the `LocalNotification` type. The columns
  themselves persist (dropping them needs a `notifications` rebuild, blocked on the
  migration-runner FK-OFF limitation) but are no longer written. No behavior change —
  nothing read any of them.

- `2026-06-01 23:00 UTC` — Dropped the dead `grace_tokens`, `grace_token_usage`, and
  `policy_rules` tables (migration 109, ADR-0003 cleanup). All three are unreachable —
  no live writer or reader; only the course export/import round-trip touched the grace
  tables, and that code is removed here too (`CourseExportReader` + `ExportDataCollector`
  grace gather, `ImportCourseDataCommand` grace restore, the `graceTokens`/`graceTokenUsage`
  export-bundle fields, and the `GraceTokenRow`/`GraceTokenRowMinimal`/`TokenUsageRow` types).
  They're leaf tables (nothing FKs into them), so they drop cleanly without a rebuild.
  Reversible. The remaining policy zombies (`course_policies`, `course_task_groups`) stay —
  dropping them needs `notifications`/`tasks` table rebuilds, which the migration engine
  can't do yet (it runs migrations inside a transaction where `PRAGMA foreign_keys` can't be
  turned off); tracked in `docs/FOLLOWUPS.md`.

### Fixed

- `2026-06-02 01:30 UTC` — Page-dependency files downloaded for offline pages now
  actually persist. `UpsertResourceCommand.upsertPageDependency` wrote
  `context_type='page_dependency'`, which the `resources.context_type` CHECK rejects —
  so the INSERT threw (swallowed by the handler), the dependency row never landed, and
  the file was re-downloaded on every page open. It now writes the allowed `'files'`
  value. Trade-off: these dependency files (`type='file'`) now show in the Files page
  (it lists `type IN ('file','page')`); the proper distinguishing fix needs a
  `resources` table rebuild blocked by the migration-runner FK-OFF limitation.
- `2026-06-02 01:30 UTC` — Fixed the dev-only `syncUpdates:createTestData` debug
  channel (notification-dot test data). `SyncTestDataCommand.createTestSession` inserted
  a non-existent `sync_sessions.status` column (and returned a rowid that didn't match
  the TEXT `id` FK), so it always threw and created nothing. It now inserts the real
  `sync_sessions` shape (`id`, `started_at`, `created_at`) and returns the TEXT id.
- `2026-06-01 22:30 UTC` — **"Remember my choice" on the Updates-page conflict
  resolver now actually sticks.** `ResolveSyncConflictCommand` was writing the
  remembered preference into `sync_preferences.prefer_local` — a column nothing
  reads (the sync conflict resolver reads `prefer_canvas`) — and via
  `INSERT OR REPLACE`, which could even reset an existing `prefer_canvas`
  preference back to its default. It now upserts `prefer_canvas`, so the
  remembered choice lands in the column sync actually consults. The now-unused
  `prefer_local` column was dropped (migration 108, reversible).

### Removed

- `2026-06-01 22:00 UTC` — Dropped 6 vestigial scoring/value columns (migration 107,
  ADR-0003 cleanup): `tasks.effective_grade` (the live `effectiveGrade` is computed
  by the grade simulator, never this column), `courses.grade_volatility` (never read
  or written), and the old ROI/priority inputs `tasks.pain_index` /
  `penalty_severity` / `has_safety_net` / `days_until_cutoff` (only the import-restore
  path wrote them — that write was removed too). The `idx_tasks_pain_index` index went
  with them. Direct `ALTER TABLE DROP COLUMN` (no rebuild); reversible. NOT touched:
  `tasks.lock_at` (alive — Canvas-authoritative, synced + exported; an earlier doc note
  calling it vestigial was wrong) and `sync_preferences.prefer_local` (still written
  verbatim by the conflict commands; deferred).
- `2026-06-01 21:30 UTC` — Removed the dead `course_policies` read chain (ADR-0003
  cleanup, slice 1 of the policy-family retirement). `data:getPolicies` /
  `data:getAllPolicies` always returned empty lists — `course_policies` has no INSERT
  writer and no UI ever called either handler. Deleted `PolicyReader`, both handlers,
  their contract/preload/ipc-client entries, and the 2 dead test files. The `Policy`
  Zod schema/type stays (still used by export/import + l4 mappers). The table itself
  is **not** dropped yet — it's FK'd by live tables (`notifications.linked_policy_id`,
  `grace_tokens.policy_id`, `policy_rules.policy_id`), so the drop needs a
  notifications + grace_tokens rebuild (tracked in `docs/FOLLOWUPS.md`).

### Added

- `2026-06-01 21:00 UTC` — **Grade-history trend is now a live feature.** The
  `grade_history` table + `GradeHistoryCard` chart on each course's detail page had
  a display half but no recording half, so the chart was permanently empty. Added
  `SyncCourseOperations.recordGradeChange`, which appends a grade point whenever a
  course's overall grade changes between syncs (one point per distinct transition;
  null/unchanged grades are skipped, so the chart shows the trajectory, not a flat
  line). Also fixed a latent shape bug exposed by real data: the reader/handler now
  return `id` + `courseId` (required by `GradeHistoryEntrySchema` and used as the
  card's React key) — previously `{recordedAt, grade}`, which would have failed
  result validation the first time a row existed.

### Removed

- `2026-06-01 20:30 UTC` — Dropped the `policy_announcements` table (migration 106),
  ADR-0003 cleanup. It was the lone "live-writer-but-no-consumer" zombie — sync wrote
  a detection row for every policy-flagged announcement, but nothing has read the table
  since the intelligence layer that turned detections into `course_policies` rows was
  removed. Removed both orphan writers (`SyncContentOperations` policy block,
  `AnnouncementSyncStrategy.processPolicyDetection`) and the dead `policy-detected`
  event / `onPolicyDetected` / `PolicyDetectedEvent` plumbing. Reversible (`down`
  recreates the table + its two indexes). The `is_policy_related` notification flag
  is left in place but is now likewise unconsumed (micro-followup in `docs/FOLLOWUPS.md`).
- `2026-06-01 20:00 UTC` — Dropped 11 dead/zombie schema tables (migration 105),
  ADR-0003 cleanup. An audit confirmed each has no production writer or reader
  AND no inbound FK from a live table: the 7 L3-intelligence leftovers
  (`task_completion_events`, `user_behavior_patterns`, `effort_estimations`,
  `workload_snapshots`, `recommendations`, `user_insights`,
  `adaptive_weight_adjustments`), the two policy grade-rule children
  (`grade_replacements`, `weight_transfers`), and two never-wired-up field tables
  (`field_modifications`, `field_notification_suppressions`). Their unused
  `DatabaseRowTypes` interfaces and `resetAppState` teardown DELETEs were removed
  too. The migration is reversible (`down` recreates each from original DDL).
  Deliberately NOT dropped: `course_task_groups` — although dead, `tasks.task_group_id`
  and `course_policies.target_group_id` still FK to it (needs a column-removing
  rebuild first; deferred). Remaining schema zombies (`policy_announcements`,
  `course_policies`, `grade_history`, vestigial columns) tracked in
  `docs/FOLLOWUPS.md`.

### Changed

- `2026-06-01 19:30 UTC` — Migrated `fileDataHandlers` off raw SQL and **flipped
  the ADR-0007 enforcement test to a hard zero-violations gate** (literal-zero
  closeout, 3 of 3 — `src/lifecycle/ipc-handlers/**` is now genuinely
  raw-SQL-free). `fileDataHandlers`'s 13 generic-typed reads (files/attachments
  listings, module-items with the `has_local_content` subqueries, file
  references, Canvas-URL lookups) moved to L1 readers: new
  `AnnouncementFileReferenceReader`; `ResourceReader.getFilesAndPagesByCourse` /
  `getVisibleFilesAndPages` / `getExternalIdCourseById`;
  `AnnouncementAttachmentReader.getByCourseOrderedByName` /
  `getAllWithCourseAndNotification` / `getExternalIdCourseById`;
  `ModuleReader.getItemsForCourses`; reuse of `CourseReader` / `TaskReader.getById`
  and `CoursePageReader.getUrlSlug` (in `buildCanvasResourceUrl`). The
  enforcement test (`ipc-handlers-no-raw-sql.test.ts`) is rewritten from the
  per-file ratchet to a single assertion that matches **both** `db.executeRead(`
  and the generic `db.executeRead<T>(` form (the latter is what hid ~30 reads
  from the old regex), and `.adr-0007-handler-sql-ceiling.json` is deleted.
  `database.transaction` / `.checkpoint` remain allowed. Behaviour preserved
  exactly. **ADR-0007 is fully closed.**

- `2026-06-01 19:00 UTC` — Migrated `data/courseContentHandlers` off raw SQL
  (ADR-0007 literal-zero closeout, 2 of 3). All 8 generic-typed reads across the
  five channels (`data:getCourseSyllabus`, `data:getGradeHistory`,
  `pages:getByCourse`, `pages:get`, `pages:getByTitle`) now route through L1
  readers: new `CourseSyllabusReader` (syllabus designation) and
  `GradeHistoryReader`; `ResourceReader.getSyllabusInfoById`; four new
  `CoursePageReader` methods (`getAllByCourse` / `getById` / `getByTitleInCourse`
  / `getSyllabusPageByCourse`); reuse of `CourseReader.getById`. DTO shaping and
  the Canvas-URL construction stay in the handler. Behaviour preserved exactly.
  One file (`fileDataHandlers`) remains before the enforcement test can flip to
  literal-zero.

- `2026-06-01 18:45 UTC` — Migrated `courseDataHandlers`'s last raw read off SQL
  (ADR-0007 literal-zero closeout, 1 of 3). `data:getEnrollmentTerms` routed its
  one `database.executeRead<…>` (a generic-typed call the ratchet never counted)
  through a new tiny `EnrollmentTermReader.getAll()`. The stale TODO is gone; the
  file is now genuinely SQL-free. One step toward making `ipc-handlers/**`
  literally raw-SQL-free so the enforcement test can flip to a hard zero (two
  files remain — `data/courseContentHandlers`, `fileDataHandlers`).

- `2026-06-01 18:30 UTC` — Migrated `courseExportHandlers`'s export _reads_ off
  raw SQL (ADR-0007 follow-up). `data:exportCourseData`'s 9 generic-typed
  `executeRead<…>` calls (ratchet-invisible, so the file passed the enforcement
  test with its ceiling entry already removed, but real raw SQL remained) now
  route through a new `CourseExportReader.gather(courseIds?)` that returns the
  full export bundle (courses + tasks/notifications/pages/policies/resources/
  syllabuses/grace-tokens/usage). DTO shaping stays in the handler. The numeric
  id sets are coerced to integers before the `IN (...)` interpolation, so the
  export filter can no longer carry injected SQL. Behaviour preserved exactly
  (including the empty-courses early return that avoids an invalid `IN ()`).
  Note: this does NOT yet make the handler dir literally SQL-free — three files
  (`fileDataHandlers`, `data/courseContentHandlers`, `courseDataHandlers`) still
  hold ratchet-invisible generic reads; see `docs/FOLLOWUPS.md`.

- `2026-06-01 18:00 UTC` — Migrated `syncHandlers` off raw SQL (ADR-0007) —
  **the final handler; the ratchet's `paths` map is now empty and every IPC
  handler is migrated.** The conflict-resolution `UPDATE ${table} SET ${field}`
  (previously built by string interpolation from conflict records) is hardened
  behind a new `ApplyConflictResolutionCommand` that validates the table against
  a fixed allow-list (`courses`/`tasks`/`notifications`) AND the field against
  both an identifier regex and the table's real columns (PRAGMA table_info,
  cached) — interpolation can no longer carry injected SQL. Other writes route
  through `RememberConflictPreferenceCommand` (the live `sync_preferences.prefer_canvas`
  write) and `MarkConflictResolvedCommand`; reads through `SyncUpdateReader`
  (new unresolved-conflict-by-external-id), `ResourceReader.getFolderByCoursePath`,
  the new `SyncMetadataReader`, plus reuse of `CourseReader` / `TaskReader` /
  `UserPreferencesReader` / `SetUserPreferenceCommand`. The bulk-resolve
  `database.transaction` (control flow, not SQL) stays in the handler so its
  per-row writes + sync-engine calls remain atomic. Behaviour preserved exactly.
  Ceiling drops 1 → 0 — `syncHandlers` removed; the migration train is complete.

- `2026-06-01 17:30 UTC` — Migrated `fileHandlers` off raw SQL (ADR-0007). The
  DB-touching channels (`attachment:download` / `open` / `showInFolder`,
  `files:clearSync`, `resource:showInFolder` / `showInFolderByExternalId` /
  `deleteLocal`, `canvas-file:open`) no longer touch the database directly.
  Reads route through `AnnouncementAttachmentReader` (new by-id projections),
  `ResourceReader` (new `getLocalPathById` / `getLocalPathExternalById` /
  `getDownloadInfoWithLocalPathByExternalId`), and the existing `CourseReader`.
  Attachment status writes route through a new `UpdateAttachmentDownloadCommand`
  (`setStatus` / `markDownloaded`); the multi-table `files:clearSync` wipe moved
  into a new transactional `ClearSyncedFilesCommand`; the resource `local_path`
  writes reuse `UpdateResourceLocalPathCommand` (`clear` / `setLocalPath`). The
  directory-management, dialog, and file-save channels (no DB access) are
  unchanged. Behaviour preserved exactly. Ceiling drops 2 → 1 entry —
  `fileHandlers` removed and locked at zero; only `syncHandlers` remains.

- `2026-06-01 17:00 UTC` — Migrated `htmlDependencyHandlers` off raw SQL (ADR-0007).
  Both channels (`html:checkDependencies`, `html:downloadDependencies`) no
  longer touch the database directly. All 19 SQL calls (7 ratchet-counted
  writes/upsert + 12 generic reads) moved out. High reuse of the
  pages/resources infra: reads extend `ResourceReader` / `CoursePageReader` /
  `HtmlDependencyReader` / `CourseReader` / `TaskReader` with narrow new
  projections (content-hash sources for page/assignment/syllabus,
  download-info-by-external-id, content-with-slug, children-with-hash); writes
  reuse `UpsertCoursePageCommand`, extend `UpdateResourceLocalPathCommand`
  (`setLocalPath`, no synced_at touch) and `UpsertResourceCommand`
  (`upsertPageContent`, conflict refreshes local_path/size only), and add a new
  `HtmlDependencyWriteCommand` for the session-aware `html_dependencies` writes
  (session-scoped delete, insert-or-replace with session + content hash, and
  full-parent delete). The handler keeps the Canvas API calls, file IO, HTML
  rewriting, recursive dependency-walking, and OperationCoordinator session
  orchestration (the L2 `HtmlDependencyResolver` continues to own its own SQL).
  Behaviour preserved exactly. Ceiling drops 3 → 2 entries —
  `htmlDependencyHandlers` removed and locked at zero.

- `2026-06-01 06:00 UTC` — Migrated `syncUpdatesHandlers` off raw SQL (ADR-0007).
  All ten sync-update channels (`getAll`, `getCount`, `markSeen`,
  `markAllSeen`, `markSeenByEntity`, `resolveConflict`, `cleanup`, plus the
  three debug channels) no longer touch the database directly. The 28 SQL
  calls moved to a new L1 `SyncUpdateReader` (feed query, the five badge
  aggregations, conflict lookup, debug status) and four L4 commands
  (`MarkSyncUpdatesSeenCommand` with `byIds`/`all`/`byEntity`,
  `ResolveSyncConflictCommand`, `CleanupSyncUpdatesCommand`,
  `SyncTestDataCommand`). The six post-write `SELECT changes()` /
  `last_insert_rowid()` reads collapse into the command return values
  (better-sqlite3's `changes`, identical semantics). Behaviour preserved
  exactly, including the dynamic `markAllSeen` WHERE assembly and the
  `sync_preferences.prefer_local` write. Ceiling drops 4 → 3 entries —
  `syncUpdatesHandlers` removed and locked at zero.

- `2026-06-01 05:00 UTC` — Migrated `resourceHandlers` off raw SQL (ADR-0007).
  The four resource channels (`resource:download`, `resource:downloadByExternalId`,
  `resource:openByExternalId`, `resource:open`) no longer touch the database
  directly. All 21 SQL calls moved out: reads route through three new L1
  readers (`ResourceReader`, `CoursePageReader`, `HtmlDependencyReader`) plus
  the existing `CourseReader`; the two `local_path` writes route through a new
  L4 `UpdateResourceLocalPathCommand` (`markDownloaded` / `clear`). The
  handler keeps the Canvas download queue, file IO, HTML rewriting, and the
  recursive dependency-walking orchestration. Behaviour preserved exactly
  (the `SELECT *` download lookup is narrowed to the six columns the handler
  actually read; the `(url_slug OR external_id)` page-match predicate is
  preserved). Ceiling drops 5 → 4 entries — `resourceHandlers` removed and
  locked at zero.

- `2026-05-31 05:33 UTC` — Migrated `pagesHandlers` off raw SQL (ADR-0007).
  The two page channels (`pages:downloadContent`, `pages:openFile`) no
  longer touch the database directly: reads route through the new
  `ModuleReader` (+ existing `CourseReader`) and writes through three new L4
  page commands (`UpsertCoursePageCommand`, `UpsertResourceCommand` with
  distinct `upsertPageDependency` / `upsertPage` paths, and
  `RecordHtmlDependencyCommand`). The handler keeps the Canvas API calls,
  file IO, HTML rewriting, and recursive dependency-walking orchestration.
  `ModuleReader` reuses the shared `ModuleItemRow` type to avoid schema
  drift. Behaviour preserved exactly (distinct ON CONFLICT column sets for
  the two resource upserts; idempotent dependency edges). Ceiling drops
  6 → 5 entries.

- `2026-05-30 04:33 UTC` — Migrated `calendarCrudHandlers` (imported-ICS
  calendars) off raw SQL (ADR-0007). The seven channels
  (`getImportedCalendars`, `parseICSPreview`, `importICS`, `deleteCalendar`,
  `updateCalendar`, `toggleVisibility`, `reimport`) no longer touch the
  database directly: reads route through the new `ImportedCalendarReader`
  (L1) and writes through five new L4 commands (Import / Reimport / Delete /
  Update / ToggleVisibility). The ~100-line title→course auto-match
  heuristic became a directly-testable pure function (`matchTitleToCourse`),
  and `CourseReader` gained `getForCalendarMatching()`. ICS parsing for the
  read-only preview stays in the handler; import/reimport parsing moved into
  the commands. Behaviour preserved exactly (duplicate-by-hash detection,
  transactional insert/replace, no course re-match on reimport). Ceiling
  drops 7 → 6 entries.
- `2026-05-30 03:49 UTC` — Migrated `calendarEventHandlers` off raw SQL
  (ADR-0007). The six calendar-event channels (`getEventsForRange`,
  `createEvent`, `updateEvent`, `deleteEvent`, `addEventException`,
  `exportBatch`) no longer touch the database directly: reads route through
  the new `CalendarReader` (L1) and writes through new L4 commands
  (`CreateCalendarEventCommand`, `UpdateCalendarEventCommand`,
  `DeleteCalendarEventCommand`, `AddCalendarEventExceptionCommand`). The
  delicate behaviour is preserved exactly — `updateEvent`'s cascade-sync of
  fields to a linked task, `deleteEvent`'s "can't delete Canvas-synced
  events" guard, and `createEvent`'s migration-70-safe optional-column
  update. Recurrence expansion (`RRuleExpander`) and ICS generation stay in
  the handler. Ceiling drops 8 → 7 entries.

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
