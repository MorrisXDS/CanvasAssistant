/**
 * PolicyReader tests (ADR-0007 PR-H).
 *
 * `course_policies` is a zombie table today (no live writers — see
 * CONTEXT.md "Policy (zombie)"). The tests seed rows directly to verify
 * the reader's behaviour anyway; production data will be empty until a
 * future feature repopulates the table.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { PolicyReader } from '../../../src/layers/l1-persistence/readers/PolicyReader';

describe('PolicyReader', () => {
  let db: Database;
  let reader: PolicyReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const runner = new MigrationRunner(db);
    runner.loadMigrations(coreMigrations);
    runner.runAll();

    seedCourse(db, 1, 'CS101');
    seedCourse(db, 2, 'MAT201');
    reader = new PolicyReader(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('getByCourseId', () => {
    test('returns active policies for one course, ordered by policy_type', () => {
      seedPolicy(db, { courseId: 1, policyType: 'late', policyName: 'Late Policy' });
      seedPolicy(db, {
        courseId: 1,
        policyType: 'drop_lowest',
        policyName: 'Drop Lowest',
      });

      const rows = reader.getByCourseId(1);

      expect(rows.map((r) => r.policy_type)).toEqual(['drop_lowest', 'late']);
    });

    test('excludes inactive policies', () => {
      seedPolicy(db, { courseId: 1, policyType: 'live', isActive: 1 });
      seedPolicy(db, { courseId: 1, policyType: 'dead', isActive: 0 });

      const rows = reader.getByCourseId(1);

      expect(rows.map((r) => r.policy_type)).toEqual(['live']);
    });

    test('excludes other courses', () => {
      seedPolicy(db, { courseId: 1, policyType: 'cs' });
      seedPolicy(db, { courseId: 2, policyType: 'mat' });

      const rows = reader.getByCourseId(1);

      expect(rows.map((r) => r.policy_type)).toEqual(['cs']);
    });

    test('returns empty array when no policies', () => {
      expect(reader.getByCourseId(1)).toEqual([]);
    });
  });

  describe('getByCourseIds', () => {
    test('returns rows across given courses, ordered by course_id then policy_type', () => {
      seedPolicy(db, { courseId: 2, policyType: 'mat-late' });
      seedPolicy(db, { courseId: 1, policyType: 'cs-drop' });
      seedPolicy(db, { courseId: 1, policyType: 'cs-late' });

      const rows = reader.getByCourseIds([1, 2]);

      expect(rows.map((r) => r.policy_type)).toEqual(['cs-drop', 'cs-late', 'mat-late']);
    });

    test('returns empty for empty input', () => {
      seedPolicy(db, { courseId: 1, policyType: 'x' });
      expect(reader.getByCourseIds([])).toEqual([]);
    });

    test('excludes inactive', () => {
      seedPolicy(db, { courseId: 1, policyType: 'live', isActive: 1 });
      seedPolicy(db, { courseId: 1, policyType: 'dead', isActive: 0 });

      const rows = reader.getByCourseIds([1]);

      expect(rows.map((r) => r.policy_type)).toEqual(['live']);
    });
  });
});

function seedCourse(db: Database, id: number, code: string): void {
  db.executeWrite(
    `INSERT INTO courses (id, external_id, code, name, is_hidden, target_grade)
     VALUES (?, ?, ?, ?, 0, 85)`,
    [id, `ext_${id}`, code, `Course ${code}`]
  );
}

function seedPolicy(
  db: Database,
  data: {
    courseId: number;
    policyType: string;
    policyName?: string;
    isActive?: number;
  }
): void {
  db.executeWrite(
    `INSERT INTO course_policies
       (course_id, policy_type, policy_name, policy_config, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.courseId,
      data.policyType,
      data.policyName ?? `Policy ${data.policyType}`,
      '{}',
      data.isActive ?? 1,
    ]
  );
}
