/**
 * useCourseDetailSyllabusState Hook
 * Manages syllabus-related state and handlers for CourseDetail page
 */

import { useState, useCallback, useRef } from 'react';
import type { CourseSyllabus } from '../Course';
import type { FileResource } from '../Files/FileListItem';
import type { MissingDependency } from '../Files/MissingDependenciesDialog';

export interface ConfirmDialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText: string;
  onConfirm: () => void;
}

export interface MissingDepsDialogState {
  isOpen: boolean;
  dependencies: MissingDependency[];
  totalSize: number;
  isDownloading: boolean;
  downloadProgress: number;
}

export interface UseCourseDetailSyllabusStateProps {
  courseId: number;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogConfig>>;
}

export interface UseCourseDetailSyllabusStateReturn {
  // Syllabus state
  syllabus: CourseSyllabus | null;
  setSyllabus: React.Dispatch<React.SetStateAction<CourseSyllabus | null>>;
  courseFiles: FileResource[];
  setCourseFiles: React.Dispatch<React.SetStateAction<FileResource[]>>;
  showSyllabusSelector: boolean;
  setShowSyllabusSelector: (show: boolean) => void;
  syllabusContextMenu: { x: number; y: number } | null;
  setSyllabusContextMenu: (menu: { x: number; y: number } | null) => void;

  // Loading state
  syllabusLoading: boolean;

  // Missing dependencies dialog
  missingDepsDialog: MissingDepsDialogState;
  handleDownloadDependencies: () => Promise<void>;
  handleOpenSyllabusAnyway: () => void;
  closeMissingDepsDialog: () => void;

  // Handlers
  handleSetSyllabus: (resourceId: number) => Promise<void>;
  handleMarkSyllabusReviewed: () => Promise<void>;
  handleRemoveSyllabus: () => Promise<void>;
  handleSyllabusClick: () => void;
  handleSyllabusDoubleClick: () => void;
  handleSyllabusContextMenu: (e: React.MouseEvent) => void;
}

