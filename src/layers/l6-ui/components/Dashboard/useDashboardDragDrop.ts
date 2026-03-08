/**
 * useDashboardDragDrop Hook
 * Custom hook encapsulating drag-drop logic for dashboard sections
 */

import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import { createLogger } from '../../utils/rendererLogger';

const log = createLogger('useDashboardDragDrop');

// Default section order - must match section IDs in UnifiedDashboardGrid.tsx
const DEFAULT_ORDER = ['priority', 'notifications', 'schedule', 'importantWorks'];

export interface DashboardDragDropState {
  sectionOrder: string[];
  collapsedSections: Set<string>;
  draggedItem: string | null;
  dragOverItem: string | null;
}

export interface DashboardDragDropActions {
  handleDragStart: (e: React.DragEvent, sectionId: string) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent, sectionId: string) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, targetId: string) => void;
  toggleCollapsed: (sectionId: string) => void;
  resetLayout: () => void;
}

function loadSectionOrder(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DASHBOARD_SECTION_ORDER);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure all default sections are present
      const validOrder = parsed.filter((id: string) => DEFAULT_ORDER.includes(id));
      const missing = DEFAULT_ORDER.filter((id) => !validOrder.includes(id));
      return [...validOrder, ...missing];
    }
  } catch {
    // Ignore parse errors
  }
  return [...DEFAULT_ORDER];
}

function saveSectionOrder(order: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DASHBOARD_SECTION_ORDER, JSON.stringify(order));
  } catch (e) {
    log.error('Failed to save section order', e instanceof Error ? e : undefined);
  }
}

function loadCollapsedSections(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DASHBOARD_COLLAPSED_SECTIONS);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function saveCollapsedSections(collapsed: Set<string>): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.DASHBOARD_COLLAPSED_SECTIONS,
      JSON.stringify([...collapsed])
    );
  } catch (e) {
    log.error('Failed to save collapsed sections', e instanceof Error ? e : undefined);
  }
}

export function useDashboardDragDrop(): DashboardDragDropState &
  DashboardDragDropActions {
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => loadSectionOrder());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() =>
    loadCollapsedSections()
  );
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  // Persist order changes
  useEffect(() => {
    saveSectionOrder(sectionOrder);
  }, [sectionOrder]);

  // Persist collapsed state changes
  useEffect(() => {
    saveCollapsedSections(collapsedSections);
  }, [collapsedSections]);

  const handleDragStart = useCallback((e: React.DragEvent, sectionId: string) => {
    setDraggedItem(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionId);
    // Visual feedback
    const target = e.target as HTMLElement;
    target.style.opacity = '0.5';
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
    setDraggedItem(null);
    setDragOverItem(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (draggedItem && sectionId !== draggedItem) {
        setDragOverItem(sectionId);
      }
    },
    [draggedItem]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverItem(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedItem || draggedItem === targetId) return;

      setSectionOrder((prev) => {
        const newOrder = [...prev];
        const draggedIndex = newOrder.indexOf(draggedItem);
        const targetIndex = newOrder.indexOf(targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          // Swap positions instead of insert
          newOrder[draggedIndex] = targetId;
          newOrder[targetIndex] = draggedItem;
        }

        return newOrder;
      });

      setDraggedItem(null);
      setDragOverItem(null);
    },
    [draggedItem]
  );

  const toggleCollapsed = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setSectionOrder([...DEFAULT_ORDER]);
    setCollapsedSections(new Set());
    localStorage.removeItem(STORAGE_KEYS.DASHBOARD_SECTION_ORDER);
    localStorage.removeItem(STORAGE_KEYS.DASHBOARD_COLLAPSED_SECTIONS);
  }, []);

  return {
    sectionOrder,
    collapsedSections,
    draggedItem,
    dragOverItem,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    toggleCollapsed,
    resetLayout,
  };
}

export default useDashboardDragDrop;
