/**
 * SyncUpdate command tests (ADR-0007 — syncUpdatesHandlers migration).
 *
 * Covers MarkSyncUpdatesSeenCommand / ResolveSyncConflictCommand /
 * CleanupSyncUpdatesCommand / SyncTestDataCommand.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { MarkSyncUpdatesSeenCommand } from '../../../src/layers/l4-controller/commands/syncUpdate/MarkSyncUpdatesSeenCommand';
import { ResolveSyncConflictCommand } from '../../../src/layers/l4-controller/commands/syncUpdate/ResolveSyncConflictCommand';
import { CleanupSyncUpdatesCommand } from '../../../src/layers/l4-controller/commands/syncUpdate/CleanupSyncUpdatesCommand';
import { SyncTestDataCommand } from '../../../src/layers/l4-controller/commands/syncUpdate/SyncTestDataCommand';
import type { SyncUpdateRow } from '../../../src/layers/l1-persistence/DatabaseRowTypes';

describe('SyncUpdate commands', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
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

  function seenAtOf(id: number): string | null {
    return (
      db.executeReadOne<{ seen_at: string | null }>(
        'SELECT seen_at FROM sync_updates WHERE id = ?',
        [id]
      )?.seen_at ?? null
    );
  }

  describe('MarkSyncUpdatesSeenCommand', () => {
    test('byIds marks the given ids and returns the count', () => {
      seedUpdate({ id: 1 });
      seedUpdate({ id: 2 });
      seedUpdate({ id: 3, seenAt: '2026-01-05' }); // already seen → not re-counted

      const cmd = new MarkSyncUpdatesSeenCommand(db);
      expect(cmd.byIds([1, 2, 3])).toBe(2);
      expect(seenAtOf(1)).not.toBeNull();
      expect(seenAtOf(2)).not.toBeNull();
    });

    test('all marks every unseen visible update (default excludes action-required)', () => {
      seedUpdate({ id: 1, entityType: 'task' });
      seedUpdate({ id: 2, entityType: 'task', isActionRequired: 1 }); // excluded by default
      const cmd = new MarkSyncUpdatesSeenCommand(db);
      expect(cmd.all([1])).toBe(1);
      expect(seenAtOf(1)).not.toBeNull();
      expect(seenAtOf(2)).toBeNull();
    });

    test('all honors entityType + excludeConflicts filters', () => {
      seedUpdate({ id: 1, entityType: 'task' });
      seedUpdate({ id: 2, entityType: 'grade' });
      const cmd = new MarkSyncUpdatesSeenCommand(db);
      expect(cmd.all([1], { entityType: 'grade' })).toBe(1);
      expect(seenAtOf(2)).not.toBeNull();
      expect(seenAtOf(1)).toBeNull();
    });

    test('all with excludeActionRequired:false includes action-required', () => {
      seedUpdate({ id: 1, isActionRequired: 1 });
      const cmd = new MarkSyncUpdatesSeenCommand(db);
      expect(cmd.all([1], { excludeActionRequired: false })).toBe(1);
    });

    test('byEntity marks all unseen updates for one entity', () => {
      seedUpdate({ id: 1, entityType: 'task', entityId: 100 });
      seedUpdate({ id: 2, entityType: 'task', entityId: 100 });
      seedUpdate({ id: 3, entityType: 'task', entityId: 999 });
      const cmd = new MarkSyncUpdatesSeenCommand(db);
      expect(cmd.byEntity('task', 100)).toBe(2);
      expect(seenAtOf(3)).toBeNull();
    });
  });

  describe('ResolveSyncConflictCommand', () => {
    test('resolves the conflict, persists the remembered choice, clears siblings', () => {
      // A conflict on field due_at for entity 100, plus an informational update
      // for the same entity+field that should be cleared.
      seedUpdate({
        id: 1,
        entityType: 'conflict',
        changeType: 'conflict',
        entityId: 100,
        conflictField: 'due_at',
      });
      seedUpdate({
        id: 2,
        entityType: 'task',
        entityId: 100,
        changedField: 'due_at',
      });

      const conflict = db.executeReadOne<SyncUpdateRow>(
        'SELECT * FROM sync_updates WHERE id = 1'
      )!;
      const cmd = new ResolveSyncConflictCommand(db);
      cmd.execute(1, 'local', true, conflict);

      const resolved = db.executeReadOne<{
        conflict_resolution: string | null;
        remember_choice: number;
        resolved_at: string | null;
      }>(
        'SELECT conflict_resolution, remember_choice, resolved_at FROM sync_updates WHERE id = 1'
      )!;
      expect(resolved.conflict_resolution).toBe('local');
      expect(resolved.remember_choice).toBe(1);
      expect(resolved.resolved_at).not.toBeNull();

      // sibling informational update cleared
      expect(seenAtOf(2)).not.toBeNull();

      // preference persisted to sync_preferences (prefer_local = 1)
      const pref = db.executeReadOne<{ prefer_local: number }>(
        `SELECT prefer_local FROM sync_preferences WHERE entity = 'conflict' AND field = 'due_at'`
      );
      expect(pref?.prefer_local).toBe(1);
    });

    test('without rememberChoice, no sync_preferences row is written', () => {
      seedUpdate({
        id: 1,
        entityType: 'conflict',
        changeType: 'conflict',
        entityId: 100,
        conflictField: 'due_at',
      });
      const conflict = db.executeReadOne<SyncUpdateRow>(
        'SELECT * FROM sync_updates WHERE id = 1'
      )!;
      new ResolveSyncConflictCommand(db).execute(1, 'canvas', false, conflict);
      expect(db.executeReadOne('SELECT 1 FROM sync_preferences')).toBeUndefined();
    });
  });

  describe('CleanupSyncUpdatesCommand', () => {
    test('deletes old seen updates and returns the count', () => {
      seedUpdate({ id: 1, seenAt: '2020-01-01' }); // old + seen → deleted
      seedUpdate({ id: 2, seenAt: null }); // unseen → kept
      const cmd = new CleanupSyncUpdatesCommand(db);
      expect(cmd.execute(30)).toBe(1);
      expect(
        db.executeReadOne('SELECT 1 FROM sync_updates WHERE id = 1')
      ).toBeUndefined();
      expect(db.executeReadOne('SELECT 1 FROM sync_updates WHERE id = 2')).toBeDefined();
    });
  });

  describe('SyncTestDataCommand', () => {
    test('createTestSession throws on the real schema (no sync_sessions.status column)', () => {
      // PRE-EXISTING latent bug, preserved verbatim: production sync inserts
      // sync_sessions (id, started_at, created_at); this debug INSERT names a
      // `status` column that exists in no migration. See docs/FOLLOWUPS.md.
      const cmd = new SyncTestDataCommand(db);
      expect(() => cmd.createTestSession('2026-01-01T00:00:00Z')).toThrow(
        /no column named status/
      );
    });

    test('insertTestUpdate writes a row; clearTestData removes [TEST] rows', () => {
      const cmd = new SyncTestDataCommand(db);
      cmd.insertTestUpdate({
        sync_session_id: 's1' as unknown as number,
        course_id: 1,
        entity_type: 'task',
        entity_id: 100,
        change_type: 'updated',
        changed_field: 'due_at',
        title: '[TEST] HW1',
        subtitle: 'Due date changed',
        old_value: '1',
        new_value: '2',
        created_at: '2026-01-02',
      });
      // a non-test row that should survive clearTestData
      seedUpdate({ id: 50, title: 'Real update' });

      expect(cmd.clearTestData()).toBe(1);
      expect(
        db.executeReadOne("SELECT 1 FROM sync_updates WHERE title LIKE '[TEST]%'")
      ).toBeUndefined();
      expect(db.executeReadOne('SELECT 1 FROM sync_updates WHERE id = 50')).toBeDefined();
    });
  });
});
