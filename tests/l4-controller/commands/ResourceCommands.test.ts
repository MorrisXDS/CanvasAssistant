/**
 * ResourceCommands tests (ADR-0007 — resourceHandlers migration).
 *
 * Covers UpdateResourceLocalPathCommand.markDownloaded / clear.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { UpdateResourceLocalPathCommand } from '../../../src/layers/l4-controller/commands/resource/UpdateResourceLocalPathCommand';

describe('UpdateResourceLocalPathCommand', () => {
  let db: Database;
  let cmd: UpdateResourceLocalPathCommand;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    cmd = new UpdateResourceLocalPathCommand(db);

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO resources (id, external_id, course_id, type, title)
       VALUES (10, 'file-555', 1, 'file', 'lecture.pdf')`,
      [],
      'resources'
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('markDownloaded', () => {
    test('sets local_path + synced_at', () => {
      cmd.markDownloaded(10, '/disk/lecture.pdf', '2026-02-02T00:00:00Z');
      const row = db.executeReadOne<{
        local_path: string | null;
        synced_at: string | null;
      }>('SELECT local_path, synced_at FROM resources WHERE id = 10');
      expect(row?.local_path).toBe('/disk/lecture.pdf');
      expect(row?.synced_at).toBe('2026-02-02T00:00:00Z');
    });
  });

  describe('clear', () => {
    test('nulls out local_path', () => {
      cmd.markDownloaded(10, '/disk/lecture.pdf', '2026-02-02T00:00:00Z');
      cmd.clear(10);
      const row = db.executeReadOne<{ local_path: string | null }>(
        'SELECT local_path FROM resources WHERE id = 10'
      );
      expect(row?.local_path).toBeNull();
    });
  });
});
