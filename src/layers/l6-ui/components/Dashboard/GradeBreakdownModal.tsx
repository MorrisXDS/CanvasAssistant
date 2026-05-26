/**
 * GradeBreakdownModal — displays a modal showing grade breakdown by course.
 *
 * Clicking a course navigates to the course detail page.
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned — `Modal.Header` with icon + title, then an
 * "average summary" banner sub-section followed by the course list inside
 * `Modal.Content`. No footer; rows are clickable.
 *
 * Dismiss: standard Esc / backdrop click handled by the primitive — we
 * dropped the local Esc handler that used to do this.
 *
 * z-index: default 1000 — opened from the dashboard, not nested above any
 * other modal in current flows.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import type { CourseSummary } from '../../../l5-presentation/types';
import { formatGrade } from '../../constants';
import { Modal } from '../primitives/Modal';

export interface GradeBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseSummaries: CourseSummary[];
  averageGrade: number | null;
}

export function GradeBreakdownModal({
  isOpen,
  onClose,
  courseSummaries,
  averageGrade,
}: GradeBreakdownModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleCourseClick = (courseId: number) => {
    onClose();
    navigate(`/course/${courseId}`);
  };

  // Sort by grade descending (null grades at bottom)
  const sortedCourses = [...courseSummaries].sort((a, b) => {
    if (a.effectiveAssessedGrade === null && b.effectiveAssessedGrade === null) return 0;
    if (a.effectiveAssessedGrade === null) return 1;
    if (b.effectiveAssessedGrade === null) return -1;
    return b.effectiveAssessedGrade - a.effectiveAssessedGrade;
  });

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <Modal.Header
        title="Grade Breakdown"
        icon={<BarChart3 size={20} color="var(--color-blue)" />}
        onClose={onClose}
      />

      <Modal.Content padded={false} maxHeight="70vh">
        {/* Average Summary */}
        <div style={styles.averageSummary}>
          <div style={styles.averageLabel}>Overall Average</div>
          <div style={styles.averageValue}>
            {averageGrade !== null ? formatGrade(averageGrade) : 'N/A'}
          </div>
          <div style={styles.averageSubtext}>Across {sortedCourses.length} courses</div>
        </div>

        {/* Course list */}
        {sortedCourses.length === 0 ? (
          <div style={styles.emptyState}>
            <span>No course grades available</span>
          </div>
        ) : (
          <div style={styles.courseList}>
            {sortedCourses.map((summary, index) => {
              const grade = summary.effectiveAssessedGrade;
              const target = summary.course.targetGrade;
              const diff = grade !== null ? grade - target : null;
              const status = diff !== null ? (diff >= 0 ? 'above' : 'below') : 'none';

              return (
                <div
                  key={summary.course.id}
                  style={{
                    ...styles.courseItem,
                    borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  }}
                  onClick={() => handleCourseClick(summary.course.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCourseClick(summary.course.id);
                    }
                  }}
                >
                  {/* Course color indicator */}
                  <div
                    style={{
                      ...styles.colorBar,
                      backgroundColor: summary.course.color || 'var(--color-navy)',
                    }}
                  />

                  {/* Course info */}
                  <div style={styles.courseInfo}>
                    <div style={styles.courseCode}>{summary.course.code}</div>
                    <div style={styles.courseName}>
                      {summary.course.nickname || summary.course.name}
                    </div>
                    <div style={styles.courseMeta}>
                      <span>
                        {summary.completedCount}/{summary.taskCount} tasks completed
                      </span>
                    </div>
                  </div>

                  {/* Grade */}
                  <div style={styles.gradeSection}>
                    <div style={styles.gradeValue}>
                      {grade !== null ? formatGrade(grade) : '—'}
                    </div>
                    {diff !== null && (
                      <div
                        style={{
                          ...styles.gradeDiff,
                          color:
                            status === 'above'
                              ? 'var(--color-success)'
                              : status === 'below'
                                ? 'var(--color-error)'
                                : 'var(--text-muted)',
                        }}
                      >
                        {status === 'above' && <TrendingUp size={12} />}
                        {status === 'below' && <TrendingDown size={12} />}
                        {status === 'none' && <Minus size={12} />}
                        <span>
                          {status === 'above' && '+'}
                          {formatGrade(diff)}
                        </span>
                      </div>
                    )}
                    <div style={styles.targetLabel}>Target: {target}%</div>
                  </div>

                  {/* Go to course indicator */}
                  <div style={styles.goIcon}>
                    <ExternalLink size={16} color="var(--text-muted)" />
                  </div>
                </div>
              );
            })}
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

  courseList: {
    display: 'flex',
    flexDirection: 'column',
  },

  courseItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-4) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  colorBar: {
    width: '4px',
    height: '48px',
    borderRadius: '2px',
    marginRight: 'var(--space-3)',
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
    marginBottom: '2px',
  },

  courseName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  courseMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  gradeSection: {
    textAlign: 'right',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  gradeValue: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },

  gradeDiff: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '2px',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    marginTop: '2px',
  },

  targetLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  goIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
};

export default GradeBreakdownModal;
