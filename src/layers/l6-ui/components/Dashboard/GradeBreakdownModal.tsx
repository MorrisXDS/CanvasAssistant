/**
 * GradeBreakdownModal — term-grouped grade breakdown (ADR-0015).
 *
 * Two sections inside the shared `<Modal>` primitive:
 *  - **Current** — ongoing (non-archived) courses, grouped by enrollment term
 *    (each term its own collapsible group, marked "ongoing"). Overlap-safe: two
 *    concurrently-running terms (e.g. a full-year course + a single-semester
 *    course) stay separate groups. Grades are the task-derived
 *    `summary.effectiveAssessedGrade` already computed upstream.
 *  - **Past terms** — archived courses grouped by term (newest first,
 *    collapsible, per-term credit-weighted average) plus a credit-weighted
 *    **cumulative** across all past-term courses. Fetched MODAL-SCOPED via
 *    `window.api.getPastTermGrades()` and held in LOCAL component state — it is
 *    NEVER merged into the global Zustand store (ADR-0015 store-isolation
 *    constraint; archived tasks stay main-side).
 *
 * Clicking a Current course navigates to its detail page. Past-term rows are
 * display-only (the course is archived).
 *
 * z-index: default 1000 — opened from the dashboard, not nested above another
 * modal in current flows.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ChevronRight } from 'lucide-react';
import type { CourseSummary } from '../../../l5-presentation/types';
import type { EnrollmentTerm, PastTermGrades } from '../../../../shared/ipc-contract';
import { formatGrade } from '../../constants';
import { Modal } from '../primitives/Modal';
import {
  groupCoursesByTerm,
  type CourseWithGrade,
} from '../../../../shared/grades/termGrouping';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('GradeBreakdownModal');

export interface GradeBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseSummaries: CourseSummary[];
  averageGrade: number | null;
}

/** A renderable term group with the extra UI flags the modal needs. */
interface RenderTermGroup {
  key: string;
  termName: string;
  ongoing: boolean;
  termAverage: number | null;
  courses: Array<{
    id: number | null;
    code: string;
    name: string;
    color: string | null;
    grade: number | null;
  }>;
}

