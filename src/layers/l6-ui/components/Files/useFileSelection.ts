/**
 * useFileSelection Hook
 * Selection mode, selected files, toggle/select-all handlers.
 * Delegates selection logic to useMultiSelect for Shift+Click, Ctrl+Click,
 * Mod+A, and Escape keyboard shortcuts.
 */

import React, { useMemo, useState } from 'react';
import { isFileDownloaded, getCanonicalFileId } from './FileListItem';
import type { FileItem } from './FileListItem';
import type { DownloadProgress } from './FileSelectionBar';
import type { FileModuleItem, FilePage } from './filesPageTypes';
import { useMultiSelect } from '../../hooks/useMultiSelect';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('FileSelection');

export function useFileSelection(groupedFiles: Map<number, Map<string, FileItem[]>>) {
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const getFileKey = (file: FileItem) => getCanonicalFileId(file);

  // Flatten groupedFiles into ordered array for useMultiSelect range selection
  const flattenedFiles = useMemo(() => {
    const files: FileItem[] = [];
    for (const folderMap of groupedFiles.values()) {
      for (const fileList of folderMap.values()) {
        files.push(...fileList);
      }
    }
    return files;
  }, [groupedFiles]);

  const {
    selectMode,
    setSelectMode,
    selectedKeys: selectedFiles,
    selectedCount,
    handleItemClick: handleMultiSelectClick,
    selectAll: selectAllVisible,
    deselectAll,
    isSelected: isFileSelected,
    reset: resetSelection,
  } = useMultiSelect(flattenedFiles, getFileKey, {
    selectAllFilter: (f) => !isFileDownloaded(f),
  });

  // Simple toggle for checkbox clicks (no modifier keys)
  const toggleFileSelection = (file: FileItem) => {
    handleMultiSelectClick(file, {
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
    } as React.MouseEvent);
  };

  const handleDownloadSelected = async (
    downloadingIds: Set<string>,
    setDownloadingIds: React.Dispatch<React.SetStateAction<Set<string>>>,
    fetchFiles: () => Promise<void>
  ) => {
    const api = window.api;
    if (!api) return;

    const filesToDownload = flattenedFiles.filter(
      (f) => selectedFiles.has(getFileKey(f)) && !isFileDownloaded(f)
    );

    if (filesToDownload.length === 0) return;

    let completedCount = 0;
    const totalCount = filesToDownload.length;

    setDownloadProgress({ total: totalCount, completed: 0, isComplete: false });

    const progressInterval = setInterval(() => {
      setDownloadProgress((prev) =>
        prev ? { ...prev, completed: completedCount } : null
      );
    }, 100);

    try {
      for (const file of filesToDownload) {
        const canonicalId = getCanonicalFileId(file);
        setDownloadingIds((prev) => new Set(prev).add(canonicalId));
        try {
          if (file.source === 'attachment') {
            await api.downloadAttachment(file.id);
          } else if (file.source === 'page') {
            const page = file as FilePage;
            const pageResult = await api.getPage(page.id);
            if (pageResult?.success && pageResult.data?.bodyHtml) {
              await api.exportPageHtml({
                courseId: page.courseId,
                pageId: page.id,
                title: page.title,
                bodyHtml: pageResult.data.bodyHtml,
              });
            }
          } else if (file.source === 'module') {
            const moduleItem = file as FileModuleItem;
            if (moduleItem.itemType === 'Page') {
              await api.downloadPageContent(moduleItem.id);
            } else if (moduleItem.itemType === 'File' && moduleItem.contentId) {
              await api.downloadResourceByExternalId(moduleItem.contentId);
            }
          } else {
            await api.downloadResource(file.id);
          }
          completedCount++;
        } catch (error) {
          logger.error('Download failed', error instanceof Error ? error : undefined);
          completedCount++;
        }
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(canonicalId);
          return next;
        });
      }
    } finally {
      clearInterval(progressInterval);
    }

    setDownloadProgress({
      total: totalCount,
      completed: completedCount,
      isComplete: true,
    });

    await fetchFiles();
    resetSelection();

    setTimeout(() => {
      setDownloadProgress(null);
    }, 3500);
  };

  return {
    selectMode,
    setSelectMode,
    selectedFiles,
    selectedCount,
    downloadProgress,
    getFileKey,
    toggleFileSelection,
    handleMultiSelectClick,
    selectAllVisible,
    deselectAll,
    isFileSelected,
    resetSelection,
    handleDownloadSelected,
  };
}
