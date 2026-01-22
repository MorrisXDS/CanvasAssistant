/**
 * Files Page
 * File browser with filters, selective sync, and download management
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  FolderOpen,
  FileText,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  Search,
  Grid,
  List,
  ChevronRight,
  ChevronDown,
  File,
  Image,
  FileSpreadsheet,
  Presentation,
  Archive,
  Code,
  Music,
  Video,
  RefreshCw,
  Filter,
  X,
  Square,
  CheckSquare,
  Settings,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react';
import { Card, ConfirmDialog } from '../shared';
import { useStore } from '../../../l5-presentation/store';

// Storage keys
const SYNC_PREFS_KEY = 'fileSyncPreferences';
const EXPANDED_STATE_KEY = 'fileExplorerExpandedState';
const VIEW_PREFS_KEY = 'fileExplorerViewPrefs';

interface ExpandedState {
  courses: number[];
  folders: string[];
}

interface ViewPreferences {
  defaultExpandAll: boolean;
  viewMode: 'list' | 'grid';
}

// File explorer settings from SettingsModal
interface FileExplorerSettings {
  defaultState: 'collapsed' | 'expanded' | 'remember';
  defaultViewMode: 'list' | 'grid';
}

const FILE_EXPLORER_SETTINGS_KEY = 'fileExplorerSettings';

function loadFileExplorerSettings(): FileExplorerSettings {
  try {
    const stored = localStorage.getItem(FILE_EXPLORER_SETTINGS_KEY);
    console.debug('[FilesPage] Raw settings from localStorage:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.debug('[FilesPage] Parsed explorer settings:', parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load file explorer settings:', e);
  }
  console.debug('[FilesPage] Using default settings: { defaultState: "remember", defaultViewMode: "list" }');
  return { defaultState: 'remember', defaultViewMode: 'list' };
}

function loadExpandedState(): ExpandedState {
  try {
    const stored = localStorage.getItem(EXPANDED_STATE_KEY);
    console.debug('[FilesPage] Raw expanded state from localStorage:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.debug('[FilesPage] Parsed expanded state:', parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load expanded state:', e);
  }
  console.debug('[FilesPage] No saved expanded state, returning empty');
  return { courses: [], folders: [] };
}

function saveExpandedState(courses: Set<number>, folders: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_STATE_KEY, JSON.stringify({
      courses: Array.from(courses),
      folders: Array.from(folders),
    }));
  } catch (e) {
    console.error('Failed to save expanded state:', e);
  }
}

function loadViewPrefs(): ViewPreferences {
  try {
    const stored = localStorage.getItem(VIEW_PREFS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
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

interface SyncPreferences {
  enabledCourses: Set<number>;
  autoDownload: boolean;
  syncAnnouncements: boolean;
  syncCanvasFiles: boolean;
}

function loadSyncPreferences(): SyncPreferences {
  try {
    const stored = localStorage.getItem(SYNC_PREFS_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return {
        enabledCourses: new Set(data.enabledCourses || []),
        autoDownload: data.autoDownload ?? false,
        syncAnnouncements: data.syncAnnouncements ?? true,
        syncCanvasFiles: data.syncCanvasFiles ?? true,
      };
    }
  } catch (e) {
    console.error('Failed to load sync preferences:', e);
  }
  return {
    enabledCourses: new Set(),
    autoDownload: false,
    syncAnnouncements: true,
    syncCanvasFiles: true,
  };
}

function saveSyncPreferences(prefs: SyncPreferences): void {
  try {
    localStorage.setItem(SYNC_PREFS_KEY, JSON.stringify({
      enabledCourses: Array.from(prefs.enabledCourses),
      autoDownload: prefs.autoDownload,
      syncAnnouncements: prefs.syncAnnouncements,
      syncCanvasFiles: prefs.syncCanvasFiles,
    }));
  } catch (e) {
    console.error('Failed to save sync preferences:', e);
  }
}

// Course color palette
const COURSE_COLORS = [
  '#007FA3', '#E53935', '#43A047', '#FB8C00', '#8E24AA',
  '#1E88E5', '#D81B60', '#00ACC1', '#7CB342', '#6D4C41',
];

function getCourseColor(courseId: number, existingColor: string | null): string {
  if (existingColor) return existingColor;
  return COURSE_COLORS[courseId % COURSE_COLORS.length];
}

function getShortCode(code: string): string {
  // Extract course code stopping before any letter+digit pattern followed by space/end
  // e.g., "CHE353H1 F LEC0101" → "CHE353", "ECE421H1 F" → "ECE421"
  const match = code.match(/^(.+?)(?=[A-Z]\d(?:\s|$))/i);
  return match ? match[1] : code.split(/\s/)[0];
}

// Extract course prefix (e.g., "ECE" from "ECE244H1 F LEC0101")
function getCoursePrefix(code: string): string {
  const match = code.match(/^([A-Z]{2,4})/);
  return match ? match[1] : 'OTHER';
}

// Extract term from course code (F = Fall, S = Spring/Winter)
function getCourseTerm(code: string): string {
  if (code.includes(' F ') || code.endsWith(' F')) return 'Fall';
  if (code.includes(' S ') || code.endsWith(' S')) return 'Winter';
  if (code.includes(' Y ') || code.endsWith(' Y')) return 'Year';
  if (code.startsWith('PERM')) return 'Permanent';
  return 'Other';
}

// Content type categorization based on filename and folder path
type ContentCategory = 'Lecture Slides' | 'Lab Manual' | 'Assignment' | 'Tutorial' | 'Notes' | 'Reading' | 'Syllabus' | 'Solution' | 'Exam' | 'Other';

function categorizeFile(filename: string, folderPath: string | null): ContentCategory {
  const lower = (filename + ' ' + (folderPath || '')).toLowerCase();

  // Check for specific patterns
  if (/lecture|slides?|ppt|presentation/i.test(lower)) return 'Lecture Slides';
  if (/lab\s*(manual|guide|\d)|laboratory/i.test(lower)) return 'Lab Manual';
  if (/assign(ment)?|homework|hw\d|problem\s*set|pset/i.test(lower)) return 'Assignment';
  if (/tutorial|tut\d|practice/i.test(lower)) return 'Tutorial';
  if (/notes?|summary|review/i.test(lower)) return 'Notes';
  if (/reading|textbook|chapter|article/i.test(lower)) return 'Reading';
  if (/syllabus|outline|course\s*info/i.test(lower)) return 'Syllabus';
  if (/solution|answer|key|marking|rubric/i.test(lower)) return 'Solution';
  if (/exam|midterm|final|quiz|test/i.test(lower)) return 'Exam';

  return 'Other';
}

// Extract week/module context from folder path or filename
function extractModuleContext(folderPath: string | null, filename: string): string | null {
  const combined = (folderPath || '') + ' ' + filename;

  // Try to find week number
  const weekMatch = combined.match(/week\s*(\d+)/i);
  if (weekMatch) return `Week ${weekMatch[1]}`;

  // Try to find module number
  const moduleMatch = combined.match(/module\s*(\d+)/i);
  if (moduleMatch) return `Module ${moduleMatch[1]}`;

  // Try to find lecture number
  const lectureMatch = combined.match(/lec(?:ture)?\s*(\d+)/i);
  if (lectureMatch) return `Lecture ${lectureMatch[1]}`;

  // Try to find lab number
  const labMatch = combined.match(/lab\s*(\d+)/i);
  if (labMatch) return `Lab ${labMatch[1]}`;

  // Try to find unit number
  const unitMatch = combined.match(/unit\s*(\d+)/i);
  if (unitMatch) return `Unit ${unitMatch[1]}`;

  return null;
}

// Get category color for badge
function getCategoryColor(category: ContentCategory): string {
  switch (category) {
    case 'Lecture Slides': return '#1976D2'; // Blue
    case 'Lab Manual': return '#7B1FA2'; // Purple
    case 'Assignment': return '#E65100'; // Orange
    case 'Tutorial': return '#00897B'; // Teal
    case 'Notes': return '#558B2F'; // Green
    case 'Reading': return '#5D4037'; // Brown
    case 'Syllabus': return '#C62828'; // Red
    case 'Solution': return '#00838F'; // Cyan
    case 'Exam': return '#AD1457'; // Pink
    default: return '#616161'; // Grey
  }
}

interface FileAttachment {
  id: number;
  notificationId: number;
  courseId: number;
  externalId: string;
  displayName: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  contentType: string | null;
  localPath: string | null;
  downloadStatus: string;
  downloadedAt: string | null;
  courseCode: string;
  courseName: string;
  notificationTitle: string;
  source: 'attachment';
}

interface FileResource {
  id: number;
  externalId: string;
  courseId: number;
  parentFolderId: number | null;
  folderPath: string | null;
  type: string;
  title: string;
  url: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  syncedAt: string | null;
  source: 'resource';
}

type FileItem = FileAttachment | FileResource;

interface FilesData {
  resources: FileResource[];
  attachments: FileAttachment[];
}

// Source type for filtering
type SourceFilter = 'all' | 'canvas' | 'announcements' | 'downloaded';

// Get file icon based on content type or extension
function getFileIcon(file: FileItem, size: number = 18): React.ReactNode {
  const contentType = 'contentType' in file ? file.contentType : file.mimeType;
  const filename = 'displayName' in file ? file.displayName : file.title;
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
    return <Image size={size} />;
  }
  if (contentType?.includes('pdf') || ext === 'pdf') {
    return <FileText size={size} />;
  }
  if (contentType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return <FileSpreadsheet size={size} />;
  }
  if (contentType?.includes('presentation') || ['pptx', 'ppt'].includes(ext)) {
    return <Presentation size={size} />;
  }
  if (contentType?.includes('word') || ['docx', 'doc'].includes(ext)) {
    return <FileText size={size} />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return <Archive size={size} />;
  }
  if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json'].includes(ext)) {
    return <Code size={size} />;
  }
  if (contentType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return <Music size={size} />;
  }
  if (contentType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
    return <Video size={size} />;
  }
  return <File size={size} />;
}

// Format file size
function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get file name
function getFileName(file: FileItem): string {
  return 'displayName' in file ? file.displayName : file.title;
}

// Check if file is downloaded
function isFileDownloaded(file: FileItem): boolean {
  if (file.source === 'attachment') {
    return (file as FileAttachment).downloadStatus === 'completed';
  }
  return file.localPath !== null;
}

type ViewMode = 'list' | 'grid';

export function FilesPage() {
  const { courses, syncStatus, triggerSync } = useStore();
  const [files, setFiles] = useState<FilesData>({ resources: [], attachments: [] });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load settings from SettingsModal
  const [explorerSettings] = useState<FileExplorerSettings>(() => loadFileExplorerSettings());

  // Load persisted view preferences and expanded state based on settings
  const [viewPrefs, setViewPrefs] = useState<ViewPreferences>(() => loadViewPrefs());
  // Use saved viewMode if available, otherwise fall back to default setting
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const saved = loadViewPrefs();
    return saved.viewMode || explorerSettings.defaultViewMode;
  });

  // Wrapper to persist view mode
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    const newPrefs = { ...viewPrefs, viewMode: mode };
    setViewPrefs(newPrefs);
    saveViewPrefs(newPrefs);
  }, [viewPrefs]);

  const [expandedCourses, setExpandedCourses] = useState<Set<number>>(() => {
    console.debug('[FilesPage] Initializing expandedCourses, defaultState:', explorerSettings.defaultState);
    // Check defaultState setting
    if (explorerSettings.defaultState === 'collapsed') {
      console.debug('[FilesPage] Setting collapsed - empty courses');
      return new Set(); // Start collapsed
    } else if (explorerSettings.defaultState === 'remember') {
      // Load saved state
      const saved = loadExpandedState();
      console.debug('[FilesPage] Remember mode - loaded courses:', saved.courses);
      return new Set(saved.courses);
    }
    // 'expanded' - will be populated after data loads
    console.debug('[FilesPage] Expanded mode - will populate after data loads');
    return new Set();
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    console.debug('[FilesPage] Initializing expandedFolders, defaultState:', explorerSettings.defaultState);
    if (explorerSettings.defaultState === 'collapsed') {
      console.debug('[FilesPage] Setting collapsed - empty folders');
      return new Set();
    } else if (explorerSettings.defaultState === 'remember') {
      const saved = loadExpandedState();
      console.debug('[FilesPage] Remember mode - loaded folders:', saved.folders);
      return new Set(saved.folders);
    }
    console.debug('[FilesPage] Expanded mode - will populate after data loads');
    return new Set();
  });
  const [hasAppliedDefaultExpand, setHasAppliedDefaultExpand] = useState(false);
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Download confirmation state
  const [pendingDownload, setPendingDownload] = useState<FileItem | null>(null);

  // Filter states
  const [selectedPrefixes, setSelectedPrefixes] = useState<Set<string>>(new Set());
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<number> | null>(null); // null = all selected

  // Selective sync states
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Sync configuration
  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [syncPrefs, setSyncPrefs] = useState<SyncPreferences>(() => loadSyncPreferences());
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

  // Initialize enabled courses with all courses if empty
  useEffect(() => {
    if (syncPrefs.enabledCourses.size === 0 && courses.length > 0) {
      const allCourseIds = new Set(courses.map((c) => c.id));
      setSyncPrefs((prev) => {
        const next = { ...prev, enabledCourses: allCourseIds };
        saveSyncPreferences(next);
        return next;
      });
    }
  }, [courses, syncPrefs.enabledCourses.size]);

  // Toggle course sync
  const toggleCourseSync = (courseId: number) => {
    setSyncPrefs((prev) => {
      const next = { ...prev, enabledCourses: new Set(prev.enabledCourses) };
      if (next.enabledCourses.has(courseId)) {
        next.enabledCourses.delete(courseId);
      } else {
        next.enabledCourses.add(courseId);
      }
      saveSyncPreferences(next);
      return next;
    });
  };

  // Toggle all courses
  const toggleAllCourses = (enable: boolean) => {
    setSyncPrefs((prev) => {
      const next = {
        ...prev,
        enabledCourses: enable ? new Set(courses.map((c) => c.id)) : new Set<number>(),
      };
      saveSyncPreferences(next);
      return next;
    });
  };

  // Update sync option
  const updateSyncOption = (key: keyof SyncPreferences, value: boolean) => {
    setSyncPrefs((prev) => {
      const next = { ...prev, [key]: value };
      saveSyncPreferences(next);
      return next;
    });
  };

  // Fetch files
  const fetchFiles = useCallback(async () => {
    const api = window.api;
    if (!api?.getFiles) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.getFiles();
      setFiles(data);
      console.debug('[FilesPage] fetchFiles complete, file count:', data.attachments.length + data.resources.length);
      // NOTE: Do NOT set expandedCourses/expandedFolders here!
      // The initial state is already set based on explorerSettings.defaultState
      // The useEffect for 'expanded' mode will handle expanding all after data loads
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Handle 'expanded' default state - expand all courses/folders after data loads
  useEffect(() => {
    console.debug('[FilesPage] Expand effect check:', {
      defaultState: explorerSettings.defaultState,
      hasAppliedDefaultExpand,
      loading,
      fileCount: files.attachments.length + files.resources.length,
    });
    if (explorerSettings.defaultState === 'expanded' && !hasAppliedDefaultExpand && !loading) {
      console.debug('[FilesPage] Applying "expanded" mode - expanding all');
      // Get all course IDs that have files
      const courseIds = new Set([
        ...files.attachments.map((a) => a.courseId),
        ...files.resources.map((r) => r.courseId),
      ]);
      setExpandedCourses(courseIds);

      // Get all folder keys
      const folderKeys = new Set<string>();
      files.resources.forEach((r) => {
        if (r.folderPath) {
          folderKeys.add(`${r.courseId}:${r.folderPath}`);
        }
      });
      // Also add "Announcements" folder for each course with attachments
      files.attachments.forEach((a) => {
        folderKeys.add(`${a.courseId}:Announcements`);
      });
      setExpandedFolders(folderKeys);
      setHasAppliedDefaultExpand(true);
    }
  }, [explorerSettings.defaultState, hasAppliedDefaultExpand, loading, files]);

  // Build course map
  const courseMap = useMemo(() => {
    return new Map(courses.map((c) => [c.id, c]));
  }, [courses]);

  // Extract available prefixes and terms
  const { availablePrefixes, availableTerms } = useMemo(() => {
    const prefixes = new Set<string>();
    const terms = new Set<string>();

    const allCourseIds = new Set([
      ...files.attachments.map((a) => a.courseId),
      ...files.resources.map((r) => r.courseId),
    ]);

    for (const courseId of allCourseIds) {
      const course = courseMap.get(courseId);
      if (course) {
        prefixes.add(getCoursePrefix(course.code));
        terms.add(getCourseTerm(course.code));
      }
    }

    return {
      availablePrefixes: Array.from(prefixes).sort(),
      availableTerms: Array.from(terms).sort(),
    };
  }, [files, courseMap]);

  // Helper to get folder path for a file
  const getFileFolderPath = (file: FileItem): string => {
    if (file.source === 'resource') {
      return (file as FileResource).folderPath || '';
    }
    // Attachments are grouped under "Announcements"
    return 'Announcements';
  };

  // Group and filter files
  const groupedFiles = useMemo(() => {
    const allFiles: FileItem[] = [...files.attachments, ...files.resources];

    // Apply filters
    const filtered = allFiles.filter((f) => {
      const course = courseMap.get(f.courseId);
      if (!course) return false;

      // Search filter
      if (searchQuery) {
        const name = getFileName(f).toLowerCase();
        if (!name.includes(searchQuery.toLowerCase())) return false;
      }

      // Prefix filter
      if (selectedPrefixes.size > 0) {
        const prefix = getCoursePrefix(course.code);
        if (!selectedPrefixes.has(prefix)) return false;
      }

      // Term filter
      if (selectedTerms.size > 0) {
        const term = getCourseTerm(course.code);
        if (!selectedTerms.has(term)) return false;
      }

      // Source filter
      if (sourceFilter !== 'all') {
        if (sourceFilter === 'canvas' && f.source !== 'resource') return false;
        if (sourceFilter === 'announcements' && f.source !== 'attachment') return false;
        if (sourceFilter === 'downloaded' && !isFileDownloaded(f)) return false;
      }

      // Course filter (null means all selected)
      if (selectedCourseIds !== null && !selectedCourseIds.has(f.courseId)) {
        return false;
      }

      return true;
    });

    // Group by course, then by folder path
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

    // Sort files within each folder
    for (const [, folderGroups] of groups) {
      for (const [, fileList] of folderGroups) {
        fileList.sort((a, b) => getFileName(a).localeCompare(getFileName(b)));
      }
    }

    return groups;
  }, [files, searchQuery, selectedPrefixes, selectedTerms, sourceFilter, courseMap, selectedCourseIds]);

  // Get list of courses that have files (for filter UI)
  const coursesWithFiles = useMemo(() => {
    const courseIds = new Set([
      ...files.attachments.map((a) => a.courseId),
      ...files.resources.map((r) => r.courseId),
    ]);
    return courses
      .filter((c) => courseIds.has(c.id))
      .sort((a, b) => getShortCode(a.code).localeCompare(getShortCode(b.code)));
  }, [files, courses]);

  // Counts
  const totalFiles = files.attachments.length + files.resources.length;
  const filteredCount = Array.from(groupedFiles.values()).reduce((sum, folderMap) => {
    return sum + Array.from(folderMap.values()).reduce((fSum, list) => fSum + list.length, 0);
  }, 0);
  const downloadedCount = [...files.attachments, ...files.resources].filter(isFileDownloaded).length;
  const hasActiveFilters = selectedPrefixes.size > 0 || selectedTerms.size > 0 || sourceFilter !== 'all' || selectedCourseIds !== null;

  // Toggle helpers
  const toggleCourse = (courseId: number) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      // Only persist if in 'remember' mode
      if (explorerSettings.defaultState === 'remember') {
        saveExpandedState(next, expandedFolders);
      }
      return next;
    });
  };

  const getFolderKey = (courseId: number, folderPath: string) => `${courseId}:${folderPath}`;

  const toggleFolder = (courseId: number, folderPath: string) => {
    const key = getFolderKey(courseId, folderPath);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Only persist if in 'remember' mode
      if (explorerSettings.defaultState === 'remember') {
        saveExpandedState(expandedCourses, next);
      }
      return next;
    });
  };

  const isFolderExpanded = (courseId: number, folderPath: string) => {
    return expandedFolders.has(getFolderKey(courseId, folderPath));
  };

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
    setSelectedCourseIds(null);
  };

  // Course filter helpers
  const toggleCourseFilter = (courseId: number) => {
    setSelectedCourseIds((prev) => {
      // If null (all selected), create a set with all except this one
      if (prev === null) {
        const all = new Set(coursesWithFiles.map((c) => c.id));
        all.delete(courseId);
        return all;
      }
      // Otherwise toggle this course
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      // If all courses are selected, return null
      if (next.size === coursesWithFiles.length) {
        return null;
      }
      return next;
    });
  };

  const selectAllCourseFilters = () => {
    setSelectedCourseIds(null);
  };

  const deselectAllCourseFilters = () => {
    setSelectedCourseIds(new Set());
  };

  const isCourseFilterSelected = (courseId: number) => {
    return selectedCourseIds === null || selectedCourseIds.has(courseId);
  };

  // File selection for selective sync
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

  // Download handlers - shows confirmation before downloading
  const handleDownload = (file: FileItem) => {
    // Prevent duplicate downloads
    if (downloadingIds.has(file.id)) {
      console.debug('[Files] Download already in progress for:', file.id);
      return;
    }
    // Show confirmation dialog
    setPendingDownload(file);
  };

  // Actual download after confirmation
  const executeDownload = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    setDownloadingIds((prev) => new Set(prev).add(file.id));

    try {
      let result;
      if (file.source === 'attachment') {
        result = await api.downloadAttachment(file.id);
      } else {
        // For resources (Canvas files), use the resource download API
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

  // Confirm download handler
  const confirmDownload = () => {
    if (pendingDownload) {
      executeDownload(pendingDownload);
      setPendingDownload(null);
    }
  };

  const cancelDownload = () => {
    setPendingDownload(null);
  };

  const handleDownloadSelected = async () => {
    const api = window.api;
    if (!api) return;

    // Gather all files from nested structure
    const allFiles: FileItem[] = [];
    for (const folderMap of groupedFiles.values()) {
      for (const fileList of folderMap.values()) {
        allFiles.push(...fileList);
      }
    }

    const filesToDownload = allFiles.filter(
      (f) => selectedFiles.has(getFileKey(f)) && !isFileDownloaded(f)
    );

    for (const file of filesToDownload) {
      setDownloadingIds((prev) => new Set(prev).add(file.id));
      try {
        if (file.source === 'attachment') {
          await api.downloadAttachment(file.id);
        } else {
          await api.downloadResource(file.id);
        }
      } catch (error) {
        console.error('Download failed:', error);
      }
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }

    await fetchFiles();
    setSelectedFiles(new Set());
    setSelectMode(false);
  };

  // Download all currently visible (filtered) files that aren't already downloaded
  const handleDownloadAllFiltered = async () => {
    const api = window.api;
    if (!api) return;

    // Gather all visible files from nested structure
    const allFiles: FileItem[] = [];
    for (const folderMap of groupedFiles.values()) {
      for (const fileList of folderMap.values()) {
        allFiles.push(...fileList);
      }
    }

    // Filter to only non-downloaded files
    const filesToDownload = allFiles.filter((f) => !isFileDownloaded(f));

    if (filesToDownload.length === 0) {
      return; // Nothing to download
    }

    // Download sequentially to avoid overwhelming the server
    for (const file of filesToDownload) {
      setDownloadingIds((prev) => new Set(prev).add(file.id));
      try {
        if (file.source === 'attachment') {
          await api.downloadAttachment(file.id);
        } else {
          await api.downloadResource(file.id);
        }
      } catch (error) {
        console.error('Download failed:', error);
      }
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }

    await fetchFiles();
  };

  // Count pending downloads in filtered view
  const pendingDownloadCount = useMemo(() => {
    let count = 0;
    for (const folderMap of groupedFiles.values()) {
      for (const fileList of folderMap.values()) {
        count += fileList.filter((f) => !isFileDownloaded(f)).length;
      }
    }
    return count;
  }, [groupedFiles]);

  const handleOpen = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    try {
      if (file.source === 'attachment') {
        await api.openAttachment(file.id);
      } else {
        await api.openResource(file.id);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  const handleShowInFolder = async (file: FileItem) => {
    const api = window.api;
    if (!api) return;

    try {
      if (file.source === 'attachment') {
        await api.showAttachmentInFolder(file.id);
      } else {
        await api.showResourceInFolder(file.id);
      }
    } catch (error) {
      console.error('Failed to show in folder:', error);
    }
  };

  const handleSync = async () => {
    // Build sync options from preferences
    const courseIds = syncPrefs.enabledCourses.size > 0
      ? Array.from(syncPrefs.enabledCourses)
      : undefined;

    await triggerSync('full', {
      courseIds,
      syncCanvasFiles: syncPrefs.syncCanvasFiles,
      syncAnnouncements: syncPrefs.syncAnnouncements,
    });
    await fetchFiles();
  };

  const handleOpenFilesDirectory = async () => {
    const api = window.api;
    if (api?.openFilesDirectory) {
      await api.openFilesDirectory();
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingState}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading files...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Files</h1>
          <p style={styles.subtitle}>
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} • {downloadedCount} downloaded
            {hasActiveFilters && ` • ${filteredCount} shown`}
          </p>
        </div>

        <div style={styles.headerActions}>
          {/* Sync Settings Button */}
          <button
            style={{
              ...styles.actionButton,
              backgroundColor: showSyncConfig ? 'var(--color-navy)' : 'var(--bg-card)',
              color: showSyncConfig ? 'white' : 'var(--text-secondary)',
            }}
            onClick={() => setShowSyncConfig(!showSyncConfig)}
            title="Sync settings"
          >
            <Settings size={16} />
            Sync Settings
          </button>

          {/* Sync Button */}
          <button
            style={styles.syncButton}
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
            title="Sync with Canvas"
          >
            <RefreshCw
              size={16}
              style={syncStatus === 'syncing' ? { animation: 'spin 1s linear infinite' } : undefined}
            />
            {syncStatus === 'syncing' ? 'Syncing...' : 'Sync'}
          </button>

          {/* Download All Filtered Button */}
          {pendingDownloadCount > 0 && (
            <button
              style={{
                ...styles.actionButton,
                backgroundColor: 'var(--color-navy)',
                color: 'white',
              }}
              onClick={handleDownloadAllFiltered}
              disabled={downloadingIds.size > 0}
              title={`Download all ${pendingDownloadCount} pending files${hasActiveFilters ? ' (filtered)' : ''}`}
            >
              <Download size={16} />
              {hasActiveFilters ? `Download ${pendingDownloadCount} Filtered` : `Download All (${pendingDownloadCount})`}
            </button>
          )}

          {/* Selective Download Toggle */}
          <button
            style={{
              ...styles.actionButton,
              backgroundColor: selectMode ? 'var(--color-navy)' : 'var(--bg-card)',
              color: selectMode ? 'white' : 'var(--text-secondary)',
            }}
            onClick={() => {
              setSelectMode(!selectMode);
              setSelectedFiles(new Set());
            }}
            title="Select files to download"
          >
            {selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
            Select
          </button>

          {/* Filter Toggle */}
          <button
            style={{
              ...styles.actionButton,
              backgroundColor: showFilters || hasActiveFilters ? 'var(--color-navy)' : 'var(--bg-card)',
              color: showFilters || hasActiveFilters ? 'white' : 'var(--text-secondary)',
            }}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <Filter size={16} />
            Filters
            {hasActiveFilters && <span style={styles.filterBadge}>{selectedPrefixes.size + selectedTerms.size + (sourceFilter !== 'all' ? 1 : 0)}</span>}
          </button>

          {/* Search */}
          <div style={styles.searchBox}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button style={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* View Toggle */}
          <div style={styles.viewToggle}>
            <button
              style={{
                ...styles.viewButton,
                backgroundColor: viewMode === 'list' ? 'var(--color-navy)' : 'transparent',
                color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => setViewMode('list')}
            >
              <List size={18} />
            </button>
            <button
              style={{
                ...styles.viewButton,
                backgroundColor: viewMode === 'grid' ? 'var(--color-navy)' : 'transparent',
                color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
              }}
              onClick={() => setViewMode('grid')}
            >
              <Grid size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Sync Configuration Panel */}
      {showSyncConfig && (
        <Card padding="md" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={styles.syncConfigPanel}>
            <div style={styles.syncConfigHeader}>
              <h3 style={styles.syncConfigTitle}>Sync Settings</h3>
              <p style={styles.syncConfigSubtitle}>
                Configure which courses and content types to sync from Canvas
              </p>
            </div>

            {/* Sync Options */}
            <div style={styles.syncOptionsSection}>
              <div style={styles.filterLabel}>Content Types</div>
              <div style={styles.syncOptionsList}>
                <button
                  style={styles.syncToggle}
                  onClick={() => updateSyncOption('syncCanvasFiles', !syncPrefs.syncCanvasFiles)}
                >
                  {syncPrefs.syncCanvasFiles ? (
                    <ToggleRight size={24} color="var(--color-navy)" />
                  ) : (
                    <ToggleLeft size={24} color="var(--text-muted)" />
                  )}
                  <span style={styles.syncToggleLabel}>Sync Canvas Files</span>
                  <span style={styles.syncToggleDesc}>Files from course modules and file folders</span>
                </button>
                <button
                  style={styles.syncToggle}
                  onClick={() => updateSyncOption('syncAnnouncements', !syncPrefs.syncAnnouncements)}
                >
                  {syncPrefs.syncAnnouncements ? (
                    <ToggleRight size={24} color="var(--color-navy)" />
                  ) : (
                    <ToggleLeft size={24} color="var(--text-muted)" />
                  )}
                  <span style={styles.syncToggleLabel}>Sync Announcement Attachments</span>
                  <span style={styles.syncToggleDesc}>Files attached to course announcements</span>
                </button>
                <button
                  style={styles.syncToggle}
                  onClick={() => updateSyncOption('autoDownload', !syncPrefs.autoDownload)}
                >
                  {syncPrefs.autoDownload ? (
                    <ToggleRight size={24} color="var(--color-navy)" />
                  ) : (
                    <ToggleLeft size={24} color="var(--text-muted)" />
                  )}
                  <span style={styles.syncToggleLabel}>Auto-Download New Files</span>
                  <span style={styles.syncToggleDesc}>Automatically download files when syncing</span>
                </button>
              </div>
            </div>

            {/* Course Selection */}
            <div style={styles.syncCoursesSection}>
              <div style={styles.syncCoursesHeader}>
                <div style={styles.filterLabel}>Courses to Sync</div>
                <div style={styles.syncCoursesActions}>
                  <button
                    style={styles.syncCoursesActionBtn}
                    onClick={() => toggleAllCourses(true)}
                  >
                    Select All
                  </button>
                  <button
                    style={styles.syncCoursesActionBtn}
                    onClick={() => toggleAllCourses(false)}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div style={styles.syncCoursesList}>
                {courses.map((course) => {
                  const isEnabled = syncPrefs.enabledCourses.has(course.id);
                  const courseColor = getCourseColor(course.id, course.color);
                  return (
                    <button
                      key={course.id}
                      style={{
                        ...styles.syncCourseItem,
                        opacity: isEnabled ? 1 : 0.6,
                      }}
                      onClick={() => toggleCourseSync(course.id)}
                    >
                      {isEnabled ? (
                        <CheckSquare size={18} color="var(--color-navy)" />
                      ) : (
                        <Square size={18} color="var(--text-muted)" />
                      )}
                      <span
                        style={{
                          ...styles.courseCodeBadge,
                          backgroundColor: courseColor,
                        }}
                      >
                        {getShortCode(course.code)}
                      </span>
                      <span style={styles.syncCourseName}>
                        {course.nickname || course.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p style={styles.syncCoursesInfo}>
                {syncPrefs.enabledCourses.size} of {courses.length} courses selected for sync
              </p>
            </div>

            {/* Download Location */}
            <div style={styles.downloadLocationSection}>
              <div style={styles.filterLabel}>Download Location</div>
              <div style={styles.downloadLocationBox}>
                <FolderOpen size={18} color="var(--text-muted)" />
                <span style={styles.downloadLocationPath}>
                  {filesDirectory || 'Loading...'}
                </span>
                <button
                  style={styles.openFolderButton}
                  onClick={handleOpenFilesDirectory}
                  title="Open in file explorer"
                >
                  Open Folder
                </button>
              </div>
              <p style={styles.downloadLocationInfo}>
                Files are organized by course code in subfolders
              </p>
            </div>

            {/* Clear Sync Data */}
            <div style={styles.clearSyncSection}>
              <div style={styles.filterLabel}>Clear Sync Data</div>
              <p style={styles.clearSyncInfo}>
                Remove all synced file information from the database. Downloaded files will not be deleted.
                Use this to fix incorrect folder structures or re-sync from scratch.
              </p>
              <button
                style={styles.clearSyncButton}
                onClick={async () => {
                  if (window.confirm('Clear all synced file data? This will remove file information from the database but not delete downloaded files.')) {
                    const api = window.api;
                    if (api?.clearFilesSync) {
                      await api.clearFilesSync();
                      await fetchFiles();
                    }
                  }
                }}
              >
                <Trash2 size={16} />
                Clear Synced Files Data
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <Card padding="md" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={styles.filterPanel}>
            {/* Course Prefix Filter */}
            <div style={styles.filterSection}>
              <div style={styles.filterLabel}>Course Prefix</div>
              <div style={styles.filterChips}>
                {availablePrefixes.map((prefix) => (
                  <button
                    key={prefix}
                    style={{
                      ...styles.filterChip,
                      backgroundColor: selectedPrefixes.has(prefix) ? 'var(--color-navy)' : 'var(--bg-app)',
                      color: selectedPrefixes.has(prefix) ? 'white' : 'var(--text-secondary)',
                    }}
                    onClick={() => togglePrefix(prefix)}
                  >
                    {prefix}
                  </button>
                ))}
              </div>
            </div>

            {/* Term Filter */}
            <div style={styles.filterSection}>
              <div style={styles.filterLabel}>Term</div>
              <div style={styles.filterChips}>
                {availableTerms.map((term) => (
                  <button
                    key={term}
                    style={{
                      ...styles.filterChip,
                      backgroundColor: selectedTerms.has(term) ? 'var(--color-navy)' : 'var(--bg-app)',
                      color: selectedTerms.has(term) ? 'white' : 'var(--text-secondary)',
                    }}
                    onClick={() => toggleTerm(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Source Filter */}
            <div style={styles.filterSection}>
              <div style={styles.filterLabel}>Source</div>
              <div style={styles.filterChips}>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'canvas', label: 'Canvas Files' },
                  { value: 'announcements', label: 'Announcements' },
                  { value: 'downloaded', label: 'Downloaded' },
                ].map((option) => (
                  <button
                    key={option.value}
                    style={{
                      ...styles.filterChip,
                      backgroundColor: sourceFilter === option.value ? 'var(--color-navy)' : 'var(--bg-app)',
                      color: sourceFilter === option.value ? 'white' : 'var(--text-secondary)',
                    }}
                    onClick={() => setSourceFilter(option.value as SourceFilter)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Course Filter */}
            {coursesWithFiles.length > 0 && (
              <div style={styles.filterSection}>
                <div style={styles.courseFilterHeader}>
                  <div style={styles.filterLabel}>Courses</div>
                  <div style={styles.courseFilterActions}>
                    <button style={styles.courseFilterAction} onClick={selectAllCourseFilters}>
                      Select All
                    </button>
                    <button style={styles.courseFilterAction} onClick={deselectAllCourseFilters}>
                      Deselect All
                    </button>
                  </div>
                </div>
                <div style={styles.courseFilterList}>
                  {coursesWithFiles.map((course) => {
                    const isSelected = isCourseFilterSelected(course.id);
                    const courseColor = getCourseColor(course.id, course.color);
                    return (
                      <button
                        key={course.id}
                        style={{
                          ...styles.courseFilterItem,
                          opacity: isSelected ? 1 : 0.5,
                          borderColor: isSelected ? courseColor : 'transparent',
                        }}
                        onClick={() => toggleCourseFilter(course.id)}
                      >
                        {isSelected ? (
                          <CheckSquare size={14} color="var(--color-navy)" />
                        ) : (
                          <Square size={14} color="var(--text-muted)" />
                        )}
                        <span style={{ ...styles.courseFilterBadge, backgroundColor: courseColor }}>
                          {getShortCode(course.code)}
                        </span>
                        <span style={styles.courseFilterName}>
                          {course.nickname || course.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button style={styles.clearFilters} onClick={clearFilters}>
                <X size={14} />
                Clear all filters
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Selection Actions Bar */}
      {selectMode && (
        <div style={styles.selectionBar}>
          <div style={styles.selectionInfo}>
            <CheckSquare size={16} />
            {selectedFiles.size} selected
          </div>
          <div style={styles.selectionActions}>
            <button style={styles.selectionButton} onClick={selectAllVisible}>
              Select all pending
            </button>
            <button style={styles.selectionButton} onClick={deselectAll}>
              Deselect all
            </button>
            <button
              style={{
                ...styles.selectionButton,
                backgroundColor: 'var(--color-navy)',
                color: 'white',
              }}
              onClick={handleDownloadSelected}
              disabled={selectedFiles.size === 0}
            >
              <Download size={14} />
              Download selected
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {totalFiles === 0 ? (
        <Card padding="lg">
          <div style={styles.emptyState}>
            <FolderOpen size={64} color="var(--color-navy)" style={{ marginBottom: 'var(--space-4)' }} />
            <h2 style={styles.emptyTitle}>No Files Yet</h2>
            <p style={styles.emptyText}>
              Files from Canvas and announcements will appear here after syncing.
            </p>
            <button style={styles.syncButtonLarge} onClick={handleSync}>
              <RefreshCw size={18} />
              Sync Now
            </button>
          </div>
        </Card>
      ) : filteredCount === 0 ? (
        <Card padding="lg">
          <div style={styles.emptyState}>
            <Search size={48} color="var(--text-muted)" style={{ marginBottom: 'var(--space-4)' }} />
            <h2 style={styles.emptyTitle}>No Results</h2>
            <p style={styles.emptyText}>
              No files match your current filters
            </p>
            <button style={styles.clearFiltersButton} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        </Card>
      ) : (
        /* File List by Course */
        <div style={styles.courseList}>
          {Array.from(groupedFiles.entries()).map(([courseId, folderMap]) => {
            const course = courseMap.get(courseId);
            const isExpanded = expandedCourses.has(courseId);
            const courseColor = getCourseColor(courseId, course?.color || null);
            const courseCode = course ? getShortCode(course.code) : 'Unknown';

            // Count total files and downloaded files in course
            let totalInCourse = 0;
            let downloadedInCourse = 0;
            for (const fileList of folderMap.values()) {
              totalInCourse += fileList.length;
              downloadedInCourse += fileList.filter(isFileDownloaded).length;
            }

            // Sort folders: Announcements first, then alphabetically
            const sortedFolders = Array.from(folderMap.entries()).sort((a, b) => {
              if (a[0] === 'Announcements') return -1;
              if (b[0] === 'Announcements') return 1;
              if (a[0] === '') return -1;
              if (b[0] === '') return 1;
              return a[0].localeCompare(b[0]);
            });

            return (
              <div key={courseId} style={styles.courseSection}>
                {/* Course Header */}
                <button style={styles.courseHeader} onClick={() => toggleCourse(courseId)}>
                  <div style={styles.courseHeaderLeft}>
                    {isExpanded ? (
                      <ChevronDown size={18} color="var(--text-secondary)" />
                    ) : (
                      <ChevronRight size={18} color="var(--text-secondary)" />
                    )}
                    <span style={{ ...styles.courseCodeBadge, backgroundColor: courseColor }}>
                      {courseCode}
                    </span>
                    <span style={styles.courseHeaderName}>
                      {course?.nickname || course?.name || 'Unknown Course'}
                    </span>
                  </div>
                  <span style={styles.courseFileCount}>
                    {downloadedInCourse}/{totalInCourse} downloaded
                  </span>
                </button>

                {/* Folders and Files */}
                {isExpanded && (
                  <div style={styles.foldersContainer}>
                    {sortedFolders.map(([folderPath, folderFiles]) => {
                      const folderExpanded = isFolderExpanded(courseId, folderPath);
                      const folderDownloaded = folderFiles.filter(isFileDownloaded).length;
                      const displayPath = folderPath || 'Root';

                      return (
                        <div key={folderPath} style={styles.folderSection}>
                          {/* Folder Header */}
                          <button
                            style={styles.folderHeader}
                            onClick={() => toggleFolder(courseId, folderPath)}
                          >
                            <div style={styles.folderHeaderLeft}>
                              {folderExpanded ? (
                                <ChevronDown size={14} color="var(--text-muted)" />
                              ) : (
                                <ChevronRight size={14} color="var(--text-muted)" />
                              )}
                              <FolderOpen size={14} color="var(--text-muted)" />
                              <span style={styles.folderName}>{displayPath}</span>
                            </div>
                            <span style={styles.folderFileCount}>
                              {folderDownloaded}/{folderFiles.length}
                            </span>
                          </button>

                          {/* Files in Folder */}
                          {folderExpanded && (
                            viewMode === 'list' ? (
                              <div style={styles.fileList}>
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
                                  />
                                ))}
                              </div>
                            ) : (
                              <div style={styles.fileGrid}>
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
                                  />
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Download Confirmation Dialog */}
      <ConfirmDialog
        isOpen={pendingDownload !== null}
        title="Download File"
        message={`Download "${pendingDownload ? getFileName(pendingDownload) : ''}"?`}
        type="info"
        confirmText="Download"
        cancelText="Cancel"
        onConfirm={confirmDownload}
        onCancel={cancelDownload}
      />
    </div>
  );
}

// File List Item Component
interface FileItemProps {
  file: FileItem;
  isDownloading: boolean;
  isSelected: boolean;
  selectMode: boolean;
  onToggleSelect: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onShowInFolder?: () => void;
}

function FileListItem({
  file,
  isDownloading,
  isSelected,
  selectMode,
  onToggleSelect,
  onDownload,
  onOpen,
  onShowInFolder,
}: FileItemProps) {
  const isAttachment = file.source === 'attachment';
  const downloadStatus = isAttachment ? (file as FileAttachment).downloadStatus : null;
  const isDownloaded = isFileDownloaded(file);

  // Get student-centric metadata
  const filename = getFileName(file);
  const folderPath = file.source === 'resource' ? (file as FileResource).folderPath : null;
  const category = categorizeFile(filename, folderPath);
  const moduleContext = extractModuleContext(folderPath, filename);
  const categoryColor = getCategoryColor(category);

  // Handle double-click: open if downloaded, download if not
  const handleDoubleClick = () => {
    if (selectMode) return; // Ignore in select mode
    if (isDownloaded) {
      onOpen();
    } else {
      onDownload();
    }
  };

  return (
    <div
      style={styles.fileListItem}
      onDoubleClick={handleDoubleClick}
      title={isDownloaded ? 'Double-click to open' : 'Double-click to download'}
    >
      {selectMode && (
        <button
          style={styles.checkbox}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
        >
          {isSelected ? (
            <CheckSquare size={18} color="var(--color-navy)" />
          ) : (
            <Square size={18} color="var(--text-muted)" />
          )}
        </button>
      )}
      <div style={styles.fileIcon}>{getFileIcon(file)}</div>
      <div style={styles.fileInfo}>
        <div style={styles.fileName}>{filename}</div>
        <div style={styles.fileMeta}>
          {/* Category badge */}
          <span
            style={{
              ...styles.categoryBadge,
              backgroundColor: categoryColor,
            }}
          >
            {category}
          </span>
          {/* Module/Week context */}
          {moduleContext && (
            <>
              <span style={styles.metaSeparator}>•</span>
              <span style={styles.moduleContext}>{moduleContext}</span>
            </>
          )}
          {/* Source info for attachments */}
          {isAttachment && (
            <>
              <span style={styles.metaSeparator}>•</span>
              <span style={styles.fileSource} title={(file as FileAttachment).notificationTitle}>
                from Announcement
              </span>
            </>
          )}
          {/* Download status indicator */}
          {isDownloaded && (
            <>
              <span style={styles.metaSeparator}>•</span>
              <CheckCircle size={12} color="var(--color-success)" />
            </>
          )}
        </div>
      </div>
      <div style={styles.fileActions}>
        {isDownloading ? (
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} color="var(--text-secondary)" />
        ) : isDownloaded ? (
          <>
            <button
              style={styles.fileActionButton}
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              title="Open file"
            >
              <CheckCircle size={16} color="var(--color-success)" />
            </button>
            {onShowInFolder && (
              <button
                style={styles.fileActionButton}
                onClick={(e) => { e.stopPropagation(); onShowInFolder(); }}
                title="Show in folder"
              >
                <FolderOpen size={16} />
              </button>
            )}
          </>
        ) : downloadStatus === 'failed' ? (
          <button
            style={styles.fileActionButton}
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            title="Retry download"
          >
            <AlertCircle size={16} color="var(--color-error)" />
          </button>
        ) : (
          <button
            style={styles.fileActionButton}
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            title="Download"
          >
            <Download size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function FileGridItem({
  file,
  isDownloading,
  isSelected,
  selectMode,
  onToggleSelect,
  onDownload,
  onOpen,
}: Omit<FileItemProps, 'onShowInFolder'>) {
  const isDownloaded = isFileDownloaded(file);

  // Get student-centric metadata
  const filename = getFileName(file);
  const folderPath = file.source === 'resource' ? (file as FileResource).folderPath : null;
  const category = categorizeFile(filename, folderPath);
  const moduleContext = extractModuleContext(folderPath, filename);
  const categoryColor = getCategoryColor(category);

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect();
    } else if (isDownloaded) {
      onOpen();
    } else {
      onDownload();
    }
  };

  return (
    <div
      style={{
        ...styles.fileGridItem,
        borderColor: isSelected ? 'var(--color-navy)' : 'transparent',
      }}
      onClick={handleClick}
    >
      {selectMode && (
        <div style={styles.gridCheckbox}>
          {isSelected ? (
            <CheckSquare size={16} color="var(--color-navy)" />
          ) : (
            <Square size={16} color="var(--text-muted)" />
          )}
        </div>
      )}
      <div style={styles.fileGridIcon}>
        {isDownloading ? (
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} color="var(--text-secondary)" />
        ) : (
          getFileIcon(file, 32)
        )}
      </div>
      <div style={styles.fileGridName} title={filename}>{filename}</div>
      <div style={styles.fileGridMeta}>
        <span
          style={{
            ...styles.categoryBadgeSmall,
            backgroundColor: categoryColor,
          }}
        >
          {category}
        </span>
        {moduleContext && <span style={styles.gridModuleContext}>{moduleContext}</span>}
        {isDownloaded && (
          <CheckCircle size={10} color="var(--color-success)" style={{ marginLeft: '4px' }} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },

  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  syncButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    marginLeft: '4px',
    padding: '0 6px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '10px',
    fontSize: '11px',
  },

  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    minWidth: '200px',
  },

  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    background: 'none',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  clearSearch: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  viewButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },

  filterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  filterChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },

  filterChip: {
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-full)',
    border: 'none',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  courseFilterHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  courseFilterActions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  courseFilterAction: {
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-navy)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  courseFilterList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },

  courseFilterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    border: '2px solid transparent',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  courseFilterBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '1px 6px',
    borderRadius: '3px',
  },

  courseFilterName: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-primary)',
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  clearFilters: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    alignSelf: 'flex-start',
    padding: 'var(--space-1) var(--space-2)',
    background: 'none',
    border: 'none',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    cursor: 'pointer',
  },

  // Sync Config Panel Styles
  syncConfigPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-5)',
  },

  syncConfigHeader: {
    borderBottom: '1px solid var(--border-light)',
    paddingBottom: 'var(--space-3)',
  },

  syncConfigTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  syncConfigSubtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  syncOptionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  syncOptionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  syncToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'left',
  },

  syncToggleLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    flex: 1,
  },

  syncToggleDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    maxWidth: '200px',
    textAlign: 'right',
  },

  syncCoursesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  syncCoursesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  syncCoursesActions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  syncCoursesActionBtn: {
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  syncCoursesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 'var(--space-2)',
  },

  syncCourseItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'opacity var(--transition-fast)',
  },

  syncCourseName: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },

  syncCoursesInfo: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: 'var(--space-1)',
  },

  downloadLocationSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--border-light)',
  },

  downloadLocationBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  downloadLocationPath: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  openFolderButton: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    flexShrink: 0,
  },

  downloadLocationInfo: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  clearSyncSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    paddingTop: 'var(--space-4)',
    borderTop: '1px solid var(--border-light)',
  },

  clearSyncInfo: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },

  clearSyncButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },

  selectionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
    border: '1px solid var(--color-navy)',
  },

  selectionInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-navy)',
  },

  selectionActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  selectionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-12)',
    color: 'var(--text-secondary)',
  },

  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-10)',
  },

  emptyTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  syncButtonLarge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-5)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  clearFiltersButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  courseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  courseSection: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
  },

  courseHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },

  courseHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  courseCodeBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },

  courseHeaderName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  courseFileCount: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  foldersContainer: {
    borderTop: '1px solid var(--border-light)',
  },

  folderSection: {
    borderBottom: '1px solid var(--border-light)',
  },

  folderHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 'var(--space-2) var(--space-4)',
    paddingLeft: 'var(--space-6)',
    background: 'var(--bg-app)',
    border: 'none',
    cursor: 'pointer',
  },

  folderHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  folderName: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },

  folderFileCount: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },

  fileList: {
    borderTop: '1px solid var(--border-light)',
  },

  fileListItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  checkbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },

  fileIcon: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },

  fileInfo: {
    flex: 1,
    minWidth: 0,
  },

  fileName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  fileMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  metaSeparator: {
    margin: '0 var(--space-1)',
  },

  fileSource: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  filePath: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: 'var(--text-muted)',
    maxWidth: '300px',
  },

  categoryBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
  },

  categoryBadgeSmall: {
    fontSize: '9px',
    fontWeight: 'var(--font-semibold)',
    color: 'white',
    padding: '1px 4px',
    borderRadius: '2px',
    whiteSpace: 'nowrap',
  },

  moduleContext: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    fontWeight: 'var(--font-medium)',
  },

  gridModuleContext: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    marginLeft: '4px',
  },

  fileActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    flexShrink: 0,
  },

  fileActionButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  fileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderTop: '1px solid var(--border-light)',
  },

  fileGridItem: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'center',
  },

  gridCheckbox: {
    position: 'absolute',
    top: '8px',
    left: '8px',
  },

  fileGridIcon: {
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-2)',
  },

  fileGridName: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
    marginBottom: '2px',
  },

  fileGridMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
};

export default FilesPage;
