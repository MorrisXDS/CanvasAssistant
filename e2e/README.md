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

`course-detail-keyboard.spec.ts` (deterministic signals — `sessionStorage` focus index,
field `id` focus, chip count badges):

- **Item 1** — `Ctrl+E` opens Settings, `Alt+U` → Credits, `Escape` closes the panel.
- **Item 2** — `W`/`S` walk the focused task; `E` opens edit; overloaded `Alt+G`→Score /
  `Alt+T`→Title resolve correctly; `Ctrl+Enter` saves; digit keys `1–5` switch filters
  (visible rows match the chip count).

### Not yet covered

- **Item 3 (Queue)** and **Item 4 (Announcements)** keyboard nav — these need a seeded
  course that has queued tasks / announcements. The fixture supports them; the specs are
  a follow-up.
- `Q/E` section cycling and the full multi-layer Escape cascade beyond the Settings branch.

## Limitations

Verifies objective behavior (state, focus, navigation, DOM), **not** subjective feel,
exact outline styling, or that `Shift+O`/`O` actually opens a real browser tab (the app
calls `openExternal`; we don't assert the OS side).
