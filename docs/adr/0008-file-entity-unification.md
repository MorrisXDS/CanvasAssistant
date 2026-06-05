# 0008 — FileEntity: unified read model for Canvas-side file blobs

Status: Accepted (2026-05-28 via PR-F.2)

> Flipped from **Proposed** to **Accepted** when PR-F.2 landed the
> `FileEntityProvider`, the two readers (`CanvasFileReader`,
> `AnnouncementAttachmentReader`), the
> `idx_notification_attachments_external_id` migration, and the divergence
> logging instrumentation. PR-F.3 still ships the IPC handler / UI
> migration that exposes FileEntity to renderer consumers.

## Context

The codebase has **two physically distinct file row sources** for Canvas
files, with different identities, schemas, and lifecycles:

- **`resources`** rows with `type='file'` — Canvas files surfaced via a
  course's Files area, modules, syllabi, etc. Identified locally by
  `resources.id`; identified Canvas-side by `resources.external_id`
  (`TEXT UNIQUE NOT NULL`). Written by `SyncContentOperations`.
- **`notification_attachments`** rows — files attached to announcements
  (`notifications.source_type='announcement'`). Identified locally by
  `notification_attachments.id`; identified Canvas-side by
  `notification_attachments.external_id` (`TEXT NOT NULL`, with
  `UNIQUE(notification_id, external_id)`). Written by
  `AnnouncementSyncStrategy.processAttachments`.

CONTEXT.md's "Files & references" cluster already names these as
**CanvasFile** and **AnnouncementAttachment**. The "Same blob, two entities"
flagged ambiguity calls out the open question: _can the same Canvas file
exist as both a CanvasFile and an AnnouncementAttachment, and if so, how do
we reason about it as one thing?_

