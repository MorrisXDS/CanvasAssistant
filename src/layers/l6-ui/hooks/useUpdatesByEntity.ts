/**
 * useUpdatesByEntity Hook
 * Groups sync updates by course and folder for notification dot display
 *
 * Usage:
 *   const updatesByCourse = useUpdatesByCourse();
 *   const updatesByFolder = useUpdatesByFolder(courseId);
 *   const taskUpdates = useTaskUpdates();
 *   const fieldUpdates = useTaskFieldUpdates(taskId);
 */

import { useMemo } from 'react';
import { useStore } from '../../l5-presentation/store';
import { getCourseColor } from '../constants';
import {
  type UpdateType,
  getPriorityUpdateType,
} from '../components/shared/NotificationDot';

/** Course update summary for notification dots */
export interface CourseUpdateSummary {
  /** Course color (hex) */
  color: string;
  /** Number of unseen updates */
  count: number;
  /** Whether any update requires action (queued task) */
  hasActionRequired: boolean;
}

/** Folder update summary for notification dots */
export interface FolderUpdateSummary {
  /** Number of unseen updates in this folder */
  count: number;
  /** Whether any update requires action */
  hasActionRequired: boolean;
}

/**
 * Groups sync updates by course ID
 * Returns a Map of courseId -> { color, count, hasActionRequired }
 *
 * Only includes unseen updates (seenAt is null)
 */
export function useUpdatesByCourse(): Map<number, CourseUpdateSummary> {
  const { syncUpdates, courses } = useStore();

  return useMemo(() => {
    const map = new Map<number, CourseUpdateSummary>();

    // Build course color lookup
    const courseColorMap = new Map<number, string>();
    for (const course of courses) {
      courseColorMap.set(course.id, getCourseColor(course.id, course.color));
    }

    // Group updates by course
    for (const update of syncUpdates.updates) {
      // Only include unseen updates
      if (update.seenAt !== null) continue;

      const courseId = update.courseId;
      const existing = map.get(courseId);

      if (existing) {
        existing.count++;
        if (update.isActionRequired) {
          existing.hasActionRequired = true;
        }
      } else {
        // Get color from update (joined field) or fall back to course lookup
        const color =
          update.courseColor || courseColorMap.get(courseId) || getCourseColor(courseId);

        map.set(courseId, {
          color,
          count: 1,
          hasActionRequired: update.isActionRequired || false,
        });
      }
    }

    return map;
  }, [syncUpdates.updates, courses]);
}

/**
 * Groups file/page sync updates by folder path for a specific course
 * Returns a Map of folderPath -> { count, hasActionRequired }
 *
 * @param courseId - Course to filter updates for
 */
export function useUpdatesByFolder(courseId: number): Map<string, FolderUpdateSummary> {
  const { syncUpdates } = useStore();

  return useMemo(() => {
    const map = new Map<string, FolderUpdateSummary>();

    for (const update of syncUpdates.updates) {
      // Only file and page updates for this course
      if (update.courseId !== courseId) continue;
      if (update.entityType !== 'file' && update.entityType !== 'page') continue;
      if (update.seenAt !== null) continue;

      // Extract folder path from subtitle or use root
      // subtitle typically contains the folder path for file updates
      const folderPath = update.subtitle || '';

      const existing = map.get(folderPath);
      if (existing) {
        existing.count++;
        if (update.isActionRequired) {
          existing.hasActionRequired = true;
        }
      } else {
        map.set(folderPath, {
          count: 1,
          hasActionRequired: update.isActionRequired || false,
        });
      }
    }

    return map;
  }, [syncUpdates.updates, courseId]);
}

/**
 * Get total update count for specific entity types
 * Useful for nav item badges
 */
export function useUpdateCountByType(entityTypes: string[]): {
  total: number;
  hasActionRequired: boolean;
} {
  const { syncUpdates } = useStore();

  return useMemo(() => {
    let total = 0;
    let hasActionRequired = false;

    for (const update of syncUpdates.updates) {
      if (update.seenAt !== null) continue;
      if (!entityTypes.includes(update.entityType)) continue;

      total++;
      if (update.isActionRequired) {
        hasActionRequired = true;
      }
    }

    return { total, hasActionRequired };
  }, [syncUpdates.updates, entityTypes]);
}

/**
 * Get dots data for sidebar navigation
 * Returns array of { color, hasActionRequired } for rendering NotificationDotGroup
 */
export function useSidebarDots(): Array<{ color: string; hasActionRequired: boolean }> {
  const updatesByCourse = useUpdatesByCourse();

  return useMemo(() => {
    const dots: Array<{ color: string; hasActionRequired: boolean }> = [];

    // Sort by hasActionRequired first (action required items show first)
    const sortedEntries = Array.from(updatesByCourse.entries()).sort(([, a], [, b]) => {
      if (a.hasActionRequired && !b.hasActionRequired) return -1;
      if (!a.hasActionRequired && b.hasActionRequired) return 1;
      return 0;
    });

    for (const [, summary] of sortedEntries) {
      dots.push({
        color: summary.color,
        hasActionRequired: summary.hasActionRequired,
      });
    }

    return dots;
  }, [updatesByCourse]);
}

