/**
 * Reader-method tests for the ADR-0007 courseContentHandlers migration:
 * CourseSyllabusReader, GradeHistoryReader, ResourceReader.getSyllabusInfoById,
 * and the new CoursePageReader page-list/detail methods.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { CourseSyllabusReader } from '../../../src/layers/l1-persistence/readers/CourseSyllabusReader';
import { GradeHistoryReader } from '../../../src/layers/l1-persistence/readers/GradeHistoryReader';
import { ResourceReader } from '../../../src/layers/l1-persistence/readers/ResourceReader';
import { CoursePageReader } from '../../../src/layers/l1-persistence/readers/CoursePageReader';

describe('courseContent migration readers', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    db.executeWrite(
      `INSERT INTO courses (id, external_id, code, name, syllabus_body) VALUES (1, '4242', 'CS101', 'Intro', '<p>syl</p>')`,
      [],
      'courses'
    );
  });

  afterEach(() => db.close());

  describe('CourseSyllabusReader.getDesignationByCourse', () => {
    test('returns the designation, or null', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title) VALUES (10, 'r1', 1, 'file', 'syl.pdf')`,
        [],
        'resources'
      );
      db.executeWrite(
        `INSERT INTO course_syllabuses (course_id, resource_id, source_type, last_reviewed_at, marked_at)
         VALUES (1, 10, 'resource', '2026-01-01', '2026-01-02')`,
        [],
        'course_syllabuses'
      );
      expect(new CourseSyllabusReader(db).getDesignationByCourse(1)).toMatchObject({
        resource_id: 10,
        source_type: 'resource',
        last_reviewed_at: '2026-01-01',
      });
      expect(new CourseSyllabusReader(db).getDesignationByCourse(999)).toBeNull();
    });
  });

  describe('GradeHistoryReader.getByCourse', () => {
    test('returns rows oldest-first', () => {
      db.executeWrite(
        `INSERT INTO grade_history (course_id, grade, recorded_at) VALUES
           (1, 88, '2026-03-01'), (1, 91, '2026-01-01')`,
        [],
        'grade_history'
      );
      expect(new GradeHistoryReader(db).getByCourse(1)).toEqual([
        { recorded_at: '2026-01-01', grade: 91 },
        { recorded_at: '2026-03-01', grade: 88 },
      ]);
    });
  });

  describe('ResourceReader.getSyllabusInfoById', () => {
    test('returns id + title + url + local_path + synced_at', () => {
      db.executeWrite(
        `INSERT INTO resources (id, external_id, course_id, type, title, url, local_path, synced_at)
         VALUES (10, 'r1', 1, 'file', 'syl.pdf', 'https://x/r1', '/d/syl.pdf', '2026-01-03')`,
        [],
        'resources'
      );
      expect(new ResourceReader(db).getSyllabusInfoById(10)).toEqual({
        id: 10,
        title: 'syl.pdf',
        url: 'https://x/r1',
        local_path: '/d/syl.pdf',
        synced_at: '2026-01-03',
      });
      expect(new ResourceReader(db).getSyllabusInfoById(999)).toBeNull();
    });
  });

  describe('CoursePageReader page list/detail methods', () => {
    beforeEach(() => {
      db.executeWrite(
        `INSERT INTO course_pages (id, external_id, course_id, page_type, title, url_slug, body_html, is_front_page)
         VALUES
           (50, 'p-home', 1, 'landing', 'Home', 'home', '<p>h</p>', 1),
           (51, 'p-week', 1, 'content', 'Week 1', 'week-1', '<p>w</p>', 0),
           (52, 'p-syl', 1, 'syllabus', 'Syllabus', 'syllabus', '<p>s</p>', 0)`,
        [],
        'course_pages'
      );
    });

    test('getAllByCourse: front page first then title', () => {
      const rows = new CoursePageReader(db).getAllByCourse(1);
      // front page (50) first; then title ASC → 'Syllabus' (52) before 'Week 1' (51)
      expect(rows.map((p) => p.id)).toEqual([50, 52, 51]);
      expect(rows[0]).toHaveProperty('body_text'); // full projection
    });

    test('getById', () => {
      expect(new CoursePageReader(db).getById(51)?.title).toBe('Week 1');
      expect(new CoursePageReader(db).getById(999)).toBeNull();
    });

    test('getByTitleInCourse', () => {
      expect(new CoursePageReader(db).getByTitleInCourse('Week 1', 1)?.id).toBe(51);
      expect(new CoursePageReader(db).getByTitleInCourse('Week 1', 2)).toBeNull();
    });

    test('getSyllabusPageByCourse', () => {
      expect(new CoursePageReader(db).getSyllabusPageByCourse(1)).toMatchObject({
        id: 52,
        title: 'Syllabus',
        external_id: 'p-syl',
      });
    });
  });
});
