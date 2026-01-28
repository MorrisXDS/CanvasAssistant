/**
 * SettingsModal Component - Redesigned
 *
 * Modal overlay for application settings with:
 * - 4 collapsible accordion sections
 * - Fuzzy search across all settings
 * - Change indicators for modified settings
 * - Import/export functionality
 */

import React, { useState, useEffect, useMemo } from 'react';
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
} from '../../l5-presentation/settings';
import type { Course } from '../../l5-presentation/types';
import { ConfirmDialog } from './shared/ConfirmDialog';
import {
  Accordion,
  SearchInput,
  SettingRow,
  ToggleSwitch,
  SettingSelect,
  SettingSlider,
  SettingButtonGroup,
} from './primitives';

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

// Category icons
const CATEGORY_ICONS: Record<SettingsCategory, React.ReactNode> = {
  account: <Link size={18} />,
  display: <Palette size={18} />,
  academic: <GraduationCap size={18} />,
  notifications: <Bell size={18} />,
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
  const { courses, fetchCourses } = useStore();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Accordion state - all sections open by default
  const [openSections, setOpenSections] = useState<string[]>([
    'account',
    'display',
    'academic',
    'notifications',
  ]);

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

  // Dashboard settings
  const [dashboardSettings, setDashboardSettings] = useState<DashboardSettings>(
    () => settingsManager.get(STORAGE_KEYS.DASHBOARD) ?? DEFAULT_DASHBOARD_SETTINGS
  );

  // Landing page setting
  const [landingPage, setLandingPage] = useState<string>(
    () => settingsManager.get(STORAGE_KEYS.LANDING_PAGE) ?? '/'
  );

  // Window behavior settings
  const [windowBehavior, setWindowBehavior] = useState<{
    closeAction: 'quit' | 'minimize-to-tray' | null;
    showTrayIcon: boolean;
  }>({ closeAction: null, showTrayIcon: true });

  // Clear data confirmation dialog
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [deleteTokenOnClear, setDeleteTokenOnClear] = useState(false);

  // Data export/import state
  const [isExporting, setIsExporting] = useState(false);
  const [_isImporting, setIsImporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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

    if (
      'autoSyncEnabled' in updates ||
      'autoSyncInterval' in updates ||
      'autoAssignDueDate' in updates
    ) {
      try {
        await window.api.setAutoSyncPreferences({
          autoSyncEnabled: newPrefs.autoSyncEnabled,
          autoSyncInterval: newPrefs.autoSyncInterval,
          autoAssignDueDate: newPrefs.autoAssignDueDate,
        });
      } catch (e) {
        console.error('Failed to sync preferences:', e);
      }
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

  const updateDashboardSettings = (updates: Partial<DashboardSettings>) => {
    const newSettings = { ...dashboardSettings, ...updates };
    setDashboardSettings(newSettings);
    settingsManager.set(STORAGE_KEYS.DASHBOARD, newSettings);
  };

  const updateLandingPage = (path: string) => {
    setLandingPage(path);
    settingsManager.set(STORAGE_KEYS.LANDING_PAGE, path);
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

  const _handleImportDatabase = async () => {
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

  const accountModifiedCount =
    (isSyncModified ? 1 : 0) + (windowBehavior.closeAction !== null ? 1 : 0);
  const displayModifiedCount =
    (isAppearanceModified ? 1 : 0) +
    (isDashboardModified ? 1 : 0) +
    (landingPage !== '/' ? 1 : 0) +
    (isFileExplorerModified ? 1 : 0) +
    (isCalendarModified ? 1 : 0) +
    (isCourseSettingsModified ? 1 : 0);
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
          placeholder="Search settings..."
          debounce={150}
        />
      </div>

      {/* Content */}
      <div style={styles.content}>
        <Accordion type="multiple" value={openSections} onChange={setOpenSections}>
          {/* Account & Connection */}
          {shouldShowSection('account') && (
            <Accordion.Item value="account">
              <Accordion.Trigger
                icon={CATEGORY_ICONS.account}
                badge={<ModifiedBadge count={accountModifiedCount} />}
              >
                {SETTINGS_CATEGORIES.account.label}
              </Accordion.Trigger>
              <Accordion.Content>
                <div style={styles.section}>
                  <p style={styles.sectionDesc}>
                    {SETTINGS_CATEGORIES.account.description}
                  </p>

                  {/* Canvas URL */}
                  <SettingRow
                    label="Canvas URL"
                    description="Your institution's Canvas LMS URL"
                    vertical
                  >
                    <input
                      type="text"
                      value={canvasUrl}
                      onChange={(e) => setCanvasUrl(e.target.value)}
                      placeholder="https://your-institution.instructure.com"
                      style={styles.input}
                      disabled={isConnected}
                    />
                  </SettingRow>

                  {/* Connection Status */}
                  <div style={styles.statusRow}>
                    <span style={styles.statusLabel}>Status:</span>
                    {isConnected ? (
                      <span style={styles.statusConnected}>
                        <Check size={14} /> Connected
                      </span>
                    ) : (
                      <span style={styles.statusDisconnected}>
                        <AlertCircle size={14} /> Not Connected
                      </span>
                    )}
                  </div>

                  {connectionError && <div style={styles.error}>{connectionError}</div>}

                  {tokenValidationResult.status && (
                    <div
                      style={{
                        ...styles.validationResult,
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

                  <div style={styles.buttonRow}>
                    {isConnected ? (
                      <>
                        <button
                          style={{
                            ...styles.secondaryButton,
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
                              />{' '}
                              Validating...
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={14} /> Validate Token
                            </>
                          )}
                        </button>
                        <button
                          style={styles.secondaryButton}
                          onClick={handleOpenTokenReplace}
                        >
                          <Key size={14} /> Replace Token
                        </button>
                        <button style={styles.dangerButton} onClick={handleDisconnect}>
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        style={{
                          ...styles.primaryButton,
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
                            />{' '}
                            Connecting...
                          </>
                        ) : (
                          'Connect'
                        )}
                      </button>
                    )}
                  </div>

                  <div style={styles.divider} />

                  {/* Sync Settings */}
                  <SettingRow
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
                        { value: '0', label: 'Never' },
                        { value: '15', label: '15 minutes' },
                        { value: '30', label: '30 minutes' },
                        { value: '60', label: '1 hour' },
                        { value: '120', label: '2 hours' },
                      ]}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Sync files"
                    description="Include course files and folders in sync"
                    isModified={
                      syncPrefs.syncFiles !== DEFAULT_SYNC_PREFERENCES.syncFiles
                    }
                    onReset={() =>
                      updateSyncPrefs({ syncFiles: DEFAULT_SYNC_PREFERENCES.syncFiles })
                    }
                  >
                    <ToggleSwitch
                      checked={syncPrefs.syncFiles}
                      onChange={(checked) => updateSyncPrefs({ syncFiles: checked })}
                    />
                  </SettingRow>

                  <SettingRow
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

                  <div style={styles.divider} />

                  {/* Window Behavior */}
                  <SettingRow
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
                        { value: '', label: 'Ask every time' },
                        { value: 'minimize-to-tray', label: 'Minimize to tray' },
                        { value: 'quit', label: 'Quit application' },
                      ]}
                    />
                  </SettingRow>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          )}

          {/* Display & Layout */}
          {shouldShowSection('display') && (
            <Accordion.Item value="display">
              <Accordion.Trigger
                icon={CATEGORY_ICONS.display}
                badge={<ModifiedBadge count={displayModifiedCount} />}
              >
                {SETTINGS_CATEGORIES.display.label}
              </Accordion.Trigger>
              <Accordion.Content>
                <div style={styles.section}>
                  <p style={styles.sectionDesc}>
                    {SETTINGS_CATEGORIES.display.description}
                  </p>

                  {/* Theme */}
                  <SettingRow
                    label="Theme"
                    description="Application color theme"
                    isModified={appearance.theme !== DEFAULT_APPEARANCE_SETTINGS.theme}
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
                        { value: 'light', label: 'Light', icon: <Sun size={14} /> },
                        { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                        { value: 'system', label: 'System', icon: <Monitor size={14} /> },
                      ]}
                    />
                  </SettingRow>

                  {/* Landing Page */}
                  <SettingRow
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

                  {/* Sidebar */}
                  <SettingRow
                    label="Collapsed sidebar"
                    description="Start with sidebar collapsed on launch"
                    isModified={
                      appearance.sidebarCollapsed !==
                      DEFAULT_APPEARANCE_SETTINGS.sidebarCollapsed
                    }
                    onReset={() =>
                      updateAppearance({
                        sidebarCollapsed: DEFAULT_APPEARANCE_SETTINGS.sidebarCollapsed,
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

                  <div style={styles.divider} />

                  {/* Dashboard Settings */}
                  <SettingRow
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

                  <SettingRow
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

                  <div style={styles.divider} />

                  {/* View Modes */}
                  <SettingRow
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
                        updateCourseSettings({ defaultViewMode: v as 'grid' | 'list' })
                      }
                      options={[
                        { value: 'grid', label: 'Grid' },
                        { value: 'list', label: 'List' },
                      ]}
                    />
                  </SettingRow>

                  <SettingRow
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
                        updateCalendarSettings({ defaultViewMode: v as 'month' | 'week' })
                      }
                      options={[
                        { value: 'month', label: 'Month' },
                        { value: 'week', label: 'Week' },
                      ]}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Files view"
                    description="Default view mode for the files page"
                    isModified={
                      fileExplorer.defaultViewMode !==
                      DEFAULT_FILE_EXPLORER_SETTINGS.defaultViewMode
                    }
                    onReset={() =>
                      updateFileExplorer({
                        defaultViewMode: DEFAULT_FILE_EXPLORER_SETTINGS.defaultViewMode,
                      })
                    }
                  >
                    <SettingButtonGroup
                      value={fileExplorer.defaultViewMode}
                      onChange={(v) =>
                        updateFileExplorer({ defaultViewMode: v as 'list' | 'grid' })
                      }
                      options={[
                        { value: 'list', label: 'List' },
                        { value: 'grid', label: 'Grid' },
                      ]}
                    />
                  </SettingRow>

                  <SettingRow
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
                        { value: 'collapsed', label: 'All Collapsed' },
                        { value: 'expanded', label: 'All Expanded' },
                        { value: 'remember', label: 'Remember State' },
                      ]}
                    />
                  </SettingRow>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          )}

          {/* Academic & Courses */}
          {shouldShowSection('academic') && (
            <Accordion.Item value="academic">
              <Accordion.Trigger
                icon={CATEGORY_ICONS.academic}
                badge={<ModifiedBadge count={academicModifiedCount} />}
              >
                {SETTINGS_CATEGORIES.academic.label}
              </Accordion.Trigger>
              <Accordion.Content>
                <div style={styles.section}>
                  <p style={styles.sectionDesc}>
                    {SETTINGS_CATEGORIES.academic.description}
                  </p>

                  {/* Target Grade */}
                  <SettingRow
                    label="Default target grade"
                    description="Applied to new courses. Individual targets can be overridden."
                    isModified={
                      academic.defaultTargetGrade !==
                      DEFAULT_ACADEMIC_SETTINGS.defaultTargetGrade
                    }
                    onReset={() =>
                      updateAcademic({
                        defaultTargetGrade: DEFAULT_ACADEMIC_SETTINGS.defaultTargetGrade,
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

                  {/* Term Selection */}
                  <SettingRow
                    label="Semester selection"
                    description="Which semester's courses to display"
                    isModified={
                      academic.termSelection !== DEFAULT_ACADEMIC_SETTINGS.termSelection
                    }
                    onReset={() =>
                      updateAcademic({
                        termSelection: DEFAULT_ACADEMIC_SETTINGS.termSelection,
                      })
                    }
                  >
                    <select
                      value={academic.termSelection}
                      onChange={(e) => updateAcademic({ termSelection: e.target.value })}
                      style={styles.select}
                    >
                      <option value="auto">Auto-detect current</option>
                      <option value="all">Show all semesters</option>
                      {enrollmentTerms.length > 0 && (
                        <optgroup label="Available Semesters">
                          {enrollmentTerms.map((term) => (
                            <option key={term.externalId} value={term.externalId}>
                              {term.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </SettingRow>

                  <div style={styles.divider} />

                  {/* Course Visibility */}
                  <SettingRow
                    label="Show hidden courses"
                    description="Display hidden courses in the courses list by default"
                    isModified={
                      courseSettings.showHiddenByDefault !==
                      DEFAULT_COURSE_SETTINGS.showHiddenByDefault
                    }
                    onReset={() =>
                      updateCourseSettings({
                        showHiddenByDefault: DEFAULT_COURSE_SETTINGS.showHiddenByDefault,
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

                  {/* Auto-fill due dates */}
                  <SettingRow
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

                  <div style={styles.divider} />

                  {/* Download Location */}
                  <SettingRow
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
                        <FolderOpen size={14} /> Change
                      </button>
                    </div>
                  </SettingRow>

                  {/* Link Behavior */}
                  <SettingRow
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
                        { value: 'always-external', label: 'Open in browser' },
                        { value: 'prefer-local', label: 'Prefer local' },
                      ]}
                    />
                  </SettingRow>

                  <div style={styles.divider} />

                  {/* Course Visibility List */}
                  <div style={styles.subsectionTitle}>Course Visibility</div>
                  <p style={styles.fieldDesc}>
                    Hidden courses won't appear in Dashboard, Tasks, or Announcements.
                  </p>
                  <div style={styles.courseList}>
                    {courses.length === 0 ? (
                      <p style={styles.emptyText}>No courses synced yet.</p>
                    ) : (
                      courses.map((course: Course) => (
                        <div key={course.id} style={styles.courseRow}>
                          <div style={styles.courseInfo}>
                            <span
                              style={{
                                ...styles.courseDot,
                                backgroundColor: course.color || 'var(--color-navy)',
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
                              handleToggleCourseVisibility(course.id, course.isHidden)
                            }
                            title={course.isHidden ? 'Show course' : 'Hide course'}
                          >
                            {course.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Accordion.Content>
            </Accordion.Item>
          )}

          {/* Notifications */}
          {shouldShowSection('notifications') && (
            <Accordion.Item value="notifications">
              <Accordion.Trigger
                icon={CATEGORY_ICONS.notifications}
                badge={<ModifiedBadge count={notificationsModifiedCount} />}
              >
                {SETTINGS_CATEGORIES.notifications.label}
              </Accordion.Trigger>
              <Accordion.Content>
                <div style={styles.section}>
                  <p style={styles.sectionDesc}>
                    {SETTINGS_CATEGORIES.notifications.description}
                  </p>

                  <SettingRow
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
                      onChange={(checked) => updateNotifications({ enabled: checked })}
                    />
                  </SettingRow>

                  {notifications.enabled && (
                    <>
                      <div style={styles.divider} />
                      <div style={styles.subsectionTitle}>Alert types</div>

                      <SettingRow
                        label="Priority alerts"
                        description="Intelligence flags high-priority or at-risk tasks"
                        isModified={
                          notifications.priorityAlerts !==
                          DEFAULT_NOTIFICATION_SETTINGS.priorityAlerts
                        }
                        onReset={() =>
                          updateNotifications({
                            priorityAlerts: DEFAULT_NOTIFICATION_SETTINGS.priorityAlerts,
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

                      <SettingRow
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

                      <SettingRow
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

                      <SettingRow
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

                      <div style={styles.divider} />
                      <div style={styles.subsectionTitle}>Intelligence alerts</div>

                      <SettingRow
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

                      <SettingRow
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

                      <div style={styles.divider} />
                      <div style={styles.subsectionTitle}>Smart quiet mode</div>
                      <p style={styles.quietModeDesc}>
                        Automatically suppress notifications when:
                      </p>

                      <SettingRow
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

                      <SettingRow
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

                      <SettingRow
                        label="Busy or Exam status"
                        description="Pause when inferred status is Busy or Exam"
                        isModified={
                          notifications.quietWhenBusy !==
                          DEFAULT_NOTIFICATION_SETTINGS.quietWhenBusy
                        }
                        onReset={() =>
                          updateNotifications({
                            quietWhenBusy: DEFAULT_NOTIFICATION_SETTINGS.quietWhenBusy,
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
                    </>
                  )}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          )}
        </Accordion>

        {/* No search results message */}
        {hasSearchResults && filteredSettings?.length === 0 && (
          <div style={styles.noResults}>
            <p>No settings found for "{searchQuery}"</p>
            <button style={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerLeft}>
          <button style={styles.footerButton} onClick={handleExportSettings}>
            <Upload size={14} /> Export Settings
          </button>
          <button style={styles.footerButton} onClick={handleImportSettings}>
            <Download size={14} /> Import Settings
          </button>
        </div>
        <div style={styles.footerRight}>
          <button
            style={styles.footerButton}
            onClick={handleExportDatabase}
            disabled={isExporting}
          >
            <Database size={14} /> Backup Data
          </button>
          <button
            style={{ ...styles.footerButton, ...styles.dangerButtonSmall }}
            onClick={() => setShowClearDataConfirm(true)}
          >
            <RotateCcw size={14} /> Reset All
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
              <h4 style={styles.tokenModalTitle}>Replace Canvas Token</h4>
              <button
                style={styles.tokenModalClose}
                onClick={() => setShowTokenReplaceModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p style={styles.tokenModalDesc}>
              Enter your new Canvas API token. You can generate one from your Canvas
              account settings.
            </p>
            <div style={styles.field}>
              <label style={styles.label}>New Access Token</label>
              <input
                type="password"
                value={newToken}
                onChange={(e) => {
                  setNewToken(e.target.value);
                  setNewTokenValidation({ valid: null, userName: null, error: null });
                }}
                placeholder="Enter your new Canvas access token"
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
                Token valid
                {newTokenValidation.userName && ` for ${newTokenValidation.userName}`}
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
                      Validating...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} /> Validate Token
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
                      Replacing...
                    </>
                  ) : (
                    <>
                      <Key size={14} /> Replace Token
                    </>
                  )}
                </button>
              )}
              <button
                style={styles.cancelButton}
                onClick={() => setShowTokenReplaceModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation */}
      <ConfirmDialog
        isOpen={showClearDataConfirm}
        type="danger"
        title="Reset All Data"
        message={
          deleteTokenOnClear
            ? 'This will delete all synced data including courses, tasks, files, announcements, AND your Canvas API token. You will need to re-authenticate after this action. This action cannot be undone.'
            : 'This will delete all synced data including courses, tasks, files, and announcements. This action cannot be undone. Your Canvas connection will be preserved.'
        }
        confirmText="Reset All Data"
        cancelText="Cancel"
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
          Also delete Canvas API token (requires re-authentication)
        </label>
      </ConfirmDialog>
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

  // Connection status
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
};

export default SettingsModal;