/**
 * Check if a specific course has unseen updates
 */
export function useCourseHasUpdates(courseId: number): {
  hasUpdates: boolean;
  count: number;
  hasActionRequired: boolean;
  color: string;
} {
  const updatesByCourse = useUpdatesByCourse();

  return useMemo(() => {
    const summary = updatesByCourse.get(courseId);
    if (!summary) {
      return { hasUpdates: false, count: 0, hasActionRequired: false, color: '' };
    }
    return {
      hasUpdates: true,
      count: summary.count,
      hasActionRequired: summary.hasActionRequired,
      color: summary.color,
    };
  }, [updatesByCourse, courseId]);
}

/**
 * Get dots data specifically for file/page updates
 * Returns array of { color, hasActionRequired } for courses with file updates
 */
export function useFileUpdateDots(): Array<{
  color: string;
  hasActionRequired: boolean;
}> {
  const { syncUpdates, courses } = useStore();

  return useMemo(() => {
    // Build course color lookup
    const courseColorMap = new Map<number, string>();
    for (const course of courses) {
      courseColorMap.set(course.id, getCourseColor(course.id, course.color));
    }

    // Group file/page updates by course
    const courseUpdates = new Map<
      number,
      { color: string; hasActionRequired: boolean }
    >();

    for (const update of syncUpdates.updates) {
      if (update.seenAt !== null) continue;
      if (update.entityType !== 'file' && update.entityType !== 'page') continue;

      const courseId = update.courseId;
      if (!courseUpdates.has(courseId)) {
        const color =
          update.courseColor || courseColorMap.get(courseId) || getCourseColor(courseId);
        courseUpdates.set(courseId, {
          color,
          hasActionRequired: update.isActionRequired || false,
        });
      } else if (update.isActionRequired) {
        courseUpdates.get(courseId)!.hasActionRequired = true;
      }
    }

    // Sort by hasActionRequired first
    return Array.from(courseUpdates.values()).sort((a, b) => {
      if (a.hasActionRequired && !b.hasActionRequired) return -1;
      if (!a.hasActionRequired && b.hasActionRequired) return 1;
      return 0;
    });
  }, [syncUpdates.updates, courses]);
}

// =============================================================================
// Task Update Hooks - For item and field-level notification dots
// =============================================================================

/** Task update summary for notification dots */
export interface TaskUpdateSummary {
  /** Highest priority update type for this task */
  updateType: UpdateType;
  /** List of changed fields (for 'updated' items) */
  changedFields: string[];
  /** Whether this task has a grade change */
  hasGradeChange: boolean;
  /** Whether this task has a conflict requiring action */
  hasConflict: boolean;
  /** IDs of the sync update records (for marking as seen) */
  updateIds: number[];
}

/** Field update info for field-level dots */
export interface FieldUpdateInfo {
  /** Update type for this field */
  updateType: UpdateType;
  /** Previous value */
  oldValue: string | null;
  /** New value */
  newValue: string | null;
  /** Sync update record ID */
  updateId: number;
}

/**
 * Map changeType string to UpdateType
 */
function changeTypeToUpdateType(changeType: string): UpdateType {
  switch (changeType) {
    case 'new':
      return 'new';
    case 'updated':
      return 'updated';
    case 'grade_changed':
      return 'grade_changed';
    case 'conflict':
      return 'conflict';
    default:
      return 'updated';
  }
}

/**
 * Get task updates grouped by task ID
 * Returns a Map of taskId -> TaskUpdateSummary
 *
 * Includes tasks, grades, and conflicts related to tasks
 */
export function useTaskUpdates(): Map<number, TaskUpdateSummary> {
  const { syncUpdates } = useStore();

  return useMemo(() => {
    const map = new Map<number, TaskUpdateSummary>();

    for (const update of syncUpdates.updates) {
      // Only unseen updates for task-related entities
      if (update.seenAt !== null) continue;
      if (
        update.entityType !== 'task' &&
        update.entityType !== 'grade' &&
        update.entityType !== 'conflict'
      ) {
        continue;
      }

      const taskId = update.entityId;
      const updateType = changeTypeToUpdateType(update.changeType);

      const existing = map.get(taskId);
      if (existing) {
        // Update with higher priority type
        existing.updateType = getPriorityUpdateType(existing.updateType, updateType);
        existing.updateIds.push(update.id);

        if (update.changeType === 'grade_changed') {
          existing.hasGradeChange = true;
        }
        if (update.changeType === 'conflict') {
          existing.hasConflict = true;
        }
        if (update.changedField) {
          existing.changedFields.push(update.changedField);
        }
      } else {
        map.set(taskId, {
          updateType,
          changedFields: update.changedField ? [update.changedField] : [],
          hasGradeChange: update.changeType === 'grade_changed',
          hasConflict: update.changeType === 'conflict',
          updateIds: [update.id],
        });
      }
    }

    return map;
  }, [syncUpdates.updates]);
}

