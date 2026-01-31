/**
 * Files Page
 * Refactored file browser with folder hierarchy, type colors, and extracted components
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FolderOpen,
  Loader2,
  Search,
  Grid,
  List,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Filter,
  X,
  Square,
  CheckSquare,
  Settings,
  Megaphone,
  BookOpen,
  FlaskConical,
  ClipboardList,
  GraduationCap,
  FileQuestion,
  Library,
  FolderArchive,
  GripVertical,
  FileText,
} from 'lucide-react';
import { Card, ConfirmDialog, Dropdown } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import styles from './FilesPage.module.css';

// Import extracted components
import {
  FileListItem,
  FileItem,
  FileAttachment,
  FileResource,
  FilePage,
  FileModuleItem,
  getFileName,
  isFileDownloaded,
  getModuleItemFolderPath,
} from './FileListItem';
import { FileGridItem } from './FileGridItem';
import {
  FileFilterPanel,
  SourceFilter,
  StatusFilter,
  SizeFilter,
} from './FileFilterPanel';
import { FileSyncConfig } from './FileSyncConfig';
import { FileSelectionBar, DownloadProgress } from './FileSelectionBar';
import { FileContextMenu, FilePropertiesContent } from './FileContextMenu';
import {
  MissingDependenciesDialog,
  MissingDependency,
} from './MissingDependenciesDialog';
import { ExternalLinkDialog } from './ExternalLinkDialog';
import {
  getFolderTypeFromPath,
  getFolderDepth,
  getCourseColor,
  getShortCode,
  getCoursePrefix,
  getCourseTerm,
  FolderTypeConfig,
} from './folderTypes';
import { useFolderDragDrop } from './useFolderDragDrop';
import { useFilesCourseDragDrop } from './useFilesCourseDragDrop';

// Storage keys
const EXPANDED_STATE_KEY = 'fileExplorerExpandedState';
const VIEW_PREFS_KEY = 'fileExplorerViewPrefs';
const FILE_EXPLORER_SETTINGS_KEY = 'fileExplorerSettings';

interface ExpandedState {
  courses: number[];
  folders: string[];
}

interface ViewPreferences {
  defaultExpandAll: boolean;
  viewMode: 'list' | 'grid';
}

interface FileExplorerSettings {
  defaultState: 'collapsed' | 'expanded' | 'remember';
  defaultViewMode: 'list' | 'grid';
}

interface FilesData {
  resources: FileResource[];
  attachments: FileAttachment[];
  pages: FilePage[];
  moduleItems: FileModuleItem[];
}

type ViewMode = 'list' | 'grid';

// Storage helpers
function loadFileExplorerSettings(): FileExplorerSettings {
  try {
    const stored = localStorage.getItem(FILE_EXPLORER_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load file explorer settings:', e);
  }
  return { defaultState: 'remember', defaultViewMode: 'list' };
}

function loadExpandedState(): ExpandedState {
  try {
    const stored = localStorage.getItem(EXPANDED_STATE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load expanded state:', e);
  }
  return { courses: [], folders: [] };
}

function saveExpandedState(courses: Set<number>, folders: Set<string>): void {
  try {
    localStorage.setItem(
      EXPANDED_STATE_KEY,
      JSON.stringify({
        courses: Array.from(courses),
        folders: Array.from(folders),
      })
    );
  } catch (e) {
    console.error('Failed to save expanded state:', e);
  }
}

function loadViewPrefs(): ViewPreferences {
  try {
    const stored = localStorage.getItem(VIEW_PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load view preferences:', e);
  }
  return { defaultExpandAll: false, viewMode: 'list' };
}

function saveViewPrefs(prefs: ViewPreferences): void {
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save view preferences:', e);
  }
}

// Get file extension
function getFileExtension(file: FileItem): string {
  const filename = getFileName(file);
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return filename.includes('.') ? ext : '';
}

// Check file size against filter
function matchesSizeFilter(file: FileItem, filter: SizeFilter): boolean {
  if (filter === 'all') return true;
  const size = file.sizeBytes;
  if (size === null) return false;

  const MB = 1024 * 1024;
  switch (filter) {
    case 'small':
      return size < 1 * MB;
    case 'medium':
      return size >= 1 * MB && size < 10 * MB;
    case 'large':
      return size >= 10 * MB;
    default:
      return true;
  }
}

// Get folder icon based on type
function getFolderIcon(type: FolderTypeConfig, size: number = 14) {
  switch (type.type) {
    case 'announcements':
      return <Megaphone size={size} />;
    case 'lectures':
      return <BookOpen size={size} />;
    case 'labs':
      return <FlaskConical size={size} />;
    case 'assignments':
      return <ClipboardList size={size} />;
    case 'tutorials':
      return <GraduationCap size={size} />;
    case 'exams':
      return <FileQuestion size={size} />;
    case 'resources':
      return <Library size={size} />;
    case 'pages':
      return <FileText size={size} />;
    default:
      return <FolderArchive size={size} />;
  }
}

export function FilesPage() {
  const { courses, syncStatus, triggerSync } = useStore();
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
  const {
    draggedFolder,
    dragOverFolder,
    handleDragStart: folderDragStart,
    handleDragOver: folderDragOver,
    handleDragLeave: folderDragLeave,
    handleDragEnd: folderDragEnd,
    handleDrop: folderDrop,
    sortFoldersByCustomOrder,
    hasCustomOrder: hasFolderCustomOrder,
    resetAllOrders: _resetFolderOrders,
    hasAnyCustomOrder: _hasCustomFolderOrder,
  } = useFolderDragDrop();

  // Course drag-and-drop reordering (in files page)
  const filesCourseIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const {
    sortByCustomOrder: sortCoursesByCustomOrder,
    draggedCourseId: filesDraggedCourseId,
    dragOverCourseId: filesDragOverCourseId,
    handleDragStart: filesCoursesDragStart,
    handleDragOver: filesCoursesDragOver,
    handleDragLeave: filesCoursesDragLeave,
    handleDragEnd: filesCoursesDragEnd,
    handleDrop: filesCoursesDrop,
    resetOrder: _resetFilesCourseOrder,
    hasCustomOrder: _hasCustomFilesCourseOrder,
  } = useFilesCourseDragDrop(filesCourseIds);

  const [hasAppliedDefaultExpand, setHasAppliedDefaultExpand] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<FileItem | null>(null);

  // Filter states
  const [selectedPrefixes, setSelectedPrefixes] = useState<Set<string>>(new Set());
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedExtensions, setSelectedExtensions] = useState<Set<string>>(new Set());
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all');
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number> | null>(null);

  // Selection states
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Download progress state
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  // Sync config states
  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [filesDirectory, setFilesDirectory] = useState<string>('');

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    file: FileItem;
    x: number;
    y: number;
  } | null>(null);

  // Properties dialog state
  const [propertiesFile, setPropertiesFile] = useState<FileItem | null>(null);

  // Missing dependencies dialog state
  const [missingDepsDialog, setMissingDepsDialog] = useState<{
    isOpen: boolean;
    file: FileItem | null;
    dependencies: MissingDependency[];
    totalSize: number;
    isDownloading: boolean;
    downloadProgress: number;
  }>({
    isOpen: false,
    file: null,
    dependencies: [],
    totalSize: 0,
    isDownloading: false,
    downloadProgress: 0,
  });

  // External link dialog state
  const [externalLinkDialog, setExternalLinkDialog] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
  }>({
    isOpen: false,
    url: '',
    title: '',
  });

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
      console.error('Failed to fetch files:', error);
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
      console.debug('[FilesPage] file-status-changed event received, refetching files');
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
    const allFiles: FileItem[] = [
      ...files.attachments,
      ...files.resources,
      ...files.pages,
      ...files.moduleItems,
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
  // Module folders should appear in Canvas module order
  const folderModulePositions = useMemo(() => {
    const positions = new Map<number, Map<string, number>>();
    for (const item of files.moduleItems) {
      const courseId = item.courseId;
      const folderPath = getModuleItemFolderPath(item);

      if (!positions.has(courseId)) {
        positions.set(courseId, new Map());
      }
      const coursePositions = positions.get(courseId)!;

      // Use the minimum module position for each folder
      const existing = coursePositions.get(folderPath);
      if (existing === undefined || item.modulePosition < existing) {
        coursePositions.set(folderPath, item.modulePosition);
      }
    }
    return positions;
  }, [files.moduleItems]);

  // Counts
  const totalFiles =
    files.attachments.length + files.resources.length + files.pages.length + files.moduleItems.length;
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
      // Fire and forget - don't await, let it run in background
      window.api
        .syncFolderByPath({ courseId, folderPath })
        .then((result) => {
          if (result.success && result.data && result.data.count > 0) {
            // Refresh files data to show newly synced files
            fetchFiles();
          }
        })
        .catch((error) => {
          console.error('Failed to sync folder files:', error);
        });
    }
  };

  const isFolderExpanded = (courseId: number, folderPath: string) => {
    return expandedFolders.has(getFolderKey(courseId, folderPath));
  };

  // Filter toggles
  const togglePrefix = (prefix: string) => {
    setSelectedPrefixes((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
      }
      return next;
    });
  };

  const toggleTerm = (term: string) => {
    setSelectedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) {
        next.delete(term);
      } else {
        next.add(term);
      }
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
      if (next.has(ext)) {
        next.delete(ext);
      } else {
        next.add(ext);
      }
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
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      if (next.size === coursesWithFiles.length) {
        return null;
      }
      return next;
    });
  };

  const isCourseFilterSelected = (courseId: number) => {
    return selectedCourseIds === null || selectedCourseIds.has(courseId);
  };

  // File selection
  const getFileKey = (file: FileItem) => `${file.source}-${file.id}`;

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

  // Download handlers
  const handleDownload = (file: FileItem) => {
    if (downloadingIds.has(file.id)) return;
    setPendingDownload(file);
  };

  const executeDownload = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    setDownloadingIds((prev) => new Set(prev).add(file.id));

    try {
      let result;
      if (file.source === 'attachment') {
        result = await api.downloadAttachment(file.id);
      } else if (file.source === 'page') {
        // For pages, fetch content and export as HTML
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
        // For module items, check if it's a Page type
        const moduleItem = file as FileModuleItem;
        if (moduleItem.itemType === 'Page') {
          // Download page content from Canvas and save as HTML file
          result = await api.downloadPageContent(moduleItem.id);
        } else {
          // For File type module items, download the associated resource
          result = await api.downloadResource(file.id);
        }
      } else {
        result = await api.downloadResource(file.id);
      }
      if (result?.success) {
        await fetchFiles();
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
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

  const handleDownloadSelected = async () => {
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

    // Initialize progress tracking
    let completedCount = 0;
    const totalCount = filesToDownload.length;

    // Set initial progress
    setDownloadProgress({ total: totalCount, completed: 0, isComplete: false });

    // Progress update interval (every 100ms)
    const progressInterval = setInterval(() => {
      setDownloadProgress((prev) =>
        prev ? { ...prev, completed: completedCount } : null
      );
    }, 100);

    try {
      for (const file of filesToDownload) {
        setDownloadingIds((prev) => new Set(prev).add(file.id));
        try {
          if (file.source === 'attachment') {
            await api.downloadAttachment(file.id);
          } else if (file.source === 'page') {
            // For pages, fetch content and export as HTML
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
          } else {
            await api.downloadResource(file.id);
          }
          completedCount++;
        } catch (error) {
          console.error('Download failed:', error);
          completedCount++; // Still count as processed
        }
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }
    } finally {
      clearInterval(progressInterval);
    }

    // Set completion state
    setDownloadProgress({
      total: totalCount,
      completed: completedCount,
      isComplete: true,
    });

    await fetchFiles();
    setSelectedFiles(new Set());
    setSelectMode(false);

    // Clear progress after animation completes
    setTimeout(() => {
      setDownloadProgress(null);
    }, 3500);
  };

  const handleOpen = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    console.log('[FilesPage] handleOpen called');

    // Fire-and-forget: don't block UI while file opens in external app
    if (file.source === 'attachment') {
      api
        .openAttachment(file.id)
        .then(() => console.log('[FilesPage] openAttachment resolved'))
        .catch((error) => {
          console.error('Failed to open file:', error);
        });
    } else if (file.source === 'page') {
      // For pages, open the Canvas URL in browser
      const page = file as FilePage;
      api
        .getPage(page.id)
        .then((pageResult) => {
          if (pageResult?.success && pageResult.data?.canvasUrl) {
            api.openExternal(pageResult.data.canvasUrl);
          }
        })
        .catch((error) => {
          console.error('Failed to open page:', error);
        });
    } else if (file.source === 'module') {
      // For module items, check the type
      const moduleItem = file as FileModuleItem;

      // ExternalUrl items: Show confirmation dialog or open directly
      if (moduleItem.itemType === 'ExternalUrl') {
        // Get the URL - try externalUrl first, then url field
        const externalLink = moduleItem.externalUrl || moduleItem.url;

        if (!externalLink) {
          console.error('[FilesPage] ExternalUrl item has no URL');
          return;
        }

        // Check if user has disabled the warning
        let skipWarning = false;
        try {
          const storedSettings = localStorage.getItem('fileExplorerSettings');
          if (storedSettings) {
            const settings = JSON.parse(storedSettings);
            skipWarning = settings.skipExternalLinkWarning === true;
          }
        } catch (e) {
          console.error('Failed to read file explorer settings:', e);
        }

        if (skipWarning) {
          // Open directly in default browser
          api.openExternal(externalLink);
        } else {
          // Show confirmation dialog
          setExternalLinkDialog({
            isOpen: true,
            url: externalLink,
            title: moduleItem.title,
          });
        }
        return;
      }

      // If it's a Page type, try to open the downloaded HTML file
      if (moduleItem.itemType === 'Page') {
        try {
          // Try to open the already-downloaded HTML file
          const openResult = await api.openPageFile?.(moduleItem.id);
          if (openResult?.success) {
            console.log('[FilesPage] Opened module page file');
            return;
          }
        } catch (error) {
          console.log('[FilesPage] Failed to open module page file, falling back to Canvas URL');
        }
      }

      // Fall back to opening Canvas URL (for non-ExternalUrl items only)
      const url = moduleItem.externalUrl || moduleItem.url;
      if (url) {
        api.openExternal(url);
      }
    } else {
      // For resources, check for missing HTML dependencies
      try {
        const result = await api.openResource(file.id);

        if (result?.hasMissingDependencies && result.missingDependencies) {
          // Show missing dependencies dialog
          console.log(
            '[FilesPage] HTML has missing dependencies:',
            result.missingDependencies
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

        console.log('[FilesPage] openResource resolved');
      } catch (error) {
        console.error('Failed to open file:', error);
      }
    }
  };

  // State for content-changed warning
  const [contentChangedWarning, setContentChangedWarning] = useState<{
    show: boolean;
    fileId: number | null;
    fileName: string | null;
  }>({ show: false, fileId: null, fileName: null });

  // Handle downloading missing dependencies
  const handleDownloadDependencies = async () => {
    const api = window.api;
    if (!api || !missingDepsDialog.file) return;

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

      const result = await api.downloadHtmlDependencies(missingDepsDialog.file.id);

      clearInterval(progressInterval);

      if (result.success) {
        setMissingDepsDialog((prev) => ({ ...prev, downloadProgress: 100 }));

        // Check if content changed during download (sync may have updated HTML)
        const fileForWarning = missingDepsDialog.file;
        const contentChanged = result.contentChanged === true;

        // Close dialog and open the file after a brief delay
        setTimeout(async () => {
          setMissingDepsDialog({
            isOpen: false,
            file: null,
            dependencies: [],
            totalSize: 0,
            isDownloading: false,
            downloadProgress: 0,
          });

          // Refresh files list
          await fetchFiles();

          // Show content changed warning if detected
          if (contentChanged && fileForWarning) {
            setContentChangedWarning({
              show: true,
              fileId: fileForWarning.id,
              fileName: getFileName(fileForWarning),
            });
          }

          // Open the file with skipDependencyCheck=true since we just downloaded
          if (fileForWarning) {
            api.openResource(fileForWarning.id, true);
          }
        }, 500);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Failed to download dependencies:', error);
      setMissingDepsDialog((prev) => ({ ...prev, isDownloading: false }));
      throw error; // Re-throw so dialog shows error
    }
  };

  // Handle re-downloading after content changed warning
  const handleRedownloadAfterChange = async () => {
    const api = window.api;
    if (!api || !contentChangedWarning.fileId) return;

    setContentChangedWarning({ show: false, fileId: null, fileName: null });

    // Check dependencies again and trigger download
    const checkResult = await api.checkHtmlDependencies(contentChangedWarning.fileId);
    if (checkResult.success && checkResult.missingCount > 0) {
      // Re-open the dialog to download new dependencies
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
      // No new missing deps - trigger full re-download by clearing and re-downloading
      await api.downloadHtmlDependencies(contentChangedWarning.fileId);
      await fetchFiles();
    }
  };

  // Handle opening file without dependencies (broken offline experience)
  const handleOpenAnyway = () => {
    const api = window.api;
    if (!api || !missingDepsDialog.file) return;

    // Close dialog
    setMissingDepsDialog({
      isOpen: false,
      file: null,
      dependencies: [],
      totalSize: 0,
      isDownloading: false,
      downloadProgress: 0,
    });

    // Open file with skipDependencyCheck=true
    api.openResource(missingDepsDialog.file.id, true);
  };

  const closeMissingDepsDialog = () => {
    if (missingDepsDialog.isDownloading) return; // Prevent closing during download
    setMissingDepsDialog({
      isOpen: false,
      file: null,
      dependencies: [],
      totalSize: 0,
      isDownloading: false,
      downloadProgress: 0,
    });
  };

  // Handle external link confirmation
  const handleExternalLinkConfirm = (dontShowAgain: boolean) => {
    const api = window.api;
    if (!api) return;

    // Save preference if user checked "Don't show again"
    if (dontShowAgain) {
      try {
        const storedSettings = localStorage.getItem('fileExplorerSettings');
        const settings = storedSettings ? JSON.parse(storedSettings) : {};
        settings.skipExternalLinkWarning = true;
        localStorage.setItem('fileExplorerSettings', JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save file explorer settings:', e);
      }
    }

    // Open the external link
    if (externalLinkDialog.url) {
      api.openExternal(externalLinkDialog.url);
    }

    // Close dialog
    setExternalLinkDialog({ isOpen: false, url: '', title: '' });
  };

  const closeExternalLinkDialog = () => {
    setExternalLinkDialog({ isOpen: false, url: '', title: '' });
  };

  const handleShowInFolder = (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    // Pages don't have a local folder
    if (file.source === 'page') return;

    // Fire-and-forget: don't block UI
    if (file.source === 'attachment') {
      api.showAttachmentInFolder(file.id).catch((error) => {
        console.error('Failed to show in folder:', error);
      });
    } else {
      api.showResourceInFolder(file.id).catch((error) => {
        console.error('Failed to show in folder:', error);
      });
    }
  };

  const handleSync = async () => {
    let termSelection: 'all' | 'auto' | string = 'auto';
    try {
      const academicSettings = localStorage.getItem('academicSettings');
      if (academicSettings) {
        const settings = JSON.parse(academicSettings);
        termSelection = settings.termSelection || 'auto';
      }
    } catch (e) {
      console.error('[FilesPage] Failed to parse academic settings:', e);
    }

    await triggerSync('full', { termSelection });
    await fetchFiles();
  };

  const handleOpenFilesDirectory = () => {
    const api = window.api;
    if (api?.openFilesDirectory) {
      // Fire-and-forget: don't block UI
      api.openFilesDirectory().catch((error) => {
        console.error('Failed to open files directory:', error);
      });
    }
  };

  const handleClearFilesSync = async () => {
    if (
      window.confirm(
        'Clear all synced file data? This will remove file information from the database but not delete downloaded files.'
      )
    ) {
      const api = window.api;
      if (api?.clearFilesSync) {
        await api.clearFilesSync();
        await fetchFiles();
      }
    }
  };

  // Context menu handlers
  const handleContextMenu = (file: FileItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ file, x: e.clientX, y: e.clientY });
  };

  const handleCopyPath = async (file: FileItem) => {
    if (file.source === 'page') return;

    const localPath =
      file.source === 'attachment'
        ? (file as FileAttachment).localPath
        : (file as FileResource).localPath;

    if (localPath) {
      try {
        await navigator.clipboard.writeText(localPath);
      } catch (err) {
        console.error('Failed to copy path:', err);
      }
    }
  };

  const handleDeleteLocal = async (file: FileItem) => {
    const api = window.api;
    if (!api?.deleteResourceLocal) return;

    // Only resources can be deleted (not pages or attachments for now)
    if (file.source !== 'resource') {
      return;
    }

    try {
      const result = await api.deleteResourceLocal(file.id);
      if (result.success) {
        // Refresh file list to reflect the deletion
        await fetchFiles();
      } else {
        console.error('Delete failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete local copy:', error);
    }
  };

  const handleOpenInCanvas = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    try {
      if (file.source === 'resource') {
        // Get Canvas URL from backend
        const result = await api.getResourceCanvasUrl(file.id, 'resource');
        if (result?.success && result.data?.canvasUrl) {
          api.openExternal(result.data.canvasUrl);
        }
      } else if (file.source === 'page') {
        // Page URL - need to fetch from backend
        const page = file as FilePage;
        const result = await api.getPage(page.id);
        if (result?.success && result.data?.canvasUrl) {
          api.openExternal(result.data.canvasUrl);
        }
      } else if (file.source === 'attachment') {
        // Get Canvas URL from backend
        const result = await api.getResourceCanvasUrl(file.id, 'attachment');
        if (result?.success && result.data?.canvasUrl) {
          api.openExternal(result.data.canvasUrl);
        }
      } else if (file.source === 'module') {
        // Module item - use the html_url stored in the url field
        const moduleItem = file as FileModuleItem;
        if (moduleItem.url) {
          api.openExternal(moduleItem.url);
        }
      }
    } catch (err) {
      console.error('Failed to open in Canvas:', err);
    }
  };

  const handleShowProperties = (file: FileItem) => {
    setPropertiesFile(file);
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <Loader2 size={24} className={styles.spinner} />
          <span>Loading files...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Files</h1>
          <p className={styles.subtitle}>
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} • {downloadedCount} downloaded
            {hasActiveFilters && ` • ${filteredCount} shown`}
          </p>
        </div>

        <div className={styles.headerActions}>
          {/* Sync Settings Dropdown */}
          <Dropdown
            trigger={
              <button
                className={`${styles.actionButton} ${showSyncConfig ? styles.actionButtonActive : ''}`}
                title="Sync settings"
              >
                <Settings size={16} />
                Sync Settings
                <ChevronDown size={14} />
              </button>
            }
            isOpen={showSyncConfig}
            onOpenChange={setShowSyncConfig}
            align="left"
            width={380}
          >
            <FileSyncConfig
              filesDirectory={filesDirectory}
              onOpenFilesDirectory={handleOpenFilesDirectory}
              onClearFilesSync={handleClearFilesSync}
            />
          </Dropdown>

          {/* Sync Button */}
          <button
            className={styles.syncButton}
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
            title="Sync with Canvas"
          >
            <RefreshCw
              size={16}
              className={syncStatus === 'syncing' ? styles.spinner : undefined}
            />
            {syncStatus === 'syncing' ? 'Syncing...' : 'Sync'}
          </button>

          {/* Select Mode Toggle */}
          <button
            className={`${styles.actionButton} ${selectMode ? styles.actionButtonActive : ''}`}
            onClick={() => {
              setSelectMode(!selectMode);
              setSelectedFiles(new Set());
            }}
            title="Select files to download"
          >
            {selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
            Select
          </button>

          {/* Filter Dropdown */}
          <Dropdown
            trigger={
              <button
                className={`${styles.actionButton} ${showFilters || hasActiveFilters ? styles.actionButtonActive : ''}`}
                title="Toggle filters"
              >
                <Filter size={16} />
                Filters
                {hasActiveFilters && (
                  <span className={styles.filterBadge}>
                    {selectedPrefixes.size +
                      selectedTerms.size +
                      (sourceFilter !== 'all' ? 1 : 0) +
                      (statusFilter !== 'all' ? 1 : 0) +
                      selectedExtensions.size +
                      (sizeFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
                <ChevronDown size={14} />
              </button>
            }
            isOpen={showFilters}
            onOpenChange={setShowFilters}
            align="left"
            width={400}
          >
            <FileFilterPanel
              availablePrefixes={availablePrefixes}
              availableTerms={availableTerms}
              availableExtensions={availableExtensions}
              coursesWithFiles={coursesWithFiles}
              coursesByPrefix={coursesByPrefix}
              selectedPrefixes={selectedPrefixes}
              selectedTerms={selectedTerms}
              sourceFilter={sourceFilter}
              statusFilter={statusFilter}
              selectedExtensions={selectedExtensions}
              sizeFilter={sizeFilter}
              selectedCourseIds={selectedCourseIds}
              onTogglePrefix={togglePrefix}
              onToggleTerm={toggleTerm}
              onSourceFilterChange={setSourceFilter}
              onStatusFilterChange={setStatusFilter}
              onToggleExtension={toggleExtension}
              onSizeFilterChange={setSizeFilter}
              onToggleCourseFilter={toggleCourseFilter}
              onSelectAllCourses={() => setSelectedCourseIds(null)}
              onDeselectAllCourses={() => setSelectedCourseIds(new Set())}
              onClearFilters={clearFilters}
              getCourseColor={getCourseColor}
              getShortCode={getShortCode}
              isCourseFilterSelected={isCourseFilterSelected}
              hasActiveFilters={hasActiveFilters}
            />
          </Dropdown>

          {/* Search */}
          <div className={styles.searchBox}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* View Toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewButton} ${viewMode === 'list' ? styles.viewButtonActive : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <List size={18} />
            </button>
            <button
              className={`${styles.viewButton} ${viewMode === 'grid' ? styles.viewButtonActive : ''}`}
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >
              <Grid size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Selection Bar */}
      {selectMode && (
        <FileSelectionBar
          selectedCount={selectedFiles.size}
          onSelectAllPending={selectAllVisible}
          onDeselectAll={deselectAll}
          onCancel={() => {
            setSelectMode(false);
            setSelectedFiles(new Set());
          }}
          onDownloadSelected={handleDownloadSelected}
          isDownloading={downloadingIds.size > 0}
          downloadProgress={downloadProgress}
        />
      )}

      {/* Empty State */}
      {totalFiles === 0 ? (
        <Card padding="lg">
          <div className={styles.emptyState}>
            <FolderOpen
              size={64}
              color="var(--color-navy)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 className={styles.emptyTitle}>No Files Yet</h2>
            <p className={styles.emptyText}>
              Files from Canvas and announcements will appear here after syncing.
            </p>
            <button className={styles.syncButtonLarge} onClick={handleSync}>
              <RefreshCw size={18} />
              Sync Now
            </button>
          </div>
        </Card>
      ) : filteredCount === 0 ? (
        <Card padding="lg">
          <div className={styles.emptyState}>
            <Search
              size={48}
              color="var(--text-muted)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 className={styles.emptyTitle}>No Results</h2>
            <p className={styles.emptyText}>No files match your current filters</p>
            <button className={styles.clearFiltersButton} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        </Card>
      ) : (
        /* File List by Course */
        <div className={styles.courseList}>
          {(() => {
            // Sort courses by custom order
            const courseEntries = Array.from(groupedFiles.entries());
            const sortedCourseIds = sortCoursesByCustomOrder(
              courseEntries.map(([id]) => id)
            );
            const sortedEntries = sortedCourseIds
              .map((id) => courseEntries.find(([cid]) => cid === id))
              .filter(Boolean) as [number, Map<string, FileItem[]>][];

            return sortedEntries.map(([courseId, folderMap]) => {
              const course = courseMap.get(courseId);
              const isExpanded = expandedCourses.has(courseId);
              const courseColor = getCourseColor(courseId, course?.color || null);
              const courseCode = course ? getShortCode(course.code) : 'Unknown';
              const isCoursesDragging = filesDraggedCourseId === courseId;
              const isCoursesDragOver = filesDragOverCourseId === courseId;

              let totalInCourse = 0;
              let downloadedInCourse = 0;
              for (const fileList of folderMap.values()) {
                totalInCourse += fileList.length;
                downloadedInCourse += fileList.filter(isFileDownloaded).length;
              }

              // Sort folders: Custom order takes priority, then module position, then alphabetical
              const folderPaths = Array.from(folderMap.keys());

              let sortedPaths: string[];
              if (hasFolderCustomOrder(courseId)) {
                // User has manually reordered - respect their custom order
                sortedPaths = sortFoldersByCustomOrder(courseId, folderPaths);
              } else {
                // No custom order - use module position for module folders, alphabetical for others
                const courseModulePositions = folderModulePositions.get(courseId);
                sortedPaths = [...folderPaths].sort((a, b) => {
                  const posA = courseModulePositions?.get(a);
                  const posB = courseModulePositions?.get(b);

                  // If both have module positions, sort by Canvas module position
                  if (posA !== undefined && posB !== undefined) {
                    return posA - posB;
                  }
                  // Module folders come after non-module folders
                  if (posA !== undefined) return 1;
                  if (posB !== undefined) return -1;

                  // Non-module folders: alphabetical order
                  return a.localeCompare(b);
                });
              }

              const sortedFolders = sortedPaths.map(
                (path) => [path, folderMap.get(path)!] as [string, FileItem[]]
              );

              return (
                <div
                  key={courseId}
                  className={styles.courseSection}
                  draggable
                  onDragStart={(e) => filesCoursesDragStart(e, courseId)}
                  onDragEnd={filesCoursesDragEnd}
                  onDragOver={(e) => filesCoursesDragOver(e, courseId)}
                  onDragLeave={filesCoursesDragLeave}
                  onDrop={(e) => filesCoursesDrop(e, courseId)}
                  style={{
                    opacity: isCoursesDragging ? 0.5 : 1,
                    boxShadow: isCoursesDragOver ? '0 0 0 2px var(--color-blue)' : 'none',
                    borderRadius: isCoursesDragOver ? 'var(--radius-md)' : undefined,
                    transition: 'opacity 150ms ease, box-shadow 150ms ease',
                  }}
                >
                  {/* Course Header */}
                  <button
                    className={styles.courseHeader}
                    onClick={() => toggleCourse(courseId)}
                    aria-expanded={isExpanded}
                  >
                    <div className={styles.courseHeaderLeft}>
                      {/* Drag handle */}
                      <span
                        className={styles.courseDragHandle}
                        title="Drag to reorder"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical size={14} />
                      </span>
                      {isExpanded ? (
                        <ChevronDown size={18} color="var(--text-secondary)" />
                      ) : (
                        <ChevronRight size={18} color="var(--text-secondary)" />
                      )}
                      <span
                        className={styles.courseCodeBadge}
                        style={{ backgroundColor: courseColor }}
                      >
                        {courseCode}
                      </span>
                      <span className={styles.courseHeaderName}>
                        {course?.nickname || course?.name || 'Unknown Course'}
                      </span>
                    </div>
                    <span className={styles.courseFileCount}>
                      {downloadedInCourse}/{totalInCourse} downloaded
                    </span>
                  </button>

                  {/* Folders and Files */}
                  {isExpanded && (
                    <div className={styles.foldersContainer}>
                      {sortedFolders.map(([folderPath, folderFiles]) => {
                        const folderExpanded = isFolderExpanded(courseId, folderPath);
                        const folderDownloaded =
                          folderFiles.filter(isFileDownloaded).length;
                        const displayPath = folderPath || 'Root';

                        // Get folder type and styling
                        const folderType = getFolderTypeFromPath(folderPath || null);
                        const folderDepth = getFolderDepth(folderPath || null);

                        const isDragging =
                          draggedFolder?.courseId === courseId &&
                          draggedFolder?.path === folderPath;
                        const isDragOver =
                          dragOverFolder?.courseId === courseId &&
                          dragOverFolder?.path === folderPath;

                        return (
                          <div
                            key={folderPath}
                            className={styles.folderSection}
                            draggable
                            onDragStart={(e) => folderDragStart(e, courseId, folderPath)}
                            onDragEnd={folderDragEnd}
                            onDragOver={(e) => folderDragOver(e, courseId, folderPath)}
                            onDragLeave={folderDragLeave}
                            onDrop={(e) =>
                              folderDrop(e, courseId, folderPath, folderPaths)
                            }
                            style={{
                              opacity: isDragging ? 0.5 : 1,
                              boxShadow: isDragOver
                                ? '0 0 0 2px var(--color-blue)'
                                : 'none',
                              borderRadius: isDragOver ? 'var(--radius-md)' : undefined,
                              transition: 'opacity 150ms ease, box-shadow 150ms ease',
                            }}
                          >
                            {/* Folder Header with Type Color */}
                            <button
                              className={styles.folderHeader}
                              onClick={() => toggleFolder(courseId, folderPath)}
                              style={
                                {
                                  '--folder-accent-color': folderType.color,
                                  paddingLeft: `calc(var(--space-6) + ${folderDepth * 20}px)`,
                                } as React.CSSProperties
                              }
                              aria-expanded={folderExpanded}
                            >
                              <div className={styles.folderHeaderLeft}>
                                {/* Drag handle */}
                                <span
                                  className={styles.folderDragHandle}
                                  title="Drag to reorder"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <GripVertical size={12} />
                                </span>
                                {folderExpanded ? (
                                  <ChevronDown size={14} color="var(--text-muted)" />
                                ) : (
                                  <ChevronRight size={14} color="var(--text-muted)" />
                                )}
                                <span style={{ color: folderType.color }}>
                                  {getFolderIcon(folderType, 14)}
                                </span>
                                <span className={styles.folderName}>{displayPath}</span>
                                <span
                                  className={styles.folderTypeBadge}
                                  style={{ backgroundColor: folderType.color }}
                                >
                                  {folderType.label}
                                </span>
                              </div>
                              <span className={styles.folderFileCount}>
                                {folderDownloaded}/{folderFiles.length}
                              </span>
                            </button>

                            {/* Files in Folder */}
                            {folderExpanded &&
                              (viewMode === 'list' ? (
                                <div
                                  className={styles.fileList}
                                  style={
                                    {
                                      '--folder-depth-offset': `${folderDepth * 20}px`,
                                    } as React.CSSProperties
                                  }
                                >
                                  {folderFiles.map((file) => (
                                    <FileListItem
                                      key={getFileKey(file)}
                                      file={file}
                                      isDownloading={downloadingIds.has(file.id)}
                                      isSelected={selectedFiles.has(getFileKey(file))}
                                      selectMode={selectMode}
                                      onToggleSelect={() => toggleFileSelection(file)}
                                      onDownload={() => handleDownload(file)}
                                      onOpen={() => handleOpen(file)}
                                      onShowInFolder={() => handleShowInFolder(file)}
                                      onContextMenu={(e) => handleContextMenu(file, e)}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div
                                  className={styles.fileGrid}
                                  style={
                                    {
                                      '--folder-depth-offset': `${folderDepth * 20}px`,
                                    } as React.CSSProperties
                                  }
                                >
                                  {folderFiles.map((file) => (
                                    <FileGridItem
                                      key={getFileKey(file)}
                                      file={file}
                                      isDownloading={downloadingIds.has(file.id)}
                                      isSelected={selectedFiles.has(getFileKey(file))}
                                      selectMode={selectMode}
                                      onToggleSelect={() => toggleFileSelection(file)}
                                      onDownload={() => handleDownload(file)}
                                      onOpen={() => handleOpen(file)}
                                      onShowInFolder={() => handleShowInFolder(file)}
                                      onContextMenu={(e) => handleContextMenu(file, e)}
                                    />
                                  ))}
                                </div>
                              ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Download Confirmation Dialog */}
      <ConfirmDialog
        isOpen={pendingDownload !== null}
        title={
          pendingDownload && isFileDownloaded(pendingDownload)
            ? 'Re-download File?'
            : 'Download File'
        }
        message={
          pendingDownload && isFileDownloaded(pendingDownload)
            ? `"${getFileName(pendingDownload)}" has already been downloaded. Do you want to download it again? This will overwrite the existing file.`
            : `Download "${pendingDownload ? getFileName(pendingDownload) : ''}"?`
        }
        type={pendingDownload && isFileDownloaded(pendingDownload) ? 'warning' : 'info'}
        confirmText={
          pendingDownload && isFileDownloaded(pendingDownload)
            ? 'Re-download'
            : 'Download'
        }
        cancelText="Cancel"
        onConfirm={confirmDownload}
        onCancel={() => setPendingDownload(null)}
      />

      {/* File Context Menu */}
      {contextMenu && (
        <FileContextMenu
          file={contextMenu.file}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onOpen={() => handleOpen(contextMenu.file)}
          onDownload={() => handleDownload(contextMenu.file)}
          onShowInFolder={() => handleShowInFolder(contextMenu.file)}
          onCopyPath={() => handleCopyPath(contextMenu.file)}
          onOpenInCanvas={() => handleOpenInCanvas(contextMenu.file)}
          onDeleteLocal={() => handleDeleteLocal(contextMenu.file)}
          onShowProperties={() => handleShowProperties(contextMenu.file)}
        />
      )}

      {/* File Properties Dialog */}
      <ConfirmDialog
        isOpen={propertiesFile !== null}
        title="File Properties"
        message=""
        type="info"
        confirmText="Close"
        onConfirm={() => setPropertiesFile(null)}
        onCancel={() => setPropertiesFile(null)}
        hideCancel
      >
        {propertiesFile && (
          <FilePropertiesContent
            file={propertiesFile}
            courseName={
              courseMap.get(propertiesFile.courseId)?.nickname ||
              courseMap.get(propertiesFile.courseId)?.name ||
              'Unknown Course'
            }
          />
        )}
      </ConfirmDialog>

      {/* Missing Dependencies Dialog for HTML files */}
      <MissingDependenciesDialog
        isOpen={missingDepsDialog.isOpen}
        onClose={closeMissingDepsDialog}
        onDownload={handleDownloadDependencies}
        onOpenAnyway={handleOpenAnyway}
        missingDependencies={missingDepsDialog.dependencies}
        totalSize={missingDepsDialog.totalSize}
        fileName={missingDepsDialog.file ? getFileName(missingDepsDialog.file) : ''}
        isDownloading={missingDepsDialog.isDownloading}
        downloadProgress={missingDepsDialog.downloadProgress}
      />

      {/* External Link Confirmation Dialog */}
      <ExternalLinkDialog
        isOpen={externalLinkDialog.isOpen}
        url={externalLinkDialog.url}
        title={externalLinkDialog.title}
        onClose={closeExternalLinkDialog}
        onConfirm={handleExternalLinkConfirm}
      />

      {/* Content Changed Warning Toast */}
      {contentChangedWarning.show && (
        <div className={styles.contentChangedWarning}>
          <div className={styles.contentChangedWarningContent}>
            <RefreshCw size={16} className={styles.contentChangedWarningIcon} />
            <span>
              Content for <strong>{contentChangedWarning.fileName}</strong> was updated
              while downloading. Consider re-downloading for the latest version.
            </span>
          </div>
          <div className={styles.contentChangedWarningActions}>
            <button
              className={styles.contentChangedWarningButton}
              onClick={handleRedownloadAfterChange}
            >
              Re-download
            </button>
            <button
              className={styles.contentChangedWarningDismiss}
              onClick={() =>
                setContentChangedWarning({ show: false, fileId: null, fileName: null })
              }
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilesPage;
