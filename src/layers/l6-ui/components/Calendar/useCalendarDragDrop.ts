/**
 * Calendar Drag-Drop Hook
 * Custom hook for handling ICS file drag-and-drop functionality
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ICSImportPreview } from '../../../l5-presentation/types';

export interface UseCalendarDragDropOptions {
  onImportReady: (content: string, preview: ICSImportPreview) => void;
}

export interface UseCalendarDragDropResult {
  isDragging: boolean;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
}

export function useCalendarDragDrop({
  onImportReady,
}: UseCalendarDragDropOptions): UseCalendarDragDropResult {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Listen for file drops - both from Electron IPC and from window custom event
  useEffect(() => {
    // Handler for ICS content (from any source)
    const processICSContent = async (content: string, filename: string) => {
      try {
        const preview = await window.api.parseICSPreview(content, filename);
        if (preview) {
          onImportReady(content, preview);
        }
      } catch (error) {
        console.error('Failed to parse dropped ICS file:', error);
      }
    };

    // Electron IPC handler
    const handleFileDrop = async (data: {
      type: string;
      content: string;
      filename: string;
    }) => {
      if (data.type === 'ics') {
        await processICSContent(data.content, data.filename);
      }
    };

    // Window custom event handler (fallback for HTML5 drag-drop)
    const handleWindowDrop = async (e: Event) => {
      const customEvent = e as CustomEvent<{ content: string; filename: string }>;
      await processICSContent(customEvent.detail.content, customEvent.detail.filename);
    };

    const cleanup = window.api.onFileDropped(handleFileDrop);
    window.addEventListener('ics-file-dropped', handleWindowDrop);

    return () => {
      cleanup();
      window.removeEventListener('ics-file-dropped', handleWindowDrop);
    };
  }, [onImportReady]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const icsFile = files.find(
        (f) => f.name.endsWith('.ics') || f.type === 'text/calendar'
      );

      if (!icsFile) {
        return;
      }

      try {
        const content = await icsFile.text();
        const preview = await window.api.parseICSPreview(content, icsFile.name);

        if (preview) {
          onImportReady(content, preview);
        }
      } catch (error) {
        console.error('Failed to parse ICS file:', error);
      }
    },
    [onImportReady]
  );

  return {
    isDragging,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
