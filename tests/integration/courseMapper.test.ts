/**
 * courseMapper — pure-function tests.
 *
 * Per CLAUDE.md §7, domain pure functions target 90% branch coverage. The
 * mapper translates `CourseRow` (snake_case from DB) to the IPC contract's
 * `Course` / `CourseDetail` DTOs (camelCase). It must:
 *   - Map every field on the right
 *   - Preserve nulls where the schema permits null
 *   - Coerce the `is_hidden` integer to boolean
 *   - Apply documented defaults (credits → 1.0, totalWeight → 0,
 *     gradeCurveAdjustment → 0, targetGradeSource → 'default')
 *
 * Placed under tests/integration/ so the existing Jest project picks it up
 * (the IPC handler mapper lives outside tests/l1-persistence/).
 */

import type { CourseRow } from '../../src/layers/l1-persistence';
import {
  mapCourseRowToListDto,
  mapCourseRowToDetailDto,
} from '../../src/lifecycle/ipc-handlers/mappers/courseMapper';

function row(overrides: Partial<CourseRow> = {}): CourseRow {
  // Default = a fully-populated typical row.
  return {
    id: 1,
    external_id: 'ext_1',
    code: 'CS101',
    name: 'Intro to CS',
    target_grade: 85,
    target_grade_source: 'manual',
    assessed_grade: 78.5,
    current_grade: 80.0,
    total_weight: 95,
    grade_curve_adjustment: 2.5,
    color: '#FF8800',
    nickname: 'Intro',
    is_hidden: 0,
    syllabus_body: 'Course outline...',
    last_synced_at: '2026-01-15T10:00:00Z',
    enrollment_term_id: 100,
    credits: 0.5,
    archived_at: null,
    archive_source: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    late_penalty_authority: null,
    drop_lowest_authority: null,
    grade_calc_mode: null,
    auto_accept_canvas_tasks: 0,
    syllabus_prompt_dismissed_at: null,
    ...overrides,
  };
}

describe('mapCourseRowToListDto', () => {
  test('maps every camelCase field on a fully-populated row', () => {
    const dto = mapCourseRowToListDto(row());

    expect(dto).toEqual({
      id: 1,
      externalId: 'ext_1',
      code: 'CS101',
      name: 'Intro to CS',
      targetGrade: 85,
      targetGradeSource: 'manual',
      assessedGrade: 78.5,
      currentGrade: 80.0,
      color: '#FF8800',
      nickname: 'Intro',
      isHidden: false,
      lastSyncedAt: '2026-01-15T10:00:00Z',
      enrollmentTermId: 100,
      credits: 0.5,
      archivedAt: null,
      archiveSource: null,
    });
  });

  test('coerces is_hidden integer to boolean', () => {
    expect(mapCourseRowToListDto(row({ is_hidden: 1 })).isHidden).toBe(true);
    expect(mapCourseRowToListDto(row({ is_hidden: 0 })).isHidden).toBe(false);
  });

  test('preserves nullable fields as null', () => {
    const dto = mapCourseRowToListDto(
      row({
        assessed_grade: null,
        current_grade: null,
        color: null,
        nickname: null,
        last_synced_at: null,
        enrollment_term_id: null,
        archived_at: null,
        archive_source: null,
      })
    );

    expect(dto.assessedGrade).toBeNull();
    expect(dto.currentGrade).toBeNull();
    expect(dto.color).toBeNull();
    expect(dto.nickname).toBeNull();
    expect(dto.lastSyncedAt).toBeNull();
    expect(dto.enrollmentTermId).toBeNull();
    expect(dto.archivedAt).toBeNull();
    expect(dto.archiveSource).toBeNull();
  });

  test('exposes archived metadata for archived rows', () => {
    const dto = mapCourseRowToListDto(
      row({ archived_at: '2024-12-15T00:00:00Z', archive_source: 'auto' })
    );

    expect(dto.archivedAt).toBe('2024-12-15T00:00:00Z');
    expect(dto.archiveSource).toBe('auto');
  });

  test('falls back targetGradeSource to "default" when DB has null', () => {
    // target_grade_source is typed as 'default' | 'manual' but the schema
    // permits NULL on older rows. Map defaults to 'default'.
    const dto = mapCourseRowToListDto(
      row({ target_grade_source: null as unknown as 'default' })
    );
    expect(dto.targetGradeSource).toBe('default');
  });

  test('falls back credits to 1.0 when DB has null', () => {
    const dto = mapCourseRowToListDto(row({ credits: null as unknown as number }));
    expect(dto.credits).toBe(1.0);
  });
});

describe('mapCourseRowToDetailDto', () => {
  test('extends the list DTO with totalWeight, syllabusBody, gradeCurveAdjustment, syllabusPromptDismissedAt', () => {
    const dto = mapCourseRowToDetailDto(
      row({
        total_weight: 105,
        syllabus_body: '## Outline\n- Week 1',
        grade_curve_adjustment: -3.5,
        syllabus_prompt_dismissed_at: '2026-02-01T00:00:00Z',
      })
    );

    expect(dto.totalWeight).toBe(105);
    expect(dto.syllabusBody).toBe('## Outline\n- Week 1');
    expect(dto.gradeCurveAdjustment).toBe(-3.5);
    expect(dto.syllabusPromptDismissedAt).toBe('2026-02-01T00:00:00Z');
  });

  test('falls back totalWeight and gradeCurveAdjustment to 0 when DB has null', () => {
    const dto = mapCourseRowToDetailDto(
      row({
        total_weight: null as unknown as number,
        grade_curve_adjustment: null as unknown as number,
      })
    );

    expect(dto.totalWeight).toBe(0);
    expect(dto.gradeCurveAdjustment).toBe(0);
  });

  test('preserves null syllabusBody and null syllabusPromptDismissedAt', () => {
    const dto = mapCourseRowToDetailDto(
      row({ syllabus_body: null, syllabus_prompt_dismissed_at: null })
    );

    expect(dto.syllabusBody).toBeNull();
    expect(dto.syllabusPromptDismissedAt).toBeNull();
  });

  test('also maps every list-DTO field (extends not replaces)', () => {
    const dto = mapCourseRowToDetailDto(row({ id: 42, name: 'Extended' }));

    expect(dto.id).toBe(42);
    expect(dto.name).toBe('Extended');
    expect(dto.externalId).toBe('ext_1');
    expect(dto.targetGrade).toBe(85);
  });
});
