/**
 * useFolderDragDrop - Hook for drag-and-drop folder reordering within a course
 * Children cannot leave their parent course scope.
 * Persists order to localStorage per course.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createLogger } from '../../utils/rendererLogger';

const log = createLogger('useFolderDragDrop');

const STORAGE_KEY = 'folderOrder';

interface FolderOrderMap {
  [courseId: number]: string[];
}

/**
 * Load folder order from localStorage
 */
function loadFolderOrder(): FolderOrderMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    log.error('Failed to load folder order', e instanceof Error ? e : undefined);
  }
  return {};
}

/**
 * Save folder order to localStorage
 */
function saveFolderOrder(order: FolderOrderMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch (e) {
    log.error('Failed to save folder order', e instanceof Error ? e : undefined);
  }
}

export function useFolderDragDrop() {
  // Custom order stored in localStorage (folder paths per course)
  const [folderOrderMap, setFolderOrderMap] = useState<FolderOrderMap>(() =>
    loadFolderOrder()
  );

  // Active drag state
  const [draggedFolder, setDraggedFolder] = useState<{
    courseId: number;
    path: string;
  } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<{
    courseId: number;
    path: string;
  } | null>(null);

  /**
   * Get custom order for a specific course
   */
  const getCustomOrder = useCallback(
    (courseId: number): string[] => {
      return folderOrderMap[courseId] || [];
    },
    [folderOrderMap]
  );

  /**
   * Sort folder paths by custom order for a course
   */
  const sortFoldersByCustomOrder = useCallback(
    (courseId: number, folderPaths: string[]): string[] => {
      const customOrder = getCustomOrder(courseId);
      if (customOrder.length === 0) return folderPaths;

      const orderMap = new Map(customOrder.map((path, index) => [path, index]));
      return [...folderPaths].sort((a, b) => {
        const orderA = orderMap.get(a) ?? Infinity;
        const orderB = orderMap.get(b) ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        // Fall back to alphabetical if not in custom order
        return a.localeCompare(b);
      });
    },
    [getCustomOrder]
  );

  /**
   * Handle drag start - only allow dragging within same course
   */
  const handleDragStart = useCallback(
    (e: React.DragEvent, courseId: number, folderPath: string) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ courseId, folderPath }));
      setDraggedFolder({ courseId, path: folderPath });
    },
    []
  );

  /**
   * Handle drag over - only allow if same course
   */
  const handleDragOver = useCallback(
    (e: React.DragEvent, courseId: number, folderPath: string) => {
      // Only allow drop within same course
      if (draggedFolder && draggedFolder.courseId !== courseId) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (
        draggedFolder &&
        (draggedFolder.path !== folderPath || draggedFolder.courseId !== courseId)
      ) {
        setDragOverFolder({ courseId, path: folderPath });
      }
    },
    [draggedFolder]
  );

  /**
   * Handle drag leave
   */
  const handleDragLeave = useCallback(() => {
    setDragOverFolder(null);
  }, []);

  /**
   * Handle drag end
   */
  const handleDragEnd = useCallback(() => {
    setDraggedFolder(null);
    setDragOverFolder(null);
  }, []);

  /**
   * Handle drop - swap positions within same course
   */
  const handleDrop = useCallback(
    (
      e: React.DragEvent,
      targetCourseId: number,
      targetFolderPath: string,
      allFolderPaths: string[]
    ) => {
      e.preventDefault();

      if (!draggedFolder) {
        setDraggedFolder(null);
        setDragOverFolder(null);
        return;
      }

      // Don't allow cross-course drops
      if (draggedFolder.courseId !== targetCourseId) {
        setDraggedFolder(null);
        setDragOverFolder(null);
        return;
      }

      // Don't process same folder
      if (draggedFolder.path === targetFolderPath) {
        setDraggedFolder(null);
        setDragOverFolder(null);
        return;
      }

      // Get current order or initialize from provided paths
      let currentOrder = folderOrderMap[targetCourseId];
      if (!currentOrder || currentOrder.length === 0) {
        currentOrder = [...allFolderPaths];
      }

      // Ensure both folders are in the order array
      if (!currentOrder.includes(draggedFolder.path)) {
        currentOrder.push(draggedFolder.path);
      }
      if (!currentOrder.includes(targetFolderPath)) {
        currentOrder.push(targetFolderPath);
      }

      // Swap positions
      const draggedIndex = currentOrder.indexOf(draggedFolder.path);
      const targetIndex = currentOrder.indexOf(targetFolderPath);

      const newOrder = [...currentOrder];
      newOrder[draggedIndex] = targetFolderPath;
      newOrder[targetIndex] = draggedFolder.path;

      // Update state and persist
      const newMap = {
        ...folderOrderMap,
        [targetCourseId]: newOrder,
      };
      setFolderOrderMap(newMap);
      saveFolderOrder(newMap);

      setDraggedFolder(null);
      setDragOverFolder(null);
    },
    [draggedFolder, folderOrderMap]
  );

  /**
   * Reset custom order for a specific course
   */
  const resetCourseOrder = useCallback(
    (courseId: number) => {
      const newMap = { ...folderOrderMap };
      delete newMap[courseId];
      setFolderOrderMap(newMap);
      saveFolderOrder(newMap);
    },
    [folderOrderMap]
  );

  /**
   * Reset all custom orders
   */
  const resetAllOrders = useCallback(() => {
    setFolderOrderMap({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Check if a course has custom order
   */
  const hasCustomOrder = useCallback(
    (courseId: number): boolean => {
      return (folderOrderMap[courseId]?.length ?? 0) > 0;
    },
    [folderOrderMap]
  );

  /**
   * Check if any course has custom order
   */
  const hasAnyCustomOrder = useMemo(() => {
    return Object.values(folderOrderMap).some((order) => order && order.length > 0);
  }, [folderOrderMap]);

  return {
    // State
    draggedFolder,
    dragOverFolder,

    // Actions
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,

    // Ordering
    getCustomOrder,
    sortFoldersByCustomOrder,
    resetCourseOrder,
    resetAllOrders,
    hasCustomOrder,
    hasAnyCustomOrder,
  };
}