/**
 * Get file updates grouped by file ID
 * Returns a Map of fileId -> { updateType, updateIds }
 */
export function useFileUpdates(): Map<
  number,
  { updateType: UpdateType; updateIds: number[] }
> {
  const { syncUpdates } = useStore();

  return useMemo(() => {
    const map = new Map<number, { updateType: UpdateType; updateIds: number[] }>();

    for (const update of syncUpdates.updates) {
      // Only unseen file/page updates
      if (update.seenAt !== null) continue;
      if (update.entityType !== 'file' && update.entityType !== 'page') continue;

      const fileId = update.entityId;
      const updateType = changeTypeToUpdateType(update.changeType);

      const existing = map.get(fileId);
      if (existing) {
        existing.updateType = getPriorityUpdateType(existing.updateType, updateType);
        existing.updateIds.push(update.id);
      } else {
        map.set(fileId, {
          updateType,
          updateIds: [update.id],
        });
      }
    }

    return map;
  }, [syncUpdates.updates]);
}

/**
 * Get field-level updates for a specific task
 * Returns null if the task is 'new' (no field dots needed for new items)
 * Returns a Map of fieldName -> FieldUpdateInfo for updated tasks
 *
 * @param taskId - The task ID to get field updates for
 */
export function useTaskFieldUpdates(
  taskId: number | null
): Map<string, FieldUpdateInfo> | null {
  const { syncUpdates } = useStore();

  return useMemo(() => {
    if (taskId === null) return null;

    // First check if task is new (no field dots for new items)
    let isNew = false;
    const fieldMap = new Map<string, FieldUpdateInfo>();

    for (const update of syncUpdates.updates) {
      if (update.seenAt !== null) continue;
      if (update.entityId !== taskId) continue;
      if (
        update.entityType !== 'task' &&
        update.entityType !== 'grade' &&
        update.entityType !== 'conflict'
      ) {
        continue;
      }

      // If any update for this task is 'new', skip field dots entirely
      if (update.changeType === 'new') {
        isNew = true;
        break;
      }

      // Get the field name - changedField for updates, conflictField for conflicts
      const fieldName = update.changedField || update.conflictField;
      if (!fieldName) continue;

      const updateType = changeTypeToUpdateType(update.changeType);

      const existing = fieldMap.get(fieldName);
      if (existing) {
        // Keep higher priority update type
        const priorityType = getPriorityUpdateType(existing.updateType, updateType);
        if (priorityType !== existing.updateType) {
          fieldMap.set(fieldName, {
            updateType: priorityType,
            oldValue: update.oldValue,
            newValue: update.newValue,
            updateId: update.id,
          });
        }
      } else {
        fieldMap.set(fieldName, {
          updateType,
          oldValue: update.oldValue ?? null,
          newValue: update.newValue ?? null,
          updateId: update.id,
        });
      }
    }

    // Return null for new tasks (no field dots)
    if (isNew) return null;

    // Return null if no field updates
    if (fieldMap.size === 0) return null;

    return fieldMap;
  }, [syncUpdates.updates, taskId]);
}

/**
 * Check if a specific task has unseen updates
 * Convenience hook for simple task-level dot display
 */
export function useTaskHasUpdates(taskId: number): {
  hasUpdates: boolean;
  updateType: UpdateType | null;
  hasConflict: boolean;
  updateIds: number[];
} {
  const taskUpdates = useTaskUpdates();

  return useMemo(() => {
    const summary = taskUpdates.get(taskId);
    if (!summary) {
      return { hasUpdates: false, updateType: null, hasConflict: false, updateIds: [] };
    }
    return {
      hasUpdates: true,
      updateType: summary.updateType,
      hasConflict: summary.hasConflict,
      updateIds: summary.updateIds,
    };
  }, [taskUpdates, taskId]);
}

/**
 * Check if a specific file has unseen updates
 */
export function useFileHasUpdates(fileId: number): {
  hasUpdates: boolean;
  updateType: UpdateType | null;
  updateIds: number[];
} {
  const fileUpdates = useFileUpdates();

  return useMemo(() => {
    const summary = fileUpdates.get(fileId);
    if (!summary) {
      return { hasUpdates: false, updateType: null, updateIds: [] };
    }
    return {
      hasUpdates: true,
      updateType: summary.updateType,
      updateIds: summary.updateIds,
    };
  }, [fileUpdates, fileId]);
}
