/**
 * CoursesFilterPanel Component
 * Filter controls for the courses page
 */

import React from 'react';
import { X, EyeOff } from 'lucide-react';
import { styles } from './coursesPageStyles';
import type { GradeFilter } from './coursesPageUtils';

export interface CoursesFilterPanelProps {
  availablePrefixes: string[];
  availableTypes: string[];
  prefixFilter: string;
  typeFilter: string;
  gradeFilter: GradeFilter;
  showHidden: boolean;
  hiddenCount: number;
  hasActiveFilters: boolean;
  onPrefixFilterChange: (prefix: string) => void;
  onTypeFilterChange: (type: string) => void;
  onGradeFilterChange: (filter: GradeFilter) => void;
  onShowHiddenChange: (show: boolean) => void;
  onClearFilters: () => void;
  /** Which section has keyboard focus (null when keyboard isn't driving) */
  keyboardSection?: 'prefix' | 'type' | 'grade' | 'show-hidden' | 'clear' | null;
  /** Index of the focused option within the active section */
  keyboardIndex?: number;
}

export function CoursesFilterPanel({
  availablePrefixes,
  availableTypes,
  prefixFilter,
  typeFilter,
  gradeFilter,
  showHidden,
  hiddenCount,
  hasActiveFilters,
  onPrefixFilterChange,
  onTypeFilterChange,
  onGradeFilterChange,
  onShowHiddenChange,
  onClearFilters,
  keyboardSection = null,
  keyboardIndex = 0,
}: CoursesFilterPanelProps) {
  const focusOutline = {
    outline: '2px solid var(--color-navy)',
    outlineOffset: '2px',
    borderRadius: 'var(--radius-sm)',
  } as const;
  return (
    <div style={styles.filterPanel}>
      {/* Prefix Filter — chip buttons to match the other sections so keyboard
          nav behaves identically (walk with W/S/arrows, commit with Space/Enter). */}
      {availablePrefixes.length > 1 && (
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>
            Subject
            <kbd
              style={{
                marginLeft: '6px',
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontFamily: 'inherit',
              }}
            >
              ⌥⇧S
            </kbd>
          </label>
          <div style={styles.filterChips}>
            <button
              style={{
                ...styles.filterChip,
                backgroundColor:
                  prefixFilter === 'all' ? 'var(--color-navy)' : 'var(--bg-app)',
                color: prefixFilter === 'all' ? 'white' : 'var(--text-secondary)',
                borderColor:
                  prefixFilter === 'all' ? 'var(--color-navy)' : 'var(--border-default)',
                ...(keyboardSection === 'prefix' && keyboardIndex === 0
                  ? focusOutline
                  : {}),
              }}
              onClick={() => onPrefixFilterChange('all')}
            >
              All
            </button>
            {availablePrefixes.map((prefix, i) => (
              <button
                key={prefix}
                style={{
                  ...styles.filterChip,
                  backgroundColor:
                    prefixFilter === prefix ? 'var(--color-navy)' : 'var(--bg-app)',
                  color: prefixFilter === prefix ? 'white' : 'var(--text-secondary)',
                  borderColor:
                    prefixFilter === prefix
                      ? 'var(--color-navy)'
                      : 'var(--border-default)',
                  ...(keyboardSection === 'prefix' && keyboardIndex === i + 1
                    ? focusOutline
                    : {}),
                }}
                onClick={() => onPrefixFilterChange(prefix)}
              >
                {prefix}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Type Filter */}
      {availableTypes.length > 0 && (
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>
            Type
            <kbd
              style={{
                marginLeft: '6px',
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontFamily: 'inherit',
              }}
            >
              ⌥⇧T
            </kbd>
          </label>
          <div style={styles.filterChips}>
            <button
              style={{
                ...styles.filterChip,
                backgroundColor:
                  typeFilter === 'all' ? 'var(--color-navy)' : 'var(--bg-app)',
                color: typeFilter === 'all' ? 'white' : 'var(--text-secondary)',
                borderColor:
                  typeFilter === 'all' ? 'var(--color-navy)' : 'var(--border-default)',
                ...(keyboardSection === 'type' && keyboardIndex === 0
                  ? focusOutline
                  : {}),
              }}
              onClick={() => onTypeFilterChange('all')}
            >
              All
            </button>
            {availableTypes.map((type, i) => (
              <button
                key={type}
                style={{
                  ...styles.filterChip,
                  backgroundColor:
                    typeFilter === type ? 'var(--color-navy)' : 'var(--bg-app)',
                  color: typeFilter === type ? 'white' : 'var(--text-secondary)',
                  borderColor:
                    typeFilter === type ? 'var(--color-navy)' : 'var(--border-default)',
                  ...(keyboardSection === 'type' && keyboardIndex === i + 1
                    ? focusOutline
                    : {}),
                }}
                onClick={() => onTypeFilterChange(type)}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grade Status Filter */}
      <div style={styles.filterGroup}>
        <label style={styles.filterLabel}>
          Grade
          <kbd
            style={{
              marginLeft: '6px',
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontFamily: 'inherit',
            }}
          >
            ⌥⇧G
          </kbd>
        </label>
        <div style={styles.filterChips}>
          {(['all', 'on-track', 'at-risk', 'behind'] as GradeFilter[]).map(
            (filter, i) => (
              <button
                key={filter}
                style={{
                  ...styles.filterChip,
                  backgroundColor:
                    gradeFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                  color: gradeFilter === filter ? 'white' : 'var(--text-secondary)',
                  borderColor:
                    gradeFilter === filter
                      ? 'var(--color-navy)'
                      : 'var(--border-default)',
                  ...(keyboardSection === 'grade' && keyboardIndex === i
                    ? focusOutline
                    : {}),
                }}
                onClick={() => onGradeFilterChange(filter)}
              >
                {filter === 'all'
                  ? 'All'
                  : filter === 'on-track'
                    ? 'On Track'
                    : filter === 'at-risk'
                      ? 'At Risk'
                      : 'Behind'}
              </button>
            )
          )}
        </div>
      </div>

      {/* Show Hidden */}
      <div style={styles.filterGroup}>
        <button
          style={{
            ...styles.filterChip,
            backgroundColor: showHidden ? 'var(--color-navy)' : 'var(--bg-app)',
            color: showHidden ? 'white' : 'var(--text-secondary)',
            borderColor: showHidden ? 'var(--color-navy)' : 'var(--border-default)',
            ...(keyboardSection === 'show-hidden' ? focusOutline : {}),
          }}
          onClick={() => onShowHiddenChange(!showHidden)}
        >
          <EyeOff size={14} />
          Show Hidden ({hiddenCount})
        </button>
      </div>

      {hasActiveFilters && (
        <button
          style={{
            ...styles.clearFiltersBtn,
            ...(keyboardSection === 'clear' ? focusOutline : {}),
          }}
          onClick={onClearFilters}
        >
          <X size={14} />
          Clear All
        </button>
      )}
    </div>
  );
}

export default CoursesFilterPanel;
