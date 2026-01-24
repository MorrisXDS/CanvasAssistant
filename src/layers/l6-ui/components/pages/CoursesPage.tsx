/**
 * Courses Page
 * Course glossary with grid/list view toggle and pin functionality
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FixedSizeList as VirtualList } from 'react-window';
import {
  BookOpen,
  Grid,
  List,
  Pin,
  PinOff,
  ChevronRight,
  Target,
  Search,
  Filter,
  X,
  Eye,
  EyeOff,
  Palette,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { useStore, getCachedCourseGrades } from '../../../l5-presentation/store';
import { Card, Badge, InfoTrigger } from '../shared';
import { useCourseDragDrop } from './useCourseDragDrop';
import type { Course } from '../../../l5-presentation/types';

// Course color palette
const COURSE_COLORS = [
  '#007FA3', '#E53935', '#43A047', '#FB8C00', '#8E24AA',
  '#1E88E5', '#D81B60', '#00ACC1', '#7CB342', '#6D4C41',
];

function getCourseColor(courseId: number, existingColor: string | null): string {
  if (existingColor) return existingColor;
  return COURSE_COLORS[courseId % COURSE_COLORS.length];
}

function getShortCode(code: string): string {
  // Stop before a letter followed by a digit and then space/end (e.g., "H1 " or "Y1")
  const match = code.match(/^(.+?)(?=[A-Z]\d(?:\s|$))/i);
  return match ? match[1] : code.split(/\s/)[0];
}

type ViewMode = 'grid' | 'list';
type GradeFilter = 'all' | 'on-track' | 'at-risk' | 'behind';

function getGradeStatus(course: Course): 'on-track' | 'at-risk' | 'behind' | 'unknown' {
  if (course.currentGrade === null) return 'unknown';
  if (course.currentGrade >= course.targetGrade) return 'on-track';
  if (course.currentGrade >= course.targetGrade - 10) return 'at-risk';
  return 'behind';
}

// Extract course prefix (e.g., "CSC" from "CSC108H1")
function getCoursePrefix(code: string): string {
  const match = code.match(/^([A-Z]{2,4})/i);
  return match ? match[1].toUpperCase() : code.slice(0, 3).toUpperCase();
}

// Extract course type (LEC, TUT, PRA) from name or code
function getCourseType(course: Course): string | null {
  const combined = `${course.code} ${course.name}`.toUpperCase();
  if (combined.includes('LEC')) return 'LEC';
  if (combined.includes('TUT')) return 'TUT';
  if (combined.includes('PRA')) return 'PRA';
  if (combined.includes('LAB')) return 'LAB';
  if (combined.includes('SEM')) return 'SEM';
  return null;
}

// Load pinned courses from localStorage
function loadPinnedCourses(): Set<number> {
  try {
    const stored = localStorage.getItem('pinnedCourses');
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Failed to load pinned courses:', e);
  }
  return new Set();
}

// Save pinned courses to localStorage
function savePinnedCourses(pinned: Set<number>): void {
  try {
    localStorage.setItem('pinnedCourses', JSON.stringify([...pinned]));
  } catch (e) {
    console.error('Failed to save pinned courses:', e);
  }
}

// Load course settings from localStorage
function loadCourseSettings(): { defaultViewMode: ViewMode; showHiddenByDefault: boolean } {
  try {
    const stored = localStorage.getItem('courseSettings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        defaultViewMode: parsed.defaultViewMode || 'grid',
        showHiddenByDefault: parsed.showHiddenByDefault || false,
      };
    }
  } catch (e) {
    console.error('Failed to load course settings:', e);
  }
  return { defaultViewMode: 'grid', showHiddenByDefault: false };
}

// Load remembered view mode (user's last selection takes priority over default)
function loadViewMode(pageKey: string, defaultMode: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(`viewMode:${pageKey}`);
    if (stored === 'grid' || stored === 'list') {
      return stored;
    }
  } catch (e) {
    console.error('Failed to load view mode:', e);
  }
  return defaultMode;
}

// Save view mode when user changes it
function saveViewMode(pageKey: string, mode: ViewMode): void {
  try {
    localStorage.setItem(`viewMode:${pageKey}`, mode);
  } catch (e) {
    console.error('Failed to save view mode:', e);
  }
}

export function CoursesPage() {
  const navigate = useNavigate();
  const { courses, fetchCourses, tasks } = useStore();
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    loadViewMode('courses', loadCourseSettings().defaultViewMode)
  );

  // Wrap setViewMode to also save to localStorage
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    saveViewMode('courses', mode);
  };
  const [pinnedCourses, setPinnedCourses] = useState<Set<number>>(() => loadPinnedCourses());

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
    resetOrder,
    hasCustomOrder,
  } = useCourseDragDrop(courseIds);

  // Color picker state
  const [colorPickerCourseId, setColorPickerCourseId] = useState<number | null>(null);
  const [customColor, setCustomColor] = useState<string>('');

  // Filter state - use settings as defaults
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [prefixFilter, setPrefixFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showHidden, setShowHidden] = useState(() => loadCourseSettings().showHiddenByDefault);
  const [showFilters, setShowFilters] = useState(false);

  // Get unique prefixes and types from visible courses (respects showHidden toggle)
  const { availablePrefixes, availableTypes } = useMemo(() => {
    const prefixes = new Set<string>();
    const types = new Set<string>();

    // Only compute from courses that would be visible with current showHidden setting
    const visibleCourses = showHidden ? courses : courses.filter((c) => !c.isHidden);

    visibleCourses.forEach((course) => {
      prefixes.add(getCoursePrefix(course.code));
      const courseType = getCourseType(course);
      if (courseType) types.add(courseType);
    });

    return {
      availablePrefixes: Array.from(prefixes).sort(),
      availableTypes: Array.from(types).sort(),
    };
  }, [courses, showHidden]);

  // Reset filters when selected option is no longer available
  useEffect(() => {
    if (prefixFilter !== 'all' && !availablePrefixes.includes(prefixFilter)) {
      console.debug('[CoursesPage] Resetting prefix filter - option no longer available:', prefixFilter);
      setPrefixFilter('all');
    }
    if (typeFilter !== 'all' && !availableTypes.includes(typeFilter)) {
      console.debug('[CoursesPage] Resetting type filter - option no longer available:', typeFilter);
      setTypeFilter('all');
    }
  }, [availablePrefixes, availableTypes, prefixFilter, typeFilter]);

  // Navigate to course detail - memoized to prevent unnecessary re-renders
  const handleCourseClick = useCallback((courseId: number) => {
    navigate(`/course/${courseId}`);
  }, [navigate]);

  // Save pinned courses when they change
  useEffect(() => {
    savePinnedCourses(pinnedCourses);
  }, [pinnedCourses]);

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
  const openColorPicker = (courseId: number, currentColor: string, e: React.MouseEvent) => {
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
    console.debug('[CoursesPage] Toggling hide for course:', courseId, 'from', currentlyHidden, 'to', !currentlyHidden);
    const result = await window.api.dispatch('UpdateCoursePreferences', {
      courseId,
      preferences: { isHidden: !currentlyHidden },
    });
    console.debug('[CoursesPage] Dispatch result:', result);
    await fetchCourses();
    console.debug('[CoursesPage] Courses after fetchCourses:', courses.length, 'hidden:', courses.filter(c => c.isHidden).length);
  };

  // Close color picker
  const closeColorPicker = () => {
    setColorPickerCourseId(null);
    setCustomColor('');
  };

  // Filter and sort courses
  const filteredCourses = useMemo(() => {
    let result = [...courses];

    // Filter by hidden status
    if (!showHidden) {
      result = result.filter((c) => !c.isHidden);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.code.toLowerCase().includes(query) ||
          (c.nickname && c.nickname.toLowerCase().includes(query))
      );
    }

    // Filter by grade status
    if (gradeFilter !== 'all') {
      result = result.filter((c) => getGradeStatus(c) === gradeFilter);
    }

    // Filter by prefix
    if (prefixFilter !== 'all') {
      result = result.filter((c) => getCoursePrefix(c.code) === prefixFilter);
    }

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter((c) => getCourseType(c) === typeFilter);
    }

    // Sort: apply custom order first, then pinned first, then alphabetically
    const orderedIds = sortByCustomOrder(result.map((c) => c.id));
    const orderMap = new Map(orderedIds.map((id, index) => [id, index]));

    result.sort((a, b) => {
      // Pinned courses always first
      const aPinned = pinnedCourses.has(a.id);
      const bPinned = pinnedCourses.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      // Then by custom order (if exists)
      const orderA = orderMap.get(a.id) ?? Infinity;
      const orderB = orderMap.get(b.id) ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;

      // Finally alphabetically
      return a.code.localeCompare(b.code);
    });

    return result;
  }, [courses, pinnedCourses, searchQuery, gradeFilter, prefixFilter, typeFilter, showHidden, sortByCustomOrder]);

  const pinnedCount = filteredCourses.filter((c) => pinnedCourses.has(c.id)).length;
  const hiddenCount = courses.filter((c) => c.isHidden).length;
  const hasActiveFilters = searchQuery || gradeFilter !== 'all' || prefixFilter !== 'all' || typeFilter !== 'all' || showHidden;

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
            {filteredCourses.length} of {courses.length} course{courses.length !== 1 ? 's' : ''}
            {pinnedCount > 0 && ` • ${pinnedCount} pinned`}
            {hiddenCount > 0 && !showHidden && ` • ${hiddenCount} hidden`}
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
              backgroundColor: hasActiveFilters ? 'var(--color-navy-light)' : 'var(--bg-card)',
              borderColor: hasActiveFilters ? 'var(--color-navy)' : 'var(--border-default)',
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
                backgroundColor: viewMode === 'grid' ? 'var(--color-navy)' : 'transparent',
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
                backgroundColor: viewMode === 'list' ? 'var(--color-navy)' : 'transparent',
                color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Filter Panel */}
      {showFilters && (
        <div style={styles.filterPanel}>
          {/* Prefix Filter */}
          {availablePrefixes.length > 1 && (
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Prefix</label>
              <select
                style={styles.filterSelect}
                value={prefixFilter}
                onChange={(e) => setPrefixFilter(e.target.value)}
              >
                <option value="all">All</option>
                {availablePrefixes.map((prefix) => (
                  <option key={prefix} value={prefix}>{prefix}</option>
                ))}
              </select>
            </div>
          )}

          {/* Type Filter */}
          {availableTypes.length > 0 && (
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Type</label>
              <div style={styles.filterChips}>
                <button
                  style={{
                    ...styles.filterChip,
                    backgroundColor: typeFilter === 'all' ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: typeFilter === 'all' ? 'white' : 'var(--text-secondary)',
                    borderColor: typeFilter === 'all' ? 'var(--color-navy)' : 'var(--border-default)',
                  }}
                  onClick={() => setTypeFilter('all')}
                >
                  All
                </button>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    style={{
                      ...styles.filterChip,
                      backgroundColor: typeFilter === type ? 'var(--color-navy)' : 'var(--bg-app)',
                      color: typeFilter === type ? 'white' : 'var(--text-secondary)',
                      borderColor: typeFilter === type ? 'var(--color-navy)' : 'var(--border-default)',
                    }}
                    onClick={() => setTypeFilter(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grade Status Filter */}
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Grade</label>
            <div style={styles.filterChips}>
              {(['all', 'on-track', 'at-risk', 'behind'] as GradeFilter[]).map((filter) => (
                <button
                  key={filter}
                  style={{
                    ...styles.filterChip,
                    backgroundColor: gradeFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: gradeFilter === filter ? 'white' : 'var(--text-secondary)',
                    borderColor: gradeFilter === filter ? 'var(--color-navy)' : 'var(--border-default)',
                  }}
                  onClick={() => setGradeFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter === 'on-track' ? 'On Track' : filter === 'at-risk' ? 'At Risk' : 'Behind'}
                </button>
              ))}
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
              }}
              onClick={() => setShowHidden(!showHidden)}
            >
              <EyeOff size={14} />
              Show Hidden ({hiddenCount})
            </button>
          </div>

          {hasActiveFilters && (
            <button style={styles.clearFiltersBtn} onClick={clearFilters}>
              <X size={14} />
              Clear All
            </button>
          )}
        </div>
      )}

      {/* Empty State - No courses at all */}
      {courses.length === 0 ? (
        <Card padding="lg">
          <div style={styles.emptyState}>
            <BookOpen size={64} color="var(--color-navy)" style={{ marginBottom: 'var(--space-4)' }} />
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
            <Search size={48} color="var(--text-muted)" style={{ marginBottom: 'var(--space-4)' }} />
            <h2 style={styles.emptyTitle}>No Courses Match</h2>
            <p style={styles.emptyText}>
              Try adjusting your search or filters.
            </p>
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
            return (
              <MemoizedCourseGridCard
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
                colorPickerValue={colorPickerCourseId === course.id ? customColor : undefined}
                onColorChange={handleColorChange}
                onColorInputChange={setCustomColor}
                onColorPickerClose={closeColorPicker}
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
            // For small lists, render directly (virtualization overhead not worth it)
            filteredCourses.map((course, index) => {
              const grades = getCachedCourseGrades(course.id, tasks);
              return (
                <MemoizedCourseListItem
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
                  colorPickerValue={colorPickerCourseId === course.id ? customColor : undefined}
                  onColorChange={handleColorChange}
                  onColorInputChange={setCustomColor}
                  onColorPickerClose={closeColorPicker}
                />
              );
            })
          ) : (
            // For large lists, use virtualization
            <VirtualList
              height={Math.min(filteredCourses.length * 80, 600)} // 80px per item, max 600px
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
              }}
            >
              {VirtualizedListItem}
            </VirtualList>
          )}
        </div>
      )}
    </div>
  );
}

