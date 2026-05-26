---
name: manual-test-launch
description: Launch the CanvasAssistant Electron app against an isolated test database (seeded duplicate-warning scenarios) for manual UI testing — kills stale processes, flips the better-sqlite3 native ABI, seeds a fresh temp environment, rebuilds for Electron, and launches in the background. Use when the user says "launch the test app", "launch the app", "manual test", "run the app", "open the test env", "relaunch", or wants to manually verify a UI change.
---

# Manual test launch

End-to-end launcher for the isolated duplicate-warning test environment at
`scripts/manual-test-duplicate-warning.js`. The real DB is never touched —
a fresh temp dir under `%TEMP%/cid-dup-test-XXXXX` is seeded with the test
scenarios (7 cases in Course A + 1 fuzzy in Course B; see the script for
the matrix) and the app launches against it.

## When to use

- After a code change that affects any UI flow you want to eyeball.
- After a relaunch is needed because the user closed the app, the bundle
  refreshed, or a previous launcher's temp dir got cleaned up.
- When the user says any of the trigger phrases in the description.

## Do not use when

- The user wants to run `npm test` (use the test runners directly).
- The user wants to launch the **real** app (`npm run dev`) — this skill
  is for the isolated test env only.

## Steps

### 1. Kill any stale test Electron processes

The launcher attaches `--user-data-dir=...cid-dup-test-*` to its electron
processes. Kill those (only — never touch electron processes from other
apps that just happen to be running).

```powershell
Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | `
  Where-Object { $_.CommandLine -match 'cid-dup-test' } | `
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
```

If processes refuse to die (Access denied), the parent process is probably
elevated. Ask the user to kill them via Task Manager.

### 2. Flip better-sqlite3 to the Node ABI + seed

The seed script uses Node to write to the DB. If the native module is
currently built for Electron (e.g. from the previous app launch), this
will throw `NODE_MODULE_VERSION` mismatch.

```bash
node scripts/ensure-native-modules.js && node scripts/manual-test-duplicate-warning.js --seed
```

The seed step prints the temp dir path — capture it (the script also
prints the exact `--launch` command to copy).

### 3. Flip back to Electron ABI + launch in the background

```bash
npm run rebuild
node scripts/manual-test-duplicate-warning.js --launch "<TEMP_DIR_FROM_STEP_2>"
```

**Always launch with `run_in_background: true`.** The launcher uses
`stdio: 'inherit'` and stays attached to the electron process. Without
background mode, the agent hangs until the user closes the app.

### 4. Report

Tell the user:

- The app is launching (no need to wait; they'll see the window).
- The temp dir path (so they can find logs if needed).
- A short pointer to what to test (e.g. "open Course A → Accept All to test
  the bulk modal" — adjust to whatever change was just made).

## Common failure modes

| Symptom                                            | Fix                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Seed throws `NODE_MODULE_VERSION 143 requires 137` | `ensure-native-modules.js` wasn't run, or the npm rebuild flipped it. Re-run step 2.                                                      |
| `npm run rebuild` errors with `EBUSY: file locked` | A previous Electron is still running with the native module mapped. Re-run step 1; if that fails, the process is elevated — ask the user. |
| Launcher exits with `dist/main.js not found`       | `npm run build` hasn't been run since the last source change. Run it before retrying.                                                     |
| App opens but shows stale UI                       | Bundle reference cache. Kill app, `rm -rf dist`, `npm run build`, relaunch.                                                               |

## Cleanup

The launcher's `SIGINT` / `app.on('exit')` handlers automatically delete
the temp dir on close. Nothing to do manually unless the launcher was
force-killed (then the temp dir lingers under `%TEMP%/cid-dup-test-*`
until next reboot).
