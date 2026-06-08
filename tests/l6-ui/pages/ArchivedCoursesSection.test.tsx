/**
 * ArchivedCoursesSection tests (ADR-0015).
 *
 * Covers the flat-list → per-term-subgroup conversion: groups newest-first with
 * per-term average + count, Restore preserved (disabled for auto-archived),
 * collapse toggles, and unknown-term courses still render.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ArchivedCoursesSection } from '../../../src/layers/l6-ui/components/pages/ArchivedCoursesSection';
import type { Course } from '../../../src/layers/l5-presentation/types';
import type { EnrollmentTerm, PastTermGrades } from '../../../src/shared/ipc-contract';

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    externalId: 'ext-1',
    code: 'ECE311',
    name: 'Control Systems',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: null,
    currentGrade: null,
    color: '#22c3dd',
    nickname: null,
    isHidden: false,
    lastSyncedAt: null,
    enrollmentTermId: 200,
    credits: 1.0,
    archivedAt: '2025-01-01',
    archiveSource: 'manual',
    ...overrides,
  };
}

const TERMS: EnrollmentTerm[] = [
  {
    id: 1,
    externalId: '100',
    name: '2025 Fall',
    startAt: null,
    endAt: '2025-12-15T00:00:00Z',
  },
  {
    id: 2,
    externalId: '200',
    name: '2026 Winter',
    startAt: null,
    endAt: '2026-04-30T00:00:00Z',
  },
];

const PAST: PastTermGrades = {
  terms: [
    {
      termName: '2026 Winter',
      termEndAt: '2026-04-30T00:00:00Z',
      courses: [],
      termAverage: 84,
    },
    {
      termName: '2025 Fall',
      termEndAt: '2025-12-15T00:00:00Z',
      courses: [],
      termAverage: 81,
    },
  ],
  cumulative: 82,
  courseCount: 4,
};

function renderSection(courses: Course[], onUnarchive = jest.fn()) {
  return render(
    <MemoryRouter>
      <ArchivedCoursesSection
        archivedCourses={courses}
        showArchived
        loadingArchived={false}
        onToggleShow={jest.fn()}
        onUnarchive={onUnarchive}
        enrollmentTerms={TERMS}
        pastTermGrades={PAST}
      />
    </MemoryRouter>
  );
}

describe('ArchivedCoursesSection', () => {
  it('renders per-term subgroups, newest term first', () => {
    renderSection([
      makeCourse({ id: 1, code: 'ECE454', enrollmentTermId: 100 }), // 2025 Fall
      makeCourse({ id: 2, code: 'ECE311', enrollmentTermId: 200 }), // 2026 Winter
    ]);

    const winter = screen.getByText('2026 Winter');
    const fall = screen.getByText('2025 Fall');
    expect(winter).toBeInTheDocument();
    expect(fall).toBeInTheDocument();
    // Newest (Winter) appears before Fall in document order.
    expect(
      winter.compareDocumentPosition(fall) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('shows per-term average + count in the term header', () => {
    renderSection([
      makeCourse({ id: 1, code: 'ECE311', enrollmentTermId: 200 }),
      makeCourse({ id: 2, code: 'ECE342', enrollmentTermId: 200 }),
    ]);

    // 2026 Winter avg from PAST = 84.
    expect(screen.getByText('avg 84.0%')).toBeInTheDocument();
  });

  it('preserves Restore and disables it for auto-archived courses', () => {
    const onUnarchive = jest.fn();
    renderSection(
      [
        makeCourse({
          id: 1,
          code: 'ECE311',
          enrollmentTermId: 200,
          archiveSource: 'manual',
        }),
        makeCourse({
          id: 2,
          code: 'ECE342',
          enrollmentTermId: 200,
          archiveSource: 'auto',
        }),
      ],
      onUnarchive
    );

    const restoreButtons = screen.getAllByRole('button', { name: /Restore/ });
    expect(restoreButtons).toHaveLength(2);
    // Manual is enabled; auto is disabled.
    const enabled = restoreButtons.find((b) => !(b as HTMLButtonElement).disabled);
    const disabled = restoreButtons.find((b) => (b as HTMLButtonElement).disabled);
    expect(enabled).toBeDefined();
    expect(disabled).toBeDefined();

    fireEvent.click(enabled!);
    expect(onUnarchive).toHaveBeenCalledWith(1);
  });

  it('collapses and expands a term subgroup on header click', () => {
    renderSection([makeCourse({ id: 1, code: 'ECE311', enrollmentTermId: 200 })]);

    // Newest term defaults open → row visible.
    expect(screen.getByText('Control Systems')).toBeInTheDocument();

    fireEvent.click(screen.getByText('2026 Winter'));
    expect(screen.queryByText('Control Systems')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('2026 Winter'));
    expect(screen.getByText('Control Systems')).toBeInTheDocument();
  });

  it('renders the empty state when there are no archived courses', () => {
    renderSection([]);
    expect(screen.getByText('No archived courses')).toBeInTheDocument();
  });

  it('groups courses with no matching term under "Unknown term"', () => {
    renderSection([makeCourse({ id: 1, code: 'ECE999', enrollmentTermId: 9999 })]);
    expect(screen.getByText('Unknown term')).toBeInTheDocument();
  });
});
