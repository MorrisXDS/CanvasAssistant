/**
 * ModuleReader tests (ADR-0007 — pagesHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { ModuleReader } from '../../../src/layers/l1-persistence/readers/ModuleReader';

describe('ModuleReader', () => {
  let db: Database;
  let reader: ModuleReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new ModuleReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getModuleItemById', () => {
    test('returns the projected row when found', () => {
      db.executeWrite(
        `INSERT INTO module_items (id, external_id, course_id, module_id, title, item_type, page_url, url)
         VALUES (10, 'mi1', 1, 5, 'My Page', 'Page', 'my-page', 'https://x/courses/1/pages/my-page')`,
        [],
        'module_items'
      );
      const row = reader.getModuleItemById(10);
      expect(row).toEqual({
        id: 10,
        module_id: 5,
        title: 'My Page',
        item_type: 'Page',
        page_url: 'my-page',
        url: 'https://x/courses/1/pages/my-page',
      });
    });

    test('returns null when not found', () => {
      expect(reader.getModuleItemById(999)).toBeNull();
    });
  });

  describe('getModuleById', () => {
    test('returns course_id + name when found', () => {
      db.executeWrite(
        `INSERT INTO modules (id, external_id, course_id, name) VALUES (5, 'm1', 7, 'Week 1')`,
        [],
        'modules'
      );
      expect(reader.getModuleById(5)).toEqual({ course_id: 7, name: 'Week 1' });
    });

    test('returns null when not found', () => {
      expect(reader.getModuleById(999)).toBeNull();
    });
  });
});
