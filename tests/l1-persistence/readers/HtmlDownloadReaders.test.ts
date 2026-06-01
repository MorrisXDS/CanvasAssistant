/**
 * Reader-method tests for the ADR-0007 htmlDependencyHandlers migration.
 *
 * Covers the new projections added to support `html:checkDependencies` /
 * `html:downloadDependencies`: ResourceReader.getHtmlDownloadInfoByExternalId,
 * CoursePageReader.getContentWithSlug / getHashSourceByExternalId,
 * HtmlDependencyReader.getChildrenWithHash,
 * CourseReader.getSyllabusHashSourceByExternalId,
 * TaskReader.getDescriptionHashSourceByExternalId.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ResourceReader } from '../../../src/layers/l1-persistence/readers/ResourceReader';
import { CoursePageReader } from '../../../src/layers/l1-persistence/readers/CoursePageReader';
import { HtmlDependencyReader } from '../../../src/layers/l1-persistence/readers/HtmlDependencyReader';
import { CourseReader } from '../../../src/layers/l1-persistence/readers/CourseReader';
import { TaskReader } from '../../../src/layers/l1-persistence/readers/TaskReader';

describe('htmlDependency migration reader methods', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, syllabus_body, syllabus_hash)
       VALUES (1, '4242', 'CS101', 'Intro', '<p>syllabus</p>', 'shash')`,
      [],
      'courses'
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('ResourceReader.getHtmlDownloadInfoByExternalId', () => {
    test('returns id + local_path + url + title + folder_path', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, url, local_path, folder_path)
         VALUES (10, 'file-5', 1, 'file', 'a.pdf', 'https://x/5', '/d/a.pdf', 'Wk1')`,
        [],
        'resources'
      );
      expect(new ResourceReader(db).getHtmlDownloadInfoByExternalId('file-5')).toEqual({
        id: 10,
        local_path: '/d/a.pdf',
        url: 'https://x/5',
        title: 'a.pdf',
        folder_path: 'Wk1',
      });
    });

    test('returns null when not found', () => {
      expect(new ResourceReader(db).getHtmlDownloadInfoByExternalId('nope')).toBeNull();
    });
  });

  describe('CoursePageReader', () => {
    beforeEach(() => {
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html, content_hash)
         VALUES (50, 'pg-ext', 1, 'content', 'Wk1', 'wk-1', '<p>b</p>', 'chash')`,
        [],
        'course_pages'
      );
    });

    test('getContentWithSlug returns identity + body + slug (by slug or external_id)', () => {
      const r = new CoursePageReader(db);
      expect(r.getContentWithSlug(1, 'wk-1')).toEqual({
        id: 50,
        external_id: 'pg-ext',
        title: 'Wk1',
        body_html: '<p>b</p>',
        url_slug: 'wk-1',
      });
      expect(r.getContentWithSlug(1, 'pg-ext')?.id).toBe(50);
      expect(r.getContentWithSlug(2, 'wk-1')).toBeNull();
    });

    test('getHashSourceByExternalId returns body_html + content_hash', () => {
      expect(new CoursePageReader(db).getHashSourceByExternalId('pg-ext')).toEqual({
        body_html: '<p>b</p>',
        content_hash: 'chash',
      });
      expect(new CoursePageReader(db).getHashSourceByExternalId('nope')).toBeNull();
    });
  });

  describe('HtmlDependencyReader.getChildrenWithHash', () => {
    test('returns child edges with their recorded_content_hash', () => {
      db.executeWrite(
        `INSERT INTO html_dependencies
           (parent_source_type, parent_source_id, child_source_type, child_source_id, recorded_content_hash)
         VALUES ('page', 'p1', 'file', '5', 'h1')`,
        [],
        'html_dependencies'
      );
      const rows = new HtmlDependencyReader(db).getChildrenWithHash('page', 'p1');
      expect(rows).toEqual([
        { child_source_type: 'file', child_source_id: '5', recorded_content_hash: 'h1' },
      ]);
    });

    test('returns empty array when none', () => {
      expect(new HtmlDependencyReader(db).getChildrenWithHash('page', 'none')).toEqual(
        []
      );
    });
  });

  describe('CourseReader.getSyllabusHashSourceByExternalId', () => {
    test('returns syllabus_body + syllabus_hash by external_id', () => {
      expect(new CourseReader(db).getSyllabusHashSourceByExternalId('4242')).toEqual({
        syllabus_body: '<p>syllabus</p>',
        syllabus_hash: 'shash',
      });
      expect(new CourseReader(db).getSyllabusHashSourceByExternalId('nope')).toBeNull();
    });
  });

  describe('TaskReader.getDescriptionHashSourceByExternalId', () => {
    test('returns description + description_hash by external_id', () => {
      db.executeWrite(
        `INSERT INTO tasks (id, external_id, course_id, title, description, description_hash)
         VALUES (200, 'a-1', 1, 'HW', '<p>desc</p>', 'dhash')`,
        [],
        'tasks'
      );
      expect(new TaskReader(db).getDescriptionHashSourceByExternalId('a-1')).toEqual({
        description: '<p>desc</p>',
        description_hash: 'dhash',
      });
      expect(new TaskReader(db).getDescriptionHashSourceByExternalId('nope')).toBeNull();
    });
  });
});
