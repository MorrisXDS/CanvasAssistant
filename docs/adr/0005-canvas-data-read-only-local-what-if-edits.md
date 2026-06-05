# 0005 — Canvas data is read-only upstream; local edits are "what-if" only

Status: Accepted

## Context

Canvas LMS is the system of record for courses, assignments, grades, and files. The app
syncs that data locally, but users also edit task fields (grade, weight, dates), run grade
**simulations**, create their own calendar events, and download files. A choice was needed:
does the app ever write back to Canvas, and what happens to local edits when Canvas changes
the same data?

(Originally resolved in the old `OPEN_QUESTIONS.md` Q2.3 / Q3.4; preserved here.)

## Decision

- **Sync is one-way: Canvas → local.** The app **never writes back to the Canvas API.**
- **Local edits to Canvas objects are planning / "what-if" annotations**, stored locally
  (e.g. `local_modified_at`, grade simulation state). They are not pushed upstream.
- **Conflict, don't clobber.** When a local edit and a Canvas update touch the same field,
  surface a conflict for the user to resolve (the Updates page / `canvas_task_queue` flow)
  rather than silently overwriting either side.
- **Files sync one-way, on demand** — manual download from Canvas to local storage; no
  bidirectional sync, no automatic background mirroring.

## Consequences

- Editing a Canvas-derived task locally is safe: it can't corrupt the student's real Canvas
  account, which is why grade what-if simulation is allowed freely.
- No Canvas write-API integration to build or maintain (auth scopes, error handling, etc.).
- The DB carries local-vs-remote bookkeeping (`local_modified_at`) and the app needs the
  conflict-resolution UI — that complexity is intentional, not accidental.
- A Canvas pull must **not** blindly overwrite locally-edited fields; respect the conflict path.
