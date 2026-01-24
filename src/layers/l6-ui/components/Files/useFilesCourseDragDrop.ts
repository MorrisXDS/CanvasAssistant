/**
 * useFilesCourseDragDrop - Hook for drag-and-drop course reordering in Files page
 * Courses cannot merge/join each other.
 * Persists order to localStorage.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'filesCourseOrder';

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
    console.error('Failed to load files course order:', e);
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
    console.error('Failed to save files course order:', e);
  }
}

export function useFilesCourseDragDrop(courseIds: number[]) {
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
  }, [courseIds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleDragStart = useCallback((e: React.DragEvent, courseId: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', courseId.toString());
    setDraggedCourseId(courseId);
  }, []);

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

  const handleDragLeave = useCallback(() => {
    setDragOverCourseId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedCourseId(null);
    setDragOverCourseId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetCourseId: number) => {
      e.preventDefault();

      if (!draggedCourseId || draggedCourseId === targetCourseId) {
        setDraggedCourseId(null);
        setDragOverCourseId(null);
        return;
      }

      let newOrder = customOrder.length > 0 ? [...customOrder] : [...courseIds];

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
