# Architecture

> A holistic tour of how Canvas Assistant is built — the layering, the process
> model, the data flow, and the invariants that keep it honest. Point decisions are
> recorded as [ADRs](adr/); this document ties them together. For how to run the
> test suites see [TESTING.md](TESTING.md).

## At a glance

Canvas Assistant is an **offline-first** Electron desktop app. The **local SQLite
database is the source of truth** for what the UI shows; Canvas is the _upstream_ that
a background sync engine pulls from. Everything already synced stays fully usable with
no network. Local edits (e.g. a target grade, a "what-if" grade) are layered on top of
the read-only Canvas data — see [ADR-0005](adr/0005-canvas-data-read-only-local-what-if-edits.md).

```
        ┌─────────────────────────── Electron app ───────────────────────────┐
        │                                                                      │
  Canvas LMS  ──HTTPS──▶  L2 SyncEngine  ──▶  L1 SQLite (WAL)  ──events──▶ UI │
   (upstream)            (rate-limited,         (source of truth)              │
                          circuit-broken)              ▲                       │
        │                                              │ IPC (typed, Zod)      │
        │   renderer (L5–L6)  ◀── reads via readers ───┤                       │
        │        │            ──── writes via commands ─▶                      │
        └────────┼─────────────────────────────────────────────────────────── ┘
                 └─ React + Zustand, keyboard-first
```

## The seven layers

Code lives under `src/layers/` as a strict stack with **unidirectional dependencies** —
a layer may import only from layers _below_ it. The renderer (L5–L6) and main process
(L0–L4) are separate runtimes that communicate **only** over IPC.

| Layer                 | Responsibility                                  | Key modules                                                                                                                                                                     |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L6 — UI**           | React components, pages, modals, keyboard hooks | `components/pages/*`, `components/primitives/Modal`, `hooks/useStackAwareHotkeys`, `hooks/useSectionScope`                                                                      |
| **L5 — Presentation** | Client state + derived views                    | Zustand `store`, `selectors`, `viewModels/*`                                                                                                                                    |
| **L4 — Controller**   | All writes, as command objects                  | `CommandDispatcher`, `commands/*Command`                                                                                                                                        |
| **L3 — Intelligence** | Pure analysis over local data                   | `GradeCalculationService`, grade simulation, content-analysis, data-quality (the priority/ROI layer was **removed** — [ADR-0003](adr/0003-removal-of-l3-intelligence-layer.md)) |
| **L2 — Daemon**       | Canvas I/O + sync                               | `CanvasClient`, `SyncEngine`, `RateLimiter`, `CircuitBreaker`, HTML/file download, exporters, `BackupManager`                                                                   |
| **L1 — Persistence**  | SQLite + schema + visibility                    | `Database`, `MigrationRunner`, `VisibilityOracle`, readers/repositories, `DatabaseRowTypes`                                                                                     |
| **L0 — Utilities**    | Cross-cutting primitives                        | `Logger` (PII-redacting), `AppConfig`, `CredentialManager` (keytar), `SystemMonitor`, `HealthCheck`                                                                             |

`src/layers/bootstrap/` holds the `ServiceRegistry` + `ServiceTokens` — the dependency-injection
wiring that constructs the layers in order at startup.

**Rules** (the ones that matter):

1. **No upward imports.** L1 never imports L2+; the renderer never imports a main-process module directly.
2. **Cross-layer notifications use events.** L1 emits commit events; higher layers subscribe.
3. **Course visibility everywhere** (see below) — only `SyncEngine` is exempt.

## Process model & the IPC boundary

The **main process** (CommonJS) owns L0–L4: the database, sync, the file system, the
keychain. The **renderer** (ESM via Vite, React) owns L5–L6. They never share memory;
they talk through a typed IPC contract:

- **`src/preload.ts`** — the context-bridge. `contextIsolation` is on and `nodeIntegration`
  is off, so the renderer reaches the main process _only_ through the `window.api.*`
  surface defined here.
- **`src/shared/ipc-contract.ts`** — the single source of truth for IPC channel shapes,
  validated with **Zod** at the boundary.
- **`src/lifecycle/ipc-handlers/*`** (28 handlers) — **thin adapters**. A handler carries
  **no SQL**: reads go through a named L1 _reader_, writes through an L4 _command_ via the
  `CommandDispatcher`. This is enforced by a test (see Invariants) — [ADR-0007](adr/0007-ipc-handlers-thin-adapters.md).
- Routing uses `HashRouter` because Electron serves the renderer over `file://` — [ADR-0004](adr/0004-hashrouter-for-electron-file-protocol.md).

## Data flow

**Sync (write-from-Canvas):**

```
SyncEngine.sync()
  → CanvasClient (axios) ──[RateLimiter: ≤3 concurrent]──[CircuitBreaker]──▶ Canvas API
  → DataMappers transform payloads → row shapes
  → Database.upsert (idempotent, WAL) with ETag/incremental-by-course
  → HTML pages cached locally + URLs rewritten to local paths (offline reading)
  → files downloaded via the download manager
  → a "sync updates" feed records what changed → surfaced on the Updates page
```

