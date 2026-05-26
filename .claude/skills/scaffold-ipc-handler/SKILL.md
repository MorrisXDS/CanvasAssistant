---
name: scaffold-ipc-handler
description: Generate a new IPC handler (registered via `ipcMain.handle`) with the `VisibleDataProvider` course-visibility filter wired in correctly per `CLAUDE.md` §8 "MANDATORY: Course Visibility Filtering". Prevents the common mistake of querying courses, tasks, notifications, calendar events, or files without filtering to visible courses — which leaks archived/hidden/term-filtered data into the UI. Use when the user says "scaffold an ipc handler", "new ipc handler", "add an ipc endpoint", or is creating any new `data:*` handler that touches course-scoped tables.
---

# Scaffold IPC handler

Every IPC handler that touches course-scoped data MUST filter through
`VisibleDataProvider`. Per `CLAUDE.md` §8:

> BEFORE writing ANY code that queries courses, tasks, notifications,
> calendar events, files, or any course-related data, you MUST use
> `VisibleDataProvider`.

The ONLY exception is `SyncEngine` (it discovers ALL courses from
Canvas — but that's the daemon, not an IPC handler).

## When to use

- Adding a new `data:*` IPC handler that reads from a course-scoped
  table (`tasks`, `notifications`, `calendar_events`, `resources`,
  `canvas_task_queue`, etc.).
- The user says any of the trigger phrases.

## Do not use when

- The IPC handler doesn't touch course data (e.g. settings, auth,
  global config — those don't need visibility filtering).
- Modifying an existing handler that already uses VisibleDataProvider
  (just edit it).

## Where handlers live

- `src/lifecycle/ipc-handlers/<topic>DataHandlers.ts` for data reads/writes
- `src/preload.ts` for the renderer-side API binding
- `src/shared/ipc-contract.ts` for the Zod schema if there's a request/response type

## Steps

### 1. Confirm intent

Ask the user (if unclear):

- What does the handler query/write? (read vs write, which table)
- What's the channel name? (`data:getThing` / `data:createThing`)
- What's the input/output shape?

### 2. Write the IPC handler — visibility-filtered SQL template

```ts
ipcMain.handle('data:get<Thing>', (_event, options?: { ... }) => {
  // ALWAYS get visible IDs first.
  const visibleIds = visibleDataProvider.getVisibleCourseIds();

  // If no visible courses, return empty (NOT all data!).
  if (visibleIds.length === 0) return [];

  // Filter the query to visible courses only.
  const placeholders = visibleIds.map(() => '?').join(', ');
  const sql = `
    SELECT *
    FROM <table>
    WHERE course_id IN (${placeholders})
      AND deleted_at IS NULL
      -- any other filters relevant to the handler
  `;
  return database.executeRead(sql, visibleIds);
});
```

### 3. If the handler invokes an L4 command

If the handler dispatches to an L4 command (e.g. `AcceptQueuedTaskCommand`),
the command itself must inject `VisibleDataProvider` via the
`CommandContext`. See `MergeQueuedTaskCommand.ts` for an example —
visibility isn't bypassed by routing through a command.

### 4. If the handler is a write

Writes are usually OK without the visibility filter (you're updating a
specific row by id, not enumerating). But if the write is bulk (e.g.
"archive all courses matching X"), the candidate set MUST come from
`getVisibleCourseIds()`.

### 5. Wire up `preload.ts`

```ts
get<Thing>: (options?: { ... }) => ipcRenderer.invoke('data:get<Thing>', options),
```

Add a corresponding type entry in `src/shared/ipc-contract.ts` if the
request/response uses a Zod schema.

### 6. Write a unit test

Per `CLAUDE.md` §7 "New public method MUST write unit test". Tests
mirror src: `tests/lifecycle/<topic>DataHandlers.test.ts` (or the
appropriate layer folder if the logic is in an L4 command).

The test MUST verify:

- Empty `visibleIds` → returns empty (not all data).
- Specific `visibleIds` → returns only rows in those courses.
- Archived / hidden / soft-deleted courses are excluded.

### 7. Pre-submit checklist (per §8)

- [ ] Does my code query courses, tasks, notifications, files, or
      calendar events?
- [ ] If yes, am I using `VisibleDataProvider.getVisibleCourseIds()`?
- [ ] If `visibleIds` is empty, do I return empty (not all data)?
- [ ] In the UI consumer (L6), am I filtering by `courseMap` from the
      store (which is already visibility-filtered)?

If any answer is "no", the handler is non-compliant. Fix before
shipping.

## Negative pattern — never do this

```ts
// ❌ WRONG: no visibility filter
const tasks = db.executeRead('SELECT * FROM tasks');

// ❌ WRONG: only checks one filter dimension
const tasks = db.executeRead(`
  SELECT * FROM tasks t JOIN courses c ON t.course_id = c.id
  WHERE c.archived_at IS NULL
`); // misses is_hidden + term selection

// ❌ WRONG: re-implementing visibility logic inline
const visibleCourses = courses.filter((c) => !c.isHidden && !c.archivedAt);
```

`VisibleDataProvider` is the single source of truth for what "visible"
means. Don't re-implement it.
