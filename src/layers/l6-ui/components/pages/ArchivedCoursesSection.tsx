/**
 * ArchivedCoursesSection Component
 * Expandable section showing archived courses with restore functionality
 */

import React from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Course } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { styles } from './coursesPageStyles';
import { getShortCode } from './coursesPageUtils';

export interface ArchivedCoursesSectionProps {
  archivedCourses: Course[];
  showArchived: boolean;
  loadingArchived: boolean;
  onToggleShow: () => void;
  onUnarchive: (courseId: number) => Promise<void>;
}

export function ArchivedCoursesSection({
  archivedCourses,
  showArchived,
  loadingArchived,
  onToggleShow,
  onUnarchive,
}: ArchivedCoursesSectionProps) {
  const navigate = useNavigate();

  return (
    <div style={styles.archivedSection}>
      <button style={styles.archivedHeader} onClick={onToggleShow}>
        <div style={styles.archivedHeaderLeft}>
          <Archive size={18} color="var(--text-muted)" />
          <span style={styles.archivedTitle}>Archived Courses</span>
          {archivedCourses.length > 0 && (
            <span style={styles.archivedCount}>{archivedCourses.length}</span>
          )}
        </div>
        {showArchived ? (
          <ChevronUp size={18} color="var(--text-muted)" />
        ) : (
          <ChevronDown size={18} color="var(--text-muted)" />
        )}
      </button>

      {showArchived && (
        <div style={styles.archivedContent}>
          {loadingArchived ? (
            <div style={styles.archivedLoading}>Loading archived courses...</div>
          ) : archivedCourses.length === 0 ? (
            <div style={styles.archivedEmpty}>
              <Archive size={32} color="var(--text-muted)" />
              <p>No archived courses</p>
            </div>
          ) : (
            <div style={styles.archivedList}>
              {archivedCourses.map((course) => {
                const isAutoArchived = course.archiveSource === 'auto';
                return (
                  <div key={course.id} style={styles.archivedItem}>
                    <div
                      style={{
                        ...styles.archivedColorBar,
                        backgroundColor: getCourseColor(course.id, course.color),
                      }}
                    />
                    <div
                      style={styles.archivedInfoClickable}
                      onClick={() => navigate(`/course/${course.id}`)}
                      title="View course details"
                    >
                      <span style={styles.archivedCode}>{getShortCode(course.code)}</span>
                      <span style={styles.archivedName}>{course.name}</span>
                      {isAutoArchived && (
                        <span style={styles.autoArchivedBadge}>Term ended</span>
                      )}
                    </div>
                    <button
                      style={{
                        ...styles.unarchiveButton,
                        ...(isAutoArchived ? styles.unarchiveButtonDisabled : {}),
                      }}
                      onClick={() => !isAutoArchived && onUnarchive(course.id)}
                      title={
                        isAutoArchived
                          ? 'Cannot restore - term has ended'
                          : 'Restore this course'
                      }
                      disabled={isAutoArchived}
                    >
                      <ArchiveRestore size={16} />
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ArchivedCoursesSection;
