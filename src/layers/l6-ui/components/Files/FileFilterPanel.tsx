/**
 * FileFilterPanel Component
 * Filter controls with accordion sections for better organization
 */

import React from 'react';
import { X, CheckSquare, Square } from 'lucide-react';
import { AccordionSection } from '../shared';
import styles from './FilesPage.module.css';

// Types
export type SourceFilter = 'all' | 'canvas' | 'announcements';
export type StatusFilter = 'all' | 'pending' | 'downloaded';
export type SizeFilter = 'all' | 'small' | 'medium' | 'large';

export interface Course {
  id: number;
  code: string;
  name: string;
  nickname: string | null;
  color: string | null;
}

export interface FileFilterPanelProps {
  // Available options
  availablePrefixes: string[];
  availableTerms: string[];
  availableExtensions: string[];
  coursesWithFiles: Course[];
  coursesByPrefix: Map<string, Course[]>;

  // Selected filters
  selectedPrefixes: Set<string>;
  selectedTerms: Set<string>;
  sourceFilter: SourceFilter;
  statusFilter: StatusFilter;
  selectedExtensions: Set<string>;
  sizeFilter: SizeFilter;
  selectedCourseIds: Set<number> | null;

  // Callbacks
  onTogglePrefix: (prefix: string) => void;
  onToggleTerm: (term: string) => void;
  onSourceFilterChange: (filter: SourceFilter) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onToggleExtension: (ext: string) => void;
  onSizeFilterChange: (filter: SizeFilter) => void;
  onToggleCourseFilter: (courseId: number) => void;
  onSelectAllCourses: () => void;
  onDeselectAllCourses: () => void;
  onClearFilters: () => void;

  // Helpers
  getCourseColor: (courseId: number, existingColor: string | null) => string;
  getShortCode: (code: string) => string;
  isCourseFilterSelected: (courseId: number) => boolean;

  hasActiveFilters: boolean;
}

