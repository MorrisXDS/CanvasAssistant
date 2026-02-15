/**
 * useFileSelection Hook
 * Selection mode, selected files, toggle/select-all handlers
 */

import { useState } from 'react';
import { isFileDownloaded, getCanonicalFileId } from './FileListItem';
import type { FileItem } from './FileListItem';
import type { DownloadProgress } from './FileSelectionBar';
import type { FileModuleItem, FilePage } from './filesPageTypes';

export function useFileSelection(groupedFiles: Map<number, Map<string, FileItem[]>>) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const getFileKey = (file: FileItem) => getCanonicalFileId(file);

  const toggleFileSelection = (file: FileItem) => {
    const key = getFileKey(file);
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const allKeys: string[] = [];
    for (const folderMap of groupedFiles.values()) {
      for (const fileList of folderMap.values()) {
        for (const f of fileList) {
          if (!isFileDownloaded(f)) {
            allKeys.push(getFileKey(f));
          }
        }
      }
    }
    setSelectedFiles(new Set(allKeys));
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  const handleDownloadSelected = async (
    downloadingIds: Set<string>,
    setDownloadingIds: React.Dispatch<React.SetStateAction<Set<string>>>,
    fetchFiles: () => Promise<void>
  ) => {
    const api = window.api;
    if (!api) return;

    const allFiles: FileItem[] = [];
    for (const folderMap of groupedFiles.values()) {
      for (const fileList of folderMap.values()) {
        allFiles.push(...fileList);
      }
    }

    const filesToDownload = allFiles.filter(
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
          console.error('Download failed:', error);
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
    setSelectedFiles(new Set());
    setSelectMode(false);

    setTimeout(() => {
      setDownloadProgress(null);
    }, 3500);
  };

  return {
    selectMode,
    setSelectMode,
    selectedFiles,
    setSelectedFiles,
    downloadProgress,
    getFileKey,
    toggleFileSelection,
    selectAllVisible,
    deselectAll,
    handleDownloadSelected,
  };
}