interface CourseCardProps {
  course: Course;
  isPinned: boolean;
  earned: number;
  trend: number;
  assessed: number;
  onTogglePin: (courseId: number, e: React.MouseEvent) => void;
  onToggleHide: (courseId: number, currentlyHidden: boolean) => void;
  onClick: () => void;
  onColorClick?: (courseId: number, currentColor: string, e: React.MouseEvent) => void;
  showColorPicker?: boolean;
  colorPickerValue?: string;
  onColorChange?: (courseId: number, color: string) => void;
  onColorInputChange?: (value: string) => void;
  onColorPickerClose?: () => void;
  // Drag-and-drop props
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
}

function CourseGridCard({
  course,
  isPinned,
  earned,
  trend,
  assessed,
  onTogglePin,
  onToggleHide,
  onClick,
  onColorClick,
  showColorPicker,
  colorPickerValue,
  onColorChange,
  onColorInputChange,
  onColorPickerClose,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: CourseCardProps) {
  const color = getCourseColor(course.id, course.color);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!showColorPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        onColorPickerClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker, onColorPickerClose]);

  return (
    <div
      style={{
        ...styles.gridCard,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDragOver ? '0 0 0 2px var(--color-blue)' : 'var(--shadow-card)',
        transition: 'box-shadow 150ms ease, opacity 150ms ease',
      }}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Color accent bar - click to change color */}
      <div
        style={{ ...styles.colorBar, backgroundColor: color, cursor: 'pointer', position: 'relative' }}
        onClick={(e) => onColorClick?.(course.id, color, e)}
        title="Click to change color"
      >
        {showColorPicker && (
          <div ref={colorPickerRef} style={styles.colorPickerPopup} onClick={(e) => e.stopPropagation()}>
            {/* Preset colors */}
            <div style={styles.colorPresets}>
              {COURSE_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  style={{
                    ...styles.colorPresetBtn,
                    backgroundColor: presetColor,
                    border: colorPickerValue === presetColor ? '2px solid var(--text-primary)' : '2px solid transparent',
                  }}
                  onClick={() => onColorChange?.(course.id, presetColor)}
                  title={presetColor}
                />
              ))}
            </div>
            {/* Custom HEX input */}
            <div style={styles.hexInputRow}>
              <span style={styles.hexLabel}>HEX</span>
              <input
                type="text"
                value={colorPickerValue || color}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.match(/^#?[0-9A-Fa-f]{0,6}$/)) {
                    onColorInputChange?.(val);
                  }
                }}
                onBlur={(e) => {
                  let val = e.target.value.trim();
                  if (!val.startsWith('#')) val = '#' + val;
                  if (val.match(/^#[0-9A-Fa-f]{6}$/)) {
                    onColorChange?.(course.id, val.toUpperCase());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    let val = (e.target as HTMLInputElement).value.trim();
                    if (!val.startsWith('#')) val = '#' + val;
                    if (val.match(/^#[0-9A-Fa-f]{6}$/)) {
                      onColorChange?.(course.id, val.toUpperCase());
                    }
                  }
                }}
                style={styles.hexInput}
                placeholder="#007FA3"
                maxLength={7}
              />
              <input
                type="color"
                value={colorPickerValue || color}
                onChange={(e) => onColorChange?.(course.id, e.target.value.toUpperCase())}
                style={styles.nativeColorPicker}
                title="Use color picker"
              />
            </div>
          </div>
        )}
      </div>

      {/* Use display: contents to allow children to participate in parent grid */}
      <div style={styles.gridCardContent}>
        {/* Header row - Grid row 1 */}
        <div style={styles.gridCardHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {/* Drag handle */}
            <div
              style={styles.dragHandle}
              title="Drag to reorder"
              data-drag-handle
            >
              <GripVertical size={14} />
            </div>
            <span style={{ ...styles.courseCodeBadge, backgroundColor: color }}>
              {getShortCode(course.code)}
            </span>
            <InfoTrigger
              summary={`${course.code} - ${course.nickname || course.name}`}
              title={course.code}
              details={
                <div>
                  <p><strong>Full Name:</strong> {course.name}</p>
                  {course.nickname && <p><strong>Nickname:</strong> {course.nickname}</p>}
                  <p><strong>Target Grade:</strong> {course.targetGrade}%</p>
                  <p><strong>Current Grade:</strong> {course.currentGrade !== null ? `${course.currentGrade.toFixed(1)}%` : 'Not yet assessed'}</p>
                  {course.assessedGrade !== null && (
                    <p><strong>Assessed Grade:</strong> {course.assessedGrade.toFixed(1)}%</p>
                  )}
                  {course.lastSyncedAt && (
                    <p><strong>Last Synced:</strong> {new Date(course.lastSyncedAt).toLocaleString()}</p>
                  )}
                </div>
              }
              size="sm"
              position="right"
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button
              style={{
                ...styles.pinButton,
                color: course.isHidden ? 'var(--color-medium)' : 'var(--text-muted)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleHide(course.id, course.isHidden);
              }}
              title={course.isHidden ? 'Show course' : 'Hide course'}
            >
              {course.isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              style={{
                ...styles.pinButton,
                color: isPinned ? 'var(--color-navy)' : 'var(--text-muted)',
              }}
              onClick={(e) => onTogglePin(course.id, e)}
              title={isPinned ? 'Unpin course' : 'Pin course'}
            >
              {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
            </button>
          </div>
        </div>

        {/* Course name - Grid row 2 */}
        <h3 style={styles.gridCourseName}>
          {course.nickname || course.name}
        </h3>

        {/* Full code - Grid row 3 (flex spacer) */}
        <span style={styles.fullCode}>{course.code}</span>

        {/* Stats - Grid row 4 */}
        <div style={styles.gridStats}>
          <div style={styles.gridStatItem}>
            <Target size={14} color="var(--text-muted)" />
            <span style={styles.gridStatLabel}>Target</span>
            <span style={styles.gridStatValue}>{course.targetGrade}%</span>
          </div>
          {assessed > 0 && (
            <>
              <div style={styles.gridStatItem}>
                <span style={styles.gridStatLabel}>Earned</span>
                <span
                  style={{
                    ...styles.gridStatValue,
                    color:
                      trend >= course.targetGrade
                        ? 'var(--color-success)'
                        : trend >= course.targetGrade - 10
                        ? 'var(--color-medium)'
                        : 'var(--color-high)',
                  }}
                >
                  {earned.toFixed(1)}%
                </span>
              </div>
              <div style={styles.gridStatItem}>
                <span style={styles.gridStatLabel}>Trend</span>
                <span
                  style={{
                    ...styles.gridStatValue,
                    color:
                      trend >= course.targetGrade
                        ? 'var(--color-success)'
                        : trend >= course.targetGrade - 10
                        ? 'var(--color-medium)'
                        : 'var(--color-high)',
                  }}
                >
                  {trend.toFixed(1)}%
                </span>
              </div>
            </>
          )}
        </div>

        {/* Sync time - Grid row 5 */}
        <div style={styles.syncTime}>
          {course.lastSyncedAt ? `Synced ${new Date(course.lastSyncedAt).toLocaleDateString()}` : '\u00A0'}
        </div>
      </div>
    </div>
  );
}

interface CourseListItemProps extends CourseCardProps {
  isFirst: boolean;
}

function CourseListItem({
  course,
  isPinned,
  earned,
  trend,
  assessed,
  onTogglePin,
  onToggleHide,
  isFirst,
  onClick,
  onColorClick,
  showColorPicker,
  colorPickerValue,
  onColorChange,
  onColorInputChange,
  onColorPickerClose,
}: CourseListItemProps) {
  const color = getCourseColor(course.id, course.color);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!showColorPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        onColorPickerClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker, onColorPickerClose]);

  return (
    <div
      style={{
        ...styles.listItem,
        borderTop: isFirst ? 'none' : '1px solid var(--border-light)',
      }}
      onClick={onClick}
    >
      {/* Color indicator */}
      {/* Color indicator - click to change color */}
      <div style={{ position: 'relative' }}>
        <button
          style={{ ...styles.listColorDot, backgroundColor: color, cursor: 'pointer', border: 'none' }}
          onClick={(e) => onColorClick?.(course.id, color, e)}
          title="Click to change color"
        />
        {showColorPicker && (
          <div ref={colorPickerRef} style={styles.colorPickerPopupList} onClick={(e) => e.stopPropagation()}>
            {/* Preset colors */}
            <div style={styles.colorPresets}>
              {COURSE_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  style={{
                    ...styles.colorPresetBtn,
                    backgroundColor: presetColor,
                    border: colorPickerValue === presetColor ? '2px solid var(--text-primary)' : '2px solid transparent',
                  }}
                  onClick={() => onColorChange?.(course.id, presetColor)}
                  title={presetColor}
                />
              ))}
            </div>
            {/* Custom HEX input */}
            <div style={styles.hexInputRow}>
              <span style={styles.hexLabel}>HEX</span>
              <input
                type="text"
                value={colorPickerValue || color}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.match(/^#?[0-9A-Fa-f]{0,6}$/)) {
                    onColorInputChange?.(val);
                  }
                }}
                onBlur={(e) => {
                  let val = e.target.value.trim();
                  if (!val.startsWith('#')) val = '#' + val;
                  if (val.match(/^#[0-9A-Fa-f]{6}$/)) {
                    onColorChange?.(course.id, val.toUpperCase());
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    let val = (e.target as HTMLInputElement).value.trim();
                    if (!val.startsWith('#')) val = '#' + val;
                    if (val.match(/^#[0-9A-Fa-f]{6}$/)) {
                      onColorChange?.(course.id, val.toUpperCase());
                    }
                  }
                }}
                style={styles.hexInput}
                placeholder="#007FA3"
                maxLength={7}
              />
              <input
                type="color"
                value={colorPickerValue || color}
                onChange={(e) => onColorChange?.(course.id, e.target.value.toUpperCase())}
                style={styles.nativeColorPicker}
                title="Use color picker"
              />
            </div>
          </div>
        )}
      </div>

      {/* Course info */}
      <div style={styles.listInfo}>
        <div style={styles.listHeader}>
          <span style={{ ...styles.listCodeBadge, backgroundColor: color }}>
            {getShortCode(course.code)}
          </span>
          <span style={styles.listFullCode}>{course.code}</span>
          <InfoTrigger
            summary={`${course.code} - ${course.nickname || course.name}`}
            title={course.code}
            details={
              <div>
                <p><strong>Full Name:</strong> {course.name}</p>
                {course.nickname && <p><strong>Nickname:</strong> {course.nickname}</p>}
                <p><strong>Target Grade:</strong> {course.targetGrade}%</p>
                <p><strong>Current Grade:</strong> {course.currentGrade !== null ? `${course.currentGrade.toFixed(1)}%` : 'Not yet assessed'}</p>
                {course.assessedGrade !== null && (
                  <p><strong>Assessed Grade:</strong> {course.assessedGrade.toFixed(1)}%</p>
                )}
                {course.lastSyncedAt && (
                  <p><strong>Last Synced:</strong> {new Date(course.lastSyncedAt).toLocaleString()}</p>
                )}
              </div>
            }
            size="sm"
            position="right"
          />
        </div>
        <h3 style={styles.listCourseName}>
          {course.nickname || course.name}
        </h3>
      </div>

      {/* Grades */}
      <div style={styles.listGrades}>
        <div style={styles.listGradeItem}>
          <span style={styles.listGradeLabel}>Target</span>
          <span style={styles.listGradeValue}>{course.targetGrade}%</span>
        </div>
        {assessed > 0 && (
          <>
            <div style={styles.listGradeItem}>
              <span style={styles.listGradeLabel}>Earned</span>
              <span
                style={{
                  ...styles.listGradeValue,
                  color:
                    trend >= course.targetGrade
                      ? 'var(--color-success)'
                      : trend >= course.targetGrade - 10
                      ? 'var(--color-medium)'
                      : 'var(--color-high)',
                }}
              >
                {earned.toFixed(1)}%
              </span>
            </div>
            <div style={styles.listGradeItem}>
              <span style={styles.listGradeLabel}>Trend</span>
              <span
                style={{
                  ...styles.listGradeValue,
                  color:
                    trend >= course.targetGrade
                      ? 'var(--color-success)'
                      : trend >= course.targetGrade - 10
                      ? 'var(--color-medium)'
                      : 'var(--color-high)',
                }}
              >
                {trend.toFixed(1)}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div style={styles.listActions}>
        <button
          style={{
            ...styles.pinButton,
            color: course.isHidden ? 'var(--color-medium)' : 'var(--text-muted)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide(course.id, course.isHidden);
          }}
          title={course.isHidden ? 'Show course' : 'Hide course'}
        >
          {course.isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          style={{
            ...styles.pinButton,
            color: isPinned ? 'var(--color-navy)' : 'var(--text-muted)',
          }}
          onClick={(e) => onTogglePin(course.id, e)}
          title={isPinned ? 'Unpin course' : 'Pin course'}
        >
          {isPinned ? <Pin size={16} /> : <PinOff size={16} />}
        </button>
        <ChevronRight size={18} color="var(--text-muted)" />
      </div>
    </div>
  );
}

// Memoized components to prevent unnecessary re-renders
const MemoizedCourseGridCard = React.memo(CourseGridCard);
const MemoizedCourseListItem = React.memo(CourseListItem);

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

  return (
    <div style={style}>
      <MemoizedCourseListItem
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
        colorPickerValue={data.colorPickerCourseId === course.id ? data.customColor : undefined}
        onColorChange={data.handleColorChange}
        onColorInputChange={data.setCustomColor}
        onColorPickerClose={data.closeColorPicker}
      />
    </div>
  );
}

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
