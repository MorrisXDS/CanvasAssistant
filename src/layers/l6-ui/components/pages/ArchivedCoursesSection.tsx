/**
 * ArchivedCoursesSection — archived courses grouped by enrollment term
 * (ADR-0015).
 *
 * The drawer now renders collapsible per-term subgroups (newest first; header =
 * term name + per-term credit-weighted average + course count). Each subgroup
 * expands to the existing archived rows (color bar, code, name, Restore). The
 * Active grid on the Courses page is unchanged.
 *
 * Term names / end dates come from `enrollmentTerms` (a course stores its Canvas
 * term id in `enrollmentTermId`, which equals an enrollment term's
 * `externalId`). Per-term averages come from `pastTermGrades` (computed
 * main-side, matched by term name) — archived course grades are not in the
 * global store, so the section relies on the same main-side authority the grade
 * modal uses. All inputs are page-local props (never the global store).
 */

import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Course } from '../../../l5-presentation/types';
import type { EnrollmentTerm, PastTermGrades } from '../../../../shared/ipc-contract';
import { getCourseColor, formatGrade } from '../../constants';
import { styles } from './coursesPageStyles';
import { getShortCode } from './coursesPageUtils';

export interface ArchivedCoursesSectionProps {
  archivedCourses: Course[];
  showArchived: boolean;
  loadingArchived: boolean;
  onToggleShow: () => void;
  onUnarchive: (courseId: number) => Promise<void>;
  /** Enrollment terms, used to resolve each archived course's term name / order. */
  enrollmentTerms?: EnrollmentTerm[];
  /** Main-side per-term averages (matched by term name). Optional. */
  pastTermGrades?: PastTermGrades | null;
}

interface ArchivedTermGroup {
  key: string;
  termName: string;
  termEndAt: string | null;
  termAverage: number | null;
  courses: Course[];
}

const NO_TERM_KEY = '__no_term__';

export function ArchivedCoursesSection({
  archivedCourses,
  showArchived,
  loadingArchived,
  onToggleShow,
  onUnarchive,
  enrollmentTerms = [],
  pastTermGrades = null,
}: ArchivedCoursesSectionProps) {
  const navigate = useNavigate();
  // Which term subgroups are expanded (key → open). Newest term defaults open.
  const [openTerms, setOpenTerms] = useState<Record<string, boolean>>({});

  // Canvas term id (= externalId) → { name, endAt }.
  const termById = useMemo(() => {
    const map = new Map<number, { name: string; endAt: string | null }>();
    for (const t of enrollmentTerms) {
      const canvasId = Number(t.externalId);
      if (!Number.isNaN(canvasId)) {
        map.set(canvasId, { name: t.name, endAt: t.endAt });
      }
    }
    return map;
  }, [enrollmentTerms]);

  // Per-term average by term name (from the main-side authority).
  const avgByTermName = useMemo(() => {
    const map = new Map<string, number | null>();
    if (pastTermGrades) {
      for (const term of pastTermGrades.terms) {
        map.set(term.termName, term.termAverage);
      }
    }
    return map;
  }, [pastTermGrades]);

  // Group archived courses by term, newest term first (NULLS LAST).
  const termGroups: ArchivedTermGroup[] = useMemo(() => {
    const groups = new Map<string, ArchivedTermGroup>();
    for (const course of archivedCourses) {
      const termInfo =
        course.enrollmentTermId !== null
          ? termById.get(course.enrollmentTermId)
          : undefined;
      const termName = termInfo?.name ?? null;
      const key = termName ?? NO_TERM_KEY;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          // No-term bucket label — must match PastTermGradesReader.ts (the
          // canonical main-side source) so the drawer and reader never diverge.
          termName: termName ?? 'Unknown term',
          termEndAt: termInfo?.endAt ?? null,
          termAverage: termName !== null ? (avgByTermName.get(termName) ?? null) : null,
          courses: [],
        };
        groups.set(key, group);
      }
      group.courses.push(course);
    }

    const result = Array.from(groups.values());
    result.sort((a, b) => {
      if (a.termEndAt === null && b.termEndAt === null) {
        return a.termName.localeCompare(b.termName);
      }
      if (a.termEndAt === null) return 1;
      if (b.termEndAt === null) return -1;
      if (a.termEndAt > b.termEndAt) return -1;
      if (a.termEndAt < b.termEndAt) return 1;
      return a.termName.localeCompare(b.termName);
    });
    return result;
  }, [archivedCourses, termById, avgByTermName]);

  const isTermOpen = (group: ArchivedTermGroup, index: number): boolean =>
    openTerms[group.key] ?? index === 0; // newest term open by default

  const toggleTerm = (key: string, defaultOpen: boolean) => {
    setOpenTerms((prev) => ({ ...prev, [key]: !(prev[key] ?? defaultOpen) }));
  };

  const renderRow = (course: Course) => {
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
          {isAutoArchived && <span style={styles.autoArchivedBadge}>Term ended</span>}
        </div>
        <button
          style={{
            ...styles.unarchiveButton,
            ...(isAutoArchived ? styles.unarchiveButtonDisabled : {}),
          }}
          onClick={() => !isAutoArchived && onUnarchive(course.id)}
          title={
            isAutoArchived ? 'Cannot restore - term has ended' : 'Restore this course'
          }
          disabled={isAutoArchived}
        >
          <ArchiveRestore size={16} />
          Restore
        </button>
      </div>
    );
  };

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
              {termGroups.map((group, index) => {
                const open = isTermOpen(group, index);
                return (
                  <div key={group.key} style={styles.archivedTermGroup}>
                    <button
                      type="button"
                      style={styles.archivedTermHeader}
                      onClick={() => toggleTerm(group.key, index === 0)}
                      aria-expanded={open}
                    >
                      <ChevronRight
                        size={14}
                        style={{
                          ...styles.archivedTermCaret,
                          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}
                        color="var(--text-muted)"
                      />
                      <span style={styles.archivedTermName}>{group.termName}</span>
                      {group.termAverage !== null && (
                        <span style={styles.archivedTermAvg}>
                          avg {formatGrade(group.termAverage)}
                        </span>
                      )}
                      <span style={styles.archivedTermCount}>{group.courses.length}</span>
                    </button>
                    {open && <div>{group.courses.map(renderRow)}</div>}
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
