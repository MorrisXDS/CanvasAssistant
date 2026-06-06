/**
 * PastTermGradesReader tests (ADR-0015).
 *
 * Verifies the reader returns the IPC shape, computes per-term + cumulative
 * averages MAIN-SIDE from task grades (task-derived, NOT current_grade),
 * excludes non-archived courses, and orders terms newest-first.
 */

import { Database } from '../../../src/layers/l1-persistence/Database';
import {
  MigrationRunner,
  coreMigrations,
} from '../../../src/layers/l1-persistence/MigrationRunner';
import { PastTermGradesReader } from '../../../src/layers/l1-persistence/readers/PastTermGradesReader';

describe('PastTermGradesReader', () => {
  let db: Database;
  let reader: PastTermGradesReader;

  beforeEach(() => {
    db = new Database({ dbPath: ':memory:', verbose: false });
    db.initialize();
    const migrationRunner = new MigrationRunner(db);
    migrationRunner.loadMigrations(coreMigrations);
    migrationRunner.runAll();
    reader = new PastTermGradesReader(db);
  });

  afterEach(() => {
    db.close();
  });

  test('returns empty terms + null cumulative when no archived courses', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: '2024-12-15T00:00:00Z',
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100 }); // active, not archived

    const result = reader.getPastTermGrades();

    expect(result.terms).toEqual([]);
    expect(result.cumulative).toBeNull();
    expect(result.courseCount).toBe(0);
  });

  test('computes task-derived per-term average (NOT current_grade)', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: '2024-12-15T00:00:00Z',
    });
    // current_grade is intentionally bogus to prove we ignore it.
    seedCourse(db, {
      id: 1,
      enrollment_term_id: 100,
      archived_at: '2025-01-01',
      credits: 1.0,
      current_grade: 5,
    });
    // Two tasks: 50% weight @ 80, 50% weight @ 90 → 85
    seedTask(db, { course_id: 1, weight: 50, grade: 80 });
    seedTask(db, { course_id: 1, weight: 50, grade: 90 });

    const result = reader.getPastTermGrades();

    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].termName).toBe('Fall 2024');
    expect(result.terms[0].courses[0].grade).toBeCloseTo(85, 5);
    expect(result.terms[0].termAverage).toBeCloseTo(85, 5);
    expect(result.cumulative).toBeCloseTo(85, 5);
    expect(result.courseCount).toBe(1);
  });

  test('excludes non-archived courses from the breakdown', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: '2024-12-15T00:00:00Z',
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100, archived_at: '2025-01-01' });
    seedTask(db, { course_id: 1, weight: 100, grade: 70 });
    // Active course in the same term — must NOT appear.
    seedCourse(db, { id: 2, enrollment_term_id: 100 });
    seedTask(db, { course_id: 2, weight: 100, grade: 99 });

    const result = reader.getPastTermGrades();

    expect(result.courseCount).toBe(1);
    expect(result.terms[0].courses.map((c) => c.grade)).toEqual([70]);
  });

  test('groups by term, newest first, and credit-weights the cumulative', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2023',
      end_at: '2023-12-15T00:00:00Z',
    });
    seedTerm(db, {
      external_id: '200',
      name: 'Fall 2024',
      end_at: '2024-12-15T00:00:00Z',
    });

    // Older term: one 1cr course @ 60.
    seedCourse(db, {
      id: 1,
      enrollment_term_id: 100,
      archived_at: '2024-01-01',
      credits: 1.0,
    });
    seedTask(db, { course_id: 1, weight: 100, grade: 60 });

    // Newer term: one 0.5cr course @ 90.
    seedCourse(db, {
      id: 2,
      enrollment_term_id: 200,
      archived_at: '2025-01-01',
      credits: 0.5,
    });
    seedTask(db, { course_id: 2, weight: 100, grade: 90 });

    const result = reader.getPastTermGrades();

    expect(result.terms.map((t) => t.termName)).toEqual(['Fall 2024', 'Fall 2023']);
    // Cumulative credit-weighted: (90*0.5 + 60*1)/(1.5) = 105/1.5 = 70
    expect(result.cumulative).toBeCloseTo(70, 5);
    expect(result.courseCount).toBe(2);
  });

  test('course with no assessable tasks → null grade, excluded from averages', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: '2024-12-15T00:00:00Z',
    });
    seedCourse(db, { id: 1, enrollment_term_id: 100, archived_at: '2025-01-01' });
    // weight 0 and a null-grade task — neither contributes.
    seedTask(db, { course_id: 1, weight: 0, grade: 95 });
    seedTask(db, { course_id: 1, weight: 50, grade: null });

    const result = reader.getPastTermGrades();

    expect(result.terms[0].courses[0].grade).toBeNull();
    expect(result.terms[0].termAverage).toBeNull();
    expect(result.cumulative).toBeNull();
  });

  test('defaults missing credits to 1.0 in the course DTO', () => {
    seedTerm(db, {
      external_id: '100',
      name: 'Fall 2024',
      end_at: '2024-12-15T00:00:00Z',
    });
    seedCourse(db, {
      id: 1,
      enrollment_term_id: 100,
      archived_at: '2025-01-01',
      credits: 0,
    });
    seedTask(db, { course_id: 1, weight: 100, grade: 75 });

    const result = reader.getPastTermGrades();

    expect(result.terms[0].courses[0].credits).toBe(1.0);
  });
});

// =============================================================================
// Seed helpers
// =============================================================================

function seedCourse(
  db: Database,
  data: {
    id: number;
    enrollment_term_id?: number | null;
    archived_at?: string | null;
    credits?: number;
    current_grade?: number | null;
    color?: string | null;
  }
): void {
  db.executeWrite(
    `INSERT INTO courses (
      id, external_id, code, name, target_grade, enrollment_term_id,
      archived_at, credits, current_grade, color
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.id,
      `ext_${data.id}`,
      `C${data.id}`,
      `Course ${data.id}`,
      85,
      data.enrollment_term_id ?? null,
      data.archived_at ?? null,
      data.credits ?? 1.0,
      data.current_grade ?? null,
      data.color ?? null,
    ]
  );
}

function seedTerm(
  db: Database,
  data: { external_id: string; name: string; end_at: string }
): void {
  db.executeWrite(
    `INSERT INTO enrollment_terms (external_id, name, end_at) VALUES (?, ?, ?)`,
    [data.external_id, data.name, data.end_at]
  );
}

let taskSeq = 0;
function seedTask(
  db: Database,
  data: { course_id: number; weight: number | null; grade: number | null }
): void {
  taskSeq += 1;
  db.executeWrite(
    `INSERT INTO tasks (external_id, course_id, title, weight, grade, priority_score)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [`task_${taskSeq}`, data.course_id, `Task ${taskSeq}`, data.weight, data.grade, 0]
  );
}
