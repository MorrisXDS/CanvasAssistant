# 0001 — Seven-layer unidirectional architecture

Status: Accepted

## Context

CID is an offline-first Electron app that pulls Canvas data into local SQLite and presents
it in a React UI. Without structure, Electron apps tend to tangle main-process concerns
(DB, API, filesystem) with renderer concerns (UI, state), making them hard to reason about
and test.

## Decision

Organize all code under `src/layers/` into seven layers with a strict, one-directional
dependency rule (`L6 → L5 → L4 → L3/L2/L1 → L0`):

- **L0 utilities** — Logger, SystemMonitor, AppConfig, CredentialManager, HealthCheck
- **L1 persistence** — Database, MigrationRunner (SQLite WAL), VisibleDataProvider
- **L2 daemon** — CanvasClient, SyncEngine, RateLimiter, CircuitBreaker
- **L3 intelligence** — grade calculation + simulation (see ADR 0003 for what was removed)
- **L4 controller** — CommandDispatcher, commands
- **L5 presentation** — Zustand store, view models
- **L6 ui** — React components

Rules: no upward imports; cross-layer notifications via `EventEmitter`; the renderer
(L5/L6) talks to the main process (L0–L4) only across the `preload.ts` IPC bridge. Course
visibility is centralized in `VisibleDataProvider` (every consumer except `SyncEngine`
must filter through it).

## Consequences

- Clear seams make layers independently testable and the IPC boundary explicit.
- Some indirection: a UI action travels L6→L5→IPC→L4→L1 rather than calling the DB directly.
- The boundary is enforced by convention/review, not tooling — watch for upward imports in PRs.
- Full conventions live in `CLAUDE.md`, which remains the authoritative architecture doc.
