/**
 * Command tests for the ADR-0007 syncHandlers migration.
 *
 * Covers ApplyConflictResolutionCommand (incl. the table allow-list + column
 * validation that hardens the formerly-interpolated UPDATE),
 * RememberConflictPreferenceCommand, and MarkConflictResolvedCommand.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ApplyConflictResolutionCommand } from '../../../src/layers/l4-controller/commands/syncConflict/ApplyConflictResolutionCommand';
import { RememberConflictPreferenceCommand } from '../../../src/layers/l4-controller/commands/syncConflict/RememberConflictPreferenceCommand';
import { MarkConflictResolvedCommand } from '../../../src/layers/l4-controller/commands/syncConflict/MarkConflictResolvedCommand';

describe('syncConflict commands', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    // sync_preferences gains prefer_canvas + expires_at at runtime via
    // SyncConflictResolver.ensureTable() (not migrations) — replicate so tests
    // exercise the real startup schema.
    db.executeWrite(
      'ALTER TABLE sync_preferences ADD COLUMN prefer_canvas INTEGER NOT NULL DEFAULT 1',
      []
    );
    db.executeWrite(
      'ALTER TABLE sync_preferences ADD COLUMN expires_at TEXT DEFAULT NULL',
      []
    );
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('ApplyConflictResolutionCommand', () => {
    test('applies a valid (table, field) update', () => {
      new ApplyConflictResolutionCommand(db).apply('courses', 'name', 'Renamed', 1);
      const row = db.executeReadOne<{ name: string }>(
        'SELECT name FROM courses WHERE id = 1'
      );
      expect(row?.name).toBe('Renamed');
    });

    test('rejects a non-allowlisted table', () => {
      expect(() =>
        new ApplyConflictResolutionCommand(db).apply('sync_preferences', 'field', 'x', 1)
      ).toThrow(/non-allowlisted table/);
    });

    test('rejects a field that is not a valid identifier (injection attempt)', () => {
      expect(() =>
        new ApplyConflictResolutionCommand(db).apply(
          'courses',
          'name = 1; DROP TABLE courses; --',
          'x',
          1
        )
      ).toThrow(/invalid field identifier/);
      // table still intact
      expect(db.executeReadOne('SELECT 1 FROM courses WHERE id = 1')).toBeDefined();
    });

    test('rejects a valid identifier that is not a real column', () => {
      expect(() =>
        new ApplyConflictResolutionCommand(db).apply('courses', 'not_a_column', 'x', 1)
      ).toThrow(/unknown column/);
    });

    test('caches columns across calls (second valid apply still works)', () => {
      const cmd = new ApplyConflictResolutionCommand(db);
      cmd.apply('courses', 'name', 'A', 1);
      cmd.apply('courses', 'name', 'B', 1);
      expect(
        db.executeReadOne<{ name: string }>('SELECT name FROM courses WHERE id = 1')?.name
      ).toBe('B');
    });
  });

  describe('RememberConflictPreferenceCommand', () => {
    test('inserts a prefer_canvas preference (with expiry)', () => {
      new RememberConflictPreferenceCommand(db).execute({
        entity: 'task',
        entityId: 7,
        field: 'due_at',
        preferCanvas: true,
        expiresAt: '2026-12-31T00:00:00Z',
      });
      const row = db.executeReadOne<{ prefer_canvas: number; expires_at: string | null }>(
        `SELECT prefer_canvas, expires_at FROM sync_preferences WHERE entity = 'task' AND field = 'due_at'`
      );
      expect(row?.prefer_canvas).toBe(1);
      expect(row?.expires_at).toBe('2026-12-31T00:00:00Z');
    });

    test('upserts on conflict (entity, entity_id, field)', () => {
      const cmd = new RememberConflictPreferenceCommand(db);
      cmd.execute({
        entity: 'task',
        entityId: 7,
        field: 'due_at',
        preferCanvas: true,
        expiresAt: null,
      });
      cmd.execute({
        entity: 'task',
        entityId: 7,
        field: 'due_at',
        preferCanvas: false,
        expiresAt: null,
      });
      const rows = db.executeRead<{ prefer_canvas: number }>(
        `SELECT prefer_canvas FROM sync_preferences WHERE entity = 'task' AND entity_id = 7 AND field = 'due_at'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].prefer_canvas).toBe(0);
    });

    test('rememberForAll convention: NULL entity_id', () => {
      new RememberConflictPreferenceCommand(db).execute({
        entity: 'course',
        entityId: null,
        field: 'name',
        preferCanvas: true,
        expiresAt: null,
      });
      const row = db.executeReadOne<{ entity_id: number | null }>(
        `SELECT entity_id FROM sync_preferences WHERE entity = 'course' AND field = 'name'`
      );
      expect(row?.entity_id).toBeNull();
    });
  });

  describe('MarkConflictResolvedCommand', () => {
    beforeEach(() => {
      db.executeWrite(
        `INSERT INTO sync_sessions (id, started_at, created_at) VALUES ('s1', '2026-01-01', '2026-01-01')`,
        [],
        'sync_sessions'
      );
    });

    function seedConflict(opts: {
      id: number;
      externalId?: string;
      entityId?: number;
      field?: string;
    }): void {
      db.executeWrite(
        `INSERT INTO sync_updates
           (id, sync_session_id, course_id, entity_type, entity_id, change_type, conflict_field, changed_field, external_id, title)
         VALUES (?, 's1', 1, 'conflict', ?, 'conflict', ?, ?, ?, 'Conflict')`,
        [
          opts.id,
          opts.entityId ?? 100,
          opts.field ?? 'due_at',
          opts.field ?? 'due_at',
          opts.externalId ?? null,
        ],
        'sync_updates'
      );
    }

    test('byExternalId stamps seen_at + resolved_at + resolution', () => {
      seedConflict({ id: 1, externalId: 'cf-1' });
      new MarkConflictResolvedCommand(db).byExternalId('cf-1', 'canvas');
      const row = db.executeReadOne<{
        seen_at: string | null;
        resolved_at: string | null;
        conflict_resolution: string | null;
      }>(
        'SELECT seen_at, resolved_at, conflict_resolution FROM sync_updates WHERE id = 1'
      );
      expect(row?.seen_at).not.toBeNull();
      expect(row?.resolved_at).not.toBeNull();
      expect(row?.conflict_resolution).toBe('canvas');
    });

    test('byEntityField stamps unseen matching rows', () => {
      seedConflict({ id: 1, entityId: 100, field: 'due_at' });
      new MarkConflictResolvedCommand(db).byEntityField(100, 'due_at', 'local');
      const row = db.executeReadOne<{
        seen_at: string | null;
        conflict_resolution: string | null;
      }>('SELECT seen_at, conflict_resolution FROM sync_updates WHERE id = 1');
      expect(row?.seen_at).not.toBeNull();
      expect(row?.conflict_resolution).toBe('local');
    });
  });
});
