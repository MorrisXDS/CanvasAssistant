/**
 * SyncUpdateReader tests (ADR-0007 — syncUpdatesHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { SyncUpdateReader } from '../../../src/layers/l1-persistence/readers/SyncUpdateReader';

describe('SyncUpdateReader', () => {
  let db: Database;
  let reader: SyncUpdateReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new SyncUpdateReader(db);

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, color) VALUES (1, '4242', 'CS101', 'Intro', '#abc')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO sync_sessions (id, started_at, created_at) VALUES ('s1', '2026-01-01', '2026-01-01')`,
      [],
      'sync_sessions'
    );
  });

  afterEach(() => {
    db.close();
  });

  /** Insert a sync_update with sane defaults; override via opts. */
  function seedUpdate(opts: {
    id: number;
    entityType?: string;
    entityId?: number;
    changeType?: string;
    changedField?: string | null;
    conflictField?: string | null;
    title?: string;
    isActionRequired?: number;
    seenAt?: string | null;
    resolvedAt?: string | null;
    createdAt?: string;
  }): void {
    db.executeWrite(
      `INSERT INTO sync_updates
         (id, sync_session_id, course_id, entity_type, entity_id, change_type, changed_field,
          conflict_field, title, is_action_required, seen_at, resolved_at, created_at)
       VALUES (?, 's1', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.id,
        opts.entityType ?? 'task',
        opts.entityId ?? 100,
        opts.changeType ?? 'updated',
        opts.changedField ?? null,
        opts.conflictField ?? null,
        opts.title ?? `Update ${opts.id}`,
        opts.isActionRequired ?? 0,
        opts.seenAt ?? null,
        opts.resolvedAt ?? null,
        opts.createdAt ?? '2026-01-02',
      ],
      'sync_updates'
    );
  }

  describe('getAllWithCourse', () => {
    test('returns unseen updates joined with course fields, newest first', () => {
      seedUpdate({ id: 1, createdAt: '2026-01-01' });
      seedUpdate({ id: 2, createdAt: '2026-01-03' });
      seedUpdate({ id: 3, seenAt: '2026-01-04' }); // seen → excluded

      const rows = reader.getAllWithCourse([1], false, 500);
      expect(rows.map((r) => r.id)).toEqual([2, 1]); // newest first
      expect(rows[0].course_code).toBe('CS101');
      expect(rows[0].course_color).toBe('#abc');
    });

    test('includeResolved returns seen rows too', () => {
      seedUpdate({ id: 1, seenAt: '2026-01-04' });
      const rows = reader.getAllWithCourse([1], true, 500);
      expect(rows.map((r) => r.id)).toEqual([1]);
    });

    test('unseen mode still surfaces unresolved conflicts even if seen', () => {
      seedUpdate({
        id: 1,
        entityType: 'conflict',
        changeType: 'conflict',
        seenAt: '2026-01-04',
        resolvedAt: null,
      });
      const rows = reader.getAllWithCourse([1], false, 500);
      expect(rows.map((r) => r.id)).toEqual([1]);
    });

    test('respects the limit', () => {
      seedUpdate({ id: 1, createdAt: '2026-01-01' });
      seedUpdate({ id: 2, createdAt: '2026-01-02' });
      expect(reader.getAllWithCourse([1], false, 1)).toHaveLength(1);
    });
  });

  describe('getCounts', () => {
    test('tallies informational, conflicts, actionRequired, byCourse, byType', () => {
      seedUpdate({ id: 1, entityType: 'task' }); // informational
      seedUpdate({ id: 2, entityType: 'grade' }); // informational
      seedUpdate({ id: 3, entityType: 'task', isActionRequired: 1 }); // action-required
      seedUpdate({
        id: 4,
        entityType: 'conflict',
        changeType: 'conflict',
        resolvedAt: null,
      }); // conflict

      const counts = reader.getCounts([1]);
      expect(counts.informational).toBe(2);
      expect(counts.actionRequired).toBe(1);
      expect(counts.conflicts).toBe(1);
      expect(counts.byCourse).toEqual({ '1': 4 });
      expect(counts.byType).toEqual({ task: 2, grade: 1, conflict: 1 });
    });

    test('resolved conflicts and seen informational are excluded', () => {
      seedUpdate({ id: 1, seenAt: '2026-01-05' }); // seen informational
      seedUpdate({
        id: 2,
        entityType: 'conflict',
        changeType: 'conflict',
        resolvedAt: '2026-01-05',
      }); // resolved conflict
      const counts = reader.getCounts([1]);
      expect(counts.informational).toBe(0);
      expect(counts.conflicts).toBe(0);
    });
  });

  describe('getConflictById', () => {
    test('returns the conflict row', () => {
      seedUpdate({
        id: 7,
        entityType: 'conflict',
        changeType: 'conflict',
        conflictField: 'due_at',
      });
      expect(reader.getConflictById(7)?.conflict_field).toBe('due_at');
    });

    test('returns null for a non-conflict id', () => {
      seedUpdate({ id: 8, entityType: 'task' });
      expect(reader.getConflictById(8)).toBeNull();
    });

    test('returns null when not found', () => {
      expect(reader.getConflictById(999)).toBeNull();
    });
  });

  describe('getFirstTaskInCourse / getFirstResourceInCourse', () => {
    test('returns the first task / resource, or null', () => {
      expect(reader.getFirstTaskInCourse(1)).toBeNull();
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title) VALUES (200, 't1', 1, 'HW1')`,
        [],
        'tasks'
      );
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title) VALUES (300, 'r1', 1, 'file', 'notes.pdf')`,
        [],
        'resources'
      );
      expect(reader.getFirstTaskInCourse(1)).toEqual({ id: 200, title: 'HW1' });
      expect(reader.getFirstResourceInCourse(1)).toEqual({ id: 300, title: 'notes.pdf' });
    });
  });

  describe('getStatus', () => {
    test('returns per-change_type totals and grand-total unseen', () => {
      seedUpdate({ id: 1, changeType: 'updated' });
      seedUpdate({ id: 2, changeType: 'updated', seenAt: '2026-01-05' });
      seedUpdate({ id: 3, changeType: 'new' });

      const status = reader.getStatus();
      expect(status.totalUnseen).toBe(2);
      const updated = status.byType.find((s) => s.change_type === 'updated');
      expect(updated).toEqual({ change_type: 'updated', total: 2, unseen: 1 });
    });
  });
});
