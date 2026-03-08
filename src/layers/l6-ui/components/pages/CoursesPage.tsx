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
  Square,
  CheckSquare,
  Eye,
  EyeOff,
  Pin,
  PinOff,
} from 'lucide-react';
import { useStore, getCachedCourseGrades } from '../../../l5-presentation/store';
import { Card, SelectionBar } from '../shared';
import { useShallow } from 'zustand/react/shallow';
import { useCourseDragDrop } from './useCourseDragDrop';
import { useMultiSelect } from '../../hooks/useMultiSelect';
import { useUpdatesByCourse } from '../../hooks';
import { getCourseColor, formatGrade } from '../../constants';
import type { Course } from '../../../l5-presentation/types';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('CoursesPage');

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
        logger.error('Failed to fetch archived courses', error instanceof Error ? error : undefined);
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
      logger.error('Failed to unarchive course', error instanceof Error ? error : undefined);
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
      logger.error('Failed to archive course', error instanceof Error ? error : undefined);
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

  // Multi-select hook for bulk actions
  const getCourseKey = useCallback((c: Course) => String(c.id), []);
  const {
    selectMode,
    selectedKeys,
    selectedCount,
    setSelectMode,
    handleItemClick: handleCourseSelectClick,
    selectAll: selectAllCourses,
    deselectAll: deselectAllCourses,
    isSelected: isCourseSelected,
    reset: resetCourseSelection,
  } = useMultiSelect(filteredCourses, getCourseKey);

  // Bulk action handlers
  const handleBulkHide = async () => {
    for (const course of filteredCourses) {
      if (selectedKeys.has(String(course.id)) && !course.isHidden) {
        await window.api.dispatch('UpdateCoursePreferences', {
          courseId: course.id,
          preferences: { isHidden: true },
        });
      }
    }
    await fetchCourses();
    resetCourseSelection();
  };

  const handleBulkShow = async () => {
    for (const course of filteredCourses) {
      if (selectedKeys.has(String(course.id)) && course.isHidden) {
        await window.api.dispatch('UpdateCoursePreferences', {
          courseId: course.id,
          preferences: { isHidden: false },
        });
      }
    }
    await fetchCourses();
    resetCourseSelection();
  };

  const handleBulkPin = () => {
    setPinnedCourses((prev) => {
      const next = new Set(prev);
      for (const key of selectedKeys) {
        next.add(Number(key));
      }
      return next;
    });
    resetCourseSelection();
  };

  const handleBulkUnpin = () => {
    setPinnedCourses((prev) => {
      const next = new Set(prev);
      for (const key of selectedKeys) {
        next.delete(Number(key));
      }
      return next;
    });
    resetCourseSelection();
  };

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
              data-search-input
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

          {/* Select Mode Toggle */}
          <button
            style={{
              ...styles.filterButton,
              backgroundColor: selectMode ? 'var(--color-navy-light)' : 'var(--bg-card)',
              borderColor: selectMode ? 'var(--color-navy)' : 'var(--border-default)',
              color: selectMode ? 'var(--color-navy)' : 'var(--text-secondary)',
            }}
            onClick={() => {
              if (selectMode) {
                resetCourseSelection();
              } else {
                setSelectMode(true);
              }
            }}
            title="Select courses for bulk actions"
          >
            {selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
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

      {/* Selection Bar */}
      {selectMode && (
        <SelectionBar
          selectedCount={selectedCount}
          onSelectAll={selectAllCourses}
          onDeselectAll={deselectAllCourses}
          onCancel={resetCourseSelection}
          actions={[
            { label: 'Hide', icon: <EyeOff size={14} />, onClick: handleBulkHide },
            { label: 'Show', icon: <Eye size={14} />, onClick: handleBulkShow },
            { label: 'Pin', icon: <Pin size={14} />, onClick: handleBulkPin },
            { label: 'Unpin', icon: <PinOff size={14} />, onClick: handleBulkUnpin },
          ]}
        />
      )}

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
        <div
          style={styles.grid}
          onClickCapture={(e) => {
            if (!selectMode) return;
            const cardEl = (e.target as HTMLElement).closest('[data-course-id]');
            if (!cardEl) return;
            const id = Number(cardEl.getAttribute('data-course-id'));
            const course = filteredCourses.find(c => c.id === id);
            if (course && (e.shiftKey || e.ctrlKey || e.metaKey)) {
              e.stopPropagation();
              handleCourseSelectClick(course, e);
            }
          }}
        >
          {filteredCourses.map((course) => {
            const grades = getCachedCourseGrades(course.id, tasks);
            const updateInfo = updatesByCourse.get(course.id);
            return (
              <div key={course.id} data-course-id={course.id} style={{ position: 'relative' }}>
                {selectMode && (
                  <div
                    style={courseSelectOverlayStyles.checkbox}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCourseSelectClick(course, e);
                    }}
                  >
                    {isCourseSelected(course) ? (
                      <CheckSquare size={18} color="var(--color-navy)" />
                    ) : (
                      <Square size={18} color="var(--text-muted)" />
                    )}
                  </div>
                )}
                <CourseGridCard
                  course={course}
                  isPinned={pinnedCourses.has(course.id)}
                  earned={grades.earned}
                  trend={grades.trend}
                  assessed={grades.assessed}
                  onTogglePin={togglePin}
                  onToggleHide={handleToggleHide}
                  onClick={selectMode
                    ? () => handleCourseSelectClick(course, { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent)
                    : () => handleCourseClick(course.id)
                  }
                  onColorClick={selectMode ? undefined : openColorPicker}
                  showColorPicker={!selectMode && colorPickerCourseId === course.id}
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
                  onDragStart={selectMode ? undefined : (e) => handleDragStart(e, course.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, course.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, course.id)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        /* List View - Virtualized for performance */
        <div
          style={styles.list}
          onClickCapture={(e) => {
            if (!selectMode) return;
            const itemEl = (e.target as HTMLElement).closest('[data-course-id]');
            if (!itemEl) return;
            const id = Number(itemEl.getAttribute('data-course-id'));
            const course = filteredCourses.find(c => c.id === id);
            if (course && (e.shiftKey || e.ctrlKey || e.metaKey)) {
              e.stopPropagation();
              handleCourseSelectClick(course, e);
            }
          }}
        >
          {filteredCourses.length <= 20 ? (
            // For small lists, render directly (virtualization overhead not worth it)
            filteredCourses.map((course, index) => {
              const grades = getCachedCourseGrades(course.id, tasks);
              const updateInfo = updatesByCourse.get(course.id);
              return (
                <div key={course.id} data-course-id={course.id} style={{ display: 'flex', alignItems: 'center' }}>
                  {selectMode && (
                    <div
                      style={courseSelectOverlayStyles.listCheckbox}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCourseSelectClick(course, e);
                      }}
                    >
                      {isCourseSelected(course) ? (
                        <CheckSquare size={16} color="var(--color-navy)" />
                      ) : (
                        <Square size={16} color="var(--text-muted)" />
                      )}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <CourseListItem
                      course={course}
                      isPinned={pinnedCourses.has(course.id)}
                      earned={grades.earned}
                      trend={grades.trend}
                      assessed={grades.assessed}
                      onTogglePin={togglePin}
                      onToggleHide={handleToggleHide}
                      isFirst={index === 0}
                      onClick={selectMode
                        ? () => handleCourseSelectClick(course, { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent)
                        : () => handleCourseClick(course.id)
                      }
                      onColorClick={selectMode ? undefined : openColorPicker}
                      showColorPicker={!selectMode && colorPickerCourseId === course.id}
                      colorPickerValue={colorPickerCourseId === course.id ? customColor : undefined}
                      onColorChange={handleColorChange}
                      onColorInputChange={setCustomColor}
                      onColorPickerClose={closeColorPicker}
                      hasUpdates={!!updateInfo}
                      updateCount={updateInfo?.count}
                      hasActionRequired={updateInfo?.hasActionRequired}
                    />
                  </div>
                </div>
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
                selectMode,
                isCourseSelected,
                handleCourseSelectClick,
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
  selectMode: boolean;
  isCourseSelected: (course: Course) => boolean;
  handleCourseSelectClick: (course: Course, e: React.MouseEvent) => void;
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
    <div style={style} data-course-id={course.id}>
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        {data.selectMode && (
          <div
            style={courseSelectOverlayStyles.listCheckbox}
            onClick={(e) => {
              e.stopPropagation();
              data.handleCourseSelectClick(course, e);
            }}
          >
            {data.isCourseSelected(course) ? (
              <CheckSquare size={16} color="var(--color-navy)" />
            ) : (
              <Square size={16} color="var(--text-muted)" />
            )}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <CourseListItem
            course={course}
            isPinned={data.pinnedCourses.has(course.id)}
            earned={grades.earned}
            trend={grades.trend}
            assessed={grades.assessed}
            onTogglePin={data.togglePin}
            onToggleHide={data.handleToggleHide}
            isFirst={index === 0}
            onClick={data.selectMode
              ? () => data.handleCourseSelectClick(course, { shiftKey: false, ctrlKey: false, metaKey: false } as React.MouseEvent)
              : () => data.handleCourseClick(course.id)
            }
            onColorClick={data.selectMode ? undefined : data.openColorPicker}
            showColorPicker={!data.selectMode && data.colorPickerCourseId === course.id}
            colorPickerValue={data.colorPickerCourseId === course.id ? data.customColor : undefined}
            onColorChange={data.handleColorChange}
            onColorInputChange={data.setCustomColor}
            onColorPickerClose={data.closeColorPicker}
            hasUpdates={!!updateInfo}
            updateCount={updateInfo?.count}
            hasActionRequired={updateInfo?.hasActionRequired}
          />
        </div>
      </div>
    </div>
  );
}

/** Styles for selection checkbox overlays on course cards/list items */
const courseSelectOverlayStyles: Record<string, React.CSSProperties> = {
  checkbox: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    zIndex: 10,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-card)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
  },
  listCheckbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    flexShrink: 0,
    cursor: 'pointer',
    paddingLeft: 'var(--space-3)',
  },
};

/* REMOVED_OLD_STYLES_START
const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-6)',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minWidth: 0,
  },

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  searchIcon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '220px',
    height: '36px',
    paddingLeft: '36px',
    paddingRight: '32px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
  },

  clearSearch: {
    position: 'absolute',
    right: '8px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    color: 'var(--text-muted)',
  },

  filterButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '8px',
    height: '8px',
    backgroundColor: 'var(--color-navy)',
    borderRadius: '50%',
  },

  filterPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    boxShadow: 'var(--shadow-card)',
  },

  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    marginRight: 'var(--space-1)',
  },

  filterChips: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexWrap: 'wrap',
  },

  filterSelect: {
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    outline: 'none',
  },

  filterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    border: '1px solid',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  clearFiltersBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-error)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    marginLeft: 'auto',
  },

  clearFiltersLarge: {
    marginTop: 'var(--space-4)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  viewButton: {
    width: '40px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  resetOrderButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '36px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'grab',
    opacity: 0,
    transition: 'opacity var(--transition-fast)',
  },

  // Grid View Styles - uses CSS Grid for card alignment, scales proportionally with viewport
  grid: {
    display: 'grid',
    // Cards grow from 280px min to fill available space, with max ~400px before wrapping
    gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(280px, 20vw, 400px), 1fr))',
    gap: 'clamp(16px, 2vw, 24px)',
    // Each card is a 5-row grid for internal alignment
    alignItems: 'stretch',
    flex: 1,
  },

  gridCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    transition: 'box-shadow var(--transition-fast), transform var(--transition-fast)',
    cursor: 'pointer',
    // Internal grid for consistent alignment
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr auto auto', // header, name, spacer, stats, footer
    height: '100%', // Stretch to fill row height
    minHeight: 'clamp(200px, 18vw, 280px)', // Proportional minimum height
  },

  colorBar: {
    height: '4px',
  },

  colorPickerPopup: {
    position: 'absolute',
    top: '100%',
    left: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    padding: 'var(--space-3)',
    zIndex: 100,
    minWidth: '200px',
  },

  colorPresets: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },

  colorPresetBtn: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'transform var(--transition-fast)',
  },

  hexInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    borderTop: '1px solid var(--border-light)',
    paddingTop: 'var(--space-3)',
  },

  hexLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
  },

  hexInput: {
    flex: 1,
    height: '28px',
    padding: '0 var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },

  nativeColorPicker: {
    width: '28px',
    height: '28px',
    padding: 0,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  colorPickerPopupList: {
    position: 'absolute',
    top: '50%',
    left: 'calc(100% + var(--space-2))',
    transform: 'translateY(-50%)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    padding: 'var(--space-3)',
    zIndex: 100,
    minWidth: '200px',
  },

  gridCardContent: {
    display: 'contents', // Let children participate in parent grid
  },

  gridCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px) clamp(6px, 0.8vw, 12px) clamp(12px, 1.5vw, 20px)',
  },

  courseCodeBadge: {
    fontSize: 'clamp(10px, 0.85vw, 13px)',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: 'clamp(2px, 0.3vw, 5px) clamp(6px, 0.6vw, 10px)',
    borderRadius: 'clamp(3px, 0.3vw, 5px)',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },

  pinButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  gridCourseName: {
    fontSize: 'clamp(14px, 1.1vw, 18px)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    lineHeight: 'var(--leading-snug)',
    padding: '0 clamp(12px, 1.5vw, 20px)',
  },

  fullCode: {
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    color: 'var(--text-muted)',
    display: 'block',
    padding: 'clamp(4px, 0.4vw, 8px) clamp(12px, 1.5vw, 20px) 0 clamp(12px, 1.5vw, 20px)',
    alignSelf: 'start', // Align to top of flex area
  },

  gridStats: {
    display: 'flex',
    gap: 'clamp(12px, 1.2vw, 20px)',
    padding: 'clamp(8px, 1vw, 16px) clamp(12px, 1.5vw, 20px)',
    borderTop: '1px solid var(--border-light)',
    marginTop: 'auto', // Push to bottom of flex area
  },

  gridStatItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'clamp(4px, 0.4vw, 8px)',
  },

  gridStatLabel: {
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    color: 'var(--text-muted)',
  },

  gridStatValue: {
    fontSize: 'clamp(12px, 1vw, 16px)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  syncTime: {
    fontSize: 'clamp(10px, 0.8vw, 13px)',
    color: 'var(--text-muted)',
    padding: '0 clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px)',
  },

  // List View Styles - fills available space
  list: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  listColorDot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    flexShrink: 0,
    padding: 0,
    transition: 'transform var(--transition-fast)',
  },

  listInfo: {
    flex: 1,
    minWidth: 0,
  },

  listHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  listCodeBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase',
  },

  listFullCode: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  listCourseName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  listGrades: {
    display: 'flex',
    gap: 'var(--space-6)',
    flexShrink: 0,
  },

  listGradeItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },

  listGradeLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  listGradeValue: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  listActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },

  // Empty State
  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-10)',
  },

  emptyTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    color: 'var(--text-secondary)',
  },
};
REMOVED_OLD_STYLES_END */

// Inject hover styles for drag handle visibility
if (typeof document !== 'undefined') {
  const styleId = 'course-card-drag-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-drag-handle] {
        opacity: 0 !important;
      }
      div:hover > div > div > [data-drag-handle],
      div:hover > div > [data-drag-handle] {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }
}

export default CoursesPage;
