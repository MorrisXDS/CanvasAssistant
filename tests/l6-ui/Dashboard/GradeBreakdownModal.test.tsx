/**
 * GradeBreakdownModal tests (ADR-0015).
 *
 * Covers the term-grouped Current section, the modal-scoped Past-terms fetch +
 * cumulative, the empty-past-terms hide, and that grades shown are the
 * task-derived `effectiveAssessedGrade` (NOT current_grade).
 *
 * window.api.getPastTermGrades / getEnrollmentTerms are stubbed — the modal
 * fetches them into LOCAL state (never the store), so a plain window.api mock
 * is the whole seam.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { GradeBreakdownModal } from '../../../src/layers/l6-ui/components/Dashboard/GradeBreakdownModal';
import type { CourseSummary, Course } from '../../../src/layers/l5-presentation/types';
import type { EnrollmentTerm, PastTermGrades } from '../../../src/shared/ipc-contract';

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    externalId: 'ext-1',
    code: 'ECE311',
    name: 'Control Systems',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: 78,
    currentGrade: null,
    color: '#22c3dd',
    nickname: null,
    isHidden: false,
    lastSyncedAt: null,
    enrollmentTermId: 200,
    credits: 1.0,
    archivedAt: null,
    archiveSource: null,
    ...overrides,
  };
}

function makeSummary(
  course: Partial<Course>,
  effectiveAssessedGrade: number | null
): CourseSummary {
  return {
    course: makeCourse(course),
    taskCount: 5,
    completedCount: 2,
    upcomingCount: 1,
    overdueCount: 0,
    effectiveAssessedGrade,
    targetDelta: 0,
  };
}

const TERMS: EnrollmentTerm[] = [
  {
    id: 1,
    externalId: '200',
    name: '2026 Winter',
    startAt: null,
    endAt: '2026-04-30T00:00:00Z',
  },
  {
    id: 2,
    externalId: '300',
    name: '2025 Fall-Winter',
    startAt: null,
    endAt: '2026-04-30T00:00:00Z',
  },
];

function stubApi(
  past: PastTermGrades | null,
  terms: EnrollmentTerm[] = TERMS
): { getEnrollmentTerms: jest.Mock; getPastTermGrades: jest.Mock } {
  const api = {
    getEnrollmentTerms: jest.fn().mockResolvedValue(terms),
    getPastTermGrades: jest.fn().mockResolvedValue(past),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
  return api;
}

function clearApi(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
}

function renderModal(summaries: CourseSummary[], averageGrade: number | null) {
  return render(
    <MemoryRouter>
      <GradeBreakdownModal
        isOpen
        onClose={jest.fn()}
        courseSummaries={summaries}
        averageGrade={averageGrade}
      />
    </MemoryRouter>
  );
}

describe('GradeBreakdownModal', () => {
  afterEach(() => {
    clearApi();
    jest.clearAllMocks();
  });

  it('renders the current-average banner', async () => {
    const api = stubApi(null);
    renderModal([makeSummary({ id: 1 }, 78)], 84);

    expect(screen.getByText('Current average')).toBeInTheDocument();
    expect(screen.getByText('84.0%')).toBeInTheDocument();
    // Let the open-effect's fetch settle so its state update happens inside act.
    await waitFor(() => expect(api.getPastTermGrades).toHaveBeenCalled());
  });

  it('groups current courses by term and marks them ongoing', async () => {
    stubApi(null);
    renderModal(
      [
        makeSummary({ id: 1, code: 'ECE311', enrollmentTermId: 200 }, 78),
        makeSummary({ id: 2, code: 'ECE496', enrollmentTermId: 300 }, 86),
      ],
      82
    );

    // Wait for terms to load so names resolve.
    await waitFor(() => {
      expect(screen.getByText('2026 Winter')).toBeInTheDocument();
    });
    expect(screen.getByText('2025 Fall-Winter')).toBeInTheDocument();
    // Both current groups carry the "ongoing" badge.
    expect(screen.getAllByText('● ongoing')).toHaveLength(2);
  });

  it('shows the task-derived effectiveAssessedGrade (not current_grade)', async () => {
    stubApi(null);
    // current_grade is null on the course; the displayed grade must come from
    // effectiveAssessedGrade (78).
    renderModal([makeSummary({ id: 1, currentGrade: null }, 78)], 78);

    await waitFor(() => {
      expect(screen.getByText('2026 Winter')).toBeInTheDocument();
    });
    // 78 appears as the per-term avg and the course pill.
    expect(screen.getAllByText('78.0%').length).toBeGreaterThanOrEqual(1);
  });

  it('hides the Past terms section when there are none', async () => {
    stubApi({ terms: [], cumulative: null, courseCount: 0 });
    renderModal([makeSummary({ id: 1 }, 78)], 78);

    await waitFor(() => {
      expect(screen.getByText('2026 Winter')).toBeInTheDocument();
    });
    expect(screen.queryByText('Past terms')).not.toBeInTheDocument();
  });

  it('renders the Past terms section + cumulative when present', async () => {
    const past: PastTermGrades = {
      terms: [
        {
          termName: '2025 Fall',
          termEndAt: '2025-12-15T00:00:00Z',
          courses: [
            {
              code: 'ECE454',
              name: 'Systems',
              color: '#34d399',
              grade: 83,
              credits: 0.5,
            },
          ],
          termAverage: 83,
        },
      ],
      cumulative: 82,
      courseCount: 21,
    };
    stubApi(past);
    renderModal([makeSummary({ id: 1 }, 78)], 84);

    await waitFor(() => {
      expect(screen.getByText('Past terms')).toBeInTheDocument();
    });
    expect(screen.getByText('2025 Fall')).toBeInTheDocument();
    // Cumulative value + count appear in the past header.
    expect(screen.getByText('82.0%')).toBeInTheDocument();
    expect(screen.getByText(/21 courses/)).toBeInTheDocument();
  });

  it('collapses and expands a past-term group on header click', async () => {
    const past: PastTermGrades = {
      terms: [
        {
          termName: '2025 Fall',
          termEndAt: '2025-12-15T00:00:00Z',
          courses: [
            {
              code: 'ECE454',
              name: 'Systems',
              color: '#34d399',
              grade: 83,
              credits: 0.5,
            },
          ],
          termAverage: 83,
        },
      ],
      cumulative: 83,
      courseCount: 1,
    };
    stubApi(past);
    renderModal([makeSummary({ id: 1 }, 78)], 84);

    const header = await screen.findByText('2025 Fall');
    // Past groups default collapsed → course row hidden.
    expect(screen.queryByText('ECE454')).not.toBeInTheDocument();

    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.getByText('ECE454')).toBeInTheDocument();
    });

    fireEvent.click(header);
    await waitFor(() => {
      expect(screen.queryByText('ECE454')).not.toBeInTheDocument();
    });
  });

  it('renders nothing when isOpen is false', () => {
    stubApi(null);
    const { container } = render(
      <MemoryRouter>
        <GradeBreakdownModal
          isOpen={false}
          onClose={jest.fn()}
          courseSummaries={[makeSummary({ id: 1 }, 78)]}
          averageGrade={78}
        />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
