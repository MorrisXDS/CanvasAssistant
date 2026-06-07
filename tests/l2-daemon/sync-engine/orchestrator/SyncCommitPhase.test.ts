/**
 * SyncCommitPhase — announcement source_type regression tests (bug fix)
 *
 * Bug: SyncCommitPhase.ts lines 393 & 412 bound source_type = 'announcement'
 * in the notifications existence check, but the notifications table CHECK
 * constraint only allows ('canvas','system'). The literal 'announcement' can
 * never match, so existingAnn was always null, insertedAnn was always null,
 * and recordSyncUpdate() — the only code path that writes announcement
 * sync_updates — never fired. New announcements were silently missing from
 * the Updates feed.
 *
 * Fix: both predicates changed to source_type = 'canvas'.
 *
 * This file pins three assertions (per §7 regression-test requirement):
 *   1. Bug-documentation: the old 'announcement' predicate returns 0 rows
 *      against a 'canvas'-stored notification row (proves the dead code path).
 *   2. Post-fix new announcement: exactly 1 sync_updates row with
 *      entity_type='announcement' and change_type='new' is recorded.
 *   3. Post-fix re-sync idempotency: a second commit of the same announcement
 *      records 0 additional sync_updates rows.
 */

import { EventEmitter } from 'events';
import { Database } from '../../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../../src/layers/l1-persistence/MigrationRunner';
import { executeCommitPhase } from '../../../../src/layers/l2-daemon/sync-engine/orchestrator/SyncCommitPhase';
import type {
  OrchestratorContext,
  FetchedData,
} from '../../../../src/layers/l2-daemon/sync-engine/orchestrator/OrchestratorTypes';
import type {
  CanvasCourse,
  CanvasAnnouncement,
} from '../../../../src/layers/l2-daemon/data/DataMappers';

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Set up a fresh in-memory DB with all migrations applied. */
function makeDb(): Database {
  const db = new Database({ dbPath: ':memory:', verbose: false });
  db.initialize();
  const runner = new MigrationRunner(db);
  runner.loadMigrations(coreMigrations);
  runner.runAll();
  return db;
}

/**
 * Seed the minimum rows needed for the announcement commit path.
 * FK order: courses → sync_sessions (sync_updates FK to both).
 * notifications.course_id FK → courses.id ON DELETE CASCADE.
 */
function seedCourse(db: Database, opts: { id: number; externalId: number }): void {
  db.executeWrite(
    `INSERT OR IGNORE INTO courses (
       id, external_id, code, name, target_grade, enrollment_term_id
     ) VALUES (?, ?, 'TST101', 'Test Course', 85.0, 1)`,
    [opts.id, String(opts.externalId)],
    'courses'
  );
}

function seedSyncSession(db: Database, syncId: string): void {
  db.executeWrite(
    `INSERT OR IGNORE INTO sync_sessions (id, started_at, created_at)
     VALUES (?, datetime('now'), datetime('now'))`,
    [syncId],
    'sync_sessions'
  );
}

// ---------------------------------------------------------------------------
// Minimal OrchestratorContext stub
// ---------------------------------------------------------------------------

/**
 * Build a minimal ctx stub that satisfies executeCommitPhase.
 * Only the fields actually referenced by the announcement commit loop
 * (and the surrounding setup: emitter, checkpointManager, client, course loop)
 * need real implementations. Everything else is a no-op stub.
 */
