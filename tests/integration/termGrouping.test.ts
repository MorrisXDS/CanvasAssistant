/**
 * termGrouping — pure helper tests (ADR-0015).
 *
 * Covers term grouping (newest-first, overlap-safe), credit-weighted per-term
 * average, and credit-weighted cumulative (flattened, not double-weighted).
 */

import {
  groupCoursesByTerm,
  termAverage,
  cumulativeAverage,
  type CourseWithGrade,
} from '../../src/shared/grades/termGrouping';

function course(overrides: Partial<CourseWithGrade>): CourseWithGrade {
  return {
    code: 'C',
    name: 'Course',
    color: null,
    grade: 80,
    credits: 1.0,
    termName: 'Fall 2024',
    termEndAt: '2024-12-15T00:00:00Z',
    ...overrides,
  };
}

describe('termAverage', () => {
  test('credit-weights the grades', () => {
    // 0.5-credit @ 90 and 1.0-credit @ 60 → (90*0.5 + 60*1)/(1.5) = 105/1.5 = 70
    const avg = termAverage([
      course({ grade: 90, credits: 0.5 }),
      course({ grade: 60, credits: 1.0 }),
    ]);
    expect(avg).toBeCloseTo(70, 5);
  });

  test('defaults missing/zero credits to 1.0', () => {
    // Both treated as 1.0 → plain mean of 80 and 90 = 85
    const avg = termAverage([
      course({ grade: 80, credits: null }),
      course({ grade: 90, credits: 0 }),
    ]);
    expect(avg).toBeCloseTo(85, 5);
  });

  test('excludes null grades from the weighting', () => {
    // null grade contributes neither numerator nor denominator
    const avg = termAverage([
      course({ grade: null, credits: 5 }),
      course({ grade: 70, credits: 1 }),
    ]);
    expect(avg).toBeCloseTo(70, 5);
  });

  test('returns null when all grades are null', () => {
    expect(termAverage([course({ grade: null }), course({ grade: null })])).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(termAverage([])).toBeNull();
  });
});

describe('groupCoursesByTerm', () => {
  test('empty input → empty output', () => {
    expect(groupCoursesByTerm([])).toEqual([]);
  });

  test('orders terms newest-first by end date', () => {
    const groups = groupCoursesByTerm([
      course({ termName: '2023 Fall', termEndAt: '2023-12-15T00:00:00Z' }),
      course({ termName: '2025 Winter', termEndAt: '2025-04-30T00:00:00Z' }),
      course({ termName: '2024 Fall', termEndAt: '2024-12-15T00:00:00Z' }),
    ]);
    expect(groups.map((g) => g.termName)).toEqual([
      '2025 Winter',
      '2024 Fall',
      '2023 Fall',
    ]);
  });

  test('keeps two overlapping ongoing terms as separate groups', () => {
    // A full-year course and a single-semester course can overlap in time but
    // belong to different terms — they must not be merged.
    const groups = groupCoursesByTerm([
      course({
        code: 'ECE496',
        termName: '2025 Fall-Winter',
        termEndAt: '2026-04-30T00:00:00Z',
      }),
      course({
        code: 'ECE311',
        termName: '2026 Winter',
        termEndAt: '2026-04-30T00:00:00Z',
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.termName))).toEqual(
      new Set(['2025 Fall-Winter', '2026 Winter'])
    );
  });

  test('collapses null-term courses into one group, ordered last', () => {
    const groups = groupCoursesByTerm([
      course({ code: 'A', termName: null, termEndAt: null }),
      course({ code: 'B', termName: null, termEndAt: null }),
      course({ termName: '2024 Fall', termEndAt: '2024-12-15T00:00:00Z' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].termName).toBe('2024 Fall');
    expect(groups[1].termName).toBeNull();
    expect(groups[1].courses).toHaveLength(2);
  });

  test('computes a credit-weighted per-term average for each group', () => {
    const groups = groupCoursesByTerm([
      course({
        termName: 'T1',
        termEndAt: '2024-12-15T00:00:00Z',
        grade: 90,
        credits: 1,
      }),
      course({
        termName: 'T1',
        termEndAt: '2024-12-15T00:00:00Z',
        grade: 70,
        credits: 1,
      }),
    ]);
    expect(groups[0].termAverage).toBeCloseTo(80, 5);
  });
});

describe('cumulativeAverage', () => {
  test('flattens across terms (does not average the per-term averages)', () => {
    // Term A: one 100 @ 1cr (avg 100). Term B: three 70 @ 1cr (avg 70).
    // Averaging averages → 85. Flattened credit-weighted → (100 + 70*3)/4 = 77.5.
    const groups = groupCoursesByTerm([
      course({
        termName: 'A',
        termEndAt: '2025-04-30T00:00:00Z',
        grade: 100,
        credits: 1,
      }),
      course({ termName: 'B', termEndAt: '2024-12-15T00:00:00Z', grade: 70, credits: 1 }),
      course({ termName: 'B', termEndAt: '2024-12-15T00:00:00Z', grade: 70, credits: 1 }),
      course({ termName: 'B', termEndAt: '2024-12-15T00:00:00Z', grade: 70, credits: 1 }),
    ]);
    expect(cumulativeAverage(groups)).toBeCloseTo(77.5, 5);
  });

  test('credit-weights across all flattened courses', () => {
    // 0.5cr @ 90 and 1.0cr @ 60 across two terms → 70
    const groups = groupCoursesByTerm([
      course({
        termName: 'A',
        termEndAt: '2025-04-30T00:00:00Z',
        grade: 90,
        credits: 0.5,
      }),
      course({
        termName: 'B',
        termEndAt: '2024-12-15T00:00:00Z',
        grade: 60,
        credits: 1.0,
      }),
    ]);
    expect(cumulativeAverage(groups)).toBeCloseTo(70, 5);
  });

  test('returns null when no course is assessable', () => {
    const groups = groupCoursesByTerm([
      course({ termName: 'A', termEndAt: '2025-04-30T00:00:00Z', grade: null }),
    ]);
    expect(cumulativeAverage(groups)).toBeNull();
  });
});
