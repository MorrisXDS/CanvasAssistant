/**
 * CoursePageReader tests (ADR-0007 — resourceHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CoursePageReader } from '../../../src/layers/l1-persistence/readers/CoursePageReader';

describe('CoursePageReader', () => {
  let db: Database;
  let reader: CoursePageReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new CoursePageReader(db);

    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name) VALUES (1, '4242', 'CS101', 'Intro')`,
      [],
      'courses'
    );
    db.executeWrite(
      `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html)
       VALUES (50, 'page-abc', 1, 'content', 'Week 1 Notes', 'week-1-notes', '<p>Body</p>')`,
      [],
      'course_pages'
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('getUrlSlug', () => {
    test('matches by url_slug', () => {
      expect(reader.getUrlSlug(1, 'week-1-notes')).toEqual({ url_slug: 'week-1-notes' });
    });

    test('matches by external_id', () => {
      expect(reader.getUrlSlug(1, 'page-abc')).toEqual({ url_slug: 'week-1-notes' });
    });

    test('returns null for wrong course', () => {
      expect(reader.getUrlSlug(2, 'week-1-notes')).toBeNull();
    });

    test('null/undefined courseId matches nothing (no throw)', () => {
      expect(reader.getUrlSlug(null, 'week-1-notes')).toBeNull();
      expect(reader.getUrlSlug(undefined, 'week-1-notes')).toBeNull();
    });
  });

  describe('getContent', () => {
    test('matches by url_slug and projects identity + body', () => {
      expect(reader.getContent(1, 'week-1-notes')).toEqual({
        id: 50,
        external_id: 'page-abc',
        title: 'Week 1 Notes',
        body_html: '<p>Body</p>',
      });
    });

    test('matches by external_id', () => {
      expect(reader.getContent(1, 'page-abc')?.id).toBe(50);
    });

    test('returns null for wrong course', () => {
      expect(reader.getContent(2, 'week-1-notes')).toBeNull();
    });

    test('null/undefined courseId matches nothing (no throw)', () => {
      expect(reader.getContent(null, 'week-1-notes')).toBeNull();
      expect(reader.getContent(undefined, 'week-1-notes')).toBeNull();
    });
  });
});