function makeCtx(db: Database): OrchestratorContext {
  return {
    db,
    client: {
      getBaseUrl: () => 'https://canvas.example.com',
    } as OrchestratorContext['client'],
    rateLimiter: {} as OrchestratorContext['rateLimiter'],
    conflictResolver: {
      detectConflicts: () => ({ autoResolved: {}, conflicts: [], preservedFields: [] }),
      checkAndRecordConflict: () => null,
    } as unknown as OrchestratorContext['conflictResolver'],
    checkpointManager: {
      markCheckpointCommitting: jest.fn(),
    } as unknown as OrchestratorContext['checkpointManager'],
    backoffManager: {} as OrchestratorContext['backoffManager'],
    visibilityOracle: null,
    emitter: new EventEmitter(),
    log: null,
    isAborted: false,
    getDefaultTargetGrade: () => 50,
    getCourseSettings: () => ({ autoAssignDueDate: false, allowGuessedOverride: false }),
    getTodayEndTime: () => new Date().toISOString(),
    persistConflictData: jest.fn(),
    pendingConflictData: new Map(),
    hasActiveDownloadFor: () => false,
    computeContentHash: () => null,
    updateContentHashAndDependencies: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Minimal FetchedData builder
// ---------------------------------------------------------------------------

const CANVAS_COURSE_ID = 999;
const LOCAL_COURSE_ID = 1;
const SYNC_ID = 'test-sync-session-001';

/** A minimal CanvasCourse that mapCourse can process without throwing. */
const minimalCanvasCourse: CanvasCourse = {
  id: CANVAS_COURSE_ID,
  name: 'Test Course',
  course_code: 'TST101',
  enrollment_term_id: 1,
  default_view: 'modules',
};

/** A minimal CanvasAnnouncement that mapAnnouncement can process. */
function makeAnnouncement(id: number): CanvasAnnouncement {
  return {
    id,
    title: `Announcement ${id}`,
    message: '<p>Test announcement content</p>',
    posted_at: '2024-06-01T10:00:00Z',
    context_code: `course_${CANVAS_COURSE_ID}`,
  };
}

/**
 * Build a FetchedData with only the announcement we care about.
 * courses = [minimalCanvasCourse] so courseLookup is populated (the course
 * must already exist in the DB for the SELECT to find it).
 */
function makeFetched(announcements: CanvasAnnouncement[]): FetchedData {
  return {
    courses: [minimalCanvasCourse],
    tasks: new Map(),
    announcements: new Map([[CANVAS_COURSE_ID, announcements]]),
    modules: new Map(),
    pages: new Map(),
    folders: new Map(),
    files: new Map(),
    assignmentGroups: new Map(),
  };
}

// ---------------------------------------------------------------------------
// 1. Bug-documentation assertion
//    The old predicate (source_type = 'announcement') returns 0 rows against a
//    notification stored as source_type = 'canvas'. This is what made the code
//    path dead — existingAnn was always null and insertedAnn was always null.
// ---------------------------------------------------------------------------

describe('SyncCommitPhase — announcement source_type bug (regression guard)', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    seedCourse(db, { id: LOCAL_COURSE_ID, externalId: CANVAS_COURSE_ID });
  });

  afterEach(() => {
    db.close();
  });

  test('1. bug-documentation: source_type = "announcement" always returns 0 rows (the dead predicate)', () => {
    // Seed a notification exactly as mapAnnouncement produces it:
    // source_type = 'canvas', source_id = announcement external id.
    db.executeWrite(
      `INSERT INTO notifications (source_type, source_id, course_id, title, message, published_at)
       VALUES ('canvas', '42', ?, 'Test Ann', 'body', datetime('now'))`,
      [LOCAL_COURSE_ID],
      'notifications'
    );

    // The OLD (buggy) predicate bound source_type = 'announcement'.
    // The notifications CHECK constraint forbids that value, so this query
    // can never match any row — exactly what caused the feed to be silent.
    const row = db.executeReadOne<{ id: number }>(
      `SELECT id FROM notifications WHERE source_type = 'announcement' AND source_id = ?`,
      ['42']
    );

    // executeReadOne returns undefined (not null) when no row is found.
    // The old code treated this as falsy (null check: !existingAnn) → always entered
    // the if-block. Then the SAME predicate for insertedAnn also returned undefined
    // → never called recordSyncUpdate.
    expect(row).toBeUndefined();

    // The FIXED predicate ('canvas') correctly finds the row.
    const fixedRow = db.executeReadOne<{ id: number }>(
      `SELECT id FROM notifications WHERE source_type = 'canvas' AND source_id = ?`,
      ['42']
    );
    expect(fixedRow).not.toBeNull();
    expect(fixedRow!.id).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Post-fix: new announcement records exactly 1 sync_updates row
  // ---------------------------------------------------------------------------

  test('2. post-fix new announcement: exactly 1 sync_update with entity_type="announcement"', () => {
    // The sync session row must exist before executeCommitPhase writes to
    // sync_updates (FK: sync_updates.sync_session_id → sync_sessions.id).
    // createSyncSession() inside executeCommitPhase writes it, but we need
    // the session to exist at the point recordSyncUpdate runs inside the
    // transaction. createSyncSession is called before db.transaction(), so
    // we do NOT need to pre-seed it — it is created by executeCommitPhase.
    const ctx = makeCtx(db);
    const ann = makeAnnouncement(101);

    executeCommitPhase(ctx, makeFetched([ann]), SYNC_ID);

    const updates = db.executeRead<{
      entity_type: string;
      change_type: string;
      external_id: string | null;
    }>(
      `SELECT entity_type, change_type, external_id
       FROM sync_updates
       WHERE entity_type = 'announcement'`
    );

    // Before the fix: 0 rows (recordSyncUpdate never fired).
    // After the fix: exactly 1 row for the new announcement.
    expect(updates).toHaveLength(1);
    expect(updates[0].entity_type).toBe('announcement');
    expect(updates[0].change_type).toBe('new');
    expect(updates[0].external_id).toBe(String(ann.id));

    // updateCounts.newAnnouncements increments when the sync_update is recorded.
    // We verify via the sync_session totals that are written by completeSyncSession.
    const session = db.executeReadOne<{ total_new_announcements: number }>(
      `SELECT total_new_announcements FROM sync_sessions WHERE id = ?`,
      [SYNC_ID]
    );
    expect(session).not.toBeNull();
    expect(session!.total_new_announcements).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Post-fix: re-sync of the same announcement records 0 additional rows
  // ---------------------------------------------------------------------------

  test('3. post-fix re-sync idempotency: second commit of same announcement adds 0 sync_updates', () => {
    const ctx = makeCtx(db);
    const ann = makeAnnouncement(202);

    // First commit: announcement is new → 1 sync_update recorded.
    executeCommitPhase(ctx, makeFetched([ann]), SYNC_ID);

    const afterFirst = db.executeRead<{ id: number }>(
      `SELECT id FROM sync_updates WHERE entity_type = 'announcement'`
    );
    expect(afterFirst).toHaveLength(1);

    // Second commit: same announcement is already in notifications.
    // existingAnn is now found (source_type='canvas' predicate matches) →
    // the if (!existingAnn) block is skipped → recordSyncUpdate does NOT fire.
    const syncId2 = 'test-sync-session-002';
    executeCommitPhase(ctx, makeFetched([ann]), syncId2);

    const afterSecond = db.executeRead<{ id: number }>(
      `SELECT id FROM sync_updates WHERE entity_type = 'announcement'`
    );
    // Still 1 — no duplicate recorded on re-sync.
    expect(afterSecond).toHaveLength(1);
  });
});
