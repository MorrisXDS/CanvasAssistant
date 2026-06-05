# ADR-0009: Foreign-key-off table rebuilds in the migration engine

- **Status:** Accepted
- **Date:** 2026-06-02
- **Supersedes:** —
- **Related:** ADR-0003 (L3 removal — source of the zombie tables this unblocks)

## Context

`MigrationRunner.runMigration` runs every migration inside `db.transaction(...)`,
and `Database.initialize()` turns `PRAGMA foreign_keys = ON` (CLAUDE.md §5). Inside
a transaction, `PRAGMA foreign_keys` is a **no-op** — SQLite ignores attempts to
toggle it once a transaction is open. So a migration cannot turn FK enforcement off.

This blocks the canonical SQLite "12-step" table rebuild (the only way to drop a
column that participates in a foreign key, or to change a `CHECK`/constraint): the
rebuild must `DROP` the old table, but dropping a table that has **child** FK
references fails under FK-on. Confirmed empirically (2026-06-01): dropping
`course_policies` while `notifications.linked_policy_id` references it makes every
subsequent `notifications` INSERT throw `no such table: course_policies`.

Concretely, this gated several cleanups:

- Dropping `course_policies` (needs a `notifications` rebuild to drop `linked_policy_id`).
- Dropping `course_task_groups` (needs a `tasks` rebuild to drop `task_group_id`).
- Widening the `resources.context_type` CHECK so page-dependency files can be marked
  distinctly (needs a `resources` rebuild; `resources` has child FKs incl. a self-ref).

## Decision

Add an opt-in `disableForeignKeys?: boolean` flag to the `Migration` interface. When
set, `MigrationRunner` runs that migration's `up` (and, on rollback, its `down`) with
foreign-key enforcement **off**, following SQLite's recommended sequence:

```
PRAGMA foreign_keys = OFF;          -- outside any transaction (no-op inside one)
BEGIN;
  …migration body (the table rebuild)…
  PRAGMA foreign_key_check;         -- abort the migration if it left dangling FKs
COMMIT;
PRAGMA foreign_keys = ON;           -- always restored, even on error (finally)
```

- The `PRAGMA foreign_keys = ON` restore lives in a `finally`, so enforcement is
  re-enabled no matter how the body exits.
- `PRAGMA foreign_key_check` after the body is the safety net: a rebuild that
  re-parents rows incorrectly (orphans) fails the migration loudly instead of
  silently corrupting referential integrity.
- **Unflagged migrations are completely unchanged** — they keep running inside the
  FK-on transaction exactly as before. The flag is per-migration opt-in, so the 109
  existing migrations have zero behavioral change and zero risk.

## Consequences

- **Enables** the deferred schema drops (`course_policies`, `course_task_groups`) and
  the `resources.context_type` CHECK widening, each as a flagged rebuild migration.
- The flag is a sharp tool: a flagged migration runs without FK enforcement, so its
  body is responsible for keeping child rows consistent (then `foreign_key_check`
  verifies it). Use it ONLY for genuine table rebuilds; never as a convenience to
  dodge a constraint.
- `runAll` still stops on the first error; a failed flagged migration restores
  `foreign_keys = ON` before propagating, so the connection is never left in an
  FK-off state.
- No change to the public migration-authoring API beyond the one optional field.
