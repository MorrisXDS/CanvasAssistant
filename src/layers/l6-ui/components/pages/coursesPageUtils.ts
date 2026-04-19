/**
 * Courses Page Utilities
 * Helper functions for course processing and filtering
 */

import type { Course } from '../../../l5-presentation/types';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('CoursesPageUtils');

export type ViewMode = 'grid' | 'list';
export type GradeFilter = 'all' | 'on-track' | 'at-risk' | 'behind';

/**
 * Get shortened course code (e.g., "CSC108" from "CSC108H1 F")
 */
export function getShortCode(code: string): string {
  // Stop before a letter followed by a digit and then space/end (e.g., "H1 " or "Y1")
  const match = code.match(/^(.+?)(?=[A-Z]\d(?:\s|$))/i);
  return match ? match[1] : code.split(/\s/)[0];
}

/**
 * Get grade status for a course
 */
export function getGradeStatus(
  course: Course
): 'on-track' | 'at-risk' | 'behind' | 'unknown' {
  if (course.currentGrade === null) return 'unknown';
  if (course.currentGrade >= course.targetGrade) return 'on-track';
  if (course.currentGrade >= course.targetGrade - 10) return 'at-risk';
  return 'behind';
}

/**
 * Extract course prefix (e.g., "CSC" from "CSC108H1")
 */
export function getCoursePrefix(code: string): string {
  const match = code.match(/^([A-Z]{2,4})/i);
  return match ? match[1].toUpperCase() : code.slice(0, 3).toUpperCase();
}

/**
 * Extract course type (LEC, TUT, PRA) from name or code
 */
export function getCourseType(course: Course): string | null {
  const combined = `${course.code} ${course.name}`.toUpperCase();
  if (combined.includes('LEC')) return 'LEC';
  if (combined.includes('TUT')) return 'TUT';
  if (combined.includes('PRA')) return 'PRA';
  if (combined.includes('LAB')) return 'LAB';
  if (combined.includes('SEM')) return 'SEM';
  return null;
}

/**
 * Load pinned courses from localStorage
 */
export function loadPinnedCourses(): Set<number> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PINNED_COURSES);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    logger.error('Failed to load pinned courses', e instanceof Error ? e : undefined);
  }
  return new Set();
}

/**
 * Save pinned courses to localStorage
 */
export function savePinnedCourses(pinned: Set<number>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PINNED_COURSES, JSON.stringify([...pinned]));
  } catch (e) {
    logger.error('Failed to save pinned courses', e instanceof Error ? e : undefined);
  }
}

/**
 * Load course settings from localStorage
 */
export function loadCourseSettings(): {
  defaultViewMode: ViewMode;
  showHiddenByDefault: boolean;
} {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.COURSES);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        defaultViewMode: parsed.defaultViewMode || 'grid',
        showHiddenByDefault: parsed.showHiddenByDefault || false,
      };
    }
  } catch (e) {
    logger.error('Failed to load course settings', e instanceof Error ? e : undefined);
  }
  return { defaultViewMode: 'grid', showHiddenByDefault: false };
}

/**
 * Load remembered view mode (user's last selection takes priority over default)
 */
export function loadViewMode(pageKey: string, defaultMode: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(`viewMode:${pageKey}`);
    if (stored === 'grid' || stored === 'list') {
      return stored;
    }
  } catch (e) {
    logger.error('Failed to load view mode', e instanceof Error ? e : undefined);
  }
  return defaultMode;
}

/**
 * Save view mode when user changes it
 */
export function saveViewMode(pageKey: string, mode: ViewMode): void {
  try {
    localStorage.setItem(`viewMode:${pageKey}`, mode);
  } catch (e) {
    logger.error('Failed to save view mode', e instanceof Error ? e : undefined);
  }
}

/**
 * Get available prefixes and types from courses
 */
export function getAvailableFilters(
  courses: Course[],
  showHidden: boolean
): { availablePrefixes: string[]; availableTypes: string[] } {
  const prefixes = new Set<string>();
  const types = new Set<string>();

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
}

/**
 * Filter and sort courses based on criteria
 */
export function filterAndSortCourses(
  courses: Course[],
  options: {
    showHidden: boolean;
    searchQuery: string;
    gradeFilter: GradeFilter;
    prefixFilter: string;
    typeFilter: string;
    pinnedCourses: Set<number>;
    sortByCustomOrder: (ids: number[]) => number[];
    /** Course IDs that should remain visible even if isHidden — used for
     *  "keep-in-place on hide" so Shift+H can instantly undo before the card
     *  disappears from view. */
    keepVisibleIds?: Set<number>;
  }
): Course[] {
  let result = [...courses];

  // Filter by hidden status (keepVisibleIds bypasses the filter for specific rows)
  if (!options.showHidden) {
    result = result.filter((c) => !c.isHidden || options.keepVisibleIds?.has(c.id));
  }

  // Filter by search query
  if (options.searchQuery.trim()) {
    const query = options.searchQuery.toLowerCase();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query) ||
        (c.nickname && c.nickname.toLowerCase().includes(query))
    );
  }

  // Filter by grade status
  if (options.gradeFilter !== 'all') {
    result = result.filter((c) => getGradeStatus(c) === options.gradeFilter);
  }

  // Filter by prefix
  if (options.prefixFilter !== 'all') {
    result = result.filter((c) => getCoursePrefix(c.code) === options.prefixFilter);
  }

  // Filter by type
  if (options.typeFilter !== 'all') {
    result = result.filter((c) => getCourseType(c) === options.typeFilter);
  }

  // Sort: apply custom order first, then pinned first, then alphabetically
  const orderedIds = options.sortByCustomOrder(result.map((c) => c.id));
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));

  result.sort((a, b) => {
    // Pinned courses always first
    const aPinned = options.pinnedCourses.has(a.id);
    const bPinned = options.pinnedCourses.has(b.id);
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
}
