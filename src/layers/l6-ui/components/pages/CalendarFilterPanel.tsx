/**
 * CalendarFilterPanel Component
 * Filter controls for the calendar page
 */

import React from 'react';
import { X } from 'lucide-react';
import type { Course } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { styles } from './CalendarPage.styles';
import type { DeadlineFilter, PriorityFilter } from './CalendarPageUtils';

export interface CalendarFilterPanelProps {
  courses: Course[];
  availableTypes: string[];
  selectedCourses: Set<number>;
  typeFilter: string;
  deadlineFilter: DeadlineFilter;
  priorityFilter: PriorityFilter;
  hasActiveFilters: boolean;
  onToggleCourse: (courseId: number) => void;
  onTypeFilterChange: (type: string) => void;
  onDeadlineFilterChange: (filter: DeadlineFilter) => void;
  onPriorityFilterChange: (filter: PriorityFilter) => void;
  onClearFilters: () => void;
}

export function CalendarFilterPanel({
  courses,
  availableTypes,
  selectedCourses,
  typeFilter,
  deadlineFilter,
  priorityFilter,
  hasActiveFilters,
  onToggleCourse,
  onTypeFilterChange,
  onDeadlineFilterChange,
  onPriorityFilterChange,
  onClearFilters,
}: CalendarFilterPanelProps) {
  return (
    <div style={styles.filterPanel}>
      {/* Course Filter */}
      <div style={styles.filterGroup}>
        <label style={styles.filterLabel}>Courses</label>
        <div style={styles.filterChips}>
          {courses.map((course) => (
            <button
              key={course.id}
              style={{
                ...styles.filterChip,
                backgroundColor: selectedCourses.has(course.id)
                  ? getCourseColor(course.id, course.color)
                  : 'var(--bg-app)',
                color: selectedCourses.has(course.id)
                  ? 'white'
                  : 'var(--text-secondary)',
                borderColor: selectedCourses.has(course.id)
                  ? getCourseColor(course.id, course.color)
                  : 'var(--border-default)',
              }}
              onClick={() => onToggleCourse(course.id)}
            >
              {course.code.split(/[A-Z]\d(?:\s|$)/i)[0] || course.code.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Type Filter */}
      {availableTypes.length > 0 && (
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Type</label>
          <div style={styles.filterChips}>
            <button
              style={{
                ...styles.filterChip,
                backgroundColor:
                  typeFilter === 'all' ? 'var(--color-navy)' : 'var(--bg-app)',
                color: typeFilter === 'all' ? 'white' : 'var(--text-secondary)',
                borderColor:
                  typeFilter === 'all'
                    ? 'var(--color-navy)'
                    : 'var(--border-default)',
              }}
              onClick={() => onTypeFilterChange('all')}
            >
              All
            </button>
            {availableTypes.map((type) => (
              <button
                key={type}
                style={{
                  ...styles.filterChip,
                  backgroundColor:
                    typeFilter === type ? 'var(--color-navy)' : 'var(--bg-app)',
                  color: typeFilter === type ? 'white' : 'var(--text-secondary)',
                  borderColor:
                    typeFilter === type
                      ? 'var(--color-navy)'
                      : 'var(--border-default)',
                }}
                onClick={() => onTypeFilterChange(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Deadline Filter */}
      <div style={styles.filterGroup}>
        <label style={styles.filterLabel}>Deadline</label>
        <div style={styles.filterChips}>
          {(
            ['all', 'overdue', 'today', 'this-week', 'upcoming'] as DeadlineFilter[]
          ).map((filter) => (
            <button
              key={filter}
              style={{
                ...styles.filterChip,
                backgroundColor:
                  deadlineFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                color: deadlineFilter === filter ? 'white' : 'var(--text-secondary)',
                borderColor:
                  deadlineFilter === filter
                    ? 'var(--color-navy)'
                    : 'var(--border-default)',
              }}
              onClick={() => onDeadlineFilterChange(filter)}
            >
              {filter === 'all'
                ? 'All'
                : filter === 'this-week'
                  ? 'This Week'
                  : filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Priority Filter */}
      <div style={styles.filterGroup}>
        <label style={styles.filterLabel}>Priority</label>
        <div style={styles.filterChips}>
          {(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map((filter) => (
            <button
              key={filter}
              style={{
                ...styles.filterChip,
                backgroundColor:
                  priorityFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                color: priorityFilter === filter ? 'white' : 'var(--text-secondary)',
                borderColor:
                  priorityFilter === filter
                    ? 'var(--color-navy)'
                    : 'var(--border-default)',
              }}
              onClick={() => onPriorityFilterChange(filter)}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <button style={styles.clearFiltersBtn} onClick={onClearFilters}>
          <X size={14} />
          Clear All
        </button>
      )}
    </div>
  );
}

export default CalendarFilterPanel;
