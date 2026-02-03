/**
 * SettingsContext - Centralized state management for Settings
 *
 * This context holds all settings state and handlers, allowing section
 * components to access what they need without prop drilling.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
  type RefObject,
} from 'react';
import { useStore } from '../../../l5-presentation/store';
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
} from '../../../l5-presentation/settings';
import type { Course } from '../../../l5-presentation/types';

// =============================================================================
// TYPES
// =============================================================================

export interface EnrollmentTerm {
  id: number;
  externalId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

interface TokenValidationResult {
  status: 'success' | 'error' | null;
  message: string | null;
}

interface NewTokenValidation {
  valid: boolean | null;
  userName: string | null;
  error: string | null;
}

interface WindowBehavior {
  closeAction: 'quit' | 'minimize-to-tray' | null;
  showTrayIcon: boolean;
}

interface ExportMessage {
  type: 'success' | 'error';
  text: string;
}

interface SectionRefs {
  account: RefObject<HTMLDivElement>;
  display: RefObject<HTMLDivElement>;
  academic: RefObject<HTMLDivElement>;
  notifications: RefObject<HTMLDivElement>;
  data: RefObject<HTMLDivElement>;
}

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface SettingsContextType {
  // Modal props
  isOpen: boolean;
  onClose: () => void;
  isFullPage: boolean;

  // Store data
  courses: Course[];

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredSettings: ReturnType<typeof searchSettings> | null;
  hasSearchResults: boolean;
  matchingCategories: Set<SettingsCategory>;
  shouldShowSetting: (key: string) => boolean;
  isSearching: boolean;
  shouldShowSection: (category: SettingsCategory) => boolean;

  // Accordion
  openSections: string[];
  setOpenSections: React.Dispatch<React.SetStateAction<string[]>>;
  settingsPageSettings: SettingsPageSettings;
  updateSettingsPageSettings: (updates: Partial<SettingsPageSettings>) => void;

  // Canvas connection
  canvasUrl: string;
  setCanvasUrl: (url: string) => void;
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  checkCanvasConnection: () => Promise<void>;
  handleReconnect: () => Promise<void>;
  handleDisconnect: () => Promise<void>;

  // Token validation
  isValidatingToken: boolean;
  tokenValidationResult: TokenValidationResult;
  handleValidateToken: () => Promise<void>;

  // Token replacement
  showTokenReplaceModal: boolean;
  setShowTokenReplaceModal: (show: boolean) => void;
  newToken: string;
  setNewToken: (token: string) => void;
  isValidatingNewToken: boolean;
  newTokenValidation: NewTokenValidation;
  setNewTokenValidation: (val: NewTokenValidation) => void;
  isReplacingToken: boolean;
  handleOpenTokenReplace: () => void;
  handleValidateNewToken: () => Promise<void>;
  handleReplaceToken: () => Promise<void>;

  // Sync preferences
  syncPrefs: SyncPreferences;
  updateSyncPrefs: (updates: Partial<SyncPreferences>) => Promise<void>;

  // Appearance
  appearance: AppearanceSettings;
  updateAppearance: (updates: Partial<AppearanceSettings>) => void;

  // Notifications
  notifications: NotificationSettings;
  updateNotifications: (updates: Partial<NotificationSettings>) => void;

  // Academic
  academic: AcademicSettings;
  updateAcademic: (updates: Partial<AcademicSettings>) => Promise<void>;
  enrollmentTerms: EnrollmentTerm[];

  // File explorer
  fileExplorer: FileExplorerSettings;
  updateFileExplorer: (updates: Partial<FileExplorerSettings>) => void;
  currentDownloadPath: string;
  handleChangeDownloadLocation: () => Promise<void>;

  // Course settings
  courseSettings: CourseSettings;
  updateCourseSettings: (updates: Partial<CourseSettings>) => void;
  handleToggleCourseVisibility: (
    courseId: number,
    currentlyHidden: boolean
  ) => Promise<void>;

  // Calendar settings
  calendarSettings: CalendarSettings;
  updateCalendarSettings: (updates: Partial<CalendarSettings>) => void;

  // Content settings
  contentSettings: ContentSettings;
  updateContentSettings: (updates: Partial<ContentSettings>) => void;

  // Local HTML paths
  localHtmlPathsSettings: LocalHtmlPathsSettings;
  updateLocalHtmlPathsSettings: (
    updates: Partial<LocalHtmlPathsSettings>
  ) => Promise<void>;

  // Dashboard settings
  dashboardSettings: DashboardSettings;
  updateDashboardSettings: (updates: Partial<DashboardSettings>) => void;

  // Landing page
  landingPage: string;
  updateLandingPage: (path: string) => void;

  // Window behavior
  windowBehavior: WindowBehavior;
  updateWindowBehavior: (updates: Partial<WindowBehavior>) => Promise<void>;

  // Confirmation dialogs
  showClearDataConfirm: boolean;
  setShowClearDataConfirm: (show: boolean) => void;
  deleteTokenOnClear: boolean;
  setDeleteTokenOnClear: (del: boolean) => void;
  showDisconnectConfirm: boolean;
  setShowDisconnectConfirm: (show: boolean) => void;

  // Export/Import
  isExporting: boolean;
  exportMessage: ExportMessage | null;
  setExportMessage: (msg: ExportMessage | null) => void;
  showExportDialog: boolean;
  setShowExportDialog: (show: boolean) => void;
  showCsvDropdown: boolean;
  setShowCsvDropdown: (show: boolean) => void;
  handleExportDatabase: () => Promise<void>;
  handleImportDatabase: () => Promise<void>;
  handleExportSettings: () => Promise<void>;
  handleImportSettings: () => Promise<void>;

  // Password modal for encrypted imports
  showPasswordModal: boolean;
  importPassword: string;
  setImportPassword: (password: string) => void;
  isDecrypting: boolean;
  handleDecryptImport: () => Promise<void>;
  handleCancelPasswordModal: () => void;

  // Restart modal for database import
  showRestartModal: boolean;
  handleRestartApp: () => Promise<void>;

  // Section ordering (drag and drop)
  sectionOrder: string[];
  draggedSection: string | null;
  dragOverSection: string | null;
  handleDragStart: (e: React.DragEvent, sectionId: string) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent, sectionId: string) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, targetSectionId: string) => void;
  getDragWrapperStyle: (sectionId: string) => React.CSSProperties;

  // Dock
  dockAutoHide: boolean;
  updateDockAutoHide: (autoHide: boolean) => void;
  sectionRefs: SectionRefs;

  // Modified counts
  accountModifiedCount: number;
  displayModifiedCount: number;
  academicModifiedCount: number;
  notificationsModifiedCount: number;
}

// =============================================================================
// CONTEXT
// =============================================================================

const SettingsContext = createContext<SettingsContextType | null>(null);

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

interface SettingsProviderProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  isFullPage?: boolean;
}

export function SettingsProvider({
  children,
  isOpen,
  onClose,
  isFullPage = false,
}: SettingsProviderProps) {
  const { courses, fetchCourses, setAuthenticated } = useStore();

  // =========================================================================
  // STATE
  // =========================================================================

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Settings page settings
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

  // Accordion state
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
    return DEFAULT_SETTINGS_SECTION_ORDER;
  });

  // Canvas connection
  const [canvasUrl, setCanvasUrl] = useState('');
  const canvasUrlInitializedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Token validation
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenValidationResult, setTokenValidationResult] =
    useState<TokenValidationResult>({
      status: null,
      message: null,
    });

  // Token replacement
  const [showTokenReplaceModal, setShowTokenReplaceModal] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [isValidatingNewToken, setIsValidatingNewToken] = useState(false);
  const [newTokenValidation, setNewTokenValidation] = useState<NewTokenValidation>({
    valid: null,
    userName: null,
    error: null,
  });
  const [isReplacingToken, setIsReplacingToken] = useState(false);

  // Settings
  const [syncPrefs, setSyncPrefs] = useState<SyncPreferences>(
    () => settingsManager.get(STORAGE_KEYS.SYNC_PREFS) ?? DEFAULT_SYNC_PREFERENCES
  );
  const [appearance, setAppearance] = useState<AppearanceSettings>(
    () => settingsManager.get(STORAGE_KEYS.APPEARANCE) ?? DEFAULT_APPEARANCE_SETTINGS
  );
  const [notifications, setNotifications] = useState<NotificationSettings>(
    () => settingsManager.get(STORAGE_KEYS.NOTIFICATIONS) ?? DEFAULT_NOTIFICATION_SETTINGS
  );
  const [academic, setAcademic] = useState<AcademicSettings>(
    () => settingsManager.get(STORAGE_KEYS.ACADEMIC) ?? DEFAULT_ACADEMIC_SETTINGS
  );
  const [enrollmentTerms, setEnrollmentTerms] = useState<EnrollmentTerm[]>([]);
  const [fileExplorer, setFileExplorer] = useState<FileExplorerSettings>(
    () =>
      settingsManager.get(STORAGE_KEYS.FILE_EXPLORER) ?? DEFAULT_FILE_EXPLORER_SETTINGS
  );
  const [currentDownloadPath, setCurrentDownloadPath] = useState<string>('');
  const [courseSettings, setCourseSettings] = useState<CourseSettings>(
    () => settingsManager.get(STORAGE_KEYS.COURSES) ?? DEFAULT_COURSE_SETTINGS
  );
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(
    () => settingsManager.get(STORAGE_KEYS.CALENDAR) ?? DEFAULT_CALENDAR_SETTINGS
  );
  const [contentSettings, setContentSettings] = useState<ContentSettings>(
    () => settingsManager.get(STORAGE_KEYS.CONTENT) ?? DEFAULT_CONTENT_SETTINGS
  );
  const [localHtmlPathsSettings, setLocalHtmlPathsSettings] =
    useState<LocalHtmlPathsSettings>(
      () =>
        settingsManager.get(STORAGE_KEYS.LOCAL_HTML_PATHS) ??
        DEFAULT_LOCAL_HTML_PATHS_SETTINGS
    );
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(
    () => settingsManager.get(STORAGE_KEYS.DASHBOARD) ?? DEFAULT_DASHBOARD_SETTINGS
  );
  const [landingPage, setLandingPage] = useState<string>(
    () => settingsManager.get(STORAGE_KEYS.LANDING_PAGE) ?? '/'
  );

  // Section order
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

  // Drag state
  const [draggedSection, setDraggedSection] = useState<string | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  // Window behavior
  const [windowBehavior, setWindowBehavior] = useState<WindowBehavior>({
    closeAction: null,
    showTrayIcon: true,
  });

  // Confirmation dialogs
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [deleteTokenOnClear, setDeleteTokenOnClear] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Export/Import
  const [isExporting, setIsExporting] = useState(false);
  const [, setIsImporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<ExportMessage | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showCsvDropdown, setShowCsvDropdown] = useState(false);

  // Password modal for encrypted imports
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Restart modal for database import
  const [showRestartModal, setShowRestartModal] = useState(false);

  // Dock
  const [dockAutoHide, setDockAutoHide] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS_DOCK_AUTO_HIDE);
    return stored !== 'false';
  });

  // Section refs
  const sectionRefs: SectionRefs = {
    account: useRef<HTMLDivElement>(null),
    display: useRef<HTMLDivElement>(null),
    academic: useRef<HTMLDivElement>(null),
    notifications: useRef<HTMLDivElement>(null),
    data: useRef<HTMLDivElement>(null),
  };

  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================

  const filteredSettings = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchSettings(searchQuery);
  }, [searchQuery]);

  const hasSearchResults = filteredSettings !== null;

  const matchingCategories = useMemo(() => {
    if (!filteredSettings) return new Set<SettingsCategory>();
    return new Set(filteredSettings.map((s) => s.category));
  }, [filteredSettings]);

  const matchingSettingKeys = useMemo(() => {
    if (!filteredSettings) return null;
    return new Set(filteredSettings.map((s) => s.key));
  }, [filteredSettings]);

  const shouldShowSetting = useCallback(
    (settingKey: string): boolean => {
      if (!matchingSettingKeys) return true;
      return matchingSettingKeys.has(settingKey);
    },
    [matchingSettingKeys]
  );

  const isSearching = hasSearchResults && (filteredSettings?.length ?? 0) > 0;

  const shouldShowSection = useCallback(
    (category: SettingsCategory): boolean => {
      if (!hasSearchResults) return true;
      return matchingCategories.has(category);
    },
    [hasSearchResults, matchingCategories]
  );

  // Modified counts
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

  // =========================================================================
  // EFFECTS
  // =========================================================================

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

  // Check connection and fetch data on mount
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

  // Save open sections when changed
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

  // =========================================================================
  // HANDLERS - Canvas Connection
  // =========================================================================

  const normalizeUrl = (url: string): string => {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized.replace(/\/+$/, '');
  };

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

  // =========================================================================
  // HANDLERS - Fetch Data
  // =========================================================================

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

  // =========================================================================
  // HANDLERS - Settings Updates
  // =========================================================================

  const updateWindowBehavior = async (updates: Partial<WindowBehavior>) => {
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

    if (updates.defaultState === 'collapsed') {
      setOpenSections([]);
    } else if (updates.defaultState === 'expanded') {
      setOpenSections(DEFAULT_SETTINGS_SECTION_ORDER);
    }
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

  // =========================================================================
  // HANDLERS - Export/Import
  // =========================================================================

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
        // Show restart modal
        setShowRestartModal(true);
      } else if (result.error === 'PASSWORD_REQUIRED' && result.data?.filePath) {
        // Encrypted backup detected - show password modal
        setPendingImportPath(result.data.filePath);
        setImportPassword('');
        setShowPasswordModal(true);
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

  const handleRestartApp = async () => {
    await window.api.restartApp();
  };

  const handleDecryptImport = async () => {
    if (!pendingImportPath || !importPassword) {
      setExportMessage({ type: 'error', text: 'Password is required' });
      return;
    }

    setIsDecrypting(true);
    try {
      const encryptedResult = await window.api.importEncryptedBackup({
        filePath: pendingImportPath,
        password: importPassword,
      });

      if (encryptedResult.success) {
        setExportMessage({
          type: 'success',
          text: 'Encrypted backup decrypted successfully. Data has been loaded.',
        });
        setShowPasswordModal(false);
        setPendingImportPath(null);
        setImportPassword('');
      } else {
        setExportMessage({
          type: 'error',
          text: encryptedResult.error || 'Failed to decrypt backup - wrong password?',
        });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Decryption failed',
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCancelPasswordModal = () => {
    setShowPasswordModal(false);
    setPendingImportPath(null);
    setImportPassword('');
    setExportMessage({ type: 'error', text: 'Import cancelled' });
  };

  const handleExportSettings = async () => {
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

      const result = await window.api.exportSettingsToFile(settings);
      if (result.success) {
        setExportMessage({ type: 'success', text: 'Settings exported successfully' });
      } else if (result.error !== 'Export cancelled') {
        setExportMessage({ type: 'error', text: result.error || 'Export failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Export failed',
      });
    }
  };

  const handleImportSettings = async () => {
    try {
      const result = await window.api.importSettingsFromFile();
      if (result.success && result.data?.settings) {
        const settings = result.data.settings;

        for (const [key, value] of Object.entries(settings)) {
          if (typeof value === 'string') {
            localStorage.setItem(key, value);
          } else {
            localStorage.setItem(key, JSON.stringify(value));
          }
        }

        setExportMessage({ type: 'success', text: 'Settings imported. Reloading...' });
        setTimeout(() => window.location.reload(), 1000);
      } else if (result.error && result.error !== 'Import cancelled') {
        setExportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Import failed',
      });
    }
  };

  // =========================================================================
  // HANDLERS - Drag and Drop
  // =========================================================================

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedSection(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionId);
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

  // =========================================================================
  // CONTEXT VALUE
  // =========================================================================

  const value: SettingsContextType = {
    // Modal props
    isOpen,
    onClose,
    isFullPage,

    // Store data
    courses,

    // Search
    searchQuery,
    setSearchQuery,
    filteredSettings,
    hasSearchResults,
    matchingCategories,
    shouldShowSetting,
    isSearching,
    shouldShowSection,

    // Accordion
    openSections,
    setOpenSections,
    settingsPageSettings,
    updateSettingsPageSettings,

    // Canvas connection
    canvasUrl,
    setCanvasUrl,
    isConnected,
    isConnecting,
    connectionError,
    checkCanvasConnection,
    handleReconnect,
    handleDisconnect,

    // Token validation
    isValidatingToken,
    tokenValidationResult,
    handleValidateToken,

    // Token replacement
    showTokenReplaceModal,
    setShowTokenReplaceModal,
    newToken,
    setNewToken,
    isValidatingNewToken,
    newTokenValidation,
    setNewTokenValidation,
    isReplacingToken,
    handleOpenTokenReplace,
    handleValidateNewToken,
    handleReplaceToken,

    // Sync preferences
    syncPrefs,
    updateSyncPrefs,

    // Appearance
    appearance,
    updateAppearance,

    // Notifications
    notifications,
    updateNotifications,

    // Academic
    academic,
    updateAcademic,
    enrollmentTerms,

    // File explorer
    fileExplorer,
    updateFileExplorer,
    currentDownloadPath,
    handleChangeDownloadLocation,

    // Course settings
    courseSettings,
    updateCourseSettings,
    handleToggleCourseVisibility,

    // Calendar settings
    calendarSettings,
    updateCalendarSettings,

    // Content settings
    contentSettings,
    updateContentSettings,

    // Local HTML paths
    localHtmlPathsSettings,
    updateLocalHtmlPathsSettings,

    // Dashboard settings
    dashboardSettings,
    updateDashboardSettings,

    // Landing page
    landingPage,
    updateLandingPage,

    // Window behavior
    windowBehavior,
    updateWindowBehavior,

    // Confirmation dialogs
    showClearDataConfirm,
    setShowClearDataConfirm,
    deleteTokenOnClear,
    setDeleteTokenOnClear,
    showDisconnectConfirm,
    setShowDisconnectConfirm,

    // Export/Import
    isExporting,
    exportMessage,
    setExportMessage,
    showExportDialog,
    setShowExportDialog,
    showCsvDropdown,
    setShowCsvDropdown,
    handleExportDatabase,
    handleImportDatabase,
    handleExportSettings,
    handleImportSettings,

    // Password modal for encrypted imports
    showPasswordModal,
    importPassword,
    setImportPassword,
    isDecrypting,
    handleDecryptImport,
    handleCancelPasswordModal,

    // Restart modal for database import
    showRestartModal,
    handleRestartApp,

    // Section ordering
    sectionOrder,
    draggedSection,
    dragOverSection,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,

    // Dock
    dockAutoHide,
    updateDockAutoHide,
    sectionRefs,

    // Modified counts
    accountModifiedCount,
    displayModifiedCount,
    academicModifiedCount,
    notificationsModifiedCount,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
