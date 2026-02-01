/**
 * Calendar Filter Panel
 * Filter panel for calendar events by course, deadline, and priority
 */

import React from 'react';
import { CheckSquare, Square, X } from 'lucide-react';
import { getCourseColor } from '../../constants';
import { calendarPageStyles as styles } from './calendarPageStyles';

// Filter types
export type DeadlineFilter = 'all' | 'overdue' | 'today' | 'this-week' | 'this-month';
export type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

export interface CalendarFilterPanelProps {
  courses: Array<{ id: number; code: string; color?: string | null }>;
  selectedCourses: Set<number> | null; // null = all selected
  deadlineFilter: DeadlineFilter;
  priorityFilter: PriorityFilter;
  onCourseToggle: (courseId: number) => void;
  onSelectAllCourses: () => void;
  onDeselectAllCourses: () => void;
  onDeadlineFilterChange: (filter: DeadlineFilter) => void;
  onPriorityFilterChange: (filter: PriorityFilter) => void;
  onClearFilters: () => void;
}

export function CalendarFilterPanel({
  courses,
  selectedCourses,
  deadlineFilter,
  priorityFilter,
  onCourseToggle,
  onSelectAllCourses,
  onDeselectAllCourses,
  onDeadlineFilterChange,
  onPriorityFilterChange,
  onClearFilters,
}: CalendarFilterPanelProps) {
  const hasActiveFilters =
    selectedCourses !== null || deadlineFilter !== 'all' || priorityFilter !== 'all';

  const isCourseSelected = (courseId: number) => {
    return selectedCourses === null || selectedCourses.has(courseId);
  };

  return (
    <div style={styles.filterPanel}>
      {/* Course Filter */}
      <div style={styles.filterSection}>
        <div style={styles.filterSectionHeader}>
          <span style={styles.filterSectionTitle}>Courses</span>
          <div style={styles.filterActions}>
            <button style={styles.filterAction} onClick={onSelectAllCourses}>
              All
            </button>
            <span style={styles.filterActionDivider}>|</span>
            <button style={styles.filterAction} onClick={onDeselectAllCourses}>
              None
            </button>
          </div>
        </div>
        <div style={styles.courseFilterList}>
          {courses.map((course) => {
            const color = getCourseColor(course.id, course.color);
            const selected = isCourseSelected(course.id);
            return (
              <button
                key={course.id}
                style={{
                  ...styles.courseFilterItem,
                  opacity: selected ? 1 : 0.5,
                  borderColor: selected ? color : 'transparent',
                }}
                onClick={() => onCourseToggle(course.id)}
              >
                {selected ? (
                  <CheckSquare size={14} color={color} />
                ) : (
                  <Square size={14} color="var(--text-muted)" />
                )}
                <span
                  style={{
                    ...styles.courseFilterBadge,
                    backgroundColor: color,
                  }}
                >
                  {course.code.split(/[HY]\d|\s/)[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Deadline Filter */}
      <div style={styles.filterSection}>
        <span style={styles.filterSectionTitle}>Deadline</span>
        <div style={styles.filterChips}>
          {[
            { value: 'all', label: 'All' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'today', label: 'Today' },
            { value: 'this-week', label: 'This Week' },
            { value: 'this-month', label: 'This Month' },
          ].map((opt) => (
            <button
              key={opt.value}
              style={{
                ...styles.filterChip,
                backgroundColor:
                  deadlineFilter === opt.value ? 'var(--color-navy)' : 'var(--bg-app)',
                color: deadlineFilter === opt.value ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => onDeadlineFilterChange(opt.value as DeadlineFilter)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Priority Filter */}
      <div style={styles.filterSection}>
        <span style={styles.filterSectionTitle}>Priority</span>
        <div style={styles.filterChips}>
          {[
            { value: 'all', label: 'All' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ].map((opt) => (
            <button
              key={opt.value}
              style={{
                ...styles.filterChip,
                backgroundColor:
                  priorityFilter === opt.value ? 'var(--color-navy)' : 'var(--bg-app)',
                color: priorityFilter === opt.value ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => onPriorityFilterChange(opt.value as PriorityFilter)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button style={styles.clearFilters} onClick={onClearFilters}>
          <X size={14} />
          Clear all filters
        </button>
      )}
    </div>
  );
}