[Issue #29](https://github.com/MorrisXDS/CanvasAssistant/issues/29)
("render announcement-body file references as clickable Files-page links")
is the first concrete consumer that needs the answer. The user clicks a file
link inside an announcement; the app should navigate to the Files-page entry
for that file. Today no such unified concept exists in the IPC contract —
the renderer would have to do a Canvas-ID-keyed JOIN-equivalent lookup
itself, twice (once into each table), and decide what to do when the same
ID appears on both sides.

### Empirical premise

The unification is only meaningful if a single Canvas blob receives the
**same `external_id`** across both sync paths. Three pieces of converging
evidence support this premise:

1. **Codebase types** (`src/layers/l2-daemon/data/DataMapperTypes.ts`):
   `CanvasFile` and `CanvasAttachment` share an identity core — both carry
   `{ id: number; uuid: string; display_name; filename; url; size;
content_type; created_at; }`. `CanvasFile` is a strict superset.
2. **Canvas API documentation** for discussion-topic attachments
   ([Discussion Topics API](https://developerdocs.instructure.com/services/canvas/resources/discussion_topics)):
   the `FileAttachment.url` example is
   `http://www.example.com/courses/1/files/1/download` — the path embeds
   the canonical Canvas File ID. Whatever the JSON object's `id` field looks
   like, the URL hardcodes the canonical one.
3. **Schema permissibility**: `resources.external_id` is `UNIQUE` globally;
   `notification_attachments.external_id` is `UNIQUE(notification_id,
external_id)`. The latter is consistent with "the same `external_id`
   recurring across rows for many announcements" — which is exactly the
   shape we'd see if Canvas IDs collide across paths.

**Honest confidence**: ~85%. The grilling on 2026-05-28 did not directly
observe collisions in the user's local DB (which has 340 file rows but
0 attachment rows — no announcements with attachments synced yet). The
premise is extrapolated from API doc URL patterns + the codebase's own
modeling, not from direct observation. PR-F.2 should add an instrumented
sanity check at provider startup that logs (but does not crash on) any
external_id appearing in only one table when both tables have rows for
the same course — turning the assumption into a live monitored invariant.

### Asymmetry the design must accept

Not every announcement attachment has a course-files sibling. Files
uploaded _directly during announcement composition_ in Canvas exist as
globally-identified File records but may not appear in
`/courses/:id/files`. So the model is NOT "one row in each table per
blob" — it's "at least one row in at least one table per blob."

## Decision

Introduce a **FileEntity** wire type in `src/shared/ipc-contract.ts`,
identified by the colliding `external_id` (renamed to `canvasId` on the
wire), with canonical fields once at the top level and source-specific
extensions nested under `presences`:

```ts
interface FileEntity {
  canvasId: string; // Canvas File ID — the natural key
  uuid: string | null;
  filename: string; // canonical (sourced from canvasFile presence or first attachment)
  displayName: string; // canonical
  sizeBytes: number | null; // canonical
  contentType: string | null; // canonical
  courseId: number; // canonical (Canvas files are course-scoped)
  presences: {
    canvasFile: {
      // at most one (UNIQUE on external_id)
      resourceRowId: number;
      contextType: string | null;
      folderPath: string | null;
      localPath: string | null;
      remoteUpdatedAt: string | null;
    } | null;
    attachments: Array<{
      // many (one per announcement)
      attachmentRowId: number;
      notificationId: number;
      downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
      localPath: string | null;
      downloadedAt: string | null;
    }>;
  };
}
```

A Zod `.refine` enforces **at least one presence is populated** at parse
time — so a FileEntity is never an empty shell.

FileEntity is a **read model**: it has no backing table of its own, and
introduces no schema migration in PR-F.1. The two source tables stay
exactly as they are. A `FileEntityProvider` (PR-F.2) composes two pure
readers — `CanvasFileReader` and `AnnouncementAttachmentReader` — and
emits FileEntity at read time.

### Sub-decisions (resolved during the 2026-05-28 grilling)

**Shape is a unified read model (B), not a TS-only union (A) and not a new
backing table (C).** The TS-only union (A) creates union-noise at every
consumer and adds no semantic guarantee. A new backing table (C) is the
most "correct" but requires a migration, sync-code rewrite, and locks in a
write-side guess. The read-model layer (B) gives consumers one type, keeps
the schema stable, and is reversible — if a future ADR picks C, B's reader
becomes the migration target shape.

**Scope is `resources` (where `type='file'`) + `notification_attachments`
only.** Folders, pages, external URLs, ImportedCalendar `.ics` files,
HtmlExport entries, course-page bodies — all excluded. They're either not
blobs or not Canvas-side.

**Identity is `canvasId: string`** — the Canvas File ID — which is also the
colliding `external_id` value on both source tables. Stored as `string`
because the source columns are `TEXT` and we never do arithmetic on it.
The Canvas-provided `uuid` rides along as a companion field but is not
used for lookup.

**Single-id lookups bypass visibility.** `findByCanvasId(id)` returns the
entity regardless of course visibility. List-scoped lookups
(`findByCourseIds`) honor visibility composition at the IPC handler layer.
This mirrors ADR-0007's sub-decision α: list endpoints filter, single-id
endpoints don't. The intuition is the same — issue #29's click-through
should not silently fail because the user archived the course since
opening the announcement.

**Provider lives at `src/layers/l1-persistence/FileEntityProvider.ts`** as
a sibling to `VisibilityOracle`. Promoted into a `providers/` subdirectory
later if more providers emerge. The two readers go in the existing
`src/layers/l1-persistence/readers/` directory established by PR-B.

**Provider API surface (locked):**

```ts
class FileEntityProvider {
  findByCanvasId(id: string): FileEntity | null;
  findByCanvasIds(ids: readonly string[]): Map<string, FileEntity>;
  findByCourseIds(courseIds: readonly number[]): FileEntity[];
}
```

- The batch lookup returns a Map so callers can detect misses by key.
- `findByCourseIds` is the only list-scoped method; IPC handlers compose
  with `VisibilityOracle.getVisibleCourseIds()` before calling it.

**Canonical-field sourcing rule.** When both presences exist and agree
(the common case), it doesn't matter which we read. When they disagree,
`canvasFile` wins — it is the most directly-from-Canvas source and is
re-written by every files sync. The provider should log divergence so
sync bugs surface; it should not silently mask them.

**Issue #29's URL → canvasId extraction stays in
`src/layers/l2-daemon/data/htmlParsingUtils.ts`** — the existing home for
HTML link parsing. The provider speaks Canvas IDs, not URLs. Keeps single
responsibility per file.

### Index addition (PR-F.2 deliverable)

For Shape B's perf claim to hold, `notification_attachments.external_id`
must be indexed. Today it isn't — only `notification_id` and `course_id`
have indexes. `EXPLAIN QUERY PLAN SELECT * FROM notification_attachments
WHERE external_id = ?` reports `SCAN notification_attachments` — a full
table scan.

PR-F.2 will add the migration:

```sql
CREATE INDEX idx_notification_attachments_external_id
  ON notification_attachments(external_id);
```

Safe (additive, non-unique, reversible). Without it, the unification reads
that drive the Files page and announcement-body navigation degrade to
O(N) over all attachments per lookup.

### Why a read model rather than a backing table

A new `file_entities` table with FKs from both `resources` and
`notification_attachments` would be the most "correct" — a single canonical
row per blob, with the source rows pointing at it. We rejected this for
PR-F.1's scope because:

- **Migration risk.** Every sync writer would need restructuring: insert
  into `file_entities` first, then into the source-specific row. The
  invariants get harder (FK setup ordering, transactional consistency).
- **Locks in a write-side guess.** If a future architectural review wants
  to split things back (e.g., because Canvas exposes attachment-only
  metadata distinct from blob-level metadata), unwinding is painful.
- **Issue #29 only needs a read shape.** The first concrete consumer is
  click-through: given an `external_id` from announcement HTML, find the
  unified record. That's a one-query lookup, not a write-path.

If usage profile changes and the unification needs to be cheaper or
write-side enforced, the existing read-model provider becomes the
migration target shape — no wasted PR-F work.

### Why not a TypeScript-only union (`CanvasFile | AnnouncementAttachment`)

A TS-only union over the existing types would compile, but every consumer
would have to destructure `kind` (or read `source: 'resource' | 'attachment'`)
and handle "this is a CanvasFile" and "this is an AnnouncementAttachment"
separately. That defers the unification to N consumer sites instead of
solving it once. It also leaves the "same blob = two rows = which one do I
pick?" question to every caller. The read-model provider answers it once.

## Consequences

### Improves

- **One question, one answer.** "Given Canvas File ID X, what do I render
  / navigate to?" gets a single SQL path through `FileEntityProvider`.
  Issue #29 has a concrete consumer to call.
- **CONTEXT.md "Same blob, two entities" ambiguity becomes resolved.** The
  glossary updates in PR-F.1 promote FileEntity to a defined term and the
  flagged ambiguity becomes "FileEntity — see ADR-0008."
- **No migration risk in PR-F.1.** Pure type addition + tests. The schema,
  sync writers, and existing IPC handlers all stay exactly where they are.
- **Read-side asymmetry handled honestly.** The `presences` discriminated
  union correctly models "this blob might be in course Files, might be in
  one or more announcements, might be both" — not pretending to a
  symmetric pair.

### Costs

- **Two reads per lookup.** `findByCanvasId(id)` runs one query against
  `resources` and one against `notification_attachments`. Sub-millisecond
  per CLAUDE.md §5's SQLite-WAL-mmap profile (once the
  `notification_attachments.external_id` index lands in PR-F.2).
- **Divergence between presences is silent unless instrumented.** If
  sync paths write differing `filename` values for the same `external_id`,
  the provider's canonical-field sourcing rule (canvasFile wins) hides
  the disagreement from consumers. The provider must log divergence so it
  surfaces in `.logs/`.
- **`FileResourceSchema` and `FileAttachmentSchema` linger.** Existing
  IPC handlers (`data:getFiles`, etc.) still return the old `FilesData`
  shape. They will be migrated to return `FileEntity[]` in PR-F.3, and the
  legacy schemas removed in a follow-up cleanup PR after all consumers
  migrate. Temporary contract duplication is acceptable.

### Risks

- **Empirical premise is ~85%, not 100%.** If Canvas ever returns a
  different `id` for the same blob across sync paths (e.g., per-attachment
  scoping for announcement uploads), the unification silently fragments —
  what looks like "one blob with both presences" would actually be "two
  blobs, each with one presence." PR-F.2's startup-time logging mitigates
  this: it catches divergent IDs once data lands and the team can decide.
- **Index addition is in a separate PR.** If PR-F.2 ships its provider
  but the migration ALSO has to revert for some reason, the perf claim
  breaks. Acceptable risk — migrations are well-tested infrastructure.
- **Issue #29's renderer depends on the chain landing.** Until PR-F.3
  migrates the IPC handlers and exposes the lookup to the renderer,
  Issue #29 stays open. This is the planned sequence; mentioned for
  visibility.

## Migration plan

- **PR-F.1 — Contract.** This PR. Adds `FileEntitySchema` + `FileEntity`
  to `src/shared/ipc-contract.ts`. Adds 7 contract tests locking the
  refinement invariant. Adds this ADR (Status: Proposed). Updates
  CONTEXT.md to define FileEntity and resolve the "Same blob, two
  entities" ambiguity.
- **PR-F.2 — Provider + readers + index.** Introduces
  `CanvasFileReader` and `AnnouncementAttachmentReader` in
  `src/layers/l1-persistence/readers/`. Introduces
  `FileEntityProvider` at `src/layers/l1-persistence/FileEntityProvider.ts`.
  Adds the
  `CREATE INDEX idx_notification_attachments_external_id` migration.
  Tests pin the union logic, the canonical-field sourcing rule, and the
  divergence logging. **Flips this ADR's status to Accepted.**
- **PR-F.3 — Handler + UI migration.** Migrates
  `src/lifecycle/ipc-handlers/fileDataHandlers.ts` to return FileEntity
  via the provider. Wires Issue #29's announcement-body renderer to
  `findByCanvasId`. Removes inline `database.execute*` from file IPC
  handlers (ADR-0007 enforcement).
- **Cleanup (later, opportunistic).** Removes `FileResourceSchema` /
  `FileAttachmentSchema` from the contract once no consumer reads them.

## Related

- [ADR-0007](0007-ipc-handlers-thin-adapters.md) — IPC handlers are thin
  adapters. PR-F.2 + PR-F.3 follow PR-B's exemplar shape (reader + Oracle
  - mapper).
- [CONTEXT.md](../../CONTEXT.md) — "Files & references" cluster names
  CanvasFile, AnnouncementAttachment, FileReference, and the
  three reference subtypes. PR-F.1's CONTEXT.md update adds FileEntity
  alongside these.
- [Issue #29](https://github.com/MorrisXDS/CanvasAssistant/issues/29) —
  clickable announcement-body file links. The first concrete consumer.
- [docs/FOLLOWUPS.md](../FOLLOWUPS.md) — "Investigate Canvas file-ID
  stability across sync paths" section. This ADR closes that
  follow-up's design tree even though the empirical verification is still
  pending in production data.
