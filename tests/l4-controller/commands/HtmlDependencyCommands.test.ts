/**
 * Command tests for the ADR-0007 htmlDependencyHandlers migration.
 *
 * Covers HtmlDependencyWriteCommand (session-aware writes) plus the two
 * methods added to existing commands: UpdateResourceLocalPathCommand.setLocalPath
 * and UpsertResourceCommand.upsertPageContent.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { HtmlDependencyWriteCommand } from '../../../src/layers/l4-controller/commands/htmlDependency/HtmlDependencyWriteCommand';
import { UpdateResourceLocalPathCommand } from '../../../src/layers/l4-controller/commands/resource/UpdateResourceLocalPathCommand';
import { UpsertResourceCommand } from '../../../src/layers/l4-controller/commands/page/UpsertResourceCommand';

describe('htmlDependency migration commands', () => {
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

  describe('HtmlDependencyWriteCommand', () => {
    function deps(): Array<{
      child_source_id: string;
      download_session_id: string | null;
      recorded_content_hash: string | null;
    }> {
      return db.executeRead(
        `SELECT child_source_id, download_session_id, recorded_content_hash
         FROM html_dependencies WHERE parent_source_type = 'page' AND parent_source_id = 'p1'`
      );
    }

    test('replaceChild records an edge with session + content hash', () => {
      const cmd = new HtmlDependencyWriteCommand(db);
      cmd.replaceChild('page', 'p1', 'file', '5', 'sess-1', 'hash-1');
      expect(deps()).toEqual([
        {
          child_source_id: '5',
          download_session_id: 'sess-1',
          recorded_content_hash: 'hash-1',
        },
      ]);
    });

    test('replaceChild upserts (INSERT OR REPLACE) on the same edge', () => {
      const cmd = new HtmlDependencyWriteCommand(db);
      cmd.replaceChild('page', 'p1', 'file', '5', 'sess-1', 'hash-1');
      cmd.replaceChild('page', 'p1', 'file', '5', 'sess-2', 'hash-2');
      expect(deps()).toEqual([
        {
          child_source_id: '5',
          download_session_id: 'sess-2',
          recorded_content_hash: 'hash-2',
        },
      ]);
    });

    test('deleteForParentInSession spares edges owned by another session', () => {
      const cmd = new HtmlDependencyWriteCommand(db);
      cmd.replaceChild('page', 'p1', 'file', 'mine', 'sess-1', undefined);
      cmd.replaceChild('page', 'p1', 'file', 'unowned', undefined, undefined);
      cmd.replaceChild('page', 'p1', 'file', 'other', 'sess-2', undefined);

      cmd.deleteForParentInSession('page', 'p1', 'sess-1');

      // 'mine' (same session) and 'unowned' (NULL session) deleted; 'other' kept
      expect(deps().map((d) => d.child_source_id)).toEqual(['other']);
    });

    test('deleteAllForParent removes every edge regardless of session', () => {
      const cmd = new HtmlDependencyWriteCommand(db);
      cmd.replaceChild('page', 'p1', 'file', 'a', 'sess-1', undefined);
      cmd.replaceChild('page', 'p1', 'page', 'b', 'sess-2', undefined);
      cmd.deleteAllForParent('page', 'p1');
      expect(deps()).toEqual([]);
    });
  });

  describe('UpdateResourceLocalPathCommand.setLocalPath', () => {
    test('sets local_path without touching synced_at', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, synced_at)
         VALUES (10, 'file-5', 1, 'file', 'a.pdf', '2020-01-01')`,
        [],
        'resources'
      );
      new UpdateResourceLocalPathCommand(db).setLocalPath(10, '/d/a.pdf');
      const row = db.executeReadOne<{
        local_path: string | null;
        synced_at: string | null;
      }>('SELECT local_path, synced_at FROM resources WHERE id = 10');
      expect(row?.local_path).toBe('/d/a.pdf');
      expect(row?.synced_at).toBe('2020-01-01'); // untouched
    });
  });

  describe('UpsertResourceCommand.upsertPageContent', () => {
    const input = {
      externalId: 'html-page-pg',
      courseId: 1,
      title: 'My Page',
      localPath: '/d/p.html',
      folderPath: 'Wk1',
      sizeBytes: 123,
      contextId: 50,
    };

    test('inserts a page-type resource', () => {
      new UpsertResourceCommand(db).upsertPageContent(input);
      const row = db.executeReadOne<{
        type: string;
        title: string;
        local_path: string | null;
        context_id: string | null;
      }>(
        "SELECT type, title, local_path, context_id FROM resources WHERE external_id = 'html-page-pg'"
      );
      expect(row?.type).toBe('page');
      expect(row?.title).toBe('My Page');
      expect(row?.local_path).toBe('/d/p.html');
      // context_id is a TEXT column; the numeric page id coerces to its string form
      expect(Number(row?.context_id)).toBe(50);
    });

    test('on conflict refreshes local_path + size only, NOT title/folder', () => {
      const cmd = new UpsertResourceCommand(db);
      cmd.upsertPageContent(input);
      cmd.upsertPageContent({
        ...input,
        title: 'CHANGED',
        folderPath: 'CHANGED',
        localPath: '/d/p2.html',
        sizeBytes: 999,
      });
      const row = db.executeReadOne<{
        title: string;
        folder_path: string | null;
        local_path: string | null;
        size_bytes: number | null;
      }>(
        "SELECT title, folder_path, local_path, size_bytes FROM resources WHERE external_id = 'html-page-pg'"
      );
      expect(row?.title).toBe('My Page'); // NOT updated
      expect(row?.folder_path).toBe('Wk1'); // NOT updated
      expect(row?.local_path).toBe('/d/p2.html'); // updated
      expect(row?.size_bytes).toBe(999); // updated
    });
  });
});
