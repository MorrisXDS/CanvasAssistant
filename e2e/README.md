# End-to-End Tests (Playwright + Electron)

Drives the **built** Electron app with real keystrokes against an **isolated, offline**
fixture profile, to verify Course-Detail keyboard navigation end-to-end.

## Run

```bash
npm run test:e2e
```

This builds (`tsc && vite build`) then launches Playwright against `dist/`.

## Prerequisites

- **The app has been onboarded once on this machine.** `isAuthenticated` is derived from
  `hasCredential()` (OS keychain, global), so a Canvas token must already exist in the
  keychain. The token's real validity is irrelevant — the mock answers validation.
- **A populated local DB at `database/canvas.db`** with at least one course that has tasks.
  The fixture copies this DB into a temp dir (no network, no native module needed).
- **Close any running instance is _not_ required** — the e2e app uses its own
  `--user-data-dir`, so it gets a separate single-instance lock.

## How it works

- `mockCanvas.ts` — tiny HTTP server. Answers `GET /api/v1/users/self` with 200 so the
  main process "connects" offline; returns 503 for every other Canvas endpoint so a stray
  auto-sync aborts instead of pruning local data on an empty 200.
- `fixtures/seed.ts` — makes a temp dir, copies `database/canvas.db` (+ `-wal`/`-shm`),
  writes `.config/canvas-connection.json` pointing Canvas at the mock, and provisions an
  isolated `userData/`.
- `fixtures/app.ts` — Playwright fixture: `_electron.launch(['dist/main.js',
--user-data-dir=…], { cwd: tempDir })`, then presets `localStorage.onboardingCompleted`
  and reloads to land on the main app (skips the first-run welcome guide).

Gates cleared: single-instance lock (own user-data-dir), onboarding (keychain), welcome
guide (localStorage preset). DB/config are isolated in the temp cwd; the keychain and the
real `userData` are never modified.

## Coverage

All specs assert via deterministic signals — `sessionStorage` focus index, field `id`
focus, chip count badges, `data-testid` markers, URL hash — never subjective feel. Specs
`test.skip()` when the copied DB lacks the entity they need (queue, announcements, courses).

- **`smoke.spec.ts`** — boots to the main UI and confirms `getCourses()` returns the
  seeded courses through IPC (the fixture wiring sanity check).
- **`course-detail-keyboard.spec.ts`** (Items 1 & 2):
  - **Item 1** — `Ctrl+E` opens Settings, `Alt+U` → Credits, `Escape` closes the panel.
  - **Item 2** — `W`/`S` walk the focused task; `E` opens edit; overloaded `Alt+G`→Score /
    `Alt+T`→Title resolve correctly; `Ctrl+Enter` saves; digit keys `1–5` switch filters
    (visible rows match the chip count).
- **`course-detail-sections.spec.ts`** (Items 3 & 4 + section cycling):
  - **Item 3 (Queue)** — `Q` cycles to the Queue section (auto-expands); `W`/`S` walk cards.
  - **Item 4 (Announcements)** — cycle to Announcements; `W`/`S` walk; `Enter` opens the
    announcement (URL hash → `#/announcement/…`).
  - **`Q`/`E` section cycling** — exposes ≥2 distinct keyboard-active sections.
- **`page-keyboard.spec.ts`** — list-page focus navigation for Courses / Tasks /
  Announcements / Updates (focus engages → moves on next → returns on prev; `Enter` →
  detail route where applicable).
- **`calendar-keyboard.spec.ts`** — `Alt+Shift+D`/`Alt+Shift+P` activate a quick filter,
  `Alt+Shift+C` clears; `Alt+Shift+1` toggles a course filter; plain `Alt+1` is section
  direct-jump (no filter side effect — ADR-0010).
- **`modal-stack.spec.ts`** (ADR-0006) — Help shows the topmost modal's `ShortcutCategory`
  (not the page's); arrow-key browser scroll is `preventDefault()`-ed while a modal is open.

### Not yet covered

- The full multi-layer Escape cascade beyond the Settings branch.
- The deeper ADR-0006 bug-class specs (DuplicateWarningModal page-leak, Customize-child
  nested-leak, full scroll-suppression on a populated Tasks Section) — **deferred** in
  `docs/FOLLOWUPS.md`; they need shared seed infrastructure + a real dev machine (native-ABI
  seed trap).

## Limitations

Verifies objective behavior (state, focus, navigation, DOM), **not** subjective feel,
exact outline styling, or that `Shift+O`/`O` actually opens a real browser tab (the app
calls `openExternal`; we don't assert the OS side).