export function FileFilterPanel({
  availablePrefixes,
  availableTerms,
  availableExtensions,
  coursesWithFiles,
  coursesByPrefix,
  selectedPrefixes,
  selectedTerms,
  sourceFilter,
  statusFilter,
  selectedExtensions,
  sizeFilter,
  selectedCourseIds,
  onTogglePrefix,
  onToggleTerm,
  onSourceFilterChange,
  onStatusFilterChange,
  onToggleExtension,
  onSizeFilterChange,
  onToggleCourseFilter,
  onSelectAllCourses,
  onDeselectAllCourses,
  onClearFilters,
  getCourseColor,
  getShortCode,
  isCourseFilterSelected,
  hasActiveFilters,
}: FileFilterPanelProps) {
  return (
    <div className={styles.filterPanel}>
        {/* Quick Filters Row */}
        <div className={styles.quickFilters}>
          <span className={styles.quickFilterLabel}>Quick:</span>
          <button
            className={`${styles.quickFilterChip} ${statusFilter === 'downloaded' ? styles.quickFilterChipActive : ''}`}
            onClick={() => onStatusFilterChange(statusFilter === 'downloaded' ? 'all' : 'downloaded')}
          >
            Downloaded
          </button>
          <button
            className={`${styles.quickFilterChip} ${statusFilter === 'pending' ? styles.quickFilterChipActive : ''}`}
            onClick={() => onStatusFilterChange(statusFilter === 'pending' ? 'all' : 'pending')}
          >
            Not Downloaded
          </button>
          <button
            className={`${styles.quickFilterChip} ${selectedExtensions.has('pdf') ? styles.quickFilterChipActive : ''}`}
            onClick={() => onToggleExtension('pdf')}
          >
            PDFs Only
          </button>
          {hasActiveFilters && (
            <button className={styles.clearFilters} onClick={onClearFilters}>
              <X size={14} />
              Clear all
            </button>
          )}
        </div>

        {/* Course Prefix Filter */}
        {availablePrefixes.length > 1 && (
          <AccordionSection title="Course Prefix" defaultExpanded>
            <div className={styles.filterChips}>
              {availablePrefixes.map((prefix) => (
                <button
                  key={prefix}
                  className={`${styles.filterChip} ${selectedPrefixes.has(prefix) ? styles.filterChipActive : ''}`}
                  onClick={() => onTogglePrefix(prefix)}
                >
                  {prefix}
                </button>
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Term Filter */}
        {availableTerms.length > 1 && (
          <AccordionSection title="Term">
            <div className={styles.filterChips}>
              {availableTerms.map((term) => (
                <button
                  key={term}
                  className={`${styles.filterChip} ${selectedTerms.has(term) ? styles.filterChipActive : ''}`}
                  onClick={() => onToggleTerm(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Source Filter */}
        <AccordionSection title="Source">
          <div className={styles.filterChips}>
            {[
              { value: 'all' as const, label: 'All Sources' },
              { value: 'canvas' as const, label: 'Canvas Files' },
              { value: 'announcements' as const, label: 'Announcements' },
            ].map((option) => (
              <button
                key={option.value}
                className={`${styles.filterChip} ${sourceFilter === option.value ? styles.filterChipActive : ''}`}
                onClick={() => onSourceFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </AccordionSection>

        {/* Status Filter */}
        <AccordionSection title="Download Status">
          <div className={styles.filterChips}>
            {[
              { value: 'all' as const, label: 'All' },
              { value: 'pending' as const, label: 'Not Downloaded' },
              { value: 'downloaded' as const, label: 'Downloaded' },
            ].map((option) => (
              <button
                key={option.value}
                className={`${styles.filterChip} ${statusFilter === option.value ? styles.filterChipActive : ''}`}
                onClick={() => onStatusFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </AccordionSection>

        {/* File Extension Filter */}
        {availableExtensions.length > 0 && (
          <AccordionSection
            title="File Type"
            badge={
              selectedExtensions.size > 0 ? (
                <button
                  className={styles.clearExtensionsBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Clear all extensions
                    selectedExtensions.forEach((ext) => onToggleExtension(ext));
                  }}
                >
                  Clear ({selectedExtensions.size})
                </button>
              ) : undefined
            }
          >
            <div className={styles.filterChips}>
              {availableExtensions.map((ext) => (
                <button
                  key={ext}
                  className={`${styles.filterChip} ${selectedExtensions.has(ext) ? styles.filterChipActive : ''}`}
                  onClick={() => onToggleExtension(ext)}
                >
                  .{ext}
                </button>
              ))}
            </div>
          </AccordionSection>
        )}

        {/* Size Filter */}
        <AccordionSection title="File Size">
          <div className={styles.filterChips}>
            {[
              { value: 'all' as const, label: 'Any Size' },
              { value: 'small' as const, label: '< 1 MB' },
              { value: 'medium' as const, label: '1-10 MB' },
              { value: 'large' as const, label: '> 10 MB' },
            ].map((option) => (
              <button
                key={option.value}
                className={`${styles.filterChip} ${sizeFilter === option.value ? styles.filterChipActive : ''}`}
                onClick={() => onSizeFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </AccordionSection>

        {/* Course Filter */}
        {coursesWithFiles.length > 0 && (
          <AccordionSection
            title="Courses"
            badge={
              <div className={styles.courseFilterActions}>
                <button className={styles.courseFilterAction} onClick={onSelectAllCourses}>
                  Select All
                </button>
                <button className={styles.courseFilterAction} onClick={onDeselectAllCourses}>
                  Deselect All
                </button>
              </div>
            }
          >
            <div className={styles.courseFilterList}>
              {(selectedPrefixes.size > 0
                ? Array.from(selectedPrefixes).sort()
                : availablePrefixes
              ).map((prefix) => {
                const prefixCourses = coursesByPrefix.get(prefix) || [];
                if (prefixCourses.length === 0) return null;

                const selectedInPrefix = prefixCourses.filter((c) => isCourseFilterSelected(c.id)).length;
                const allSelected = selectedInPrefix === prefixCourses.length;

                return (
                  <div key={prefix} className={styles.prefixGroup}>
                    <div className={styles.prefixHeader}>
                      <span className={styles.prefixLabel}>{prefix}</span>
                      <span className={styles.prefixCount}>
                        {selectedInPrefix}/{prefixCourses.length}
                      </span>
                      <button
                        className={styles.prefixToggle}
                        onClick={() => {
                          prefixCourses.forEach((c) => {
                            const isSelected = isCourseFilterSelected(c.id);
                            if (allSelected && isSelected) {
                              onToggleCourseFilter(c.id);
                            } else if (!allSelected && !isSelected) {
                              onToggleCourseFilter(c.id);
                            }
                          });
                        }}
                      >
                        {allSelected ? 'Deselect' : 'Select'} All
                      </button>
                    </div>
                    <div className={styles.prefixCourses}>
                      {prefixCourses.map((course) => {
                        const isSelected = isCourseFilterSelected(course.id);
                        const courseColor = getCourseColor(course.id, course.color);
                        return (
                          <button
                            key={course.id}
                            className={styles.courseFilterItem}
                            style={{
                              opacity: isSelected ? 1 : 0.5,
                              borderColor: isSelected ? courseColor : 'transparent',
                            }}
                            onClick={() => onToggleCourseFilter(course.id)}
                          >
                            {isSelected ? (
                              <CheckSquare size={14} color="var(--color-navy)" />
                            ) : (
                              <Square size={14} color="var(--text-muted)" />
                            )}
                            <span
                              className={styles.courseFilterBadge}
                              style={{ backgroundColor: courseColor }}
                            >
                              {getShortCode(course.code)}
                            </span>
                            <span className={styles.courseFilterName}>
                              {course.nickname || course.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionSection>
        )}
      </div>
  );
}

export default FileFilterPanel;