Conflicts are first-class: when a local edit clashes with a Canvas change, the change is
held as a **conflict** for the user to resolve (with sticky per-field preferences), and
Canvas tasks that look like existing local tasks raise a **duplicate-warning** flow
(link / keep-separate / bulk-merge). Sync is crash-safe — checkpoints and backoff state
let it resume.

**Read path:** L1 reader → IPC handler → preload → Zustand store → `selectors.*` → React
component. Components read domain data from the store via selectors (never a local copy).

**Write path:** component → `window.api.*` → IPC handler → `CommandDispatcher` → command
→ `Database` (transaction) → commit event → store refresh.

## Persistence

- **better-sqlite3** in **WAL** mode, synchronous API (sub-millisecond writes) — chosen
  for the Electron main process; the Node/Electron native-ABI handling is documented in
  [ADR-0002](adr/0002-better-sqlite3-and-electron-abi.md).
- **Programmatic migrations** (`MigrationRunner`, currently through v113) plus a
  **self-healing** startup pass (`CREATE TABLE IF NOT EXISTS` / `ALTER` for a few
  runtime-managed tables) — so the schema is always brought to current even on an empty
  DB. Rebuilding a table that has child foreign keys uses an FK-off rebuild migration —
  [ADR-0009](adr/0009-migration-fk-off-rebuilds.md).
- **`DatabaseRowTypes.ts`** is the single source of truth for every row interface.
- The same physical Canvas file can arrive via two sync paths; their unification is
  covered by [ADR-0008](adr/0008-file-entity-unification.md).

## Course visibility (a load-bearing invariant)

A course is _visible_ iff it is **not hidden, not archived, not deleted, and passes the
term filter**. Every course-scoped query — tasks, announcements, calendar, files,
notifications — filters through one **`VisibilityOracle`** / `VisibleDataProvider`, and
the UI reads pre-filtered `selectors.visible*`. The **only** exception is `SyncEngine`,
which must discover _all_ courses from Canvas. This prevents hidden/archived/out-of-term
data from leaking into any view, and it's verified end-to-end by `e2e/visibility.spec.ts`.

## State management (renderer)

A single **Zustand** store with `devtools` + `subscribeWithSelector`. The rule:
**page-level components render domain data from the store via `useStore(selector)`** —
local `useState` is reserved for UI-ephemeral concerns (open/closed flags, drafts, focus
indexes). This single-source-of-truth discipline avoids the "click does nothing" class of
desync bugs.

## Keyboard system

Canvas Assistant is keyboard-first, and the keyboard stack is deliberately engineered:

- **Modal-stack-aware hotkeys** ([ADR-0006](adr/0006-modal-stack-aware-hotkey-suppression.md)) —
  a `ModalStackContext` tracks open modals so page shortcuts can't "leak" past an open
  dialog; the `?` help even shows the topmost modal's own shortcuts.
- **Uniform section navigation** ([ADR-0010](adr/0010-section-nav-direct-jump-modifier.md)) —
  `useSectionScope` + a visual `SectionBar` give every multi-section page the same
  `Alt+1..N` direct-jump and `Q`/`E` cycle.

## Enforced invariants (fitness functions)

Several architectural rules are guarded by tests that **fail CI** if violated — so the
invariants can't silently rot:

| Test                                                | Guards                                                          |
| --------------------------------------------------- | --------------------------------------------------------------- |
| `tests/integration/ipc-handlers-no-raw-sql.test.ts` | No raw SQL in IPC handlers (ADR-0007)                           |
| `tests/integration/no-handwritten-modals.test.ts`   | All dialogs use the `Modal` primitive                           |
| `tests/integration/no-raw-usehotkeys.test.ts`       | No raw `useHotkeys` outside the stack-aware wrappers (ADR-0006) |
| `tests/integration/no-stray-high-zindex.test.ts`    | No ad-hoc high z-index values in L6                             |
| `e2e/skipGuard.reporter.ts`                         | The e2e suite never silently skips (ADR-0011)                   |

## Repository layout

```
src/
  main.ts              main-process entry (paths, lifecycle)
  preload.ts           context-bridge (window.api)
  renderer.tsx         renderer entry (React root)
  layers/l0…l6         the seven layers + bootstrap (DI)
  lifecycle/ipc-handlers/   28 thin IPC adapters
  shared/              ipc-contract (Zod), ipc-client, types
tests/                 Jest unit + integration (mirrors src/)
e2e/                   Playwright specs + deterministic seed (ADR-0011)
docs/adr/              architecture decision records
```

## Further reading

- [Architecture Decision Records](adr/) — the _why_ behind each decision.
- [TESTING.md](TESTING.md) — running the three test surfaces.
- [`../README.md`](../README.md) — features + getting started.
