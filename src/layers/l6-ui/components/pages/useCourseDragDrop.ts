/**
 * useCourseDragDrop - Hook for drag-and-drop course reordering
 * Persists order to localStorage
 */

import { useState, useCallback, useEffect } from 'react';
import { createLogger } from '../../utils/rendererLogger';

const log = createLogger('useCourseDragDrop');

const STORAGE_KEY = 'courseOrder';

/**
 * Load course order from localStorage
 */
function loadCourseOrder(): number[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    log.error('Failed to load course order', e instanceof Error ? e : undefined);
  }
  return [];
}

/**
 * Save course order to localStorage
 */
function saveCourseOrder(order: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch (e) {
    log.error('Failed to save course order', e instanceof Error ? e : undefined);
  }
}

export function useCourseDragDrop(courseIds: number[]) {
  // Custom order stored in localStorage (course IDs in preferred order)
  const [customOrder, setCustomOrder] = useState<number[]>(() => loadCourseOrder());
  const [draggedCourseId, setDraggedCourseId] = useState<number | null>(null);
  const [dragOverCourseId, setDragOverCourseId] = useState<number | null>(null);

  // Sync custom order when courses change (add new courses to end)
  useEffect(() => {
    const existingIds = new Set(customOrder);
    const newCourses = courseIds.filter((id) => !existingIds.has(id));

    if (newCourses.length > 0) {
      const updatedOrder = [...customOrder, ...newCourses];
      setCustomOrder(updatedOrder);
      saveCourseOrder(updatedOrder);
    }
  }, [courseIds]);

  // Sort courses by custom order
  const sortByCustomOrder = useCallback(
    (ids: number[]): number[] => {
      if (customOrder.length === 0) return ids;

      const orderMap = new Map(customOrder.map((id, index) => [id, index]));
      return [...ids].sort((a, b) => {
        const orderA = orderMap.get(a) ?? Infinity;
        const orderB = orderMap.get(b) ?? Infinity;
        return orderA - orderB;
      });
    },
    [customOrder]
  );

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, courseId: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', courseId.toString());
    setDraggedCourseId(courseId);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback(
    (e: React.DragEvent, courseId: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (courseId !== draggedCourseId) {
        setDragOverCourseId(courseId);
      }
    },
    [draggedCourseId]
  );

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setDragOverCourseId(null);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedCourseId(null);
    setDragOverCourseId(null);
  }, []);

  // Handle drop - swap positions
  const handleDrop = useCallback(
    (e: React.DragEvent, targetCourseId: number) => {
      e.preventDefault();

      if (!draggedCourseId || draggedCourseId === targetCourseId) {
        setDraggedCourseId(null);
        setDragOverCourseId(null);
        return;
      }

      // Create new order by swapping positions
      let newOrder = customOrder.length > 0 ? [...customOrder] : [...courseIds];

      // Ensure both courses are in the order array
      if (!newOrder.includes(draggedCourseId)) {
        newOrder.push(draggedCourseId);
      }
      if (!newOrder.includes(targetCourseId)) {
        newOrder.push(targetCourseId);
      }

      const draggedIndex = newOrder.indexOf(draggedCourseId);
      const targetIndex = newOrder.indexOf(targetCourseId);

      // Swap positions
      newOrder[draggedIndex] = targetCourseId;
      newOrder[targetIndex] = draggedCourseId;

      setCustomOrder(newOrder);
      saveCourseOrder(newOrder);
      setDraggedCourseId(null);
      setDragOverCourseId(null);
    },
    [draggedCourseId, customOrder, courseIds]
  );

  // Reset custom order
  const resetOrder = useCallback(() => {
    setCustomOrder([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    customOrder,
    sortByCustomOrder,
    draggedCourseId,
    dragOverCourseId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleDrop,
    resetOrder,
    hasCustomOrder: customOrder.length > 0,
  };
}
