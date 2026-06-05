# 0002 — `better-sqlite3` + the Electron ABI constraint

Status: Accepted

## Context

The app needs fast, local, offline persistence. Async SQLite wrappers add latency and
callback complexity; the workload is local single-process reads/writes that want <1ms
latency.

## Decision

Use **`better-sqlite3`** (synchronous API, WAL mode) as the only database driver. Forbid
`sqlite3` (async) and any `fetch`-based remote DB. Pragmas: `journal_mode=WAL`,
`synchronous=NORMAL`, `foreign_keys=ON`, 64MB cache, 256MB mmap.

## Consequences

- Simple synchronous call sites; `Database.executeWrite/upsert/transaction` are blocking
  and fast. WAL allows concurrent reads during writes.
- **Native ABI lock (the big gotcha):** `better-sqlite3` is a native module compiled for a
  specific Node ABI. Electron bundles its _own_ Node, so the module must be rebuilt for
  Electron via `electron-builder install-app-deps` (wired into `npm run rebuild` / `predev`).
  After switching Node versions, run `npm rebuild`.
- A real downstream consequence: **you cannot open the app's DB from a plain-Node process**
  (e.g. a Playwright/Jest runner using system Node) — the ABI won't match. The e2e harness
  works around this by _copying_ the DB file rather than opening it from Node (see
  `e2e/fixtures/seed.ts`).
- Keep Node within the range Electron expects (see `engines` in `package.json` and `.nvmrc`).
