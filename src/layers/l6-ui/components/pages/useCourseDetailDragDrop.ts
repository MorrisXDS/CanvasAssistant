/**
 * useCourseDetailDragDrop Hook
 * Custom hook encapsulating drag-drop logic for CourseDetail sections
 * Manages two independent drag groups: task sections and sidebar sections
 */

import { useState, useCallback, useEffect } from 'react';

// localStorage keys
const TASK_SECTION_ORDER_KEY = 'courseDetailTaskSectionOrder';
const SIDEBAR_ORDER_KEY = 'courseDetailSidebarOrder';

// Default section orders
const DEFAULT_TASK_ORDER = ['pending', 'submitted', 'graded', 'info'];
const DEFAULT_SIDEBAR_ORDER = ['policies', 'announcements', 'pages'];

export interface DragState {
  draggingId: string | null;
  dragOverId: string | null;
}

export interface DragHandlers {
  onDragStart: (id: string) => (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (id: string) => (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (id: string) => (e: React.DragEvent) => void;
}

export interface UseCourseDetailDragDropResult {
  // Task sections
  taskSectionOrder: string[];
  taskDragState: DragState;
  taskDragHandlers: DragHandlers;
  resetTaskOrder: () => void;

  // Sidebar sections
  sidebarOrder: string[];
  sidebarDragState: DragState;
  sidebarDragHandlers: DragHandlers;
  resetSidebarOrder: () => void;
}

function loadOrder(key: string, defaults: string[]): string[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure all default sections are present
      const validOrder = parsed.filter((id: string) => defaults.includes(id));
      const missing = defaults.filter((id) => !validOrder.includes(id));
      return [...validOrder, ...missing];
    }
  } catch {
    // Ignore parse errors
  }
  return [...defaults];
}

function saveOrder(key: string, order: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(order));
  } catch (e) {
    console.error(`Failed to save order for ${key}:`, e);
  }
}

function useDragGroup(
  storageKey: string,
  defaults: string[]
): {
  order: string[];
  dragState: DragState;
  handlers: DragHandlers;
  reset: () => void;
} {
  const [order, setOrder] = useState<string[]>(() => loadOrder(storageKey, defaults));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Persist order changes
  useEffect(() => {
    saveOrder(storageKey, order);
  }, [storageKey, order]);

  const onDragStart = useCallback(
    (id: string) => (e: React.DragEvent) => {
      setDraggingId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      // Visual feedback handled via state
    },
    []
  );

  const onDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const onDragOver = useCallback(
    (id: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggingId && id !== draggingId) {
        setDragOverId(id);
      }
    },
    [draggingId]
  );

  const onDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const onDrop = useCallback(
    (targetId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggingId || draggingId === targetId) return;

      setOrder((prev) => {
        const newOrder = [...prev];
        const draggedIndex = newOrder.indexOf(draggingId);
        const targetIndex = newOrder.indexOf(targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          // Swap positions
          newOrder[draggedIndex] = targetId;
          newOrder[targetIndex] = draggingId;
        }

        return newOrder;
      });

      setDraggingId(null);
      setDragOverId(null);
    },
    [draggingId]
  );

  const reset = useCallback(() => {
    setOrder([...defaults]);
    localStorage.removeItem(storageKey);
  }, [storageKey, defaults]);

  return {
    order,
    dragState: { draggingId, dragOverId },
    handlers: {
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    reset,
  };
}

export function useCourseDetailDragDrop(): UseCourseDetailDragDropResult {
  const taskGroup = useDragGroup(TASK_SECTION_ORDER_KEY, DEFAULT_TASK_ORDER);
  const sidebarGroup = useDragGroup(SIDEBAR_ORDER_KEY, DEFAULT_SIDEBAR_ORDER);

  return {
    // Task sections
    taskSectionOrder: taskGroup.order,
    taskDragState: taskGroup.dragState,
    taskDragHandlers: taskGroup.handlers,
    resetTaskOrder: taskGroup.reset,

    // Sidebar sections
    sidebarOrder: sidebarGroup.order,
    sidebarDragState: sidebarGroup.dragState,
    sidebarDragHandlers: sidebarGroup.handlers,
    resetSidebarOrder: sidebarGroup.reset,
  };
}

export default useCourseDetailDragDrop;
