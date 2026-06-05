# Architecture Decision Records (ADRs)

Short records of _why_ significant technical decisions were made — the context that
`git log` and the code itself don't capture. Read these first if you're taking over the
project; they explain choices that look surprising until you know the reasoning.

Format per record: **Context → Decision → Consequences**. Status is one of
`Accepted`, `Superseded by NNNN`, or `Deprecated`.

| #                                                         | Title                                                                | Status   |
| --------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| [0001](0001-seven-layer-architecture.md)                  | Seven-layer unidirectional architecture                              | Accepted |
| [0002](0002-better-sqlite3-and-electron-abi.md)           | `better-sqlite3` + the Electron ABI constraint                       | Accepted |
| [0003](0003-removal-of-l3-intelligence-layer.md)          | Removal of the L3 "intelligence" layer                               | Accepted |
| [0004](0004-hashrouter-for-electron-file-protocol.md)     | HashRouter for the Electron `file://` renderer                       | Accepted |
| [0005](0005-canvas-data-read-only-local-what-if-edits.md) | Canvas data read-only; local edits are "what-if" only (one-way sync) | Accepted |
| [0007](0007-ipc-handlers-thin-adapters.md)                | IPC handlers are thin adapters; no raw DB access                     | Accepted |
| [0008](0008-file-entity-unification.md)                   | FileEntity: unified read model for Canvas-side file blobs            | Accepted |

## Adding an ADR

Copy the Context/Decision/Consequences shape, number it sequentially, add a row above.
Write one when a decision is non-obvious, hard to reverse, or future-you would ask "why on
earth did we do it this way?"
