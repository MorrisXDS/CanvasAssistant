/**
 * Courses Page
 * Course glossary with grid/list view toggle and pin functionality
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FixedSizeList as VirtualList } from 'react-window';
import {
  BookOpen,
  Grid,
  List,
  Search,
  Filter,
  X,
  Archive,
  ChevronDown,
} from 'lucide-react';
import { useStore, getCachedCourseGrades } from '../../../l5-presentation/store';
import { Card } from '../shared';
import { useShallow } from 'zustand/react/shallow';
import { useCourseDragDrop } from './useCourseDragDrop';
import { useUpdatesByCourse } from '../../hooks';
import { getCourseColor, formatGrade } from '../../constants';
import type { Course } from '../../../l5-presentation/types';

// Extracted modules
import { styles, injectDragHandleStyles } from './coursesPageStyles';
import {
  type ViewMode,
  type GradeFilter,
  getShortCode,
  loadPinnedCourses,
  savePinnedCourses,
  loadCourseSettings,
  loadViewMode,
  saveViewMode,
  getAvailableFilters,
  filterAndSortCourses,
} from './coursesPageUtils';
import { CourseGridCard } from './CourseGridCard';
import { CourseListItem } from './CourseListItem';
import { CoursesFilterPanel } from './CoursesFilterPanel';
import { ArchivedCoursesSection } from './ArchivedCoursesSection';

// Inject drag handle styles on module load
injectDragHandleStyles();

export function CoursesPage() {
  const navigate = useNavigate();
  const { courses, fetchCourses, refreshAll, tasks } = useStore(
    useShallow((state) => ({
      courses: state.courses,
      fetchCourses: state.fetchCourses,
      refreshAll: state.refreshAll,
      tasks: state.tasks,
    }))
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    loadViewMode('courses', loadCourseSettings().defaultViewMode)
  );

  // Wrap setViewMode to also save to localStorage
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    saveViewMode('courses', mode);
  };
  const [pinnedCourses, setPinnedCourses] = useState<Set<number>>(() =>
    loadPinnedCourses()
  );

  // Drag-and-drop reordering
  const courseIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const {
    sortByCustomOrder,
    draggedCourseId,
    dragOverCourseId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,
  } = useCourseDragDrop(courseIds);

  // Course updates for notification dots
  const updatesByCourse = useUpdatesByCourse();

  // Color picker state
  const [colorPickerCourseId, setColorPickerCourseId] = useState<number | null>(null);
  const [customColor, setCustomColor] = useState<string>('');

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [prefixFilter, setPrefixFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showHidden, setShowHidden] = useState(
    () => loadCourseSettings().showHiddenByDefault
  );
  const [showFilters, setShowFilters] = useState(false);

  // Archived courses state
  const [archivedCourses, setArchivedCourses] = useState<Course[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);

  // Archive dropdown state
  const [showArchiveDropdown, setShowArchiveDropdown] = useState(false);
  const archiveDropdownRef = React.useRef<HTMLDivElement>(null);

  // Close archive dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        archiveDropdownRef.current &&
        !archiveDropdownRef.current.contains(event.target as Node)
      ) {
        setShowArchiveDropdown(false);
      }
    }
    if (showArchiveDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showArchiveDropdown]);

  // Get unique prefixes and types from visible courses
  const { availablePrefixes, availableTypes } = useMemo(
    () => getAvailableFilters(courses, showHidden),
    [courses, showHidden]
  );

  // Reset filters when selected option is no longer available
  useEffect(() => {
    if (prefixFilter !== 'all' && !availablePrefixes.includes(prefixFilter)) {
      setPrefixFilter('all');
    }
    if (typeFilter !== 'all' && !availableTypes.includes(typeFilter)) {
      setTypeFilter('all');
    }
  }, [availablePrefixes, availableTypes, prefixFilter, typeFilter]);

  // Navigate to course detail
  const handleCourseClick = useCallback(
    (courseId: number) => {
      navigate(`/course/${courseId}`);
    },
    [navigate]
  );

  // Save pinned courses when they change
  useEffect(() => {
    savePinnedCourses(pinnedCourses);
  }, [pinnedCourses]);

  // Fetch archived courses when section is expanded
  useEffect(() => {
    const fetchArchivedCourses = async () => {
      if (!showArchived) return;
      setLoadingArchived(true);
      try {
        const result = await window.api?.getArchivedCourses?.();
        if (result) {
          setArchivedCourses(result);
        }
      } catch (error) {
        console.error('Failed to fetch archived courses:', error);
      } finally {
        setLoadingArchived(false);
      }
    };
    fetchArchivedCourses();
  }, [showArchived]);

  // Handle unarchive course
  const handleUnarchiveCourse = async (courseId: number) => {
    try {
      const result = await window.api.dispatch('UnarchiveCourse', { courseId });
      if (result.success) {
        setArchivedCourses((prev) => prev.filter((c) => c.id !== courseId));
        await refreshAll();
      }
    } catch (error) {
      console.error('Failed to unarchive course:', error);
    }
  };

  // Handle archive course
  const handleArchiveCourse = async (courseId: number) => {
    try {
      const result = await window.api.dispatch('ArchiveCourse', { courseId });
      if (result.success) {
        await refreshAll();
        const archivedResult = await window.api?.getArchivedCourses?.();
        if (archivedResult) {
          setArchivedCourses(archivedResult);
          setShowArchived(true);
        }
      }
    } catch (error) {
      console.error('Failed to archive course:', error);
    }
  };

  // Toggle pin status
  const togglePin = (courseId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  // Open color picker for a course
  const openColorPicker = (
    courseId: number,
    currentColor: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setColorPickerCourseId(courseId);
    setCustomColor(currentColor);
  };

  // Update course color
  const handleColorChange = async (courseId: number, color: string) => {
    await window.api.dispatch('UpdateCoursePreferences', {
      courseId,
      preferences: { color },
    });
    await fetchCourses();
    setColorPickerCourseId(null);
  };

  // Toggle course hidden status
  const handleToggleHide = async (courseId: number, currentlyHidden: boolean) => {
    await window.api.dispatch('UpdateCoursePreferences', {
      courseId,
      preferences: { isHidden: !currentlyHidden },
    });
    await fetchCourses();
  };

  // Close color picker
  const closeColorPicker = () => {
    setColorPickerCourseId(null);
    setCustomColor('');
  };

  // Filter and sort courses
  const filteredCourses = useMemo(
    () =>
      filterAndSortCourses(courses, {
        showHidden,
        searchQuery,
        gradeFilter,
        prefixFilter,
        typeFilter,
        pinnedCourses,
        sortByCustomOrder,
      }),
    [
      courses,
      pinnedCourses,
      searchQuery,
      gradeFilter,
      prefixFilter,
      typeFilter,
      showHidden,
      sortByCustomOrder,
    ]
  );

  const pinnedCount = filteredCourses.filter((c) => pinnedCourses.has(c.id)).length;
  const hiddenCount = courses.filter((c) => c.isHidden).length;
  const hasActiveFilters =
    !!searchQuery ||
    gradeFilter !== 'all' ||
    prefixFilter !== 'all' ||
    typeFilter !== 'all' ||
    showHidden;

  // Calculate weighted average across all visible courses
  const weightedAverage = useMemo(() => {
    let totalWeightedGrade = 0;
    let totalCredits = 0;

    for (const course of courses) {
      if (course.isHidden) continue;
      const grades = getCachedCourseGrades(course.id, tasks);
      // Only include courses that have assessed work
      if (grades.assessed > 0) {
        const credits = course.credits ?? 1.0;
        totalWeightedGrade += grades.trend * credits;
        totalCredits += credits;
      }
    }

    if (totalCredits === 0) return null;
    return totalWeightedGrade / totalCredits;
  }, [courses, tasks]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setGradeFilter('all');
    setPrefixFilter('all');
    setTypeFilter('all');
    setShowHidden(false);
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Courses</h1>
          <p style={styles.subtitle}>
            {filteredCourses.length} of {courses.length} course
            {courses.length !== 1 ? 's' : ''}
            {pinnedCount > 0 && ` • ${pinnedCount} pinned`}
            {hiddenCount > 0 && !showHidden && ` • ${hiddenCount} hidden`}
            {weightedAverage !== null && ` • Overall: ${formatGrade(weightedAverage)}`}
          </p>
        </div>

        <div style={styles.headerRight}>
          {/* Search */}
          <div style={styles.searchWrapper}>
            <Search size={16} color="var(--text-muted)" style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button style={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            style={{
              ...styles.filterButton,
              backgroundColor: hasActiveFilters
                ? 'var(--color-navy-light)'
                : 'var(--bg-card)',
              borderColor: hasActiveFilters
                ? 'var(--color-navy)'
                : 'var(--border-default)',
              color: hasActiveFilters ? 'var(--color-navy)' : 'var(--text-secondary)',
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            {hasActiveFilters && <span style={styles.filterBadge} />}
          </button>

          {/* View Toggle */}
          <div style={styles.viewToggle}>
            <button
              style={{
                ...styles.viewButton,
                backgroundColor:
                  viewMode === 'grid' ? 'var(--color-navy)' : 'transparent',
                color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <Grid size={18} />
            </button>
            <button
              style={{
                ...styles.viewButton,
                backgroundColor:
                  viewMode === 'list' ? 'var(--color-navy)' : 'transparent',
                color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={18} />
            </button>
          </div>

          {/* Archive Button with Dropdown */}
          <div style={{ position: 'relative' }} ref={archiveDropdownRef}>
            <button
              style={styles.archiveButton}
              onClick={() => setShowArchiveDropdown(!showArchiveDropdown)}
              title="Archive a course"
            >
              <Archive size={16} />
              <span>Archive</span>
              <ChevronDown size={14} style={{ marginLeft: '2px' }} />
            </button>

            {showArchiveDropdown && (
              <div style={styles.archiveDropdown}>
                <div style={styles.archiveDropdownHeader}>Select course to archive</div>
                {courses.length === 0 ? (
                  <div style={styles.archiveDropdownEmpty}>No courses available</div>
                ) : (
                  <div style={styles.archiveDropdownList}>
                    {courses.map((course) => (
                      <button
                        key={course.id}
                        style={styles.archiveDropdownItem}
                        onClick={() => {
                          handleArchiveCourse(course.id);
                          setShowArchiveDropdown(false);
                        }}
                      >
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: getCourseColor(course.id, course.color),
                            flexShrink: 0,
                          }}
                        />
                        <span style={styles.archiveDropdownCode}>
                          {getShortCode(course.code)}
                        </span>
                        <span style={styles.archiveDropdownName}>
                          {course.nickname || course.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filter Panel */}
      {showFilters && (
        <CoursesFilterPanel
          availablePrefixes={availablePrefixes}
          availableTypes={availableTypes}
          prefixFilter={prefixFilter}
          typeFilter={typeFilter}
          gradeFilter={gradeFilter}
          showHidden={showHidden}
          hiddenCount={hiddenCount}
          hasActiveFilters={hasActiveFilters}
          onPrefixFilterChange={setPrefixFilter}
          onTypeFilterChange={setTypeFilter}
          onGradeFilterChange={setGradeFilter}
          onShowHiddenChange={setShowHidden}
          onClearFilters={clearFilters}
        />
      )}

      {/* Empty State - No courses at all */}
      {courses.length === 0 ? (
        <Card padding="lg">
          <div style={styles.emptyState}>
            <BookOpen
              size={64}
              color="var(--color-navy)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 style={styles.emptyTitle}>No Courses Found</h2>
            <p style={styles.emptyText}>
              Sync with Canvas to load your enrolled courses.
            </p>
          </div>
        </Card>
      ) : filteredCourses.length === 0 ? (
        /* No results after filtering */
        <Card padding="lg">
          <div style={styles.emptyState}>
            <Search
              size={48}
              color="var(--text-muted)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 style={styles.emptyTitle}>No Courses Match</h2>
            <p style={styles.emptyText}>Try adjusting your search or filters.</p>
            <button style={styles.clearFiltersLarge} onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div style={styles.grid}>
          {filteredCourses.map((course) => {
            const grades = getCachedCourseGrades(course.id, tasks);
            const updateInfo = updatesByCourse.get(course.id);
            return (
              <CourseGridCard
                key={course.id}
                course={course}
                isPinned={pinnedCourses.has(course.id)}
                earned={grades.earned}
                trend={grades.trend}
                assessed={grades.assessed}
                onTogglePin={togglePin}
                onToggleHide={handleToggleHide}
                onClick={() => handleCourseClick(course.id)}
                onColorClick={openColorPicker}
                showColorPicker={colorPickerCourseId === course.id}
                colorPickerValue={
                  colorPickerCourseId === course.id ? customColor : undefined
                }
                onColorChange={handleColorChange}
                onColorInputChange={setCustomColor}
                onColorPickerClose={closeColorPicker}
                hasUpdates={!!updateInfo}
                updateCount={updateInfo?.count}
                hasActionRequired={updateInfo?.hasActionRequired}
                isDragging={draggedCourseId === course.id}
                isDragOver={dragOverCourseId === course.id}
                onDragStart={(e) => handleDragStart(e, course.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, course.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, course.id)}
              />
            );
          })}
        </div>
      ) : (
        /* List View - Virtualized for performance */
        <div style={styles.list}>
          {filteredCourses.length <= 20 ? (
            // For small lists, render directly
            filteredCourses.map((course, index) => {
              const grades = getCachedCourseGrades(course.id, tasks);
              const updateInfo = updatesByCourse.get(course.id);
              return (
                <CourseListItem
                  key={course.id}
                  course={course}
                  isPinned={pinnedCourses.has(course.id)}
                  earned={grades.earned}
                  trend={grades.trend}
                  assessed={grades.assessed}
                  onTogglePin={togglePin}
                  onToggleHide={handleToggleHide}
                  isFirst={index === 0}
                  onClick={() => handleCourseClick(course.id)}
                  onColorClick={openColorPicker}
                  showColorPicker={colorPickerCourseId === course.id}
                  colorPickerValue={
                    colorPickerCourseId === course.id ? customColor : undefined
                  }
                  onColorChange={handleColorChange}
                  onColorInputChange={setCustomColor}
                  onColorPickerClose={closeColorPicker}
                  hasUpdates={!!updateInfo}
                  updateCount={updateInfo?.count}
                  hasActionRequired={updateInfo?.hasActionRequired}
                />
              );
            })
          ) : (
            // For large lists, use virtualization
            <VirtualList
              height={Math.min(filteredCourses.length * 80, 600)}
              itemCount={filteredCourses.length}
              itemSize={80}
              width="100%"
              itemData={{
                courses: filteredCourses,
                tasks,
                pinnedCourses,
                togglePin,
                handleToggleHide,
                handleCourseClick,
                openColorPicker,
                colorPickerCourseId,
                customColor,
                handleColorChange,
                setCustomColor,
                closeColorPicker,
                updatesByCourse,
              }}
            >
              {VirtualizedListItem}
            </VirtualList>
          )}
        </div>
      )}

      {/* Archived Courses Section */}
      <ArchivedCoursesSection
        archivedCourses={archivedCourses}
        showArchived={showArchived}
        loadingArchived={loadingArchived}
        onToggleShow={() => setShowArchived(!showArchived)}
        onUnarchive={handleUnarchiveCourse}
      />
    </div>
  );
}

// Virtualized list item renderer for react-window
interface VirtualizedListItemData {
  courses: Course[];
  tasks: { courseId: number; weight: number; grade: number | null }[];
  pinnedCourses: Set<number>;
  togglePin: (courseId: number, e: React.MouseEvent) => void;
  handleToggleHide: (courseId: number, currentlyHidden: boolean) => Promise<void>;
  handleCourseClick: (courseId: number) => void;
  openColorPicker: (courseId: number, currentColor: string, e: React.MouseEvent) => void;
  colorPickerCourseId: number | null;
  customColor: string;
  handleColorChange: (courseId: number, color: string) => Promise<void>;
  setCustomColor: (value: string) => void;
  closeColorPicker: () => void;
  updatesByCourse: Map<
    number,
    { color: string; count: number; hasActionRequired: boolean }
  >;
}

function VirtualizedListItem({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: VirtualizedListItemData;
}) {
  const course = data.courses[index];
  const grades = getCachedCourseGrades(course.id, data.tasks);
  const updateInfo = data.updatesByCourse.get(course.id);

  return (
    <div style={style}>
      <CourseListItem
        course={course}
        isPinned={data.pinnedCourses.has(course.id)}
        earned={grades.earned}
        trend={grades.trend}
        assessed={grades.assessed}
        onTogglePin={data.togglePin}
        onToggleHide={data.handleToggleHide}
        isFirst={index === 0}
        onClick={() => data.handleCourseClick(course.id)}
        onColorClick={data.openColorPicker}
        showColorPicker={data.colorPickerCourseId === course.id}
        colorPickerValue={
          data.colorPickerCourseId === course.id ? data.customColor : undefined
        }
        onColorChange={data.handleColorChange}
        onColorInputChange={data.setCustomColor}
        onColorPickerClose={data.closeColorPicker}
        hasUpdates={!!updateInfo}
        updateCount={updateInfo?.count}
        hasActionRequired={updateInfo?.hasActionRequired}
      />
    </div>
  );
}

export default CoursesPage;
