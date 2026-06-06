# ADR-0012: Update channel (opt-in, notify-first, with compatibility warning)

- **Status:** Accepted
- **Date:** 2026-06-05
- **Supersedes:** —

## Context

Canvas Assistant ships as packaged Windows/macOS/Linux installers published to GitHub
Releases (see `release.yml` + `electron-builder.yml` `publish: github`). Today there is **no
in-app update mechanism** — users only find new versions by visiting the Releases page. We
want an opt-in update channel that:

1. is toggled on/off in Settings,
2. when on, checks for updates on a chosen interval, and
3. warns when the available version may not be compatible with the installed one.

Two constraints shape the design:

- **Builds are unsigned** (`mac.identity: null`; Windows NSIS unsigned). Squirrel.Mac (what
  `electron-updater` uses for macOS auto-update) **requires a signed app** — silent
  auto-install is not viable on macOS as built.
- The app is **offline-first** and its **local DB migrations are forward-only** (no
  downgrade path — see [ADR-0009](0009-migration-fk-off-rebuilds.md)). So _any_ update is
  effectively irreversible for the local data: once a newer version migrates the database,
  reverting to the prior version is unsupported. That is the real, honest compatibility risk
  — not just API breakage.

## Decision

Implement a **notify-first** update channel (detect + inform + let the user download), **not**
silent auto-install.

### Mechanism

A main-process **`UpdateChecker`** (L2 daemon — network I/O, alongside `CanvasClient`) polls
the **GitHub Releases** "latest" endpoint on an interval, parses the latest published version

- notes, semver-compares against the running version, and on a newer version emits an
  `update:available` event to the renderer. Offline / rate-limited / error → silent no-op.
  Downloading is the user's action (open the release / installer); we do not auto-install.

### Preferences (storage)

A new `user_preferences` key **`updatePreferences`**:
`{ enabled: boolean, intervalHours: number, lastCheckedAt: string|null, skippedVersion: string|null }`.
Stored in the SQL `user_preferences` table (main-process readable, like `exportSchedule`),
read via the existing `UserPreferencesReader`, written via the existing
`SetUserPreferenceCommand`. **Default `enabled: false`** — no outbound network check until the
user opts in (privacy). Default interval: **daily (~24h)** + a check on app launch.

### Compatibility verdict

A pure, unit-tested helper `assessUpdate(currentVersion, targetVersion)` returns a level +
reason:

- **`breaking`** when `semver.major(target) > semver.major(current)` → "v{target} is a major
  release and may not be backward-compatible."
- **`caution` (every update)** → "updating migrates your local database; you cannot roll back
  to v{current} afterward" (forward-only migrations).
- Otherwise **`safe`** (still shows the no-rollback note).

(An explicit per-release `minCompatibleVersion` marker is intentionally **out of scope** for
v1 — semver-major + the no-rollback note cover the need without a release-process change. It
can be layered in later without breaking this contract.)

### Layering / wiring

- **L2** `UpdateChecker` (timer like `AutoSyncManager`; honors `enabled`/`intervalHours`).
- **L1** `updatePreferences` in `user_preferences` (reuse reader/command).
- **L4** reuse `SetUserPreferenceCommand`; add a `checkForUpdatesNow` action.
- **IPC** (thin adapters, [ADR-0007](0007-ipc-handlers-thin-adapters.md)): `updates:getPrefs`,
  `updates:setPrefs`, `updates:checkNow`; push event `update:available`.
- **L6** a Settings **"Updates"** section (toggle + interval `Select`) and an update banner /
  `Modal` (version, release-notes link, the compatibility verdict, and
  Download / Skip-this-version / Later actions). `skippedVersion` + `lastCheckedAt` prevent
  re-nagging.

## Consequences

**Positive**

- Works on unsigned builds across all three platforms (no signing dependency).
- User always consents before installing — aligns with the compatibility-warning requirement.
- Opt-in default = no surprise network calls; respects the privacy posture.
- Small surface: reuses `user_preferences` infra; the only genuinely new code is the L2
  checker + the pure compat helper + the Settings UI.

**Negative / trade-offs**

- No one-click silent install (user downloads + runs the installer manually). Acceptable for
  a light-maintenance app; revisit if builds get signed.
- GitHub unauthenticated API rate limit (60/hr) — fine at a daily interval; `lastCheckedAt`
  guards against bursts.

## Alternatives considered

- **`electron-updater` silent auto-install** (reads `latest*.yml`, already emitted by the
  release pipeline). Rejected for v1: requires macOS code signing to function, and silent
  install contradicts the "warn before a possibly-incompatible update" requirement. Remains
  the natural upgrade path once builds are signed — this ADR's preference shape is
  forward-compatible with it.
- **Explicit `minCompatibleVersion` release marker.** Deferred — more precise but adds a
  release-time step; semver-major + no-rollback note is enough for v1.
