/**
 * SyncCourseOperations.autoArchiveExpiredCourses — buffer-unification
 * regression (ADR-0015).
 *
 * Pins that auto-archive fires at the SAME threshold as the VisibilityOracle
 * 'auto' term filter (term_end + TERM_END_BUFFER_DAYS), NOT at term_end + 0
 * days (the over-aggressive original that yanked just-finished courses out of
 * the dashboard average ~30 days early). Also pins the JOIN affinity fix:
 * `courses.enrollment_term_id` (Canvas id) joins `enrollment_terms.external_id`
 * (TEXT), via CAST.
 */

import { EventEmitter } from 'events';
import { Database } from '../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../src/layers/l1-persistence/MigrationRunner';
import { TERM_END_BUFFER_DAYS } from '../../src/layers/l1-persistence/constants/termLinger';
import { SyncCourseOperations } from '../../src/layers/l2-daemon/sync-engine/operations/SyncCourseOperations';
import type {
  SyncOperationContext,
  SyncOperationHelpers,
} from '../../src/layers/l2-daemon/sync-engine/SyncOperationContext';

describe('SyncCourseOperations.autoArchiveExpiredCourses', () => {
  let db: Database;
  let ops: SyncCourseOperations;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();

    // The method only touches ctx.db / ctx.log. The rest of the context is
    // unused for auto-archive, so a minimal stub suffices.
    const ctx = {
      db,
      log: null,
      emitter: new EventEmitter(),
    } as unknown as SyncOperationContext;
    const helpers = {} as unknown as SyncOperationHelpers;

    ops = new SyncCourseOperations(ctx, helpers);
  });

  afterEach(() => {
    db.close();
  });

  /** ISO timestamp N days from now (negative = in the past). */
  function daysFromNow(n: number): string {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
  }

  function archivedAt(courseId: number): string | null {
    const row = db.executeReadOne<{ archived_at: string | null }>(
      `SELECT archived_at FROM courses WHERE id = ?`,
      [courseId]
    );
    return row?.archived_at ?? null;
  }

  test('does NOT archive a course whose term ended 0 days ago (within buffer)', () => {
    seedTerm(db, { external_id: '100', name: 'Fall 2024', end_at: daysFromNow(0) });
    seedCourse(db, { id: 1, enrollment_term_id: 100 });

    const result = ops.autoArchiveExpiredCourses();

    expect(result.archived).toBe(0);
    expect(archivedAt(1)).toBeNull();
  });

  test('does NOT archive a course just inside the buffer window', () => {
    // Ended (buffer - 1) days ago → still within the linger window.
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: daysFromNow(-(TERM_END_BUFFER_DAYS - 1)),
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100 });

    const result = ops.autoArchiveExpiredCourses();

    expect(result.archived).toBe(0);
    expect(archivedAt(1)).toBeNull();
  });

  test('archives a course whose term ended past the buffer window', () => {
    // Ended (buffer + 1) days ago → past the linger window.
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: daysFromNow(-(TERM_END_BUFFER_DAYS + 1)),
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100 });

    const result = ops.autoArchiveExpiredCourses();

    expect(result.archived).toBe(1);
    expect(archivedAt(1)).not.toBeNull();
  });

  test('joins enrollment_term_id (Canvas id) to external_id, not the PK', () => {
    // Insert a decoy term FIRST so its autoincrement PK (1) differs from the
    // Canvas id (777). A PK-based join would mis-match; the external_id join
    // must still find the right term.
    seedTerm(db, { external_id: '1', name: 'Decoy', end_at: daysFromNow(-1000) });
    seedTerm(db, {
      external_id: '777',
      name: 'Fall 2024',
      end_at: daysFromNow(-(TERM_END_BUFFER_DAYS + 5)),
    });
    seedCourse(db, { id: 1, enrollment_term_id: 777 });

    const result = ops.autoArchiveExpiredCourses();

    expect(result.archived).toBe(1);
    expect(archivedAt(1)).not.toBeNull();
  });

  test('marks auto-archived courses with archive_source = auto', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: daysFromNow(-(TERM_END_BUFFER_DAYS + 5)),
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100 });

    ops.autoArchiveExpiredCourses();

    const row = db.executeReadOne<{ archive_source: string | null }>(
      `SELECT archive_source FROM courses WHERE id = ?`,
      [1]
    );
    expect(row?.archive_source).toBe('auto');
  });

  test('does not re-archive an already-archived course', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: daysFromNow(-(TERM_END_BUFFER_DAYS + 5)),
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100, archived_at: daysFromNow(-1) });

    const result = ops.autoArchiveExpiredCourses();

    expect(result.archived).toBe(0);
  });
});

// =============================================================================
// Seed helpers
// =============================================================================

function seedCourse(
  db: Database,
  data: { id: number; enrollment_term_id: number; archived_at?: string | null }
): void {
  db.executeWrite(
    `INSERT INTO courses (
      id, external_id, code, name, target_grade, enrollment_term_id, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      `ext_${data.id}`,
      `C${data.id}`,
      `Course ${data.id}`,
      85,
      data.enrollment_term_id,
      data.archived_at ?? null,
    ]
  );
}

function seedTerm(
  db: Database,
  data: { external_id: string; name: string; end_at: string }
): void {
  db.executeWrite(
    `INSERT INTO enrollment_terms (external_id, name, end_at) VALUES (?, ?, ?)`,
    [data.external_id, data.name, data.end_at]
  );
}
