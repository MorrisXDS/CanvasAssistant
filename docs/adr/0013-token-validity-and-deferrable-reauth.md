# ADR-0013: Token validity (tri-state) + deferrable re-auth with app-wide sync gating

- **Status:** Accepted
- **Date:** 2026-06-05
- **Supersedes:** —

## Context

A user launched the packaged Linux build with a stored-but-revoked Canvas token (graduated →
token revoked) on a machine with no OS secret service (so the encrypted-file credential
fallback was used). The app:

1. **skipped onboarding** — `isAuthenticated` was derived from token **presence**, not
   validity, so a revoked-but-present token looked "authenticated";
2. landed on a dead Dashboard with a "Canvas Student" placeholder and a generic "Sync Error",
   logging "Canvas client not initialized" on every sync;
3. **never showed a re-auth prompt** — the boot-time `token-invalid → auth:expired` push fired
   **before** the renderer window/subscription existed and was lost.

Worse, the prior `validateToken` was **binary**: any non-2xx OR any thrown error (including a
plain network failure) returned `false`, which made `retrieve()` discard the token. So an
**offline** launch with a perfectly good token would _delete the credential_ — offline was
indistinguishable from revoked.

## Decision

Gate Canvas auth on token **validity**, modelled as a **tri-state** verdict, and make re-auth
**deferrable** with an app-wide sync gate while deferred.

### 1. Tri-state validity classifier (the load-bearing core)

A new pure, unit-testable L0 function `classifyValidationResult` maps one Canvas
`/users/self` probe outcome to:

- `valid` — 2xx response. Token is good.
- `invalid` — 401/403 (response OR an `AxiosError` carrying a 401/403 response). Definitive:
  revoked / no access.
- `unknown` — everything else: no-response (offline / DNS / timeout), 5xx, 429, 404, 3xx,
  plain `Error`, non-Error throwables.

`CredentialManager` uses this internally and tracks `lastValidationVerdict`. The key behaviour
change: **`retrieve()` discards the token and emits `token-invalid` ONLY on `invalid`** — an
`unknown` (offline) verdict KEEPS the stored token. Background validation likewise only emits
`token-invalid` on `invalid`. `getStatus()` now returns `validity` (tri-state) alongside the
legacy `isValid` boolean (`isValid` is `null` when `unknown`, so a network blip never reports a
good token as failed).

### 2. Startup-race fix — pull (primary) + replay (secondary)

- **Primary — `auth:getStatus` IPC pull.** The renderer's `initialize()` calls
  `getAuthStatus()` → `{ hasCredential, validity, lastCheckedAt }`. If
  `validity === 'invalid'` it sets `authError`. A pull is race-free (the renderer asks when it
  is ready), so no push can be lost. This alone fixes the reported bug.
- **Secondary — replay.** `AppLifecycle` records the startup verdict and, once the main
  window's `did-finish-load` fires, re-emits `auth:expired` **iff the verdict was `invalid`**.
  Cheap insurance reusing the existing channel + store subscription. `setAuthError` is
  idempotent, so pull + replay + a live push all converge on one `authError` and one
  `<ReAuthModal>`.

`auth:getStatus` lives in `ipc-handlers/**` but touches **no database** (credentials are in
keychain / encrypted file), so the ADR-0007 hard-zero SQL gate is satisfied trivially — no
reader/command needed.

### 3. Deferrable re-auth + app-wide sync gate

- `ReAuthModal` gains a **Later** button (`onLater`). Later does NOT de-authenticate (the user
  stays in the app with imported data) — it sets a store flag `authReauthDeferred` and
  dismisses the modal. (Contrast Disconnect, which still deletes the credential.)
- While `authReauthDeferred || authError`, **every sync trigger is greyed out app-wide** and
  `triggerSync` itself no-ops with a clear reason. UI sites read a single
  `selectSyncDisabled` / `selectSyncDisabledReason` selector — `authReauthDeferred` lives ONLY
  in the store (CLAUDE.md §2 single source of truth).
- A successful reconnect calls `clearAuthError`, which clears BOTH `authError` and
  `authReauthDeferred`, re-enabling sync automatically. `reopenReauth` lets the disabled
  Dashboard button / AccountSection re-open the modal after Later.

### 4. AccountSection three-state badge

`AccountSection` becomes validity-aware via `getAuthStatus` (read-only): **Connected** /
**Token expired** (+ Reconnect CTA) / **Offline** (+ "Last checked …" via `formatTimeAgo`).

## Consequences

- **Offline never invalidates a good token** — the central guarantee. Pinned by a
  CredentialManager regression test (network error → token retained, no `token-invalid`,
  validity not clobbered).
- "Authenticated" now means **valid**, not merely **present**.
- **Auto-sync asymmetry:** main-process `AutoSyncManager` bypasses the renderer `triggerSync`;
  it is gated separately — an `invalid` startup verdict means the Canvas client was never built,
  and the engine already no-ops when null. The renderer `authReauthDeferred` flag does NOT gate
  main-process auto-sync. (Noted in code comments so a future reader doesn't expect it to.)
- The live runtime `auth:expired` path (401-during-request → CanvasClient `auth-error` →
  `auth:expired` → store) is unchanged; we ADD the startup pull + tri-state, we don't remove
  the push.

## Alternatives considered

- **Pull-only (no replay):** sufficient to fix the bug, but the ~5-line replay removes any
  residual ordering assumption at negligible cost and reuses existing surface.
- **Binary "valid/invalid" only:** rejected — it is exactly what caused offline to look like
  revocation. The third (`unknown`) bucket is the whole point.
- **Blocking re-auth (no Later):** rejected — the user has imported data and should not be
  locked out of the app while offline or unwilling to reconnect immediately.
