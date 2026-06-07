/**
 * useFileDialogs Hook
 * All dialog states + handlers (missing deps, external link, page download,
 * context menu, properties, download confirmation, content changed warning)
 */

import { useState } from 'react';
import { getFileName, getCanonicalFileId } from './FileListItem';
import type {
  FileItem,
  FileResource,
  FileAttachment,
  FilePage,
  FileModuleItem,
} from './FileListItem';
import type { MissingDependency } from './MissingDependenciesDialog';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import {
  shouldSkipExternalLinkWarning,
  withSkipExternalLinkWarning,
} from './externalLinkWarning';
import { createLogger } from '../../utils/rendererLogger';
import type {
  MissingDepsDialogState,
  ExternalLinkDialogState,
  PageDownloadDialogState,
  ContextMenuState,
  ContentChangedWarningState,
  FilesData,
} from './filesPageTypes';

const logger = createLogger('FileDialogs');

export function useFileDialogs(
  files: FilesData,
  fetchFiles: () => Promise<void>,
  downloadingIds: Set<string>,
  setDownloadingIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  markFileUpdateSeen: (file: FileItem) => void
) {
  const [pendingDownload, setPendingDownload] = useState<FileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [propertiesFile, setPropertiesFile] = useState<FileItem | null>(null);

  const [missingDepsDialog, setMissingDepsDialog] = useState<MissingDepsDialogState>({
    isOpen: false,
    file: null,
    dependencies: [],
    totalSize: 0,
    isDownloading: false,
    downloadProgress: 0,
  });

  const [externalLinkDialog, setExternalLinkDialog] = useState<ExternalLinkDialogState>({
    isOpen: false,
    url: '',
    title: '',
  });

  const [pageDownloadDialog, setPageDownloadDialog] = useState<PageDownloadDialogState>({
    isOpen: false,
    moduleItem: null,
    isDownloading: false,
  });

  const [contentChangedWarning, setContentChangedWarning] =
    useState<ContentChangedWarningState>({ show: false, fileId: null, fileName: null });

  // --- Download handlers ---

  const handleDownload = (file: FileItem) => {
    if (downloadingIds.has(getCanonicalFileId(file))) return;
    setPendingDownload(file);
  };

  const executeDownload = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    const canonicalId = getCanonicalFileId(file);
    setDownloadingIds((prev) => new Set(prev).add(canonicalId));

    try {
      let result;
      if (file.source === 'attachment') {
        result = await api.downloadAttachment(file.id);
      } else if (file.source === 'page') {
        const page = file as FilePage;
        const pageResult = await api.getPage(page.id);
        if (pageResult?.success && pageResult.data?.bodyHtml) {
          result = await api.exportPageHtml({
            courseId: page.courseId,
            pageId: page.id,
            title: page.title,
            bodyHtml: pageResult.data.bodyHtml,
          });
        }
      } else if (file.source === 'module') {
        const moduleItem = file as FileModuleItem;
        if (moduleItem.itemType === 'Page') {
          result = await api.downloadPageContent(moduleItem.id);
        } else if (moduleItem.itemType === 'File' && moduleItem.contentId) {
          result = await api.downloadResourceByExternalId(moduleItem.contentId);
        } else {
          logger.warn(`Cannot download module item of type: ${moduleItem.itemType}`);
          result = {
            success: false,
            error: `Cannot download ${moduleItem.itemType} items`,
          };
        }
      } else {
        result = await api.downloadResource(file.id);
      }
      if (result?.success) {
        await fetchFiles();
        markFileUpdateSeen(file);
      }
    } catch (error) {
      logger.error('Download failed', error instanceof Error ? error : undefined);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(canonicalId);
        return next;
      });
    }
  };

  const confirmDownload = () => {
    if (pendingDownload) {
      executeDownload(pendingDownload);
      setPendingDownload(null);
    }
  };

  // --- Open handler ---

  const handleOpen = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    logger.debug('handleOpen called');
    markFileUpdateSeen(file);

    if (file.source === 'attachment') {
      api
        .openAttachment(file.id)
        .then(() => logger.debug('openAttachment resolved'))
        .catch((error) => {
          logger.error('Failed to open file', error instanceof Error ? error : undefined);
        });
    } else if (file.source === 'page') {
      const page = file as FilePage;
      api
        .getPage(page.id)
        .then((pageResult) => {
          if (pageResult?.success && pageResult.data?.canvasUrl) {
            api.openExternal(pageResult.data.canvasUrl);
          }
        })
        .catch((error) => {
          logger.error('Failed to open page', error instanceof Error ? error : undefined);
        });
    } else if (file.source === 'module') {
      const moduleItem = file as FileModuleItem;

      // ExternalUrl items
      if (moduleItem.itemType === 'ExternalUrl') {
        const externalLink = moduleItem.externalUrl || moduleItem.url;
        if (!externalLink) {
          logger.error('ExternalUrl item has no URL');
          return;
        }

        const skipWarning = shouldSkipExternalLinkWarning(
          localStorage.getItem(STORAGE_KEYS.FILE_EXPLORER)
        );

        if (skipWarning) {
          api.openExternal(externalLink);
        } else {
          setExternalLinkDialog({
            isOpen: true,
            url: externalLink,
            title: moduleItem.title,
          });
        }
        return;
      }

      // Page type
      if (moduleItem.itemType === 'Page') {
        try {
          const openResult = await api.openPageFile?.(moduleItem.id);
          if (openResult?.success) {
            logger.debug('Opened module page file');
            return;
          }
          if ((openResult as { needsDownload?: boolean })?.needsDownload) {
            logger.debug('Page needs download, showing dialog');
            setPageDownloadDialog({
              isOpen: true,
              moduleItem,
              isDownloading: false,
            });
            return;
          }
          const typedResult = openResult as {
            hasMissingDependencies?: boolean;
            missingDependencies?: MissingDependency[];
            totalMissingSize?: number;
          };
          if (typedResult?.hasMissingDependencies && typedResult.missingDependencies) {
            logger.debug(
              `Page has missing dependencies: ${typedResult.missingDependencies.length} items`
            );
            setMissingDepsDialog({
              isOpen: true,
              file: moduleItem,
              dependencies: typedResult.missingDependencies,
              totalSize: typedResult.totalMissingSize || 0,
              isDownloading: false,
              downloadProgress: 0,
            });
            return;
          }
        } catch {
          logger.debug('Failed to open module page file, falling back to Canvas URL');
        }
      }

      // File type with content_id
      if (moduleItem.itemType === 'File' && moduleItem.contentId) {
        try {
          const openResult = await api.openResourceByExternalId(moduleItem.contentId);
          if (openResult?.success) {
            logger.debug('Opened module file');
            return;
          }
          if ((openResult as { needsDownload?: boolean })?.needsDownload) {
            logger.debug('Module file not downloaded, opening Canvas URL');
          }
        } catch {
          logger.debug('Failed to open module file, falling back to Canvas URL');
        }
      }

      // Fall back to Canvas URL
      const url = moduleItem.externalUrl || moduleItem.url;
      if (url) {
        api.openExternal(url);
      }
    } else {
      // Resources - check for missing HTML dependencies
      try {
        const result = await api.openResource(file.id);

        if (result?.hasMissingDependencies && result.missingDependencies) {
          logger.debug(
            `HTML has missing dependencies: ${result.missingDependencies.length} items`
          );
          setMissingDepsDialog({
            isOpen: true,
            file,
            dependencies: result.missingDependencies,
            totalSize: result.totalMissingSize || 0,
            isDownloading: false,
            downloadProgress: 0,
          });
          return;
        }

        logger.debug('openResource resolved');
      } catch (error) {
        logger.error('Failed to open file', error instanceof Error ? error : undefined);
      }
    }
  };

  // --- Missing Dependencies dialog handlers ---

  const handleDownloadDependencies = async () => {
    const api = window.api;
    if (!api || !missingDepsDialog.file) return;

    const file = missingDepsDialog.file;
    const isModulePage =
      file.source === 'module' && (file as FileModuleItem).itemType === 'Page';

    setMissingDepsDialog((prev) => ({
      ...prev,
      isDownloading: true,
      downloadProgress: 0,
    }));

    try {
      const progressInterval = setInterval(() => {
        setMissingDepsDialog((prev) => ({
          ...prev,
          downloadProgress: Math.min(prev.downloadProgress + 10, 90),
        }));
      }, 500);

      let result: { success: boolean; error?: string; contentChanged?: boolean };

      if (isModulePage) {
        const moduleItem = file as FileModuleItem;
        result = (await api.downloadPageContent?.(moduleItem.id)) || {
          success: false,
          error: 'API not available',
        };
      } else {
        result = await api.downloadHtmlDependencies(file.id);
      }

      clearInterval(progressInterval);

      if (result.success) {
        setMissingDepsDialog((prev) => ({ ...prev, downloadProgress: 100 }));

        const fileForWarning = missingDepsDialog.file;
        const contentChanged = result.contentChanged === true;

        setTimeout(async () => {
          setMissingDepsDialog({
            isOpen: false,
            file: null,
            dependencies: [],
            totalSize: 0,
            isDownloading: false,
            downloadProgress: 0,
          });

          await fetchFiles();

          if (contentChanged && fileForWarning) {
            setContentChangedWarning({
              show: true,
              fileId: fileForWarning.id,
              fileName: getFileName(fileForWarning),
            });
          }

          if (fileForWarning) {
            if (isModulePage) {
              api.openPageFile?.((fileForWarning as FileModuleItem).id);
            } else {
              api.openResource(fileForWarning.id, true);
            }
          }
        }, 500);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      logger.error(
        'Failed to download dependencies',
        error instanceof Error ? error : undefined
      );
      setMissingDepsDialog((prev) => ({ ...prev, isDownloading: false }));
      throw error;
    }
  };

  const handleRedownloadAfterChange = async () => {
    const api = window.api;
    if (!api || !contentChangedWarning.fileId) return;

    setContentChangedWarning({ show: false, fileId: null, fileName: null });

    const checkResult = await api.checkHtmlDependencies(contentChangedWarning.fileId);
    if (checkResult.success && checkResult.missingCount > 0) {
      const file = files.resources.find(
        (r: FileResource) => r.id === contentChangedWarning.fileId
      );
      if (file) {
        setMissingDepsDialog({
          isOpen: true,
          file,
          dependencies: checkResult.missingDependencies || [],
          totalSize: checkResult.totalMissingSize || 0,
          isDownloading: false,
          downloadProgress: 0,
        });
      }
    } else {
      await api.downloadHtmlDependencies(contentChangedWarning.fileId);
      await fetchFiles();
    }
  };

  const handleOpenAnyway = () => {
    const api = window.api;
    if (!api || !missingDepsDialog.file) return;

    const file = missingDepsDialog.file;
    const isModulePage =
      file.source === 'module' && (file as FileModuleItem).itemType === 'Page';

    setMissingDepsDialog({
      isOpen: false,
      file: null,
      dependencies: [],
      totalSize: 0,
      isDownloading: false,
      downloadProgress: 0,
    });

    if (isModulePage) {
      api.openPageFile?.((file as FileModuleItem).id, true);
    } else {
      api.openResource(file.id, true);
    }
  };

  const closeMissingDepsDialog = () => {
    if (missingDepsDialog.isDownloading) return;
    setMissingDepsDialog({
      isOpen: false,
      file: null,
      dependencies: [],
      totalSize: 0,
      isDownloading: false,
      downloadProgress: 0,
    });
  };

  // --- External Link dialog handlers ---

  const handleExternalLinkConfirm = (dontShowAgain: boolean) => {
    const api = window.api;
    if (!api) return;

    if (dontShowAgain) {
      try {
        localStorage.setItem(
          STORAGE_KEYS.FILE_EXPLORER,
          withSkipExternalLinkWarning(localStorage.getItem(STORAGE_KEYS.FILE_EXPLORER))
        );
      } catch (e) {
        logger.error(
          'Failed to save file explorer settings',
          e instanceof Error ? e : undefined
        );
      }
    }

    if (externalLinkDialog.url) {
      api.openExternal(externalLinkDialog.url);
    }

    setExternalLinkDialog({ isOpen: false, url: '', title: '' });
  };

  const closeExternalLinkDialog = () => {
    setExternalLinkDialog({ isOpen: false, url: '', title: '' });
  };

  // --- Page Download dialog handlers ---

  const handleDownloadPage = async () => {
    const api = window.api;
    if (!api || !pageDownloadDialog.moduleItem) return;

    const moduleItem = pageDownloadDialog.moduleItem;
    const canonicalId = getCanonicalFileId(moduleItem);

    setPageDownloadDialog((prev) => ({ ...prev, isDownloading: true }));
    setDownloadingIds((prev) => new Set(prev).add(canonicalId));

    try {
      const downloadResult = await api.downloadPageContent?.(moduleItem.id);
      if (downloadResult?.success && downloadResult.localPath) {
        logger.debug('Downloaded page, now opening');
        const openResult = await api.openPageFile?.(moduleItem.id);
        if (openResult?.success) {
          logger.debug('Opened downloaded page file');
        }
        fetchFiles();
      } else {
        logger.error(`Failed to download page: ${downloadResult?.error}`);
      }
    } catch (error) {
      logger.error('Error downloading page', error instanceof Error ? error : undefined);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(canonicalId);
        return next;
      });
      setPageDownloadDialog({ isOpen: false, moduleItem: null, isDownloading: false });
    }
  };

  const handleOpenPageInCanvas = () => {
    const api = window.api;
    if (!api || !pageDownloadDialog.moduleItem) return;

    const moduleItem = pageDownloadDialog.moduleItem;
    const url = moduleItem.externalUrl || moduleItem.url;
    if (url) {
      api.openExternal(url);
    }
    setPageDownloadDialog({ isOpen: false, moduleItem: null, isDownloading: false });
  };

  const closePageDownloadDialog = () => {
    if (pageDownloadDialog.isDownloading) return;
    setPageDownloadDialog({ isOpen: false, moduleItem: null, isDownloading: false });
  };

  // --- Show in folder ---

  const canShowInFolder = (file: FileItem): boolean => {
    if (file.source === 'page') return false;
    if (file.source === 'module') {
      return (file as FileModuleItem).itemType === 'File';
    }
    return true;
  };

  const handleShowInFolder = (file: FileItem) => {
    const api = window.api;
    if (!api) return;
    if (!canShowInFolder(file)) return;

    if (file.source === 'attachment') {
      api.showAttachmentInFolder(file.id).catch((error) => {
        logger.error(
          'Failed to show in folder',
          error instanceof Error ? error : undefined
        );
      });
    } else if (file.source === 'module') {
      const moduleItem = file as FileModuleItem;
      if (moduleItem.contentId) {
        api.showResourceInFolderByExternalId(moduleItem.contentId).catch((error) => {
          logger.error(
            'Failed to show module file in folder',
            error instanceof Error ? error : undefined
          );
        });
      }
    } else {
      api.showResourceInFolder(file.id).catch((error) => {
        logger.error(
          'Failed to show in folder',
          error instanceof Error ? error : undefined
        );
      });
    }
  };

  // --- Context menu handlers ---

  const handleContextMenu = (file: FileItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ file, x: e.clientX, y: e.clientY });
  };

  const handleCopyPath = async (file: FileItem) => {
    if (file.source === 'page') return;

    let localPath: string | null = null;

    if (file.source === 'attachment') {
      localPath = (file as FileAttachment).localPath;
    } else if (file.source === 'resource') {
      localPath = (file as FileResource).localPath;
    } else if (file.source === 'module') {
      const moduleItem = file as FileModuleItem;
      if (moduleItem.itemType === 'File' && moduleItem.contentId) {
        const matchingResource = files.resources.find(
          (r) => r.externalId === moduleItem.contentId
        );
        localPath = matchingResource?.localPath ?? null;
      }
    }

    if (localPath) {
      try {
        await navigator.clipboard.writeText(localPath);
      } catch (err) {
        logger.error('Failed to copy path', err instanceof Error ? err : undefined);
      }
    }
  };

  const handleDeleteLocal = async (file: FileItem) => {
    const api = window.api;
    if (!api?.deleteResourceLocal) return;

    let resourceId: number | null = null;

    if (file.source === 'resource') {
      resourceId = file.id;
    } else if (file.source === 'module') {
      const moduleItem = file as FileModuleItem;
      if (moduleItem.itemType === 'File' && moduleItem.contentId) {
        const matchingResource = files.resources.find(
          (r) => r.externalId === moduleItem.contentId
        );
        resourceId = matchingResource?.id ?? null;
      }
    }

    if (resourceId === null) return;

    try {
      const result = await api.deleteResourceLocal(resourceId);
      if (result.success) {
        await fetchFiles();
      } else {
        logger.error(`Delete failed: ${result.error}`);
      }
    } catch (error) {
      logger.error(
        'Failed to delete local copy',
        error instanceof Error ? error : undefined
      );
    }
  };

  const handleOpenInCanvas = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    try {
      if (file.source === 'resource') {
        const result = await api.getResourceCanvasUrl(file.id, 'resource');
        if (result?.success && result.data?.canvasUrl) {
          api.openExternal(result.data.canvasUrl);
        }
      } else if (file.source === 'page') {
        const page = file as FilePage;
        const result = await api.getPage(page.id);
        if (result?.success && result.data?.canvasUrl) {
          api.openExternal(result.data.canvasUrl);
        }
      } else if (file.source === 'attachment') {
        const result = await api.getResourceCanvasUrl(file.id, 'attachment');
        if (result?.success && result.data?.canvasUrl) {
          api.openExternal(result.data.canvasUrl);
        }
      } else if (file.source === 'module') {
        const moduleItem = file as FileModuleItem;
        if (moduleItem.url) {
          api.openExternal(moduleItem.url);
        }
      }
    } catch (err) {
      logger.error('Failed to open in Canvas', err instanceof Error ? err : undefined);
    }
  };

  const handleShowProperties = (file: FileItem) => {
    setPropertiesFile(file);
  };

  return {
    // Download confirmation
    pendingDownload,
    setPendingDownload,
    handleDownload,
    confirmDownload,

    // Open
    handleOpen,

    // Context menu
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleCopyPath,
    handleDeleteLocal,
    handleOpenInCanvas,

    // Properties
    propertiesFile,
    setPropertiesFile,
    handleShowProperties,

    // Missing dependencies
    missingDepsDialog,
    handleDownloadDependencies,
    handleOpenAnyway,
    closeMissingDepsDialog,

    // External link
    externalLinkDialog,
    handleExternalLinkConfirm,
    closeExternalLinkDialog,

    // Page download
    pageDownloadDialog,
    handleDownloadPage,
    handleOpenPageInCanvas,
    closePageDownloadDialog,

    // Content changed warning
    contentChangedWarning,
    setContentChangedWarning,
    handleRedownloadAfterChange,

    // Show in folder
    canShowInFolder,
    handleShowInFolder,
  };
}
