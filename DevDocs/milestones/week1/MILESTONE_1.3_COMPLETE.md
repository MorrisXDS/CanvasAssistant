# Week 1 Milestone 1.3 - Layer 1 Persistence (SQLite)

**Status:** ✅ Complete
**Date:** January 21, 2026

---

## Overview

Implemented the Layer 1 Persistence layer with SQLite database using WAL mode, a migration system, and event emission on commits.

## Deliverables

### 1. Database Module (`src/layers/l1-persistence/Database.ts`)

Core SQLite wrapper with:

- **WAL Mode:** Journal mode set to WAL for concurrent reads during writes
- **Performance PRAGMAs:**
  - `synchronous = NORMAL` for <1ms write latency
  - `foreign_keys = ON` for referential integrity
  - `cache_size = -64000` (64MB cache)
  - `mmap_size = 268435456` (256MB memory-mapped I/O)
- **Event Emission:** Emits `commit` events with table name and operation type
- **Upsert Support:** Idempotent inserts via `ON CONFLICT` clause
- **Transaction Support:** Atomic operations with automatic rollback

```typescript
// Usage example
const db = new Database({ dbPath: 'data/cid.db' });
db.initialize();

db.on('commit', (event) => {
  console.log(`Table ${event.table} had ${event.operation}`);
});

db.upsert('courses', {
  external_id: 'course_123',
  name: 'ECE314',
  current_grade: 85.5,
});
```

### 2. Migration System (`src/layers/l1-persistence/MigrationRunner.ts`)

Versioned schema management:

- **Version Tracking:** `schema_version` table stores applied migrations
- **Sequential Execution:** Migrations run in version order
- **Rollback Support:** Optional `down` SQL for reverting changes
- **Error Handling:** Stops on first error, reports all issues

```typescript
// Usage example
const runner = new MigrationRunner(db);
runner.loadMigrations(coreMigrations);
const result = runner.runAll();
// { applied: 9, errors: [] }
```

### 3. Core Schema (9 migrations)

| Version | Table | Description |
|---------|-------|-------------|
| 1 | `courses` | Course info, grades, targets |
| 2 | `assignments` | Work items with priority scores |
| 3 | `calendar_events` | Canvas + user-created events |
| 4 | `notifications` | Announcements and system alerts |
| 5 | `resources` | Files and folders |
| 6 | `grade_history` | Historical grade tracking |
| 7 | `user_preferences` | App settings (JSON values) |
| 8 | `sync_metadata` | ETag caching for API calls |
| 9 | (indexes) | Performance indexes |

### 4. Performance Indexes

```sql
idx_assignments_priority    -- Priority-sorted queries
idx_assignments_due_date    -- Due date filtering
idx_assignments_course      -- Course lookups
idx_notifications_dismissed -- Active notification queries
idx_notifications_course    -- Course notification lists
idx_calendar_events_start   -- Calendar date ranges
idx_resources_course        -- File browser queries
idx_grade_history_course    -- Grade trend lookups
```

---

## Test Results

**Total Tests:** 39 (Layer 1)
**All Passing:** ✅

### Database.test.ts (23 tests)
- Initialization (4 tests)
- PRAGMA Configuration (3 tests)
- Write Operations (4 tests)
- Read Operations (3 tests)
- Transactions (2 tests)
- Upsert Operations (3 tests)
- Performance (2 tests)
- Schema Version Tracking (2 tests)

### MigrationRunner.test.ts (16 tests)
- Migration Loading (2 tests)
- Pending Migrations (2 tests)
- Running Migrations (3 tests)
- Rollback (2 tests)
- Migration Status (2 tests)
- Core Migrations (5 tests)

---

## Performance Metrics

| Metric | Target | Achieved |
|--------|--------|----------|
| Write Latency | <1ms | **0.248ms** ✅ |
| WAL Mode | Enabled | ✅ |
| Foreign Keys | Enforced | ✅ |
| All Tables Created | 8 | ✅ |
| Indexes Created | 8 | ✅ |

---

## Files Created/Modified

### New Files
- `src/layers/l1-persistence/Database.ts`
- `src/layers/l1-persistence/MigrationRunner.ts`
- `src/layers/l1-persistence/index.ts`
- `tests/l1-persistence/Database.test.ts`
- `tests/l1-persistence/MigrationRunner.test.ts`

### Directories Created
- `src/layers/l1-persistence/`
- `tests/l1-persistence/`
- `migrations/`

---

## Architecture Notes

### Event-Driven Updates

The database emits commit events that Layer 5 (Presentation) can subscribe to:

```typescript
db.on('commit', ({ table, operation, rowId }) => {
  if (table === 'courses') {
    store.refreshCourses();
  }
});
```

### Idempotent Upserts

All Canvas data is synced using external_id for conflict resolution:

```typescript
db.upsert('assignments', {
  external_id: 'canvas_assignment_456',
  course_id: 1,
  title: 'Midterm Exam',
  due_at: '2026-02-15T23:59:00Z',
});
```

This ensures:
- First sync: INSERT new record
- Subsequent syncs: UPDATE existing record
- No duplicates regardless of sync frequency

---

## Next Steps

**Week 2 Milestone 2.1:** Canvas API Authentication
- CanvasClient class with base URL configuration
- API token storage via Electron safeStorage
- Token validation with `/api/v1/users/self` endpoint

---

## Checklist

- [x] SQLite database with WAL mode
- [x] PRAGMA configuration for performance
- [x] Migration system with version tracking
- [x] All 8 core tables created
- [x] Performance indexes
- [x] Event emission on commits
- [x] Idempotent upsert support
- [x] Write latency <1ms
- [x] 39 tests passing
- [x] Documentation complete
