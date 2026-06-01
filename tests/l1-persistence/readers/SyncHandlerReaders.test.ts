/**
 * Reader-method tests for the ADR-0007 syncHandlers migration.
 *
 * Covers ResourceReader.getFolderByCoursePath,
 * SyncUpdateReader.getUnresolvedConflictByExternalId, and the new
 * SyncMetadataReader.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ResourceReader } from '../../../src/layers/l1-persistence/readers/ResourceReader';
import { SyncUpdateReader } from '../../../src/layers/l1-persistence/readers/SyncUpdateReader';
import { SyncMetadataReader } from '../../../src/layers/l1-persistence/readers/SyncMetadataReader';

describe('syncHandlers migration reader methods', () => {
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
  });

  afterEach(() => {
    db.close();
  });

  describe('ResourceReader.getFolderByCoursePath', () => {
    test('returns a folder resource by course + path', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, folder_path)
         VALUES (10, 'folder-9', 1, 'folder', 'Wk1', 'Week 1')`,
        [],
        'resources'
      );
      expect(new ResourceReader(db).getFolderByCoursePath(1, 'Week 1')).toEqual({
        external_id: 'folder-9',
        course_id: 1,
      });
    });

    test('returns null for non-folder rows or wrong path', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, folder_path)
         VALUES (11, 'file-9', 1, 'file', 'a.pdf', 'Week 1')`,
        [],
        'resources'
      );
      expect(new ResourceReader(db).getFolderByCoursePath(1, 'Week 1')).toBeNull();
      expect(new ResourceReader(db).getFolderByCoursePath(1, 'Nope')).toBeNull();
    });
  });

  describe('SyncUpdateReader.getUnresolvedConflictByExternalId', () => {
    beforeEach(() => {
      db.executeWrite(
        `INSERT INTO sync_sessions (id, started_at, created_at) VALUES ('s1', '2026-01-01', '2026-01-01')`,
        [],
        'sync_sessions'
      );
    });

    test('returns the projected unresolved conflict', () => {
      db.executeWrite(
        `INSERT INTO sync_updates
           (id, sync_session_id, course_id, entity_type, entity_id, change_type, conflict_field, old_value, new_value, external_id, title, resolved_at)
         VALUES (1, 's1', 1, 'conflict', 55, 'conflict', 'due_at', '"a"', '"b"', 'cf-1', 'C', NULL)`,
        [],
        'sync_updates'
      );
      expect(new SyncUpdateReader(db).getUnresolvedConflictByExternalId('cf-1')).toEqual({
        id: 1,
        entity_id: 55,
        conflict_field: 'due_at',
        old_value: '"a"',
        new_value: '"b"',
        external_id: 'cf-1',
      });
    });

    test('ignores already-resolved conflicts', () => {
      db.executeWrite(
        `INSERT INTO sync_updates
           (id, sync_session_id, course_id, entity_type, entity_id, change_type, conflict_field, external_id, title, resolved_at)
         VALUES (2, 's1', 1, 'conflict', 55, 'conflict', 'due_at', 'cf-2', 'C', '2026-01-02')`,
        [],
        'sync_updates'
      );
      expect(
        new SyncUpdateReader(db).getUnresolvedConflictByExternalId('cf-2')
      ).toBeNull();
    });
  });

  describe('SyncMetadataReader.getLastSyncedAt', () => {
    test('returns null when empty, the max otherwise', () => {
      const r = new SyncMetadataReader(db);
      expect(r.getLastSyncedAt()).toBeNull();
      db.executeWrite(
        `INSERT INTO sync_metadata (endpoint, last_synced_at) VALUES ('/a', '2026-01-01'), ('/b', '2026-03-01')`,
        [],
        'sync_metadata'
      );
      expect(r.getLastSyncedAt()).toBe('2026-03-01');
    });
  });
});
