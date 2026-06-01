/**
 * Reader-method tests for the ADR-0007 fileDataHandlers (literal-zero) migration.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ResourceReader } from '../../../src/layers/l1-persistence/readers/ResourceReader';
import { AnnouncementAttachmentReader } from '../../../src/layers/l1-persistence/readers/AnnouncementAttachmentReader';
import { AnnouncementFileReferenceReader } from '../../../src/layers/l1-persistence/readers/AnnouncementFileReferenceReader';
import { ModuleReader } from '../../../src/layers/l1-persistence/readers/ModuleReader';

describe('fileData migration readers', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS', 'Intro'), (2, '5', 'AR', 'Arch')`,
      [],
      'courses'
    );
    db.executeWrite(
      'UPDATE courses SET archived_at = CURRENT_TIMESTAMP WHERE id = 2',
      []
    );
  });

  afterEach(() => db.close());

  describe('ResourceReader', () => {
    test('getFilesAndPagesByCourse returns file+page rows ordered', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, folder_path) VALUES
           (10, 'f1', 1, 'file', 'b.pdf', 'Z'), (11, 'p1', 1, 'page', 'a.html', 'A'),
           (12, 'x1', 1, 'external_url', 'link', NULL)`,
        [],
        'resources'
      );
      const rows = new ResourceReader(db).getFilesAndPagesByCourse(1);
      // only file + page (not external_url); ordered by folder_path then title
      expect(rows.map((r) => r.id)).toEqual([11, 10]);
    });

    test('getVisibleFilesAndPages excludes archived courses', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title) VALUES
           (10, 'f1', 1, 'file', 'ok.pdf'), (11, 'f2', 2, 'file', 'archived.pdf')`,
        [],
        'resources'
      );
      const rows = new ResourceReader(db).getVisibleFilesAndPages();
      expect(rows.map((r) => r.id)).toEqual([10]); // course 2 archived → excluded
    });

    test('getExternalIdCourseById', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title) VALUES (10, 'f1', 1, 'file', 'a')`,
        [],
        'resources'
      );
      expect(new ResourceReader(db).getExternalIdCourseById(10)).toEqual({
        external_id: 'f1',
        course_id: 1,
      });
      expect(new ResourceReader(db).getExternalIdCourseById(999)).toBeNull();
    });
  });

  describe('AnnouncementAttachmentReader', () => {
    function seedAtt(id: number, courseId: number, notifId: number): void {
      db.executeWrite('PRAGMA foreign_keys = OFF', []);
      db.executeWrite(
        `INSERT INTO notification_attachments
           (id, notification_id, course_id, external_id, display_name, filename, url, download_status)
         VALUES (?, ?, ?, ?, ?, 'f.pdf', 'https://x', 'pending')`,
        [id, notifId, courseId, `a-${id}`, `Disp ${id}`],
        'notification_attachments'
      );
      db.executeWrite('PRAGMA foreign_keys = ON', []);
    }

    test('getByCourseOrderedByName', () => {
      seedAtt(1, 1, 99);
      seedAtt(2, 1, 99);
      const rows = new AnnouncementAttachmentReader(db).getByCourseOrderedByName(1);
      expect(rows.map((r) => r.display_name)).toEqual(['Disp 1', 'Disp 2']);
    });

    test('getAllWithCourseAndNotification joins course + notification, excludes archived', () => {
      db.executeWrite(
        `INSERT INTO notifications (id, source_type, source_id, course_id, title, message, published_at)
         VALUES (100, 'canvas', 'n1', 1, 'Ann A', 'm', '2026-01-01'),
                (101, 'canvas', 'n2', 2, 'Ann B', 'm', '2026-01-01')`,
        [],
        'notifications'
      );
      seedAtt(1, 1, 100);
      seedAtt(2, 2, 101); // course 2 archived → excluded
      const rows = new AnnouncementAttachmentReader(db).getAllWithCourseAndNotification();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ course_code: 'CS', notification_title: 'Ann A' });
    });

    test('getExternalIdCourseById', () => {
      seedAtt(7, 1, 99);
      expect(new AnnouncementAttachmentReader(db).getExternalIdCourseById(7)).toEqual({
        external_id: 'a-7',
        course_id: 1,
      });
      expect(
        new AnnouncementAttachmentReader(db).getExternalIdCourseById(999)
      ).toBeNull();
    });
  });

  describe('AnnouncementFileReferenceReader.getByNotificationId', () => {
    test('returns refs (LEFT JOIN attachment may be null)', () => {
      db.executeWrite(
        `INSERT INTO notifications (id, source_type, source_id, course_id, title, message, published_at)
         VALUES (100, 'canvas', 'n1', 1, 'A', 'm', '2026-01-01')`,
        [],
        'notifications'
      );
      db.executeWrite(
        `INSERT INTO announcement_file_references
           (id, notification_id, attachment_id, start_position, end_position, matched_text)
         VALUES (1, 100, NULL, 5, 9, 'file.pdf')`,
        [],
        'announcement_file_references'
      );
      const rows = new AnnouncementFileReferenceReader(db).getByNotificationId(100);
      expect(rows).toHaveLength(1);
      expect(rows[0].matched_text).toBe('file.pdf');
      expect(rows[0].att_id).toBeNull();
    });
  });

  describe('ModuleReader.getItemsForCourses', () => {
    test('empty input → empty output', () => {
      expect(new ModuleReader(db).getItemsForCourses([])).toEqual([]);
    });

    test('returns items joined with module + course, excludes SubHeaders', () => {
      db.executeWrite(
        `INSERT INTO modules (id, external_id, course_id, name, position) VALUES (1, 'm1', 1, 'Wk1', 0)`,
        [],
        'modules'
      );
      db.executeWrite(
        `INSERT INTO module_items (id, external_id, module_id, title, item_type, position) VALUES
           (1, 'mi1', 1, 'Lecture', 'Page', 0),
           (2, 'mi2', 1, 'Header', 'SubHeader', 1)`,
        [],
        'module_items'
      );
      const rows = new ModuleReader(db).getItemsForCourses([1]);
      expect(rows.map((r) => r.title)).toEqual(['Lecture']); // SubHeader excluded
      expect(rows[0].module_name).toBe('Wk1');
    });
  });
});