export function useCourseDetailSyllabusState({
  courseId,
  setConfirmDialog,
}: UseCourseDetailSyllabusStateProps): UseCourseDetailSyllabusStateReturn {
  // Syllabus state
  const [syllabus, setSyllabus] = useState<CourseSyllabus | null>(null);
  const [courseFiles, setCourseFiles] = useState<FileResource[]>([]);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [showSyllabusSelector, setShowSyllabusSelector] = useState(false);
  const [syllabusContextMenu, setSyllabusContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const syllabusClickTimeout = useRef<NodeJS.Timeout | null>(null);

  // Missing dependencies dialog state
  const [missingDepsDialog, setMissingDepsDialog] = useState<MissingDepsDialogState>({
    isOpen: false,
    dependencies: [],
    totalSize: 0,
    isDownloading: false,
    downloadProgress: 0,
  });

  // Set syllabus
  const handleSetSyllabus = useCallback(
    async (resourceId: number) => {
      const api = window.api;
      if (!api?.dispatch) return;

      setSyllabusLoading(true);
      try {
        const result = await api.dispatch('SetCourseSyllabus', { courseId, resourceId });
        if (result.success && result.data) {
          const file = courseFiles.find((f) => f.id === resourceId);
          setSyllabus({
            id: result.data.syllabusId,
            courseId,
            resourceId,
            resourceTitle: file?.title ?? 'Unknown file',
            resourceUpdatedAt: null,
            lastReviewedAt: result.data.lastReviewedAt,
            changeDetectedAt: null,
            markedAt: result.data.lastReviewedAt,
          });
        }
      } catch (error) {
        console.error('Failed to set syllabus:', error);
      } finally {
        setSyllabusLoading(false);
      }
    },
    [courseId, courseFiles]
  );

  // Mark syllabus as reviewed
  const handleMarkSyllabusReviewed = useCallback(async () => {
    const api = window.api;
    if (!api?.dispatch) return;

    setSyllabusLoading(true);
    try {
      const result = await api.dispatch('MarkSyllabusReviewed', { courseId });
      if (result.success && result.data) {
        setSyllabus((prev) =>
          prev
            ? {
                ...prev,
                lastReviewedAt: result.data.lastReviewedAt,
                changeDetectedAt: null,
              }
            : null
        );
      }
    } catch (error) {
      console.error('Failed to mark syllabus reviewed:', error);
    } finally {
      setSyllabusLoading(false);
    }
  }, [courseId]);

  // Remove syllabus
  const handleRemoveSyllabus = useCallback(async () => {
    const api = window.api;
    if (!api?.dispatch) return;

    setSyllabusLoading(true);
    try {
      await api.dispatch('RemoveCourseSyllabus', { courseId });
      setSyllabus(null);
    } catch (error) {
      console.error('Failed to remove syllabus:', error);
    } finally {
      setSyllabusLoading(false);
    }
  }, [courseId]);

  // Syllabus click - opens selector after delay
  const handleSyllabusClick = useCallback(() => {
    // Delay single-click to allow double-click to cancel it
    if (syllabusClickTimeout.current) {
      clearTimeout(syllabusClickTimeout.current);
    }
    syllabusClickTimeout.current = setTimeout(() => {
      setShowSyllabusSelector(true);
    }, 250);
  }, []);

  // Syllabus double-click - opens file or selector
  const handleSyllabusDoubleClick = useCallback(async () => {
    // Cancel single-click action
    if (syllabusClickTimeout.current) {
      clearTimeout(syllabusClickTimeout.current);
      syllabusClickTimeout.current = null;
    }
    if (!syllabus) {
      // No syllabus - open selector instead
      setShowSyllabusSelector(true);
      return;
    }
    const api = window.api;

    // Check if syllabus file is downloaded
    const syllabusFile = courseFiles.find((f) => f.id === syllabus.resourceId);
    const isDownloaded = syllabusFile?.localPath != null;

    if (!isDownloaded) {
      // Prompt to download first
      setConfirmDialog({
        isOpen: true,
        title: 'Download Syllabus',
        message: `"${syllabus.resourceTitle}" hasn't been downloaded yet. Would you like to download it now?`,
        type: 'info',
        confirmText: 'Download',
        onConfirm: async () => {
          try {
            if (syllabus.resourceId < 0) {
              await api?.downloadAttachment(Math.abs(syllabus.resourceId));
            } else {
              await api?.downloadResource(syllabus.resourceId);
            }
            // Refresh course files to update download status
            const updatedFiles = await api?.getCourseFiles?.(courseId);
            if (updatedFiles) setCourseFiles(updatedFiles);
          } catch (error) {
            console.error('Failed to download syllabus:', error);
          }
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
      return;
    }

    // File is downloaded - open it and check for missing dependencies
    try {
      if (syllabus.resourceId < 0) {
        // Attachment - just open it (no dependency checking for attachments)
        await api?.openAttachment(Math.abs(syllabus.resourceId));
      } else {
        // Resource - check for missing dependencies
        const result = await api?.openResource(syllabus.resourceId);

        // Check if result indicates missing dependencies
        const typedResult = result as
          | {
              success?: boolean;
              hasMissingDependencies?: boolean;
              missingDependencies?: MissingDependency[];
              totalMissingSize?: number;
            }
          | undefined;

        if (typedResult?.hasMissingDependencies && typedResult.missingDependencies) {
          console.log(
            '[Syllabus] HTML has missing dependencies:',
            typedResult.missingDependencies
          );
          setMissingDepsDialog({
            isOpen: true,
            dependencies: typedResult.missingDependencies,
            totalSize: typedResult.totalMissingSize || 0,
            isDownloading: false,
            downloadProgress: 0,
          });
        }
        // If success or no missing deps, file was opened
      }
    } catch (error) {
      console.error('Failed to open syllabus:', error);
    }
  }, [syllabus, courseFiles, courseId, setConfirmDialog]);

  // Download missing dependencies
  const handleDownloadDependencies = useCallback(async () => {
    const api = window.api;
    if (!api || !syllabus) return;

    setMissingDepsDialog((prev) => ({
      ...prev,
      isDownloading: true,
      downloadProgress: 0,
    }));

    try {
      // Simulate progress since we don't have real-time updates
      const progressInterval = setInterval(() => {
        setMissingDepsDialog((prev) => ({
          ...prev,
          downloadProgress: Math.min(prev.downloadProgress + 10, 90),
        }));
      }, 500);

      const result = await api.downloadHtmlDependencies(syllabus.resourceId);

      clearInterval(progressInterval);

      if (result.success) {
        setMissingDepsDialog((prev) => ({ ...prev, downloadProgress: 100 }));

        // Close dialog and open the file after a brief delay
        setTimeout(async () => {
          setMissingDepsDialog({
            isOpen: false,
            dependencies: [],
            totalSize: 0,
            isDownloading: false,
            downloadProgress: 0,
          });

          // Refresh course files
          const updatedFiles = await api.getCourseFiles?.(courseId);
          if (updatedFiles) setCourseFiles(updatedFiles);

          // Open the file with skipDependencyCheck=true
          api.openResource(syllabus.resourceId, true);
        }, 500);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Failed to download dependencies:', error);
      setMissingDepsDialog((prev) => ({ ...prev, isDownloading: false }));
      throw error; // Re-throw so dialog shows error
    }
  }, [syllabus, courseId]);

  // Open syllabus without dependencies (broken offline experience)
  const handleOpenSyllabusAnyway = useCallback(() => {
    const api = window.api;
    if (!api || !syllabus) return;

    // Close dialog
    setMissingDepsDialog({
      isOpen: false,
      dependencies: [],
      totalSize: 0,
      isDownloading: false,
      downloadProgress: 0,
    });

    // Open file with skipDependencyCheck=true
    api.openResource(syllabus.resourceId, true);
  }, [syllabus]);

  // Close missing dependencies dialog
  const closeMissingDepsDialog = useCallback(() => {
    if (missingDepsDialog.isDownloading) return; // Prevent closing during download
    setMissingDepsDialog({
      isOpen: false,
      dependencies: [],
      totalSize: 0,
      isDownloading: false,
      downloadProgress: 0,
    });
  }, [missingDepsDialog.isDownloading]);

  // Syllabus context menu
  const handleSyllabusContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSyllabusContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return {
    // Syllabus state
    syllabus,
    setSyllabus,
    courseFiles,
    setCourseFiles,
    showSyllabusSelector,
    setShowSyllabusSelector,
    syllabusContextMenu,
    setSyllabusContextMenu,

    // Loading state
    syllabusLoading,

    // Missing dependencies dialog
    missingDepsDialog,
    handleDownloadDependencies,
    handleOpenSyllabusAnyway,
    closeMissingDepsDialog,

    // Handlers
    handleSetSyllabus,
    handleMarkSyllabusReviewed,
    handleRemoveSyllabus,
    handleSyllabusClick,
    handleSyllabusDoubleClick,
    handleSyllabusContextMenu,
  };
}

export default useCourseDetailSyllabusState;
