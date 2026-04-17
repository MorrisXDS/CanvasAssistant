/**
 * useFilesPageState Hook
 * Core state management for FilesPage: data fetching, filtering, expansion, view mode
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useStore } from '../../../l5-presentation/store';
import { useFileUpdates } from '../../hooks';
import type { UpdateType } from '../shared';
import { getFileName, isFileDownloaded, getModuleItemFolderPath } from './FileListItem';
import type { FileResource, FilePage, FileModuleItem, FileItem } from './FileListItem';
import type { SourceFilter, StatusFilter, SizeFilter } from './FileFilterPanel';
import { getCoursePrefix, getCourseTerm, getShortCode } from './folderTypes';
import { useFolderDragDrop } from './useFolderDragDrop';
import { useFilesCourseDragDrop } from './useFilesCourseDragDrop';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import type {
  FilesData,
  ViewMode,
  FileExplorerSettings,
  ViewPreferences,
} from './filesPageTypes';
import { createLogger } from '../../utils/rendererLogger';
import {
  loadFileExplorerSettings,
  loadExpandedState,
  saveExpandedState,
  loadViewPrefs,
  saveViewPrefs,
  getFileExtension,
  matchesSizeFilter,
} from './filesPageUtils';

const logger = createLogger('FilesState');

export function useFilesPageState() {
  const { courses, syncStatus, triggerSync, syncUpdates, markAllSyncUpdatesSeen } =
    useStore();

  // Notification dots for files
  const { byId: fileUpdatesById, byExternalId: fileUpdatesByExternalId } =
    useFileUpdates();

  const [files, setFiles] = useState<FilesData>({
    resources: [],
    attachments: [],
    pages: [],
    moduleItems: [],
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Settings
  const [explorerSettings] = useState<FileExplorerSettings>(() =>
    loadFileExplorerSettings()
  );
  const [viewPrefs, setViewPrefs] = useState<ViewPreferences>(() => loadViewPrefs());
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = loadViewPrefs();
    return saved.viewMode || explorerSettings.defaultViewMode;
  });

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      const newPrefs = { ...viewPrefs, viewMode: mode };
      setViewPrefs(newPrefs);
      saveViewPrefs(newPrefs);
    },
    [viewPrefs]
  );

  // Expanded state
  const [expandedCourses, setExpandedCourses] = useState<Set<number>>(() => {
    if (explorerSettings.defaultState === 'collapsed') return new Set();
    if (explorerSettings.defaultState === 'remember') {
      const saved = loadExpandedState();
      return new Set(saved.courses);
    }
    return new Set();
  });

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    if (explorerSettings.defaultState === 'collapsed') return new Set();
    if (explorerSettings.defaultState === 'remember') {
      const saved = loadExpandedState();
      return new Set(saved.folders);
    }
    return new Set();
  });

  // Folder drag-and-drop reordering
  const folderDragDrop = useFolderDragDrop();

  // Course drag-and-drop reordering (in files page)
  const filesCourseIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const coursesDragDrop = useFilesCourseDragDrop(filesCourseIds);

  const [hasAppliedDefaultExpand, setHasAppliedDefaultExpand] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [selectedPrefixes, setSelectedPrefixes] = useState<Set<string>>(new Set());
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number> | null>(null);

  // Sync config states
  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [filesDirectory, setFilesDirectory] = useState<string>('');

  // Fetch files directory path
  useEffect(() => {
    const api = window.api;
    if (api?.getFilesDirectory) {
      api.getFilesDirectory().then((result) => {
        setFilesDirectory(result.path);
      });
    }
  }, []);

  // Fetch files
  const fetchFiles = useCallback(async () => {
    const api = window.api;
    if (!api?.getFiles) {
      setLoading(false);
      return;
    }

    try {
      const [filesData, moduleItemsData] = await Promise.all([
        api.getFiles(),
        api.getModuleItems?.() ?? [],
      ]);
      setFiles({
        ...filesData,
        moduleItems: moduleItemsData,
      });
    } catch (error) {
      logger.error('Failed to fetch files', error instanceof Error ? error : undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Listen for file status changes from FileWatcher (via store)
  useEffect(() => {
    const handleFileStatusChanged = () => {
      logger.debug('file-status-changed event received, refetching files');
      fetchFiles();
    };

    window.addEventListener('file-status-changed', handleFileStatusChanged);
    return () => {
      window.removeEventListener('file-status-changed', handleFileStatusChanged);
    };
  }, [fetchFiles]);

  // Handle 'expanded' default state
  useEffect(() => {
    if (
      explorerSettings.defaultState === 'expanded' &&
      !hasAppliedDefaultExpand &&
      !loading
    ) {
      const courseIds = new Set([
        ...files.attachments.map((a) => a.courseId),
        ...files.resources.map((r) => r.courseId),
        ...files.pages.map((p) => p.courseId),
        ...files.moduleItems.map((m) => m.courseId),
      ]);
      setExpandedCourses(courseIds);

      const folderKeys = new Set<string>();
      files.resources.forEach((r) => {
        if (r.folderPath) {
          folderKeys.add(`${r.courseId}:${r.folderPath}`);
        }
      });
      files.attachments.forEach((a) => {
        folderKeys.add(`${a.courseId}:Announcements`);
      });
      files.pages.forEach((p) => {
        folderKeys.add(`${p.courseId}:${p.folderPath}`);
      });
      files.moduleItems.forEach((m) => {
        folderKeys.add(`${m.courseId}:${getModuleItemFolderPath(m)}`);
      });
      setExpandedFolders(folderKeys);
      setHasAppliedDefaultExpand(true);
    }
  }, [explorerSettings.defaultState, hasAppliedDefaultExpand, loading, files]);

  // Course map
  const courseMap = useMemo(() => {
    return new Map(courses.map((c) => [c.id, c]));
  }, [courses]);

  // Extract available filters
  const { availablePrefixes, availableTerms, availableExtensions } = useMemo(() => {
    const prefixes = new Set<string>();
    const terms = new Set<string>();
    const extensions = new Map<string, number>();

    const allCourseIds = new Set([
      ...files.attachments.map((a) => a.courseId),
      ...files.resources.map((r) => r.courseId),
      ...files.moduleItems.map((m) => m.courseId),
    ]);

    for (const courseId of allCourseIds) {
      const course = courseMap.get(courseId);
      if (course) {
        prefixes.add(getCoursePrefix(course.code));
        terms.add(getCourseTerm(course.code));
      }
    }

    const allFilesForExtensions: FileItem[] = [
      ...files.attachments,
      ...files.resources,
      ...files.pages,
      ...files.moduleItems,
    ];
    for (const file of allFilesForExtensions) {
      const ext = getFileExtension(file);
      if (ext) {
        extensions.set(ext, (extensions.get(ext) || 0) + 1);
      }
    }

    const sortedExtensions = Array.from(extensions.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ext]) => ext);

    return {
      availablePrefixes: Array.from(prefixes).sort(),
      availableTerms: Array.from(terms).sort(),
      availableExtensions: sortedExtensions,
    };
  }, [files, courseMap]);

  // Courses with files
  const coursesWithFiles = useMemo(() => {
    const courseIds = new Set([
      ...files.attachments.map((a) => a.courseId),
      ...files.resources.map((r) => r.courseId),
      ...files.moduleItems.map((m) => m.courseId),
    ]);
    return courses
      .filter((c) => courseIds.has(c.id))
      .sort((a, b) => getShortCode(a.code).localeCompare(getShortCode(b.code)));
  }, [files, courses]);

  // Courses by prefix
  const coursesByPrefix = useMemo(() => {
    const grouped = new Map<string, typeof coursesWithFiles>();
    for (const course of coursesWithFiles) {
      const prefix = getCoursePrefix(course.code);
      if (!grouped.has(prefix)) {
        grouped.set(prefix, []);
      }
      grouped.get(prefix)!.push(course);
    }
    return grouped;
  }, [coursesWithFiles]);

  // Get folder path for a file
  const getFileFolderPath = (file: FileItem): string => {
    if (file.source === 'resource') {
      return (file as FileResource).folderPath || '';
    }
    if (file.source === 'page') {
      return (file as FilePage).folderPath || 'Pages';
    }
    if (file.source === 'module') {
      return getModuleItemFolderPath(file as FileModuleItem);
    }
    return 'Announcements';
  };

  // Group and filter files
  const groupedFiles = useMemo(() => {
    // Build a set of content that's already covered by HTML resources
    const coveredPageSlugs = new Set<string>();
    const coveredAssignments = new Set<string>();
    const coveredByTitle = new Set<string>();

    // Track resource externalIds so module File items that reference the same file are filtered out
    const coveredFileExternalIds = new Set<string>();

    for (const resource of files.resources) {
      const r = resource as FileResource;
      if (r.externalId) {
        // All resources cover their externalId (for File-type module item dedup)
        coveredFileExternalIds.add(r.externalId);

        const pageMatch = r.externalId.match(/^html-page-(.+)$/);
        if (pageMatch) {
          coveredPageSlugs.add(`${r.courseId}:${pageMatch[1]}`);
          coveredByTitle.add(`${r.courseId}:${r.title.toLowerCase().trim()}`);
        }
        const assignmentMatch = r.externalId.match(/^html-assignment-(\d+)$/);
        if (assignmentMatch) {
          coveredAssignments.add(`${r.courseId}:${assignmentMatch[1]}`);
          coveredByTitle.add(`${r.courseId}:${r.title.toLowerCase().trim()}`);
        }
        const quizMatch = r.externalId.match(/^html-quiz-(\d+)$/);
        if (quizMatch) {
          coveredByTitle.add(`${r.courseId}:${r.title.toLowerCase().trim()}`);
        }
      }
    }

    const deduplicatedModuleItems = files.moduleItems.filter((item) => {
      const m = item as FileModuleItem;

      // File-type module items that reference an existing resource are duplicates
      if (m.itemType === 'File' && m.contentId) {
        if (coveredFileExternalIds.has(m.contentId)) {
          return false;
        }
      }

      if (m.itemType === 'Page' && m.pageUrl) {
        if (coveredPageSlugs.has(`${m.courseId}:${m.pageUrl}`)) {
          return false;
        }
      }

      if (m.itemType === 'Assignment' && m.contentId) {
        if (coveredAssignments.has(`${m.courseId}:${m.contentId}`)) {
          return false;
        }
      }

      const normalizedTitle = m.title.toLowerCase().trim();
      if (coveredByTitle.has(`${m.courseId}:${normalizedTitle}`)) {
        return false;
      }

      return true;
    });

    const allFiles: FileItem[] = [
      ...files.attachments,
      ...files.resources,
      ...files.pages,
      ...deduplicatedModuleItems,
    ];

    const filtered = allFiles.filter((f) => {
      const course = courseMap.get(f.courseId);
      if (!course) return false;

      if (searchQuery) {
        const name = getFileName(f).toLowerCase();
        if (!name.includes(searchQuery.toLowerCase())) return false;
      }

      if (selectedPrefixes.size > 0) {
        const prefix = getCoursePrefix(course.code);
        if (!selectedPrefixes.has(prefix)) return false;
      }

      if (selectedTerms.size > 0) {
        const term = getCourseTerm(course.code);
        if (!selectedTerms.has(term)) return false;
      }

      if (sourceFilter !== 'all') {
        if (sourceFilter === 'canvas' && f.source !== 'resource') return false;
        if (sourceFilter === 'announcements' && f.source !== 'attachment') return false;
        if (sourceFilter === 'modules' && f.source !== 'module') return false;
      }

      if (statusFilter !== 'all') {
        const downloaded = isFileDownloaded(f);
        if (statusFilter === 'downloaded' && !downloaded) return false;
        if (statusFilter === 'pending' && downloaded) return false;
      }

      if (selectedExtensions.size > 0) {
        const ext = getFileExtension(f);
        if (!selectedExtensions.has(ext)) return false;
      }

      if (!matchesSizeFilter(f, sizeFilter)) return false;

      if (selectedCourseIds !== null && !selectedCourseIds.has(f.courseId)) {
        return false;
      }

      return true;
    });

    const groups = new Map<number, Map<string, FileItem[]>>();
    for (const file of filtered) {
      const courseId = file.courseId;
      const folderPath = getFileFolderPath(file);

      if (!groups.has(courseId)) {
        groups.set(courseId, new Map());
      }
      const courseGroup = groups.get(courseId)!;
      if (!courseGroup.has(folderPath)) {
        courseGroup.set(folderPath, []);
      }
      courseGroup.get(folderPath)!.push(file);
    }

    for (const [, folderGroups] of groups) {
      for (const [, fileList] of folderGroups) {
        fileList.sort((a, b) => getFileName(a).localeCompare(getFileName(b)));
      }
    }

    return groups;
  }, [
    files,
    searchQuery,
    selectedPrefixes,
    selectedTerms,
    sourceFilter,
    statusFilter,
    selectedExtensions,
    sizeFilter,
    courseMap,
    selectedCourseIds,
  ]);

  // Build a map of folder path -> module position for default sorting
  const folderModulePositions = useMemo(() => {
    const positions = new Map<number, Map<string, number>>();
    for (const item of files.moduleItems) {
      const courseId = item.courseId;
      const folderPath = getModuleItemFolderPath(item);

      if (!positions.has(courseId)) {
        positions.set(courseId, new Map());
      }
      const coursePositions = positions.get(courseId)!;

      const existing = coursePositions.get(folderPath);
      if (existing === undefined || item.modulePosition < existing) {
        coursePositions.set(folderPath, item.modulePosition);
      }
    }
    return positions;
  }, [files.moduleItems]);

  // Counts
  const totalFiles =
    files.attachments.length +
    files.resources.length +
    files.pages.length +
    files.moduleItems.length;
  const filteredCount = Array.from(groupedFiles.values()).reduce((sum, folderMap) => {
    return (
      sum + Array.from(folderMap.values()).reduce((fSum, list) => fSum + list.length, 0)
    );
  }, 0);
  const downloadedCount = [
    ...files.attachments,
    ...files.resources,
    ...files.pages,
    ...files.moduleItems,
  ].filter(isFileDownloaded).length;
  const hasActiveFilters =
    selectedPrefixes.size > 0 ||
    selectedTerms.size > 0 ||
    sourceFilter !== 'all' ||
    statusFilter !== 'all' ||
    selectedExtensions.size > 0 ||
    sizeFilter !== 'all' ||
    selectedCourseIds !== null;

  // Toggle helpers
  const toggleCourse = (courseId: number) => {
    const isExpanding = !expandedCourses.has(courseId);

    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      if (explorerSettings.defaultState === 'remember') {
        saveExpandedState(next, expandedFolders);
      }
      return next;
    });

    // Mark all file/page updates for this course as seen when expanding
    if (isExpanding) {
      markAllSyncUpdatesSeen({
        courseId,
        entityType: 'file',
        excludeActionRequired: true,
      });
      markAllSyncUpdatesSeen({
        courseId,
        entityType: 'page',
        excludeActionRequired: true,
      });
    }
  };

  const getFolderKey = (courseId: number, folderPath: string) =>
    `${courseId}:${folderPath}`;

  const toggleFolder = (courseId: number, folderPath: string) => {
    const key = getFolderKey(courseId, folderPath);
    const isExpanding = !expandedFolders.has(key);

    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      if (explorerSettings.defaultState === 'remember') {
        saveExpandedState(expandedCourses, next);
      }
      return next;
    });

    // On expand, sync folder files from Canvas in background (non-blocking)
    if (isExpanding && folderPath && window.api?.syncFolderByPath) {
      window.api
        .syncFolderByPath({ courseId, folderPath })
        .then((result) => {
          if (result.success && result.data && result.data.count > 0) {
            fetchFiles();
          }
        })
        .catch((error) => {
          logger.error(
            'Failed to sync folder files',
            error instanceof Error ? error : undefined
          );
        });
    }

    // Mark file updates in this folder as seen when expanding
    if (isExpanding) {
      const updateIdsToMark = syncUpdates.updates
        .filter((u) => {
          if (u.courseId !== courseId) return false;
          if (u.entityType !== 'file' && u.entityType !== 'page') return false;
          if (u.seenAt !== null) return false;
          const updateFolderPath = u.subtitle || '';
          return updateFolderPath === folderPath;
        })
        .map((u) => u.id);

      if (updateIdsToMark.length > 0 && window.api?.markSyncUpdatesSeen) {
        window.api.markSyncUpdatesSeen(updateIdsToMark).catch((error) => {
          logger.error(
            'Failed to mark folder updates as seen',
            error instanceof Error ? error : undefined
          );
        });
      }
    }
  };

  const isFolderExpanded = (courseId: number, folderPath: string) => {
    return expandedFolders.has(getFolderKey(courseId, folderPath));
  };

  // Helper to get file update by checking both ID and externalId
  const getFileUpdate = useCallback(
    (file: FileItem) => {
      const byId = fileUpdatesById.get(file.id);
      if (byId) return byId;

      if (file.source === 'module') {
        const moduleItem = file as FileModuleItem;
        if (moduleItem.contentId) {
          return fileUpdatesByExternalId.get(moduleItem.contentId) ?? null;
        }
      }

      if (file.source === 'resource') {
        const resource = file as FileResource;
        if (resource.externalId) {
          return fileUpdatesByExternalId.get(resource.externalId) ?? null;
        }
      }

      return null;
    },
    [fileUpdatesById, fileUpdatesByExternalId]
  );

  // Get individual file updates in a folder
  const getFolderFileUpdates = useCallback(
    (_courseId: number, _folderPath: string, folderFiles: FileItem[]) => {
      const updates: Array<{ fileId: number; updateType: UpdateType }> = [];
      for (const file of folderFiles) {
        const update = getFileUpdate(file);
        if (update) {
          updates.push({ fileId: file.id, updateType: update.updateType });
        }
      }
      return updates;
    },
    [getFileUpdate]
  );

  // Check if a course has any file/page updates
  const courseHasFileUpdates = (courseId: number) => {
    for (const update of syncUpdates.updates) {
      if (update.courseId !== courseId) continue;
      if (update.entityType !== 'file' && update.entityType !== 'page') continue;
      if (update.seenAt !== null) continue;
      return true;
    }
    return false;
  };

  // Get update type for a file
  const getFileUpdateType = useCallback(
    (file: FileItem): UpdateType | null => {
      const update = getFileUpdate(file);
      return update?.updateType ?? null;
    },
    [getFileUpdate]
  );

  // Mark file update as seen
  const markFileUpdateSeen = useCallback(
    (file: FileItem) => {
      const update = getFileUpdate(file);
      if (update && update.updateIds.length > 0) {
        window.api?.markSyncUpdatesSeen?.(update.updateIds).catch((err: unknown) => {
          logger.error(
            'Failed to mark file update as seen',
            err instanceof Error ? err : undefined
          );
        });
      }
    },
    [getFileUpdate]
  );

  // Filter toggles
  const togglePrefix = (prefix: string) => {
    setSelectedPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const toggleTerm = (term: string) => {
    setSelectedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedPrefixes(new Set());
    setSelectedTerms(new Set());
    setSourceFilter('all');
    setStatusFilter('all');
    setSelectedExtensions(new Set());
    setSizeFilter('all');
    setSelectedCourseIds(null);
  };

  const toggleExtension = (ext: string) => {
    setSelectedExtensions((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  };

  const toggleCourseFilter = (courseId: number) => {
    setSelectedCourseIds((prev) => {
      if (prev === null) {
        const all = new Set(coursesWithFiles.map((c) => c.id));
        all.delete(courseId);
        return all;
      }
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      if (next.size === coursesWithFiles.length) return null;
      return next;
    });
  };

  const isCourseFilterSelected = (courseId: number) => {
    return selectedCourseIds === null || selectedCourseIds.has(courseId);
  };

  const handleSync = async () => {
    let termSelection: 'all' | 'auto' | string = 'auto';
    try {
      const academicSettings = localStorage.getItem(STORAGE_KEYS.ACADEMIC);
      if (academicSettings) {
        const settings = JSON.parse(academicSettings);
        termSelection = settings.termSelection || 'auto';
      }
    } catch (e) {
      logger.error(
        'Failed to parse academic settings',
        e instanceof Error ? e : undefined
      );
    }

    await triggerSync('full', { termSelection });
    await fetchFiles();
  };

  const handleOpenFilesDirectory = () => {
    const api = window.api;
    if (api?.openFilesDirectory) {
      api.openFilesDirectory().catch((error) => {
        logger.error(
          'Failed to open files directory',
          error instanceof Error ? error : undefined
        );
      });
    }
  };

  // Clear files sync confirmation state
  const [clearFilesSyncConfirmOpen, setClearFilesSyncConfirmOpen] = useState(false);

  const handleClearFilesSync = () => {
    setClearFilesSyncConfirmOpen(true);
  };

  const confirmClearFilesSync = async () => {
    setClearFilesSyncConfirmOpen(false);
    const api = window.api;
    if (api?.clearFilesSync) {
      await api.clearFilesSync();
      await fetchFiles();
    }
  };

  const cancelClearFilesSync = () => {
    setClearFilesSyncConfirmOpen(false);
  };

  return {
    // Store data
    courses,
    syncStatus,
    syncUpdates,

    // File data
    files,
    loading,
    fetchFiles,

    // View mode
    viewMode,
    setViewMode,

    // Search
    searchQuery,
    setSearchQuery,

    // Expanded state
    expandedCourses,
    expandedFolders,
    toggleCourse,
    toggleFolder,
    isFolderExpanded,

    // Drag and drop
    folderDragDrop,
    coursesDragDrop,

    // Downloading
    downloadingIds,
    setDownloadingIds,

    // Filters
    showFilters,
    setShowFilters,
    selectedPrefixes,
    selectedTerms,
    sourceFilter,
    setSourceFilter,
    statusFilter,
    setStatusFilter,
    selectedExtensions,
    sizeFilter,
    setSizeFilter,
    selectedCourseIds,
    setSelectedCourseIds,
    hasActiveFilters,

    // Computed data
    courseMap,
    availablePrefixes,
    availableTerms,
    availableExtensions,
    coursesWithFiles,
    coursesByPrefix,
    groupedFiles,
    folderModulePositions,
    totalFiles,
    filteredCount,
    downloadedCount,

    // Filter actions
    togglePrefix,
    toggleTerm,
    clearFilters,
    toggleExtension,
    toggleCourseFilter,
    isCourseFilterSelected,

    // File updates
    getFileUpdateType,
    markFileUpdateSeen,
    getFolderFileUpdates,
    courseHasFileUpdates,

    // Sync config
    showSyncConfig,
    setShowSyncConfig,
    filesDirectory,

    // Actions
    handleSync,
    handleOpenFilesDirectory,
    handleClearFilesSync,

    // Clear files sync confirmation
    clearFilesSyncConfirmOpen,
    confirmClearFilesSync,
    cancelClearFilesSync,
  };
}
