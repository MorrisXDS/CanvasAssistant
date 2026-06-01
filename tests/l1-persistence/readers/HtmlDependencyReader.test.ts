/**
 * HtmlDependencyReader tests (ADR-0007 — resourceHandlers migration).
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { HtmlDependencyReader } from '../../../src/layers/l1-persistence/readers/HtmlDependencyReader';

describe('HtmlDependencyReader', () => {
  let db: Database;
  let reader: HtmlDependencyReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();
    reader = new HtmlDependencyReader(db);

    const edge = (pType: string, pId: string, cType: string, cId: string): void => {
      db.executeWrite(
        `INSERT INTO html_dependencies (parent_source_type, parent_source_id, child_source_type, child_source_id)
         VALUES (?, ?, ?, ?)`,
        [pType, pId, cType, cId],
        'html_dependencies'
      );
    };
    edge('page', 'parent-1', 'file', '555');
    edge('page', 'parent-1', 'page', 'child-page');
    edge('page', 'other-parent', 'file', '999');
  });

  afterEach(() => {
    db.close();
  });

  describe('getChildren', () => {
    test('returns all child edges for a parent', () => {
      const rows = reader.getChildren('page', 'parent-1');
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          { child_source_type: 'file', child_source_id: '555' },
          { child_source_type: 'page', child_source_id: 'child-page' },
        ])
      );
    });

    test('returns empty array when none', () => {
      expect(reader.getChildren('page', 'nonexistent')).toEqual([]);
    });
  });

  describe('countChildren', () => {
    test('counts child edges for a parent', () => {
      expect(reader.countChildren('page', 'parent-1')).toBe(2);
      expect(reader.countChildren('page', 'other-parent')).toBe(1);
    });

    test('returns 0 when none', () => {
      expect(reader.countChildren('page', 'nonexistent')).toBe(0);
    });
  });
});