export function GradeBreakdownModal({
  isOpen,
  onClose,
  courseSummaries,
  averageGrade,
}: GradeBreakdownModalProps) {
  const navigate = useNavigate();

  // Modal-scoped fetched data — LOCAL state only (never the store).
  const [pastTerms, setPastTerms] = useState<PastTermGrades | null>(null);
  const [terms, setTerms] = useState<EnrollmentTerm[]>([]);
  // Which term groups are expanded (key → open). Current groups default open;
  // past-term groups default collapsed (newest stays the natural focus).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Fetch enrollment terms (for Current-section term names) + past-term grades
  // when the modal opens. Both stay in component-local state.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    void (async () => {
      try {
        const [termList, past] = await Promise.all([
          window.api?.getEnrollmentTerms?.() ?? Promise.resolve([]),
          window.api?.getPastTermGrades?.() ?? Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (termList) setTerms(termList as EnrollmentTerm[]);
        if (past) setPastTerms(past as PastTermGrades);
      } catch (error) {
        if (!cancelled) {
          logger.error(
            'Failed to load grade history',
            error instanceof Error ? error : undefined
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Map Canvas term id (= enrollment_terms.external_id) → { name, endAt }.
  const termById = useMemo(() => {
    const map = new Map<number, { name: string; endAt: string | null }>();
    for (const t of terms) {
      const canvasId = Number(t.externalId);
      if (!Number.isNaN(canvasId)) {
        map.set(canvasId, { name: t.name, endAt: t.endAt });
      }
    }
    return map;
  }, [terms]);

  // Build the Current section: group ongoing courses by term.
  const currentGroups: RenderTermGroup[] = useMemo(() => {
    const courses: Array<CourseWithGrade & { id: number }> = courseSummaries.map(
      (summary) => {
        const termInfo =
          summary.course.enrollmentTermId !== null
            ? termById.get(summary.course.enrollmentTermId)
            : undefined;
        return {
          id: summary.course.id,
          code: summary.course.code,
          name: summary.course.nickname || summary.course.name,
          color: summary.course.color,
          grade: summary.effectiveAssessedGrade,
          credits: summary.course.credits,
          termName: termInfo?.name ?? null,
          termEndAt: termInfo?.endAt ?? null,
        };
      }
    );

    // groupCoursesByTerm preserves the original course objects inside each group,
    // so the attached `id` survives.
    return groupCoursesByTerm(courses).map((group) => ({
      key: `current:${group.termName ?? '__none__'}`,
      termName: group.termName ?? 'Current courses',
      ongoing: true,
      termAverage: group.termAverage,
      courses: group.courses.map((c) => ({
        id: (c as CourseWithGrade & { id?: number }).id ?? null,
        code: c.code,
        name: c.name,
        color: c.color,
        grade: c.grade,
      })),
    }));
  }, [courseSummaries, termById]);

  // Build the Past-terms section from the modal-scoped IPC response.
  const pastGroups: RenderTermGroup[] = useMemo(() => {
    if (!pastTerms) return [];
    return pastTerms.terms.map((term) => ({
      key: `past:${term.termName}:${term.termEndAt ?? ''}`,
      termName: term.termName,
      ongoing: false,
      termAverage: term.termAverage,
      courses: term.courses.map((c) => ({
        id: null,
        code: c.code,
        name: c.name,
        color: c.color,
        grade: c.grade,
      })),
    }));
  }, [pastTerms]);

  if (!isOpen) return null;

  const isOpenGroup = (group: RenderTermGroup): boolean =>
    openGroups[group.key] ?? group.ongoing; // current open by default, past closed

  const toggleGroup = (key: string, defaultOpen: boolean) => {
    setOpenGroups((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? defaultOpen),
    }));
  };

  const handleCourseClick = (courseId: number | null) => {
    if (courseId === null) return; // archived past-term rows are display-only
    onClose();
    navigate(`/course/${courseId}`);
  };

  const totalCurrent = currentGroups.reduce((n, g) => n + g.courses.length, 0);
  const ongoingTermCount = currentGroups.length;

  const renderGroup = (group: RenderTermGroup) => {
    const open = isOpenGroup(group);
    return (
      <div key={group.key} style={styles.term}>
        <button
          type="button"
          style={styles.termHeader}
          onClick={() => toggleGroup(group.key, group.ongoing)}
          aria-expanded={open}
        >
          <ChevronRight
            size={14}
            style={{
              ...styles.caret,
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
            color="var(--text-muted)"
          />
          <span style={styles.termName}>{group.termName}</span>
          {group.ongoing && <span style={styles.ongoingBadge}>● ongoing</span>}
          <span style={styles.termAvg}>
            {group.termAverage !== null ? formatGrade(group.termAverage) : '—'}
          </span>
          <span style={styles.termCount}>{group.courses.length}</span>
        </button>

        {open && (
          <div>
            {group.courses.map((course, i) => {
              const clickable = course.id !== null;
              return (
                <div
                  key={`${group.key}:${course.code}:${i}`}
                  style={{
                    ...styles.courseRow,
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  onClick={() => handleCourseClick(course.id)}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleCourseClick(course.id);
                    }
                  }}
                >
                  <div
                    style={{
                      ...styles.colorDot,
                      backgroundColor: course.color || 'var(--color-navy)',
                    }}
                  />
                  <div style={styles.courseInfo}>
                    <div style={styles.courseCode}>{course.code}</div>
                    <div style={styles.courseName}>{course.name}</div>
                  </div>
                  <div style={styles.gradePill}>
                    {course.grade !== null ? formatGrade(course.grade) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const hasPast = pastGroups.length > 0;

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <Modal.Header
        title="Grade Breakdown"
        icon={<BarChart3 size={20} color="var(--color-blue)" />}
        onClose={onClose}
      />

      <Modal.Content padded={false} maxHeight="70vh">
        {/* Current average banner */}
        <div style={styles.averageSummary}>
          <div style={styles.averageLabel}>Current average</div>
          <div style={styles.averageValue}>
            {averageGrade !== null ? formatGrade(averageGrade) : 'N/A'}
          </div>
          <div style={styles.averageSubtext}>
            {totalCurrent} active {totalCurrent === 1 ? 'course' : 'courses'}
            {ongoingTermCount > 1 ? ` across ${ongoingTermCount} ongoing terms` : ''}
          </div>
        </div>

        {/* Current */}
        {currentGroups.length === 0 ? (
          <div style={styles.emptyState}>
            <span>No course grades available</span>
          </div>
        ) : (
          <>
            <div style={styles.sectionLabel}>Current</div>
            {currentGroups.map(renderGroup)}
          </>
        )}

        {/* Past terms (hidden entirely when there are none) */}
        {hasPast && (
          <div style={styles.pastSection}>
            <div style={styles.pastHeader}>
              <span style={styles.pastTitle}>Past terms</span>
              <span style={styles.pastCumulative}>
                Cumulative ·{' '}
                <b style={styles.cumulativeValue}>
                  {pastTerms?.cumulative != null
                    ? formatGrade(pastTerms.cumulative)
                    : '—'}
                </b>{' '}
                · {pastTerms?.courseCount ?? 0}{' '}
                {(pastTerms?.courseCount ?? 0) === 1 ? 'course' : 'courses'}
              </span>
            </div>
            {pastGroups.map(renderGroup)}
          </div>
        )}
      </Modal.Content>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  averageSummary: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-5)',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-light)',
  },
  averageLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 'var(--space-1)',
  },
  averageValue: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  averageSubtext: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-1)',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },
  sectionLabel: {
    padding: 'var(--space-3) var(--space-5) var(--space-1)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  term: {
    borderBottom: '1px solid var(--border-light)',
  },
  termHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3) var(--space-5)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  caret: {
    flexShrink: 0,
    transition: 'transform var(--transition-fast)',
  },
  termName: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },
  ongoingBadge: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-success)',
    backgroundColor: 'var(--color-success-bg)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-sm)',
    marginRight: 'var(--space-2)',
  },
  termAvg: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },
  termCount: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    minWidth: '18px',
    textAlign: 'right',
  },
  courseRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-5) var(--space-3) var(--space-8)',
    borderTop: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-app)',
  },
  colorDot: {
    width: '10px',
    height: '10px',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  courseInfo: {
    flex: 1,
    minWidth: 0,
  },
  courseCode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-navy)',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },
  courseName: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  gradePill: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    flexShrink: 0,
  },
  pastSection: {
    borderTop: '2px solid var(--border-default)',
  },
  pastHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-4) var(--space-5) var(--space-2)',
  },
  pastTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },
  pastCumulative: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },
  cumulativeValue: {
    color: 'var(--text-primary)',
  },
};

export default GradeBreakdownModal;
