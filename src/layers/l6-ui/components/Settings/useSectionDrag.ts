/**
 * useSectionDrag - Drag-and-drop section ordering
 *
 * Manages drag state, drop targets, and section reordering
 * with protection against accidental accordion toggles during drag.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS_SECTION_ORDER,
} from '../../../l5-presentation/settings';

export function useSectionDrag() {
  // Section order
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS_SECTION_ORDER);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Migrate old section order to include new sections if needed
        const newSections = ['files', 'sync', 'behavior'];
        const hasNewSections = newSections.some((s) => parsed.includes(s));
        if (!hasNewSections) {
          return DEFAULT_SETTINGS_SECTION_ORDER;
        }
        return parsed;
      } catch {
        return DEFAULT_SETTINGS_SECTION_ORDER;
      }
    }
    return DEFAULT_SETTINGS_SECTION_ORDER;
  });

  // Drag state
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const lastDragEndTimeRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const mouseDownTimeRef = useRef<number>(0);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleMouseDown = () => {
    mouseDownTimeRef.current = Date.now();
  };

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    isDraggingRef.current = true;
    setDraggedSection(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionId);
    setTimeout(() => {
      const target = e.target as HTMLElement;
      target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    isDraggingRef.current = false;
    setDraggedSection(null);
    setDragOverSection(null);
    lastDragEndTimeRef.current = Date.now();
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sectionId !== draggedSection) {
      setDragOverSection(sectionId);
    }
  };

  const handleDragLeave = () => {
    setDragOverSection(null);
  };

  const handleDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault();
    const sourceSectionId = e.dataTransfer.getData('text/plain');

    if (sourceSectionId && sourceSectionId !== targetSectionId) {
      const newOrder = [...sectionOrder];
      const sourceIndex = newOrder.indexOf(sourceSectionId);
      const targetIndex = newOrder.indexOf(targetSectionId);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        newOrder.splice(sourceIndex, 1);
        newOrder.splice(targetIndex, 0, sourceSectionId);
        setSectionOrder(newOrder);
        localStorage.setItem(
          STORAGE_KEYS.SETTINGS_SECTION_ORDER,
          JSON.stringify(newOrder)
        );
      }
    }

    setDraggedSection(null);
    setDragOverSection(null);
  };

  const getDragWrapperStyle = (sectionId: string): React.CSSProperties => ({
    position: 'relative',
    borderRadius: 'var(--radius-lg)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    ...(draggedSection === sectionId && { opacity: 0.5 }),
    ...(dragOverSection === sectionId &&
      draggedSection !== sectionId && {
        boxShadow: '0 0 0 2px var(--color-primary)',
      }),
  });

  /**
   * Create a wrapper for setOpenSections that ignores toggle requests during drag operations.
   * Pass the raw setOpenSectionsInternal from useSettingsSync.
   */
  const createDragAwareSetOpenSections = useCallback(
    (
      setOpenSectionsInternal: React.Dispatch<React.SetStateAction<string[]>>
    ): React.Dispatch<React.SetStateAction<string[]>> => {
      return (action: React.SetStateAction<string[]>) => {
        // Ignore accordion toggle if we're currently dragging
        if (isDraggingRef.current) {
          return;
        }
        // Ignore toggle if we just finished dragging
        const timeSinceDragEnd = Date.now() - lastDragEndTimeRef.current;
        if (timeSinceDragEnd < 200) {
          return;
        }
        // Ignore toggle if mousedown was very recent (drag initiation)
        const timeSinceMouseDown = Date.now() - mouseDownTimeRef.current;
        if (timeSinceMouseDown < 50) {
          return;
        }
        setOpenSectionsInternal(action);
      };
    },
    []
  );

  return {
    sectionOrder,
    draggedSection,
    dragOverSection,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,
    createDragAwareSetOpenSections,
  };
}
