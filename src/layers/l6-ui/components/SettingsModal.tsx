/**
 * SettingsModal Component - Redesigned
 *
 * Modal overlay for application settings with:
 * - 4 collapsible accordion sections
 * - Fuzzy search across all settings
 * - Change indicators for modified settings
 * - Import/export functionality
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Link,
  Check,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Monitor,
  FolderOpen,
  Eye,
  EyeOff,
  Calendar,
  LayoutDashboard,
  Bell,
  Database,
  RotateCcw,
  Upload,
  Download,
  ShieldCheck,
  Key,
  Palette,
  GraduationCap,
  Settings2,
  BookOpen,
  HardDrive,
  FileSpreadsheet,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { useStore } from '../../l5-presentation/store';
import {
  STORAGE_KEYS,
  settingsManager,
  DEFAULT_SYNC_PREFERENCES,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
  DEFAULT_DASHBOARD_SETTINGS,
  DEFAULT_SETTINGS_PAGE_SETTINGS,
  DEFAULT_SETTINGS_SECTION_ORDER,
  DEFAULT_LOCAL_HTML_PATHS_SETTINGS,
  SETTINGS_CATEGORIES,
  searchSettings,
  type SyncPreferences,
  type AppearanceSettings,
  type NotificationSettings,
  type AcademicSettings,
  type FileExplorerSettings,
  type CourseSettings,
  type CalendarSettings,
  type ContentSettings,
  type DashboardSettings,
  type SettingsCategory,
  type SettingsPageSettings,
  type LocalHtmlPathsSettings,
} from '../../l5-presentation/settings';
import type { Course } from '../../l5-presentation/types';
import { ConfirmDialog } from './shared/ConfirmDialog';
import { ExportDialog } from './shared/ExportDialog';
import {
  Accordion,
  SearchInput,
  SettingRow,
  ToggleSwitch,
  SettingSelect,
  SettingSlider,
  SettingButtonGroup,
  SettingsDock,
} from './primitives';
import { SETTINGS_LABELS, MENU_LABELS } from '../constants';

// =============================================================================
// TYPES
// =============================================================================

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFullPage?: boolean;
}

interface EnrollmentTerm {
  id: number;
  externalId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

// Category icons - also includes 'data' section
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  account: <Link size={18} />,
  display: <Palette size={18} />,
  academic: <GraduationCap size={18} />,
  notifications: <Bell size={18} />,
  data: <HardDrive size={18} />,
};

// Landing page options
const LANDING_PAGE_OPTIONS = [
  { value: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { value: '/calendar', label: 'Calendar', icon: <Calendar size={16} /> },
  { value: '/courses', label: 'Courses', icon: <BookOpen size={16} /> },
  { value: '/files', label: 'Files', icon: <FolderOpen size={16} /> },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SettingsModal({
  isOpen,
  onClose,
  isFullPage = false,
}: SettingsModalProps) {
  const { courses, fetchCourses, setAuthenticated } = useStore();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Settings page settings (default state for sections)
  const [settingsPageSettings, setSettingsPageSettings] = useState<SettingsPageSettings>(
    () => {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS_DEFAULT_STATE);
      if (
        stored &&
        (stored === 'collapsed' || stored === 'expanded' || stored === 'remember')
      ) {
        return { defaultState: stored };
      }
      return DEFAULT_SETTINGS_PAGE_SETTINGS;
    }
  );

  // Accordion state - initialized based on settings default state preference
  const [openSections, setOpenSections] = useState<string[]>(() => {
    const storedDefaultState = localStorage.getItem(STORAGE_KEYS.SETTINGS_DEFAULT_STATE);
    const defaultState =
      storedDefaultState ?? DEFAULT_SETTINGS_PAGE_SETTINGS.defaultState;

    if (defaultState === 'collapsed') {
      return [];
    } else if (defaultState === 'remember') {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS_OPEN_SECTIONS);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return DEFAULT_SETTINGS_SECTION_ORDER;
        }
      }
      return DEFAULT_SETTINGS_SECTION_ORDER;
    }
    // 'expanded' - all sections open
    return DEFAULT_SETTINGS_SECTION_ORDER;
  });

  // Canvas connection state
  const [canvasUrl, setCanvasUrl] = useState('');
  const canvasUrlInitializedRef = React.useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Token validation state
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenValidationResult, setTokenValidationResult] = useState<{
    status: 'success' | 'error' | null;
    message: string | null;
  }>({ status: null, message: null });

  // Token replacement modal state
  const [showTokenReplaceModal, setShowTokenReplaceModal] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [isValidatingNewToken, setIsValidatingNewToken] = useState(false);
  const [newTokenValidation, setNewTokenValidation] = useState<{
    valid: boolean | null;
    userName: string | null;
    error: string | null;
  }>({ valid: null, userName: null, error: null });
  const [isReplacingToken, setIsReplacingToken] = useState(false);

  // Sync preferences
  const [syncPrefs, setSyncPrefs] = useState<SyncPreferences>(
    () => settingsManager.get(STORAGE_KEYS.SYNC_PREFS) ?? DEFAULT_SYNC_PREFERENCES
  );

  // Appearance settings
  const [appearance, setAppearance] = useState<AppearanceSettings>(
    () => settingsManager.get(STORAGE_KEYS.APPEARANCE) ?? DEFAULT_APPEARANCE_SETTINGS
  );

  // Notification settings
  const [notifications, setNotifications] = useState<NotificationSettings>(
    () => settingsManager.get(STORAGE_KEYS.NOTIFICATIONS) ?? DEFAULT_NOTIFICATION_SETTINGS
  );

  // Academic settings
  const [academic, setAcademic] = useState<AcademicSettings>(
    () => settingsManager.get(STORAGE_KEYS.ACADEMIC) ?? DEFAULT_ACADEMIC_SETTINGS
  );

  // Enrollment terms loaded from database
  const [enrollmentTerms, setEnrollmentTerms] = useState<EnrollmentTerm[]>([]);

  // File explorer settings
  const [fileExplorer, setFileExplorer] = useState<FileExplorerSettings>(
    () =>
      settingsManager.get(STORAGE_KEYS.FILE_EXPLORER) ?? DEFAULT_FILE_EXPLORER_SETTINGS
  );

  // Current download directory
  const [currentDownloadPath, setCurrentDownloadPath] = useState<string>('');

  // Course settings
  const [courseSettings, setCourseSettings] = useState<CourseSettings>(
    () => settingsManager.get(STORAGE_KEYS.COURSES) ?? DEFAULT_COURSE_SETTINGS
  );

  // Calendar settings
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(
    () => settingsManager.get(STORAGE_KEYS.CALENDAR) ?? DEFAULT_CALENDAR_SETTINGS
  );

  // Content settings
  const [contentSettings, setContentSettings] = useState<ContentSettings>(
    () => settingsManager.get(STORAGE_KEYS.CONTENT) ?? DEFAULT_CONTENT_SETTINGS
  );

  // Local HTML paths settings (offline HTML with dependencies)
  const [localHtmlPathsSettings, setLocalHtmlPathsSettings] =
    useState<LocalHtmlPathsSettings>(
      () =>
        settingsManager.get(STORAGE_KEYS.LOCAL_HTML_PATHS) ??
        DEFAULT_LOCAL_HTML_PATHS_SETTINGS
    );

  // Dashboard settings
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(
    () => settingsManager.get(STORAGE_KEYS.DASHBOARD) ?? DEFAULT_DASHBOARD_SETTINGS
  );

  // Landing page setting
  const [landingPage, setLandingPage] = useState<string>(
    () => settingsManager.get(STORAGE_KEYS.LANDING_PAGE) ?? '/'
  );

  // Section order for drag-and-drop reordering
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS_SECTION_ORDER);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return ['account', 'display', 'academic', 'notifications', 'data'];
      }
    }
    return ['account', 'display', 'academic', 'notifications', 'data'];
  });

  // Drag state for section reordering
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  // Window behavior settings
  const [windowBehavior, setWindowBehavior] = useState<{
    closeAction: 'quit' | 'minimize-to-tray' | null;
    showTrayIcon: boolean;
  }>({ closeAction: null, showTrayIcon: true });

  // Confirmation dialogs
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [deleteTokenOnClear, setDeleteTokenOnClear] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Data export/import state
  const [isExporting, setIsExporting] = useState(false);
  const [_isImporting, setIsImporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // New export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showCsvDropdown, setShowCsvDropdown] = useState(false);

  // Dock auto-hide setting (default: true = hidden until hovered)
  const [dockAutoHide, setDockAutoHide] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS_DOCK_AUTO_HIDE);
    // Default to true (hidden) unless explicitly set to 'false'
    return stored !== 'false';
  });

  // Section refs for dock navigation
  const sectionRefs = {
    account: useRef<HTMLDivElement>(null),
    display: useRef<HTMLDivElement>(null),
    academic: useRef<HTMLDivElement>(null),
    notifications: useRef<HTMLDivElement>(null),
    data: useRef<HTMLDivElement>(null),
  };

  // =============================================================================
  // FILTERED SETTINGS FOR SEARCH
  // =============================================================================

  const filteredSettings = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchSettings(searchQuery);
  }, [searchQuery]);

  const hasSearchResults = filteredSettings !== null;
  const matchingCategories = useMemo(() => {
    if (!filteredSettings) return new Set<SettingsCategory>();
    return new Set(filteredSettings.map((s) => s.category));
  }, [filteredSettings]);

  // Set of matching setting keys for individual setting filtering
  const matchingSettingKeys = useMemo(() => {
    if (!filteredSettings) return null;
    return new Set(filteredSettings.map((s) => s.key));
  }, [filteredSettings]);

  // Check if a specific setting should be shown based on search
  const shouldShowSetting = (settingKey: string): boolean => {
    if (!matchingSettingKeys) return true;
    return matchingSettingKeys.has(settingKey);
  };

  // Flag to indicate active search mode (hide dividers, titles, descriptions)
  const isSearching = hasSearchResults && (filteredSettings?.length ?? 0) > 0;

  // =============================================================================
  // EFFECTS
  // =============================================================================

  // Apply theme on change
  useEffect(() => {
    const applyTheme = (theme: 'light' | 'dark' | 'system') => {
      const root = document.documentElement;
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        root.setAttribute('data-theme', theme);
      }
    };

    applyTheme(appearance.theme);

    if (appearance.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [appearance.theme]);

  // Check canvas connection on mount
  useEffect(() => {
    if (isOpen) {
      checkCanvasConnection();
      fetchEnrollmentTerms();
      fetchDownloadDirectory();
      fetchWindowBehavior();
    } else {
      canvasUrlInitializedRef.current = false;
      setSearchQuery('');
    }
  }, [isOpen]);

  // Save open sections when changed (for "remember" mode)
  useEffect(() => {
    if (settingsPageSettings.defaultState === 'remember') {
      localStorage.setItem(
        STORAGE_KEYS.SETTINGS_OPEN_SECTIONS,
        JSON.stringify(openSections)
      );
    }
  }, [openSections, settingsPageSettings.defaultState]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // =============================================================================
  // HANDLERS - Canvas Connection
  // =============================================================================

  const checkCanvasConnection = async () => {
    try {
      const hasCredential = await window.api.hasCredential();
      const savedUrl = settingsManager.get(STORAGE_KEYS.CANVAS_URL) ?? '';
      if (!canvasUrlInitializedRef.current) {
        setCanvasUrl(savedUrl);
        canvasUrlInitializedRef.current = true;
      }
      setIsConnected(hasCredential && !!savedUrl);
    } catch {
      setIsConnected(false);
    }
  };

  const normalizeUrl = (url: string): string => {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized.replace(/\/+$/, '');
  };

  const handleReconnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.connectCanvas(normalizedUrl);
      if (result.success) {
        setIsConnected(true);
        setCanvasUrl(normalizedUrl);
        settingsManager.set(STORAGE_KEYS.CANVAS_URL, normalizedUrl);
      } else {
        setConnectionError(result.error || 'Failed to connect');
      }
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.api.deleteCredential();
      setIsConnected(false);
      settingsManager.remove(STORAGE_KEYS.CANVAS_URL);
      setCanvasUrl('');
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  };

  const handleValidateToken = async () => {
    if (!canvasUrl) return;
    setIsValidatingToken(true);
    setTokenValidationResult({ status: null, message: null });
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.connectCanvas(normalizedUrl);
      if (result.success) {
        setTokenValidationResult({
          status: 'success',
          message: 'Token is valid and working',
        });
      } else {
        setTokenValidationResult({
          status: 'error',
          message: result.error || 'Token validation failed',
        });
      }
    } catch (e) {
      setTokenValidationResult({
        status: 'error',
        message: e instanceof Error ? e.message : 'Validation failed',
      });
    } finally {
      setIsValidatingToken(false);
    }
  };

  const handleOpenTokenReplace = () => {
    setNewToken('');
    setNewTokenValidation({ valid: null, userName: null, error: null });
    setShowTokenReplaceModal(true);
  };

  const handleValidateNewToken = async () => {
    if (!newToken || !canvasUrl) return;
    setIsValidatingNewToken(true);
    setNewTokenValidation({ valid: null, userName: null, error: null });
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.validateToken(newToken, normalizedUrl);
      if (result.valid) {
        setNewTokenValidation({
          valid: true,
          userName: result.user?.name || null,
          error: null,
        });
      } else {
        setNewTokenValidation({
          valid: false,
          userName: null,
          error: result.error || 'Invalid token',
        });
      }
    } catch (e) {
      setNewTokenValidation({
        valid: false,
        userName: null,
        error: e instanceof Error ? e.message : 'Validation failed',
      });
    } finally {
      setIsValidatingNewToken(false);
    }
  };

  const handleReplaceToken = async () => {
    if (!newTokenValidation.valid || !newToken) return;
    setIsReplacingToken(true);
    try {
      const storeResult = await window.api.storeCredential(newToken);
      if (storeResult.success) {
        const normalizedUrl = normalizeUrl(canvasUrl);
        const connectResult = await window.api.connectCanvas(normalizedUrl);
        if (connectResult.success) {
          setShowTokenReplaceModal(false);
          setNewToken('');
          setNewTokenValidation({ valid: null, userName: null, error: null });
          setTokenValidationResult({
            status: 'success',
            message: 'Token replaced successfully',
          });
        } else {
          setNewTokenValidation({
            valid: false,
            userName: null,
            error: connectResult.error || 'Failed to reconnect with new token',
          });
        }
      } else {
        setNewTokenValidation({
          valid: false,
          userName: null,
          error: 'Failed to store new token',
        });
      }
    } catch (e) {
      setNewTokenValidation({
        valid: false,
        userName: null,
        error: e instanceof Error ? e.message : 'Replacement failed',
      });
    } finally {
      setIsReplacingToken(false);
    }
  };

  // =============================================================================
  // HANDLERS - Settings Updates
  // =============================================================================

  const fetchEnrollmentTerms = async () => {
    try {
      const terms = await window.api.getEnrollmentTerms();
      setEnrollmentTerms(terms);
    } catch (error) {
      console.error('[Settings] Failed to fetch enrollment terms:', error);
    }
  };

  const fetchDownloadDirectory = async () => {
    try {
      const result = await window.api.getFilesDirectory();
      setCurrentDownloadPath(result.path);
    } catch (error) {
      console.error('[Settings] Failed to fetch download directory:', error);
    }
  };

  const fetchWindowBehavior = async () => {
    try {
      const settings = await window.api.getWindowBehavior();
      setWindowBehavior(settings);
    } catch (error) {
      console.error('[Settings] Failed to fetch window behavior:', error);
    }
  };

  const updateWindowBehavior = async (updates: Partial<typeof windowBehavior>) => {
    const newSettings = { ...windowBehavior, ...updates };
    setWindowBehavior(newSettings);
    try {
      await window.api.setWindowBehavior(newSettings);
    } catch (error) {
      console.error('[Settings] Failed to update window behavior:', error);
    }
  };

  const updateSyncPrefs = async (updates: Partial<SyncPreferences>) => {
    const newPrefs = { ...syncPrefs, ...updates };
    setSyncPrefs(newPrefs);
    settingsManager.set(STORAGE_KEYS.SYNC_PREFS, newPrefs);

    // Sync ALL sync preferences to the main process database
    // This ensures the main process sees setting changes immediately
    try {
      await window.api.setAutoSyncPreferences({
        autoSyncEnabled: newPrefs.autoSyncEnabled,
        autoSyncInterval: newPrefs.autoSyncInterval,
        autoAssignDueDate: newPrefs.autoAssignDueDate,
        saveHtmlContent: newPrefs.saveHtmlContent,
        htmlUrlRewriting: newPrefs.htmlUrlRewriting,
        downloadImages: newPrefs.downloadImages,
        downloadLinkedFiles: newPrefs.downloadLinkedFiles,
        syncFiles: newPrefs.syncFiles,
        syncAnnouncements: newPrefs.syncAnnouncements,
      });
    } catch (e) {
      console.error('Failed to sync preferences to main process:', e);
    }
  };

  const updateAppearance = (updates: Partial<AppearanceSettings>) => {
    const newSettings = { ...appearance, ...updates };
    setAppearance(newSettings);
    settingsManager.set(STORAGE_KEYS.APPEARANCE, newSettings);
  };

  const updateNotifications = (updates: Partial<NotificationSettings>) => {
    const newSettings = { ...notifications, ...updates };
    setNotifications(newSettings);
    settingsManager.set(STORAGE_KEYS.NOTIFICATIONS, newSettings);
  };

  const updateAcademic = async (updates: Partial<AcademicSettings>) => {
    const newSettings = { ...academic, ...updates };
    setAcademic(newSettings);
    settingsManager.set(STORAGE_KEYS.ACADEMIC, newSettings);

    if (updates.defaultTargetGrade !== undefined) {
      try {
        await window.api?.setDefaultTargetGrade(updates.defaultTargetGrade);
      } catch (error) {
        console.error('[Settings] Failed to propagate default target grade:', error);
      }
    }

    if (updates.termSelection !== undefined) {
      try {
        const value =
          updates.termSelection === 'all' || updates.termSelection === 'auto'
            ? updates.termSelection
            : parseInt(updates.termSelection, 10);
        await window.api?.setTermSelection(value);
        useStore.getState().fetchCourses();
      } catch (error) {
        console.error('[Settings] Failed to propagate term selection:', error);
      }
    }
  };

  const updateFileExplorer = (updates: Partial<FileExplorerSettings>) => {
    const newSettings = { ...fileExplorer, ...updates };
    setFileExplorer(newSettings);
    settingsManager.set(STORAGE_KEYS.FILE_EXPLORER, newSettings);
  };

  const updateCourseSettings = (updates: Partial<CourseSettings>) => {
    const newSettings = { ...courseSettings, ...updates };
    setCourseSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.COURSES, newSettings);
  };

  const updateCalendarSettings = (updates: Partial<CalendarSettings>) => {
    const newSettings = { ...calendarSettings, ...updates };
    setCalendarSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.CALENDAR, newSettings);
    if (updates.defaultViewMode) {
      localStorage.removeItem('viewMode:calendar');
    }
  };

  const updateContentSettings = (updates: Partial<ContentSettings>) => {
    const newSettings = { ...contentSettings, ...updates };
    setContentSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.CONTENT, newSettings);
  };

  const updateLocalHtmlPathsSettings = async (
    updates: Partial<LocalHtmlPathsSettings>
  ) => {
    const newSettings = { ...localHtmlPathsSettings, ...updates };
    setLocalHtmlPathsSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.LOCAL_HTML_PATHS, newSettings);
    // Persist to main process database for use in resource:open handler
    try {
      await window.api.setLocalHtmlPathsSettings(newSettings);
    } catch (error) {
      console.error('[Settings] Failed to save local HTML paths settings:', error);
    }
  };

  const updateDashboardSettings = (updates: Partial<DashboardSettings>) => {
    const newSettings = { ...dashboardSettings, ...updates };
    setDashboardSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.DASHBOARD, newSettings);
  };

  const updateSettingsPageSettings = (updates: Partial<SettingsPageSettings>) => {
    const newSettings = { ...settingsPageSettings, ...updates };
    setSettingsPageSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.SETTINGS_DEFAULT_STATE, newSettings.defaultState);

    // Apply the new default state immediately
    if (updates.defaultState === 'collapsed') {
      setOpenSections([]);
    } else if (updates.defaultState === 'expanded') {
      setOpenSections(DEFAULT_SETTINGS_SECTION_ORDER);
    }
    // For 'remember', keep current state - it will be saved automatically
  };

  const updateLandingPage = (path: string) => {
    setLandingPage(path);
    settingsManager.set(STORAGE_KEYS.LANDING_PAGE, path);
  };

  const updateDockAutoHide = (autoHide: boolean) => {
    setDockAutoHide(autoHide);
    localStorage.setItem(STORAGE_KEYS.SETTINGS_DOCK_AUTO_HIDE, String(autoHide));
  };

  const handleChangeDownloadLocation = async () => {
    try {
      const result = await window.api.selectFilesDirectory();
      if (result.success && result.data?.path) {
        const newPath = result.data.path;
        const setResult = await window.api.setFilesDirectory(newPath);
        if (setResult.success) {
          setCurrentDownloadPath(newPath);
          updateFileExplorer({ downloadLocation: newPath });
        }
      }
    } catch (error) {
      console.error('[Settings] Failed to change download location:', error);
    }
  };

  const handleToggleCourseVisibility = async (
    courseId: number,
    currentlyHidden: boolean
  ) => {
    await window.api.dispatch('UpdateCoursePreferences', {
      courseId,
      preferences: { isHidden: !currentlyHidden },
    });
    await fetchCourses();
  };

  // =============================================================================
  // HANDLERS - Export/Import
  // =============================================================================

  const handleExportDatabase = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.exportDatabase();
      if (result.success) {
        setExportMessage({
          type: 'success',
          text: `Database exported to ${result.data?.filePath}`,
        });
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Export failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Export failed',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportDatabase = async () => {
    setIsImporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.importDatabase();
      if (result.success) {
        setExportMessage({
          type: 'success',
          text: `Database imported successfully. Please restart the app to apply changes.`,
        });
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Import failed',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportSettings = () => {
    try {
      const settings: Record<string, unknown> = {};
      const keys = Object.values(STORAGE_KEYS);
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          try {
            settings[key] = JSON.parse(value);
          } catch {
            settings[key] = value;
          }
        }
      }

      const blob = new Blob([JSON.stringify(settings, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-assistant-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportMessage({ type: 'success', text: 'Settings exported successfully' });
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Export failed',
      });
    }
  };

  const handleImportSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const settings = JSON.parse(text);

        if (typeof settings !== 'object' || settings === null) {
          throw new Error('Invalid settings file format');
        }

        for (const [key, value] of Object.entries(settings)) {
          if (typeof value === 'string') {
            localStorage.setItem(key, value);
          } else {
            localStorage.setItem(key, JSON.stringify(value));
          }
        }

        setExportMessage({ type: 'success', text: 'Settings imported. Reloading...' });
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        setExportMessage({
          type: 'error',
          text: e instanceof Error ? e.message : 'Import failed',
        });
      }
    };
    input.click();
  };

  // =============================================================================
  // SECTION DRAG AND DROP HANDLERS
  // =============================================================================

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedSection(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionId);
    // Add a slight delay to show the drag effect
    setTimeout(() => {
      const target = e.target as HTMLElement;
      target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedSection(null);
    setDragOverSection(null);
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
        // Remove from source position
        newOrder.splice(sourceIndex, 1);
        // Insert at target position
        newOrder.splice(targetIndex, 0, sourceSectionId);

        setSectionOrder(newOrder);
        // Persist to localStorage
        localStorage.setItem(
          STORAGE_KEYS.SETTINGS_SECTION_ORDER,
          JSON.stringify(newOrder)
        );
      }
    }

    setDraggedSection(null);
    setDragOverSection(null);
  };

  // Helper to get drag wrapper style
  const getDragWrapperStyle = (sectionId: string): React.CSSProperties => ({
    position: 'relative',
    borderRadius: 'var(--radius-lg)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    ...(draggedSection === sectionId && {
      opacity: 0.5,
    }),
    ...(dragOverSection === sectionId &&
      draggedSection !== sectionId && {
        boxShadow: '0 0 0 2px var(--color-primary)',
      }),
  });

  // =============================================================================
  // CHECK IF SETTINGS ARE MODIFIED
  // =============================================================================

  const isSyncModified =
    JSON.stringify(syncPrefs) !== JSON.stringify(DEFAULT_SYNC_PREFERENCES);
  const isAppearanceModified =
    JSON.stringify(appearance) !== JSON.stringify(DEFAULT_APPEARANCE_SETTINGS);
  const isNotificationsModified =
    JSON.stringify(notifications) !== JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS);
  const isAcademicModified =
    JSON.stringify(academic) !== JSON.stringify(DEFAULT_ACADEMIC_SETTINGS);
  const isDashboardModified =
    JSON.stringify(dashboardSettings) !== JSON.stringify(DEFAULT_DASHBOARD_SETTINGS);
  const isFileExplorerModified =
    JSON.stringify(fileExplorer) !== JSON.stringify(DEFAULT_FILE_EXPLORER_SETTINGS);
  const isCalendarModified =
    JSON.stringify(calendarSettings) !== JSON.stringify(DEFAULT_CALENDAR_SETTINGS);
  const isCourseSettingsModified =
    JSON.stringify(courseSettings) !== JSON.stringify(DEFAULT_COURSE_SETTINGS);
  const isSettingsPageSettingsModified =
    settingsPageSettings.defaultState !== DEFAULT_SETTINGS_PAGE_SETTINGS.defaultState;

  const accountModifiedCount =
    (isSyncModified ? 1 : 0) + (windowBehavior.closeAction !== null ? 1 : 0);
  const displayModifiedCount =
    (isAppearanceModified ? 1 : 0) +
    (isDashboardModified ? 1 : 0) +
    (landingPage !== '/' ? 1 : 0) +
    (isFileExplorerModified ? 1 : 0) +
    (isCalendarModified ? 1 : 0) +
    (isCourseSettingsModified ? 1 : 0) +
    (isSettingsPageSettingsModified ? 1 : 0);
  const academicModifiedCount = isAcademicModified ? 1 : 0;
  const notificationsModifiedCount = isNotificationsModified ? 1 : 0;

  // =============================================================================
  // RENDER
  // =============================================================================

  if (!isOpen) return null;

  const shouldShowSection = (category: SettingsCategory): boolean => {
    if (!hasSearchResults) return true;
    return matchingCategories.has(category);
  };

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  const content = (
    <>
      {/* Header */}
      <div style={isFullPage ? styles.pageHeader : styles.header}>
        <div style={styles.headerContent}>
          <Settings2 size={24} style={{ color: 'var(--color-navy)' }} />
          <h2 style={isFullPage ? styles.pageTitle : styles.title}>Settings</h2>
        </div>
        {!isFullPage && (
          <button style={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Search */}
      <div style={styles.searchContainer}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={SETTINGS_LABELS.search.placeholder}
          debounce={150}
        />
      </div>

      {/* Content */}
      <div style={{ ...styles.content, flex: isSearching ? 'none' : 1 }}>
        <Accordion type="multiple" value={openSections} onChange={setOpenSections}>
          {/* Account & Connection */}
          {shouldShowSection('account') && (
            <div
              ref={sectionRefs.account}
              draggable
              onDragStart={(e) => handleDragStart(e, 'account')}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, 'account')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'account')}
              style={{
                ...getDragWrapperStyle('account'),
                order: sectionOrder.indexOf('account'),
              }}
            >
              <Accordion.Item value="account">
                <Accordion.Trigger
                  icon={CATEGORY_ICONS.account}
                  badge={<ModifiedBadge count={accountModifiedCount} />}
                >
                  {SETTINGS_CATEGORIES.account.label}
                </Accordion.Trigger>
                <Accordion.Content>
                  <div style={styles.section}>
                    {!isSearching && (
                      <p style={styles.sectionDesc}>
                        {SETTINGS_CATEGORIES.account.description}
                      </p>
                    )}

                    {/* Canvas Connection Card */}
                    <div style={styles.connectionCard}>
                      {/* Connection Header with Status Badge */}
                      <div style={styles.connectionHeader}>
                        <div style={styles.connectionTitleRow}>
                          <Link size={18} style={{ color: 'var(--color-primary)' }} />
                          <span style={styles.connectionTitle}>
                            {SETTINGS_LABELS.sections.canvasConnection}
                          </span>
                        </div>
                        {isConnected ? (
                          <span style={styles.statusBadgeConnected}>
                            <Check size={12} /> {SETTINGS_LABELS.status.connected}
                          </span>
                        ) : (
                          <span style={styles.statusBadgeDisconnected}>
                            <AlertCircle size={12} />{' '}
                            {SETTINGS_LABELS.status.notConnected}
                          </span>
                        )}
                      </div>

                      {/* URL Display/Input */}
                      <div style={styles.urlSection}>
                        <label style={styles.urlLabel}>Canvas URL</label>
                        {isConnected ? (
                          <div style={styles.urlDisplay}>
                            <span style={styles.urlText}>{canvasUrl}</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={canvasUrl}
                            onChange={(e) => setCanvasUrl(e.target.value)}
                            placeholder={SETTINGS_LABELS.placeholders.canvasUrl}
                            style={styles.urlInput}
                          />
                        )}
                      </div>

                      {/* Error/Validation Messages */}
                      {connectionError && (
                        <div style={styles.connectionError}>
                          <AlertCircle size={14} />
                          {connectionError}
                        </div>
                      )}

                      {tokenValidationResult.status && (
                        <div
                          style={{
                            ...styles.validationMessage,
                            backgroundColor:
                              tokenValidationResult.status === 'success'
                                ? 'var(--color-success-bg)'
                                : 'var(--color-error-bg)',
                            color:
                              tokenValidationResult.status === 'success'
                                ? 'var(--color-success)'
                                : 'var(--color-error)',
                          }}
                        >
                          {tokenValidationResult.status === 'success' ? (
                            <Check size={14} />
                          ) : (
                            <AlertCircle size={14} />
                          )}
                          {tokenValidationResult.message}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={styles.connectionActions}>
                        {isConnected ? (
                          <>
                            <div style={styles.tokenActions}>
                              <button
                                style={{
                                  ...styles.tokenButton,
                                  opacity: isValidatingToken ? 0.6 : 1,
                                }}
                                onClick={handleValidateToken}
                                disabled={isValidatingToken}
                              >
                                {isValidatingToken ? (
                                  <>
                                    <Loader2
                                      size={14}
                                      style={{ animation: 'spin 1s linear infinite' }}
                                    />
                                    {SETTINGS_LABELS.buttons.testing}
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck size={14} />
                                    {SETTINGS_LABELS.buttons.testConnection}
                                  </>
                                )}
                              </button>
                              <button
                                style={styles.tokenButton}
                                onClick={handleOpenTokenReplace}
                              >
                                <Key size={14} />
                                {SETTINGS_LABELS.buttons.updateToken}
                              </button>
                            </div>
                            <button
                              style={styles.disconnectButton}
                              onClick={() => setShowDisconnectConfirm(true)}
                            >
                              {SETTINGS_LABELS.buttons.removeConnection}
                            </button>
                          </>
                        ) : (
                          <button
                            style={{
                              ...styles.connectButton,
                              opacity: isConnecting || !canvasUrl ? 0.6 : 1,
                            }}
                            onClick={handleReconnect}
                            disabled={isConnecting || !canvasUrl}
                          >
                            {isConnecting ? (
                              <>
                                <Loader2
                                  size={16}
                                  style={{ animation: 'spin 1s linear infinite' }}
                                />
                                {SETTINGS_LABELS.buttons.connecting}
                              </>
                            ) : (
                              <>
                                <Link size={16} />
                                {SETTINGS_LABELS.buttons.connectToCanvas}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {!isSearching && <div style={styles.divider} />}

                    {/* Sync Settings */}
                    {shouldShowSetting('syncPrefs.autoSyncInterval') && (
                      <SettingRow
                        settingKey="syncPrefs.autoSyncInterval"
                        label="Auto-sync interval"
                        description="How often to automatically sync data from Canvas"
                        isModified={
                          syncPrefs.autoSyncInterval !==
                          DEFAULT_SYNC_PREFERENCES.autoSyncInterval
                        }
                        onReset={() =>
                          updateSyncPrefs({
                            autoSyncInterval: DEFAULT_SYNC_PREFERENCES.autoSyncInterval,
                            autoSyncEnabled: DEFAULT_SYNC_PREFERENCES.autoSyncEnabled,
                          })
                        }
                      >
                        <SettingSelect
                          value={String(syncPrefs.autoSyncInterval)}
                          onChange={(v) => {
                            const interval = Number(v);
                            updateSyncPrefs({
                              autoSyncInterval: interval,
                              autoSyncEnabled: interval > 0,
                            });
                          }}
                          options={[
                            {
                              value: '0',
                              label: SETTINGS_LABELS.options.syncInterval.never,
                            },
                            {
                              value: '15',
                              label: SETTINGS_LABELS.options.syncInterval.minutes15,
                            },
                            {
                              value: '30',
                              label: SETTINGS_LABELS.options.syncInterval.minutes30,
                            },
                            {
                              value: '60',
                              label: SETTINGS_LABELS.options.syncInterval.hour1,
                            },
                            {
                              value: '120',
                              label: SETTINGS_LABELS.options.syncInterval.hours2,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('syncPrefs.syncFiles') && (
                      <SettingRow
                        settingKey="syncPrefs.syncFiles"
                        label="Sync files"
                        description="Include course files and folders in sync"
                        isModified={
                          syncPrefs.syncFiles !== DEFAULT_SYNC_PREFERENCES.syncFiles
                        }
                        onReset={() =>
                          updateSyncPrefs({
                            syncFiles: DEFAULT_SYNC_PREFERENCES.syncFiles,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={syncPrefs.syncFiles}
                          onChange={(checked) => updateSyncPrefs({ syncFiles: checked })}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('syncPrefs.syncAnnouncements') && (
                      <SettingRow
                        settingKey="syncPrefs.syncAnnouncements"
                        label="Sync announcements"
                        description="Include course announcements in sync"
                        isModified={
                          syncPrefs.syncAnnouncements !==
                          DEFAULT_SYNC_PREFERENCES.syncAnnouncements
                        }
                        onReset={() =>
                          updateSyncPrefs({
                            syncAnnouncements: DEFAULT_SYNC_PREFERENCES.syncAnnouncements,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={syncPrefs.syncAnnouncements}
                          onChange={(checked) =>
                            updateSyncPrefs({ syncAnnouncements: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {!isSearching && <div style={styles.divider} />}

                    {/* Window Behavior */}
                    {shouldShowSetting('windowBehavior.closeAction') && (
                      <SettingRow
                        settingKey="windowBehavior.closeAction"
                        label="Close button behavior"
                        description="What happens when you click the close button"
                        isModified={windowBehavior.closeAction !== null}
                        onReset={() => updateWindowBehavior({ closeAction: null })}
                      >
                        <SettingSelect
                          value={windowBehavior.closeAction ?? ''}
                          onChange={(v) =>
                            updateWindowBehavior({
                              closeAction:
                                v === '' ? null : (v as 'quit' | 'minimize-to-tray'),
                            })
                          }
                          options={[
                            { value: '', label: SETTINGS_LABELS.options.closeAction.ask },
                            {
                              value: 'minimize-to-tray',
                              label: SETTINGS_LABELS.options.closeAction.minimize,
                            },
                            {
                              value: 'quit',
                              label: SETTINGS_LABELS.options.closeAction.quit,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </div>
          )}

          {/* Display & Layout */}
          {shouldShowSection('display') && (
            <div
              ref={sectionRefs.display}
              draggable
              onDragStart={(e) => handleDragStart(e, 'display')}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, 'display')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'display')}
              style={{
                ...getDragWrapperStyle('display'),
                order: sectionOrder.indexOf('display'),
              }}
            >
              <Accordion.Item value="display">
                <Accordion.Trigger
                  icon={CATEGORY_ICONS.display}
                  badge={<ModifiedBadge count={displayModifiedCount} />}
                >
                  {SETTINGS_CATEGORIES.display.label}
                </Accordion.Trigger>
                <Accordion.Content>
                  <div style={styles.section}>
                    {!isSearching && (
                      <p style={styles.sectionDesc}>
                        {SETTINGS_CATEGORIES.display.description}
                      </p>
                    )}

                    {/* Theme */}
                    {shouldShowSetting('appearance.theme') && (
                      <SettingRow
                        settingKey="appearance.theme"
                        label="Theme"
                        description="Application color theme"
                        isModified={
                          appearance.theme !== DEFAULT_APPEARANCE_SETTINGS.theme
                        }
                        onReset={() =>
                          updateAppearance({ theme: DEFAULT_APPEARANCE_SETTINGS.theme })
                        }
                      >
                        <SettingButtonGroup
                          value={appearance.theme}
                          onChange={(v) =>
                            updateAppearance({ theme: v as AppearanceSettings['theme'] })
                          }
                          options={[
                            {
                              value: 'light',
                              label: SETTINGS_LABELS.options.theme.light,
                              icon: <Sun size={14} />,
                            },
                            {
                              value: 'dark',
                              label: SETTINGS_LABELS.options.theme.dark,
                              icon: <Moon size={14} />,
                            },
                            {
                              value: 'system',
                              label: SETTINGS_LABELS.options.theme.system,
                              icon: <Monitor size={14} />,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {/* Landing Page */}
                    {shouldShowSetting('landingPage') && (
                      <SettingRow
                        settingKey="landingPage"
                        label="Landing page"
                        description="The page shown when the app launches"
                        isModified={landingPage !== '/'}
                        onReset={() => updateLandingPage('/')}
                      >
                        <SettingButtonGroup
                          value={landingPage}
                          onChange={updateLandingPage}
                          options={LANDING_PAGE_OPTIONS.map((opt) => ({
                            value: opt.value,
                            label: opt.label,
                            icon: opt.icon,
                          }))}
                        />
                      </SettingRow>
                    )}

                    {/* Sidebar */}
                    {shouldShowSetting('appearance.sidebarCollapsed') && (
                      <SettingRow
                        settingKey="appearance.sidebarCollapsed"
                        label="Collapsed sidebar"
                        description="Start with sidebar collapsed on launch"
                        isModified={
                          appearance.sidebarCollapsed !==
                          DEFAULT_APPEARANCE_SETTINGS.sidebarCollapsed
                        }
                        onReset={() =>
                          updateAppearance({
                            sidebarCollapsed:
                              DEFAULT_APPEARANCE_SETTINGS.sidebarCollapsed,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={appearance.sidebarCollapsed}
                          onChange={(checked) =>
                            updateAppearance({ sidebarCollapsed: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {!isSearching && <div style={styles.divider} />}

                    {/* Dashboard Settings */}
                    {shouldShowSetting('dashboard.prioritySortingEnabled') && (
                      <SettingRow
                        settingKey="dashboard.prioritySortingEnabled"
                        label="Priority sorting"
                        description="Sort tasks by urgency and priority score instead of due date only"
                        isModified={
                          dashboardSettings.prioritySortingEnabled !==
                          DEFAULT_DASHBOARD_SETTINGS.prioritySortingEnabled
                        }
                        onReset={() =>
                          updateDashboardSettings({
                            prioritySortingEnabled:
                              DEFAULT_DASHBOARD_SETTINGS.prioritySortingEnabled,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={dashboardSettings.prioritySortingEnabled}
                          onChange={(checked) =>
                            updateDashboardSettings({ prioritySortingEnabled: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('dashboard.importantWorksThreshold') && (
                      <SettingRow
                        settingKey="dashboard.importantWorksThreshold"
                        label="Important works threshold"
                        description="Show tasks with grade weight above this percentage"
                        isModified={
                          dashboardSettings.importantWorksThreshold !==
                          DEFAULT_DASHBOARD_SETTINGS.importantWorksThreshold
                        }
                        onReset={() =>
                          updateDashboardSettings({
                            importantWorksThreshold:
                              DEFAULT_DASHBOARD_SETTINGS.importantWorksThreshold,
                          })
                        }
                      >
                        <SettingSlider
                          value={dashboardSettings.importantWorksThreshold}
                          onChange={(v) =>
                            updateDashboardSettings({ importantWorksThreshold: v })
                          }
                          min={0}
                          max={50}
                          step={5}
                          formatValue={(v) => `${v}%`}
                        />
                      </SettingRow>
                    )}

                    {!isSearching && <div style={styles.divider} />}

                    {/* View Modes */}
                    {shouldShowSetting('courses.defaultViewMode') && (
                      <SettingRow
                        settingKey="courses.defaultViewMode"
                        label="Courses view"
                        description="Default view mode for the courses page"
                        isModified={
                          courseSettings.defaultViewMode !==
                          DEFAULT_COURSE_SETTINGS.defaultViewMode
                        }
                        onReset={() =>
                          updateCourseSettings({
                            defaultViewMode: DEFAULT_COURSE_SETTINGS.defaultViewMode,
                          })
                        }
                      >
                        <SettingButtonGroup
                          value={courseSettings.defaultViewMode}
                          onChange={(v) =>
                            updateCourseSettings({
                              defaultViewMode: v as 'grid' | 'list',
                            })
                          }
                          options={[
                            {
                              value: 'grid',
                              label: SETTINGS_LABELS.options.viewMode.grid,
                            },
                            {
                              value: 'list',
                              label: SETTINGS_LABELS.options.viewMode.list,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('calendar.defaultViewMode') && (
                      <SettingRow
                        settingKey="calendar.defaultViewMode"
                        label="Calendar view"
                        description="Default view when opening the calendar"
                        isModified={
                          calendarSettings.defaultViewMode !==
                          DEFAULT_CALENDAR_SETTINGS.defaultViewMode
                        }
                        onReset={() =>
                          updateCalendarSettings({
                            defaultViewMode: DEFAULT_CALENDAR_SETTINGS.defaultViewMode,
                          })
                        }
                      >
                        <SettingButtonGroup
                          value={calendarSettings.defaultViewMode}
                          onChange={(v) =>
                            updateCalendarSettings({
                              defaultViewMode: v as 'month' | 'week',
                            })
                          }
                          options={[
                            {
                              value: 'month',
                              label: SETTINGS_LABELS.options.viewMode.month,
                            },
                            {
                              value: 'week',
                              label: SETTINGS_LABELS.options.viewMode.week,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('fileExplorer.defaultViewMode') && (
                      <SettingRow
                        settingKey="fileExplorer.defaultViewMode"
                        label="Files view"
                        description="Default view mode for the files page"
                        isModified={
                          fileExplorer.defaultViewMode !==
                          DEFAULT_FILE_EXPLORER_SETTINGS.defaultViewMode
                        }
                        onReset={() =>
                          updateFileExplorer({
                            defaultViewMode:
                              DEFAULT_FILE_EXPLORER_SETTINGS.defaultViewMode,
                          })
                        }
                      >
                        <SettingButtonGroup
                          value={fileExplorer.defaultViewMode}
                          onChange={(v) =>
                            updateFileExplorer({ defaultViewMode: v as 'list' | 'grid' })
                          }
                          options={[
                            {
                              value: 'list',
                              label: SETTINGS_LABELS.options.viewMode.list,
                            },
                            {
                              value: 'grid',
                              label: SETTINGS_LABELS.options.viewMode.grid,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('fileExplorer.defaultState') && (
                      <SettingRow
                        settingKey="fileExplorer.defaultState"
                        label="Folder default state"
                        description="How folders appear when opening the Files page"
                        isModified={
                          fileExplorer.defaultState !==
                          DEFAULT_FILE_EXPLORER_SETTINGS.defaultState
                        }
                        onReset={() =>
                          updateFileExplorer({
                            defaultState: DEFAULT_FILE_EXPLORER_SETTINGS.defaultState,
                          })
                        }
                      >
                        <SettingSelect
                          value={fileExplorer.defaultState}
                          onChange={(v) =>
                            updateFileExplorer({
                              defaultState: v as FileExplorerSettings['defaultState'],
                            })
                          }
                          options={[
                            {
                              value: 'collapsed',
                              label: SETTINGS_LABELS.options.folderState.collapsed,
                            },
                            {
                              value: 'expanded',
                              label: SETTINGS_LABELS.options.folderState.expanded,
                            },
                            {
                              value: 'remember',
                              label: SETTINGS_LABELS.options.folderState.remember,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('settingsPage.defaultState') && (
                      <SettingRow
                        settingKey="settingsPage.defaultState"
                        label="Settings default state"
                        description="How settings sections appear when opening this page"
                        isModified={isSettingsPageSettingsModified}
                        onReset={() =>
                          updateSettingsPageSettings({
                            defaultState: DEFAULT_SETTINGS_PAGE_SETTINGS.defaultState,
                          })
                        }
                      >
                        <SettingSelect
                          value={settingsPageSettings.defaultState}
                          onChange={(v) =>
                            updateSettingsPageSettings({
                              defaultState: v as SettingsPageSettings['defaultState'],
                            })
                          }
                          options={[
                            {
                              value: 'collapsed',
                              label: SETTINGS_LABELS.options.folderState.collapsed,
                            },
                            {
                              value: 'expanded',
                              label: SETTINGS_LABELS.options.folderState.expanded,
                            },
                            {
                              value: 'remember',
                              label: SETTINGS_LABELS.options.folderState.remember,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {shouldShowSetting('settingsDockAutoHide') && (
                      <SettingRow
                        settingKey="settingsDockAutoHide"
                        label="Dock auto-hide"
                        description="Hide the section navigation dock until mouse is near bottom"
                        isModified={!dockAutoHide}
                        onReset={() => updateDockAutoHide(true)}
                      >
                        <ToggleSwitch
                          checked={dockAutoHide}
                          onChange={(checked) => updateDockAutoHide(checked)}
                        />
                      </SettingRow>
                    )}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </div>
          )}

          {/* Academic & Courses */}
          {shouldShowSection('academic') && (
            <div
              ref={sectionRefs.academic}
              draggable
              onDragStart={(e) => handleDragStart(e, 'academic')}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, 'academic')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'academic')}
              style={{
                ...getDragWrapperStyle('academic'),
                order: sectionOrder.indexOf('academic'),
              }}
            >
              <Accordion.Item value="academic">
                <Accordion.Trigger
                  icon={CATEGORY_ICONS.academic}
                  badge={<ModifiedBadge count={academicModifiedCount} />}
                >
                  {SETTINGS_CATEGORIES.academic.label}
                </Accordion.Trigger>
                <Accordion.Content>
                  <div style={styles.section}>
                    {!isSearching && (
                      <p style={styles.sectionDesc}>
                        {SETTINGS_CATEGORIES.academic.description}
                      </p>
                    )}

                    {/* Target Grade */}
                    {shouldShowSetting('academic.defaultTargetGrade') && (
                      <SettingRow
                        settingKey="academic.defaultTargetGrade"
                        label="Default target grade"
                        description="Applied to new courses. Individual targets can be overridden."
                        isModified={
                          academic.defaultTargetGrade !==
                          DEFAULT_ACADEMIC_SETTINGS.defaultTargetGrade
                        }
                        onReset={() =>
                          updateAcademic({
                            defaultTargetGrade:
                              DEFAULT_ACADEMIC_SETTINGS.defaultTargetGrade,
                          })
                        }
                      >
                        <SettingSlider
                          value={academic.defaultTargetGrade}
                          onChange={(v) => updateAcademic({ defaultTargetGrade: v })}
                          min={50}
                          max={100}
                          step={1}
                          formatValue={(v) => `${v}%`}
                        />
                      </SettingRow>
                    )}

                    {/* Term Selection */}
                    {shouldShowSetting('academic.termSelection') && (
                      <SettingRow
                        settingKey="academic.termSelection"
                        label="Semester selection"
                        description="Which semester's courses to display"
                        isModified={
                          academic.termSelection !==
                          DEFAULT_ACADEMIC_SETTINGS.termSelection
                        }
                        onReset={() =>
                          updateAcademic({
                            termSelection: DEFAULT_ACADEMIC_SETTINGS.termSelection,
                          })
                        }
                      >
                        <select
                          value={academic.termSelection}
                          onChange={(e) =>
                            updateAcademic({ termSelection: e.target.value })
                          }
                          style={styles.select}
                        >
                          <option value="auto">
                            {SETTINGS_LABELS.options.termSelection.autoDetect}
                          </option>
                          <option value="all">
                            {SETTINGS_LABELS.options.termSelection.showAll}
                          </option>
                          {enrollmentTerms.length > 0 && (
                            <optgroup
                              label={SETTINGS_LABELS.options.termSelection.availableLabel}
                            >
                              {enrollmentTerms.map((term) => (
                                <option key={term.externalId} value={term.externalId}>
                                  {term.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </SettingRow>
                    )}

                    {!isSearching && <div style={styles.divider} />}

                    {/* Course Visibility */}
                    {shouldShowSetting('courses.showHiddenByDefault') && (
                      <SettingRow
                        settingKey="courses.showHiddenByDefault"
                        label="Show hidden courses"
                        description="Display hidden courses in the courses list by default"
                        isModified={
                          courseSettings.showHiddenByDefault !==
                          DEFAULT_COURSE_SETTINGS.showHiddenByDefault
                        }
                        onReset={() =>
                          updateCourseSettings({
                            showHiddenByDefault:
                              DEFAULT_COURSE_SETTINGS.showHiddenByDefault,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={courseSettings.showHiddenByDefault}
                          onChange={(checked) =>
                            updateCourseSettings({ showHiddenByDefault: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {/* Auto-fill due dates */}
                    {shouldShowSetting('syncPrefs.autoAssignDueDate') && (
                      <SettingRow
                        settingKey="syncPrefs.autoAssignDueDate"
                        label="Auto-fill due dates"
                        description="Set today 23:59 as due date for coursework without one"
                        isModified={
                          syncPrefs.autoAssignDueDate !==
                          DEFAULT_SYNC_PREFERENCES.autoAssignDueDate
                        }
                        onReset={() =>
                          updateSyncPrefs({
                            autoAssignDueDate: DEFAULT_SYNC_PREFERENCES.autoAssignDueDate,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={syncPrefs.autoAssignDueDate}
                          onChange={(checked) =>
                            updateSyncPrefs({ autoAssignDueDate: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {!isSearching && <div style={styles.divider} />}

                    {/* Download Location */}
                    {shouldShowSetting('fileExplorer.downloadLocation') && (
                      <SettingRow
                        settingKey="fileExplorer.downloadLocation"
                        label="Download location"
                        description="Where downloaded files are stored on your computer"
                        vertical
                      >
                        <div style={styles.downloadLocationRow}>
                          <div style={styles.downloadLocationPath}>
                            {currentDownloadPath || 'Loading...'}
                          </div>
                          <button
                            style={styles.changeLocationBtn}
                            onClick={handleChangeDownloadLocation}
                          >
                            <FolderOpen size={14} /> {MENU_LABELS.common.change}
                          </button>
                        </div>
                      </SettingRow>
                    )}

                    {/* Link Behavior */}
                    {shouldShowSetting('content.linkBehavior') && (
                      <SettingRow
                        settingKey="content.linkBehavior"
                        label="Link click behavior"
                        description="How to handle clicks on links in course content"
                        isModified={
                          contentSettings.linkBehavior !==
                          DEFAULT_CONTENT_SETTINGS.linkBehavior
                        }
                        onReset={() =>
                          updateContentSettings({
                            linkBehavior: DEFAULT_CONTENT_SETTINGS.linkBehavior,
                          })
                        }
                      >
                        <SettingSelect
                          value={contentSettings.linkBehavior}
                          onChange={(v) =>
                            updateContentSettings({
                              linkBehavior: v as ContentSettings['linkBehavior'],
                            })
                          }
                          options={[
                            {
                              value: 'always-external',
                              label: SETTINGS_LABELS.options.linkBehavior.browser,
                            },
                            {
                              value: 'prefer-local',
                              label: SETTINGS_LABELS.options.linkBehavior.local,
                            },
                          ]}
                        />
                      </SettingRow>
                    )}

                    {/* Offline HTML Files */}
                    {shouldShowSetting('localHtmlPathsSettings.enabled') && (
                      <SettingRow
                        settingKey="localHtmlPathsSettings.enabled"
                        label="Offline HTML files"
                        description="Prompt to download missing images and linked files when opening HTML content"
                        isModified={
                          localHtmlPathsSettings.enabled !==
                          DEFAULT_LOCAL_HTML_PATHS_SETTINGS.enabled
                        }
                        onReset={() =>
                          updateLocalHtmlPathsSettings({
                            enabled: DEFAULT_LOCAL_HTML_PATHS_SETTINGS.enabled,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={localHtmlPathsSettings.enabled}
                          onChange={(checked) =>
                            updateLocalHtmlPathsSettings({ enabled: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {!isSearching && <div style={styles.divider} />}

                    {/* Course Visibility List */}
                    {!isSearching && (
                      <>
                        <div style={styles.subsectionTitle}>
                          {SETTINGS_LABELS.sections.courseVisibility}
                        </div>
                        <p style={styles.fieldDesc}>
                          Hidden courses won't appear in Dashboard, Tasks, or
                          Announcements.
                        </p>
                        <div style={styles.courseList}>
                          {courses.length === 0 ? (
                            <p style={styles.emptyText}>
                              {SETTINGS_LABELS.empty.noCourses}
                            </p>
                          ) : (
                            courses.map((course: Course) => (
                              <div key={course.id} style={styles.courseRow}>
                                <div style={styles.courseInfo}>
                                  <span
                                    style={{
                                      ...styles.courseDot,
                                      backgroundColor:
                                        course.color || 'var(--color-navy)',
                                    }}
                                  />
                                  <div style={styles.courseText}>
                                    <span style={styles.courseCode}>{course.code}</span>
                                    <span style={styles.courseName}>{course.name}</span>
                                  </div>
                                </div>
                                <button
                                  style={{
                                    ...styles.visibilityBtn,
                                    color: course.isHidden
                                      ? 'var(--text-muted)'
                                      : 'var(--color-success)',
                                  }}
                                  onClick={() =>
                                    handleToggleCourseVisibility(
                                      course.id,
                                      course.isHidden
                                    )
                                  }
                                  title={course.isHidden ? 'Show course' : 'Hide course'}
                                >
                                  {course.isHidden ? (
                                    <EyeOff size={18} />
                                  ) : (
                                    <Eye size={18} />
                                  )}
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </div>
          )}

          {/* Notifications */}
          {shouldShowSection('notifications') && (
            <div
              ref={sectionRefs.notifications}
              draggable
              onDragStart={(e) => handleDragStart(e, 'notifications')}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, 'notifications')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'notifications')}
              style={{
                ...getDragWrapperStyle('notifications'),
                order: sectionOrder.indexOf('notifications'),
              }}
            >
              <Accordion.Item value="notifications">
                <Accordion.Trigger
                  icon={CATEGORY_ICONS.notifications}
                  badge={<ModifiedBadge count={notificationsModifiedCount} />}
                >
                  {SETTINGS_CATEGORIES.notifications.label}
                </Accordion.Trigger>
                <Accordion.Content>
                  <div style={styles.section}>
                    {!isSearching && (
                      <p style={styles.sectionDesc}>
                        {SETTINGS_CATEGORIES.notifications.description}
                      </p>
                    )}

                    {shouldShowSetting('notifications.enabled') && (
                      <SettingRow
                        settingKey="notifications.enabled"
                        label="Enable notifications"
                        description="Show desktop notifications"
                        isModified={
                          notifications.enabled !== DEFAULT_NOTIFICATION_SETTINGS.enabled
                        }
                        onReset={() =>
                          updateNotifications({
                            enabled: DEFAULT_NOTIFICATION_SETTINGS.enabled,
                          })
                        }
                      >
                        <ToggleSwitch
                          checked={notifications.enabled}
                          onChange={(checked) =>
                            updateNotifications({ enabled: checked })
                          }
                        />
                      </SettingRow>
                    )}

                    {notifications.enabled && (
                      <>
                        {!isSearching && <div style={styles.divider} />}
                        {!isSearching && (
                          <div style={styles.subsectionTitle}>
                            {SETTINGS_LABELS.sections.alertTypes}
                          </div>
                        )}

                        {shouldShowSetting('notifications.priorityAlerts') && (
                          <SettingRow
                            settingKey="notifications.priorityAlerts"
                            label="Priority alerts"
                            description="Intelligence flags high-priority or at-risk tasks"
                            isModified={
                              notifications.priorityAlerts !==
                              DEFAULT_NOTIFICATION_SETTINGS.priorityAlerts
                            }
                            onReset={() =>
                              updateNotifications({
                                priorityAlerts:
                                  DEFAULT_NOTIFICATION_SETTINGS.priorityAlerts,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.priorityAlerts}
                              onChange={(checked) =>
                                updateNotifications({ priorityAlerts: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {shouldShowSetting('notifications.syncStatus') && (
                          <SettingRow
                            settingKey="notifications.syncStatus"
                            label="Sync status"
                            description="Notify on sync success or failure"
                            isModified={
                              notifications.syncStatus !==
                              DEFAULT_NOTIFICATION_SETTINGS.syncStatus
                            }
                            onReset={() =>
                              updateNotifications({
                                syncStatus: DEFAULT_NOTIFICATION_SETTINGS.syncStatus,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.syncStatus}
                              onChange={(checked) =>
                                updateNotifications({ syncStatus: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {shouldShowSetting('notifications.dueDateReminders') && (
                          <SettingRow
                            settingKey="notifications.dueDateReminders"
                            label="Due date reminders"
                            description="Smart reminders before assignments are due"
                            isModified={
                              notifications.dueDateReminders !==
                              DEFAULT_NOTIFICATION_SETTINGS.dueDateReminders
                            }
                            onReset={() =>
                              updateNotifications({
                                dueDateReminders:
                                  DEFAULT_NOTIFICATION_SETTINGS.dueDateReminders,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.dueDateReminders}
                              onChange={(checked) =>
                                updateNotifications({ dueDateReminders: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {shouldShowSetting('notifications.gradeAlerts') && (
                          <SettingRow
                            settingKey="notifications.gradeAlerts"
                            label="Grade alerts"
                            description="Notify when new grades are posted"
                            isModified={
                              notifications.gradeAlerts !==
                              DEFAULT_NOTIFICATION_SETTINGS.gradeAlerts
                            }
                            onReset={() =>
                              updateNotifications({
                                gradeAlerts: DEFAULT_NOTIFICATION_SETTINGS.gradeAlerts,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.gradeAlerts}
                              onChange={(checked) =>
                                updateNotifications({ gradeAlerts: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {!isSearching && <div style={styles.divider} />}
                        {!isSearching && (
                          <div style={styles.subsectionTitle}>
                            {SETTINGS_LABELS.sections.intelligenceAlerts}
                          </div>
                        )}

                        {shouldShowSetting('notifications.workloadPredictions') && (
                          <SettingRow
                            settingKey="notifications.workloadPredictions"
                            label="Workload predictions"
                            description="AI predicts busy periods and suggests planning"
                            isModified={
                              notifications.workloadPredictions !==
                              DEFAULT_NOTIFICATION_SETTINGS.workloadPredictions
                            }
                            onReset={() =>
                              updateNotifications({
                                workloadPredictions:
                                  DEFAULT_NOTIFICATION_SETTINGS.workloadPredictions,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.workloadPredictions}
                              onChange={(checked) =>
                                updateNotifications({ workloadPredictions: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {shouldShowSetting('notifications.riskWarnings') && (
                          <SettingRow
                            settingKey="notifications.riskWarnings"
                            label="Risk warnings"
                            description="Alert when predicted time exceeds remaining time"
                            isModified={
                              notifications.riskWarnings !==
                              DEFAULT_NOTIFICATION_SETTINGS.riskWarnings
                            }
                            onReset={() =>
                              updateNotifications({
                                riskWarnings: DEFAULT_NOTIFICATION_SETTINGS.riskWarnings,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.riskWarnings}
                              onChange={(checked) =>
                                updateNotifications({ riskWarnings: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {!isSearching && <div style={styles.divider} />}
                        {!isSearching && (
                          <>
                            <div style={styles.subsectionTitle}>
                              {SETTINGS_LABELS.sections.smartQuietMode}
                            </div>
                            <p style={styles.quietModeDesc}>
                              {SETTINGS_LABELS.quietMode.description}
                            </p>
                          </>
                        )}

                        {shouldShowSetting('notifications.quietWhenFullscreen') && (
                          <SettingRow
                            settingKey="notifications.quietWhenFullscreen"
                            label="Fullscreen mode"
                            description="Pause during presentations or focus sessions"
                            isModified={
                              notifications.quietWhenFullscreen !==
                              DEFAULT_NOTIFICATION_SETTINGS.quietWhenFullscreen
                            }
                            onReset={() =>
                              updateNotifications({
                                quietWhenFullscreen:
                                  DEFAULT_NOTIFICATION_SETTINGS.quietWhenFullscreen,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.quietWhenFullscreen}
                              onChange={(checked) =>
                                updateNotifications({ quietWhenFullscreen: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {shouldShowSetting('notifications.quietWhenUnplugged') && (
                          <SettingRow
                            settingKey="notifications.quietWhenUnplugged"
                            label="On battery power"
                            description="Pause when device is unplugged"
                            isModified={
                              notifications.quietWhenUnplugged !==
                              DEFAULT_NOTIFICATION_SETTINGS.quietWhenUnplugged
                            }
                            onReset={() =>
                              updateNotifications({
                                quietWhenUnplugged:
                                  DEFAULT_NOTIFICATION_SETTINGS.quietWhenUnplugged,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.quietWhenUnplugged}
                              onChange={(checked) =>
                                updateNotifications({ quietWhenUnplugged: checked })
                              }
                            />
                          </SettingRow>
                        )}

                        {shouldShowSetting('notifications.quietWhenBusy') && (
                          <SettingRow
                            settingKey="notifications.quietWhenBusy"
                            label="Busy or Exam status"
                            description="Pause when inferred status is Busy or Exam"
                            isModified={
                              notifications.quietWhenBusy !==
                              DEFAULT_NOTIFICATION_SETTINGS.quietWhenBusy
                            }
                            onReset={() =>
                              updateNotifications({
                                quietWhenBusy:
                                  DEFAULT_NOTIFICATION_SETTINGS.quietWhenBusy,
                              })
                            }
                          >
                            <ToggleSwitch
                              checked={notifications.quietWhenBusy}
                              onChange={(checked) =>
                                updateNotifications({ quietWhenBusy: checked })
                              }
                            />
                          </SettingRow>
                        )}
                      </>
                    )}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            </div>
          )}

          {/* Data Management Section */}
          <div
            ref={sectionRefs.data}
            draggable
            onDragStart={(e) => handleDragStart(e, 'data')}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, 'data')}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'data')}
            style={{
              ...getDragWrapperStyle('data'),
              order: sectionOrder.indexOf('data'),
            }}
          >
            <Accordion.Item value="data">
              <Accordion.Trigger icon={<HardDrive size={18} />}>
                Data Management
              </Accordion.Trigger>
              <Accordion.Content>
                <div style={styles.sectionContent}>
                  {/* Export Section */}
                  <div style={styles.subsectionTitle}>
                    {SETTINGS_LABELS.sections.export}
                  </div>
                  <div style={styles.exportButtonRow}>
                    <button
                      style={styles.exportActionButton}
                      onClick={handleExportDatabase}
                      disabled={isExporting}
                    >
                      <Database size={16} />
                      {SETTINGS_LABELS.buttons.quickBackup}
                    </button>

                    <div style={{ position: 'relative' }}>
                      <button
                        style={styles.exportActionButton}
                        onClick={() => setShowCsvDropdown(!showCsvDropdown)}
                      >
                        <FileSpreadsheet size={16} />
                        {SETTINGS_LABELS.buttons.exportCsv}
                        <ChevronDown size={14} />
                      </button>
                      {showCsvDropdown && (
                        <div style={styles.dropdownMenu}>
                          <button
                            style={styles.dropdownItem}
                            onClick={async () => {
                              setShowCsvDropdown(false);
                              try {
                                const result = await window.api.exportTasksCsv({});
                                if (result.success) {
                                  setExportMessage({
                                    type: 'success',
                                    text: 'Tasks exported successfully',
                                  });
                                } else {
                                  setExportMessage({
                                    type: 'error',
                                    text: result.error || 'Export failed',
                                  });
                                }
                              } catch (error) {
                                setExportMessage({
                                  type: 'error',
                                  text: String(error),
                                });
                              }
                            }}
                          >
                            {SETTINGS_LABELS.data.exportTasks}
                          </button>
                          <button
                            style={styles.dropdownItem}
                            onClick={async () => {
                              setShowCsvDropdown(false);
                              try {
                                const result = await window.api.exportGradesCsv({});
                                if (result.success) {
                                  setExportMessage({
                                    type: 'success',
                                    text: 'Grades exported successfully',
                                  });
                                } else {
                                  setExportMessage({
                                    type: 'error',
                                    text: result.error || 'Export failed',
                                  });
                                }
                              } catch (error) {
                                setExportMessage({
                                  type: 'error',
                                  text: String(error),
                                });
                              }
                            }}
                          >
                            {SETTINGS_LABELS.data.exportGrades}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      style={styles.exportActionButton}
                      onClick={() => setShowExportDialog(true)}
                    >
                      <Settings2 size={16} />
                      {SETTINGS_LABELS.buttons.customExport}
                    </button>
                  </div>

                  {!isSearching && <div style={styles.divider} />}

                  {/* Import Section */}
                  <div style={styles.subsectionTitle}>
                    {SETTINGS_LABELS.sections.import}
                  </div>
                  <div style={styles.exportButtonRow}>
                    <button
                      style={styles.exportActionButton}
                      onClick={handleImportDatabase}
                    >
                      <Download size={16} />
                      {SETTINGS_LABELS.buttons.importBackup}
                    </button>
                    <button
                      style={styles.exportActionButton}
                      onClick={handleImportSettings}
                    >
                      <Download size={16} />
                      {SETTINGS_LABELS.buttons.importSettings}
                    </button>
                  </div>

                  {!isSearching && <div style={styles.divider} />}

                  {/* Danger Zone */}
                  <div style={{ ...styles.subsectionTitle, color: 'var(--color-error)' }}>
                    {SETTINGS_LABELS.sections.dangerZone}
                  </div>
                  <div style={styles.dangerZoneBox}>
                    <div style={styles.dangerZoneContent}>
                      <div>
                        <strong>{SETTINGS_LABELS.data.resetAllData}</strong>
                        <p style={styles.dangerZoneDesc}>
                          {SETTINGS_LABELS.data.resetAllDescription}
                        </p>
                      </div>
                      <button
                        style={styles.dangerZoneButton}
                        onClick={() => setShowClearDataConfirm(true)}
                      >
                        <Trash2 size={14} />
                        {MENU_LABELS.common.reset}
                      </button>
                    </div>
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </div>
        </Accordion>

        {/* No search results message */}
        {hasSearchResults && filteredSettings?.length === 0 && (
          <div style={styles.noResults}>
            <p>{SETTINGS_LABELS.search.noResultsFor(searchQuery)}</p>
            <button style={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
              {MENU_LABELS.common.clearSearch}
            </button>
          </div>
        )}

        {/* Settings Dock Navigation - inside content area */}
        <SettingsDock
          openSections={openSections}
          onSectionChange={setOpenSections}
          sectionRefs={sectionRefs}
          onClearSearch={() => setSearchQuery('')}
          autoHide={dockAutoHide}
          sectionOrder={sectionOrder}
        />
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerLeft}>
          <button style={styles.footerButton} onClick={handleExportSettings}>
            <Upload size={14} /> {SETTINGS_LABELS.buttons.exportSettings}
          </button>
          <button style={styles.footerButton} onClick={handleImportSettings}>
            <Download size={14} /> {SETTINGS_LABELS.buttons.importSettings}
          </button>
        </div>
        <div style={styles.footerRight}>
          <button
            style={styles.footerButton}
            onClick={handleExportDatabase}
            disabled={isExporting}
          >
            <Database size={14} /> {SETTINGS_LABELS.buttons.backupData}
          </button>
          <button
            style={{ ...styles.footerButton, ...styles.dangerButtonSmall }}
            onClick={() => setShowClearDataConfirm(true)}
          >
            <RotateCcw size={14} /> {SETTINGS_LABELS.buttons.resetAll}
          </button>
        </div>
      </div>

      {exportMessage && (
        <div
          style={{
            ...styles.exportMessage,
            backgroundColor:
              exportMessage.type === 'success'
                ? 'var(--color-success-bg)'
                : 'var(--color-error-bg)',
            color:
              exportMessage.type === 'success'
                ? 'var(--color-success)'
                : 'var(--color-error)',
          }}
        >
          {exportMessage.text}
        </div>
      )}

      {/* Token Replacement Modal */}
      {showTokenReplaceModal && (
        <div
          style={styles.tokenModalOverlay}
          onClick={() => setShowTokenReplaceModal(false)}
        >
          <div style={styles.tokenModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.tokenModalHeader}>
              <h4 style={styles.tokenModalTitle}>{SETTINGS_LABELS.tokenModal.title}</h4>
              <button
                style={styles.tokenModalClose}
                onClick={() => setShowTokenReplaceModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p style={styles.tokenModalDesc}>{SETTINGS_LABELS.tokenModal.description}</p>
            <div style={styles.field}>
              <label style={styles.label}>
                {SETTINGS_LABELS.tokenModal.newTokenLabel}
              </label>
              <input
                type="password"
                value={newToken}
                onChange={(e) => {
                  setNewToken(e.target.value);
                  setNewTokenValidation({ valid: null, userName: null, error: null });
                }}
                placeholder={SETTINGS_LABELS.placeholders.newToken}
                style={styles.input}
                autoFocus
              />
            </div>
            {newTokenValidation.error && (
              <div style={styles.error}>
                <AlertCircle size={14} /> {newTokenValidation.error}
              </div>
            )}
            {newTokenValidation.valid && (
              <div style={styles.tokenSuccess}>
                <Check size={14} />
                {newTokenValidation.userName
                  ? SETTINGS_LABELS.tokenModal.tokenValidFor(newTokenValidation.userName)
                  : SETTINGS_LABELS.tokenModal.tokenValid}
              </div>
            )}
            <div style={styles.tokenModalButtons}>
              {!newTokenValidation.valid ? (
                <button
                  style={{
                    ...styles.primaryButton,
                    opacity: isValidatingNewToken || !newToken ? 0.6 : 1,
                  }}
                  onClick={handleValidateNewToken}
                  disabled={isValidatingNewToken || !newToken}
                >
                  {isValidatingNewToken ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: 'spin 1s linear infinite' }}
                      />{' '}
                      {SETTINGS_LABELS.buttons.validating}
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} /> {SETTINGS_LABELS.buttons.validateToken}
                    </>
                  )}
                </button>
              ) : (
                <button
                  style={{ ...styles.primaryButton, opacity: isReplacingToken ? 0.6 : 1 }}
                  onClick={handleReplaceToken}
                  disabled={isReplacingToken}
                >
                  {isReplacingToken ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: 'spin 1s linear infinite' }}
                      />{' '}
                      {SETTINGS_LABELS.buttons.replacing}
                    </>
                  ) : (
                    <>
                      <Key size={14} /> {SETTINGS_LABELS.buttons.replaceToken}
                    </>
                  )}
                </button>
              )}
              <button
                style={styles.cancelButton}
                onClick={() => setShowTokenReplaceModal(false)}
              >
                {MENU_LABELS.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation */}
      <ConfirmDialog
        isOpen={showClearDataConfirm}
        type="danger"
        title={SETTINGS_LABELS.data.resetAllData}
        message={
          deleteTokenOnClear
            ? SETTINGS_LABELS.data.resetConfirmWithToken
            : SETTINGS_LABELS.data.resetConfirmWithoutToken
        }
        confirmText={SETTINGS_LABELS.data.resetAllData}
        cancelText={MENU_LABELS.common.cancel}
        onCancel={() => {
          setShowClearDataConfirm(false);
          setDeleteTokenOnClear(false);
        }}
        onConfirm={async () => {
          setShowClearDataConfirm(false);
          try {
            await window.api.clearAllData({ deleteToken: deleteTokenOnClear });
            if (!deleteTokenOnClear) {
              const savedCanvasUrl = localStorage.getItem('canvasUrl');
              localStorage.clear();
              if (savedCanvasUrl) {
                localStorage.setItem('canvasUrl', savedCanvasUrl);
              }
              window.location.reload();
            }
            setDeleteTokenOnClear(false);
          } catch (error) {
            console.error('Failed to clear data:', error);
          }
        }}
      >
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={deleteTokenOnClear}
            onChange={(e) => setDeleteTokenOnClear(e.target.checked)}
            style={styles.checkbox}
          />
          {SETTINGS_LABELS.data.deleteTokenLabel}
        </label>
      </ConfirmDialog>

      {/* Disconnect Confirmation */}
      <ConfirmDialog
        isOpen={showDisconnectConfirm}
        type="danger"
        title={SETTINGS_LABELS.disconnect.title}
        message={SETTINGS_LABELS.disconnect.message}
        confirmText={SETTINGS_LABELS.disconnect.confirmText}
        cancelText={SETTINGS_LABELS.buttons.keepConnected}
        onCancel={() => setShowDisconnectConfirm(false)}
        onConfirm={async () => {
          setShowDisconnectConfirm(false);
          await handleDisconnect();
          // Return to onboarding screen
          setAuthenticated(false);
        }}
      />

      {/* Custom Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
    </>
  );

  if (isFullPage) {
    return <div style={styles.fullPage}>{content}</div>;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-xl)',
    width: 'min(640px, 90vw)',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },

  fullPage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  pageHeader: {
    marginBottom: 'var(--space-4)',
    flexShrink: 0,
  },

  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  title: {
    margin: 0,
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  pageTitle: {
    margin: 0,
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  closeButton: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-2)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchContainer: {
    padding: 'var(--space-3) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-4) var(--space-5)',
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  sectionDesc: {
    margin: 0,
    marginBottom: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: 'var(--space-3) 0',
  },

  subsectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  modifiedBadge: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    backgroundColor: 'var(--color-blue-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontWeight: 'var(--font-medium)',
  },

  // Form elements
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
  },

  select: {
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '160px',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  fieldDesc: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-2)',
  },

  quietModeDesc: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-2)',
  },

  // Connection Card
  connectionCard: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },

  connectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
  },

  connectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  connectionTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  statusBadgeConnected: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },

  statusBadgeDisconnected: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },

  urlSection: {
    marginBottom: 'var(--space-3)',
  },

  urlLabel: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-1)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  urlDisplay: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
  },

  urlText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  urlInput: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  },

  connectionError: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    marginBottom: 'var(--space-3)',
  },

  validationMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  connectionActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-subtle)',
  },

  tokenActions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  tokenButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  disconnectButton: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  connectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Connection status (legacy)
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },

  statusLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  statusConnected: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-success)',
  },

  statusDisconnected: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
  },

  error: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    marginBottom: 'var(--space-2)',
  },

  validationResult: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-2)',
  },

  // Buttons
  buttonRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
    marginTop: 'var(--space-2)',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  dangerButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-error)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  // Download location
  downloadLocationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
  },

  downloadLocationPath: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  changeLocationBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Course list
  courseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    maxHeight: '200px',
    overflowY: 'auto',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
  },

  courseRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
  },

  courseInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flex: 1,
    minWidth: 0,
  },

  courseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  courseText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  courseCode: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  courseName: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  visibilityBtn: {
    padding: 'var(--space-1)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-4)',
  },

  // No results
  noResults: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-secondary)',
  },

  clearSearchBtn: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-5)',
    borderTop: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  footerLeft: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  footerRight: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  footerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  dangerButtonSmall: {
    borderColor: 'var(--color-error)',
    color: 'var(--color-error)',
  },

  exportMessage: {
    padding: 'var(--space-2) var(--space-5)',
    fontSize: 'var(--text-sm)',
    borderTop: '1px solid var(--border-default)',
  },

  // Token modal
  tokenModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },

  tokenModal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    width: 'min(450px, 90vw)',
    padding: 'var(--space-5)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },

  tokenModalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },

  tokenModalTitle: {
    margin: 0,
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  tokenModalClose: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-1)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tokenModalDesc: {
    margin: '0 0 var(--space-4) 0',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },

  tokenSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  tokenModalButtons: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-4)',
  },

  // Checkbox
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginTop: 'var(--space-3)',
  },

  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  // Data Management Section
  exportButtonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  exportActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 'var(--space-1)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 100,
    minWidth: '160px',
    overflow: 'hidden',
  },

  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    cursor: 'pointer',
  },

  dangerZoneBox: {
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-4)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },

  dangerZoneContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
  },

  dangerZoneDesc: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 'var(--space-1) 0 0 0',
  },

  dangerZoneButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-error)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  },
};

export default SettingsModal;
