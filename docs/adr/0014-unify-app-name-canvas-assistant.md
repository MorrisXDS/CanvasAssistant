# 0014 — Unify app name to `canvas-assistant` with a first-run user-data migration

Status: Accepted

## Context

The app shipped under three different name spellings:

- npm `name` = `canvas-integration-dashboard` (package.json) — drives `app.getName()`.
- `productName` = `Canvas Assistant` (electron-builder.yml) — the brand/display name.
- a stray `canvas-assistant` (e.g. settings-export filename, `DefaultPaths` fallback).

This already caused a real user-facing bug: the Linux uninstall dialog printed
`sudo apt remove canvas-assistant` while the actual `.deb` package name (derived by
electron-builder from npm `name`) was `canvas-integration-dashboard` — so the command
was wrong.

The load-bearing complication is that **`app.getName()` (= npm `name`) drives
`app.getPath('userData')`**, which is where `appPaths.ts` puts the SQLite database,
config, logs, and the credential-fallback subfolder. Renaming `name`
`canvas-integration-dashboard` → `canvas-assistant` makes Electron look in a NEW, empty
`…/canvas-assistant` data dir on the next launch. Every existing **packaged** install —
including the user's, with imported course data — would appear blank, even though the
old data is still on disk under `…/canvas-integration-dashboard`.

Two secondary risks:

1. **`.deb` upgrade collision.** electron-builder derives the `.deb` package name from
   npm `name` (lowercased) → `canvas-assistant`. apt treats `canvas-integration-dashboard`
   and `canvas-assistant` as DISTINCT packages, so a user installing the new package over
   the old one ends up with TWO packages and two `/opt` dirs.
2. **NSIS uninstaller-filename coupling.** `appHandlers.ts`'s `app:launchUninstaller`
   built candidate[0] from `app.getName()`. NSIS names the uninstaller from
   `productName` (`Uninstall Canvas Assistant.exe`), so after the rename candidate[0]
   would be the wrong `Uninstall canvas-assistant.exe`.

## Decision

1. **Rename npm `name` → `canvas-assistant`.** KEEP `productName: Canvas Assistant`
   (brand) and `appId: com.canvasassistant.app` (bundle identity / NSIS upgrade key /
   taskbar group id). KEEP the keytar `serviceName: 'CanvasAssistant'` (renaming it would
   orphan the stored OS-keychain token). KEEP the visible
   `~/Documents/CanvasAssistant/Downloads` folder (brand-cased, outside userData; moving
   visible user files is the riskiest possible action for zero correctness benefit).

2. **Ship a one-time, first-run, fail-safe userData-dir migration**
   (`src/lifecycle/migrateUserDataDir.ts`) that relocates the OLD per-user data dir to the
   NEW one before any path-dependent initialization runs. It is wired as the FIRST side
   effect in `main.ts`, above the `appPaths` import.
   - OLD path is **name-independent**: `app.getPath('appData')` (the parent dir on all 3
     OSes — `~/.config`, `%APPDATA%`, `~/Library/Application Support`) + the fixed literal
     `canvas-integration-dashboard`. We derive it from a literal precisely because
     `getName()` no longer returns the old name.
   - NEW path is `app.getPath('userData')` (so it tracks whatever Electron actually uses).
   - Logic: dev-mode no-op (dev uses `process.cwd()` for `APP_ROOT`, never userData) →
     new-exists no-op (NEVER clobber/merge) → old-missing no-op → else atomic
     `renameSync` fast-path → on `EXDEV`/any rename error, `cpSync` recursive + VERIFY
     (canvas.db sentinel exists with matching size) + delete old only AFTER verify. Any
     failure leaves the old dir fully intact, cleans up any partial newDir, and returns
     `{reason:'failed', error}`. The whole-dir move carries WAL/-shm sidecars + nested
     subdirs (incl. the `CanvasAssistant/.credentials` fallback) automatically.

3. **Add deb `Replaces`/`Conflicts`/`Provides` for `canvas-integration-dashboard`**
   (electron-builder `deb.fpm` array, passed verbatim to fpm) so `canvas-assistant`
   cleanly supersedes the old package.

4. **Fix the NSIS uninstaller candidate[0]** to use the brand product name constant
   (`'Canvas Assistant'`) instead of `app.getName()`.

### Ordering proof (why the migration runs early enough)

`appPaths.ts` computes `APP_ROOT`/`DB_PATH`/`CONFIG_DIR`/etc. at **module-eval time** from
`app.getPath('userData')`. `tsconfig.json` sets `"module":"commonjs"`, so tsc emits each
`import` as a `require()` executed top-to-bottom; a top-level call expression is emitted
in source order, after the requires above it but before requires below it. Placing the
`migrateUserDataDirIfNeeded(app)` call immediately after the `electron` +
`migrateUserDataDir` imports — and ABOVE the `appPaths` import — guarantees it runs before
the paths freeze. `migrateUserDataDir.ts` imports ONLY `fs`/`path` (+ the `app` param) so
it never triggers the appPaths eval it must precede. The compiled emit order is verified
directly in `dist/main.js` (migration require + call appear above the `appPaths` require).
SQLite is provably not open during the move (the migration precedes
`new Database({ dbPath: DB_PATH })`).

## Consequences

- Existing packaged installs keep their data on the first launch after upgrade.
- `.deb` upgrades cleanly supersede the old package; the `apt remove canvas-assistant`
  uninstall command is now correct.
- The Windows uninstaller filename resolves correctly.
- keytar service id unchanged → stored token preserved.
- The one-time migration is a permanent boot cost, but negligible once newDir exists (two
  `existsSync` checks, then a no-op).
- **Risk — cross-device move:** handled by the copy-then-verify fallback.
- **Risk — interrupted copy:** an interrupted copy leaves a partial newDir; the next run
  hits the `new-exists` no-op and never merges or re-copies. We accept the partial as
  "safe but possibly incomplete" — but we only ever delete the old dir AFTER verify
  passes, so the old data is never lost while the copy is unverified.
- **Fail-safe floor:** on failure we log loudly (`console.error`, since the Logger is not
  yet constructed this early in boot) and leave the old dir intact; boot continues with an
  empty newDir (Database self-heals schema) so the app still starts and the user can
  recover. A renderer-side "we couldn't move your data; it's safe at <oldDir>" banner is a
  deferred FOLLOWUP, not part of this change.
- **Cannot be sandbox-verified:** the real `.deb` build + `apt install` over the old
  package (Replaces/Conflicts/Provides behavior) requires a real Debian/Ubuntu machine —
  flagged as a release-checklist item.

## Alternatives considered

- **Keep three names** — rejected; ongoing confusion + the live uninstall-command bug.
- **Rename without migration** — rejected; strands every existing install's data.
- **Also rename the visible Downloads folder** — rejected; risky move of visible user
  files (open handles, bookmarks) for no correctness benefit; it is brand-cased and
  outside userData.
- **Keep old npm name, only fix the stray strings** — rejected; does not unify the app
  identity (the explicit goal) and leaves the `.deb`/uninstall naming inconsistent.
