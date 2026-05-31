/**
 * PageCommands tests (ADR-0007 — pagesHandlers migration).
 *
 * - UpsertCoursePageCommand
 * - UpsertResourceCommand (upsertPageDependency / upsertPage)
 * - RecordHtmlDependencyCommand
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import {
  UpsertCoursePageCommand,
  UpsertResourceCommand,
  RecordHtmlDependencyCommand,
} from '../../../src/layers/l4-controller/commands/page';

describe('Page Commands', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    // resources / course_pages have a FK to courses(id)
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, 'e1', 'CS101', 'Intro')`,
      [],
      'courses'
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('UpsertCoursePageCommand', () => {
    test('inserts then updates a course page by external_id', () => {
      const cmd = new UpsertCoursePageCommand(db);
      cmd.execute({
        external_id: 'p1',
        course_id: 1,
        title: 'Intro',
        url_slug: 'intro',
        body_html: '<p>v1</p>',
        page_type: 'module_item',
      });
      cmd.execute({
        external_id: 'p1',
        course_id: 1,
        title: 'Intro v2',
        url_slug: 'intro',
        body_html: '<p>v2</p>',
        page_type: 'module_item',
      });

      const rows = db.executeRead<{ title: string; body_html: string }>(
        'SELECT title, body_html FROM course_pages WHERE external_id = ?',
        ['p1']
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ title: 'Intro v2', body_html: '<p>v2</p>' });
    });
  });

  describe('UpsertResourceCommand', () => {
    test('upsertPageDependency inserts a file resource, then refreshes on conflict', () => {
      const cmd = new UpsertResourceCommand(db);
      cmd.upsertPageDependency({
        externalId: 'file-1',
        courseId: 1,
        title: 'lecture.pdf',
        localPath: '/tmp/a/lecture.pdf',
        folderPath: 'Week 1/Page_files',
        sizeBytes: 100,
        mimeType: 'application/pdf',
        contextId: 'my-page',
      });
      cmd.upsertPageDependency({
        externalId: 'file-1',
        courseId: 1,
        title: 'IGNORED ON CONFLICT',
        localPath: '/tmp/b/lecture.pdf',
        folderPath: 'IGNORED',
        sizeBytes: 200,
        mimeType: 'application/pdf',
        contextId: 'my-page',
      });

      const row = db.executeReadOne<{
        type: string;
        title: string;
        local_path: string;
        folder_path: string;
        size_bytes: number;
        context_type: string;
      }>(
        'SELECT type, title, local_path, folder_path, size_bytes, context_type FROM resources WHERE external_id = ?',
        ['file-1']
      );
      // type/context_type set on insert; on conflict only local_path + size refreshed
      expect(row).toEqual({
        type: 'file',
        title: 'lecture.pdf', // NOT updated on conflict
        local_path: '/tmp/b/lecture.pdf', // updated
        folder_path: 'Week 1/Page_files', // NOT updated on conflict
        size_bytes: 200, // updated
        context_type: 'page_dependency',
      });
    });

    test('upsertPage inserts a page resource, then refreshes title/path on conflict', () => {
      const cmd = new UpsertResourceCommand(db);
      cmd.upsertPage({
        externalId: 'html-page-intro',
        courseId: 1,
        title: 'Intro',
        localPath: '/tmp/a/Intro.html',
        folderPath: 'Week 1',
        sizeBytes: 500,
        contextId: 'intro',
      });
      cmd.upsertPage({
        externalId: 'html-page-intro',
        courseId: 1,
        title: 'Intro Renamed',
        localPath: '/tmp/b/Intro.html',
        folderPath: 'Week 2',
        sizeBytes: 600,
        contextId: 'intro',
      });

      const row = db.executeReadOne<{
        type: string;
        mime_type: string;
        title: string;
        local_path: string;
        folder_path: string;
        size_bytes: number;
      }>(
        'SELECT type, mime_type, title, local_path, folder_path, size_bytes FROM resources WHERE external_id = ?',
        ['html-page-intro']
      );
      expect(row).toEqual({
        type: 'page',
        mime_type: 'text/html',
        title: 'Intro Renamed', // updated
        local_path: '/tmp/b/Intro.html', // updated
        folder_path: 'Week 2', // updated
        size_bytes: 600, // updated
      });
    });
  });

  describe('RecordHtmlDependencyCommand', () => {
    test('records an edge and is idempotent on conflict', () => {
      const cmd = new RecordHtmlDependencyCommand(db);
      cmd.execute('page', 'my-page', 'file', 'file-1');
      cmd.execute('page', 'my-page', 'file', 'file-1'); // duplicate → DO NOTHING
      cmd.execute('page', 'my-page', 'page', 'other-page');

      const rows = db.executeRead<{
        parent_source_id: string;
        child_source_type: string;
        child_source_id: string;
      }>(
        'SELECT parent_source_id, child_source_type, child_source_id FROM html_dependencies ORDER BY child_source_type'
      );
      expect(rows).toEqual([
        {
          parent_source_id: 'my-page',
          child_source_type: 'file',
          child_source_id: 'file-1',
        },
        {
          parent_source_id: 'my-page',
          child_source_type: 'page',
          child_source_id: 'other-page',
        },
      ]);
    });
  });
});
