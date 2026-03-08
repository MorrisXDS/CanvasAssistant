/**
 * useSettingsSync - IPC-synced settings state and handlers
 *
 * Manages all settings that are persisted via settingsManager or IPC,
 * including window behavior, sync prefs, appearance, academic, file explorer,
 * course, calendar, content, dashboard, landing page, local HTML paths,
 * and settings page preferences.
 */

import { useState } from 'react';
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
  type SyncPreferences,
  type AppearanceSettings,
  type NotificationSettings,
  type AcademicSettings,
  type FileExplorerSettings,
  type CourseSettings,
  type CalendarSettings,
  type ContentSettings,
  type DashboardSettings,
  type SettingsPageSettings,
  type LocalHtmlPathsSettings,
} from '../../../l5-presentation/settings';
import type { EnrollmentTerm, WindowBehavior } from './settingsContextTypes';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('SettingsSync');

export function useSettingsSync() {
  const { fetchCourses } = useStore();

  // Settings state
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
  const [openSections, setOpenSectionsInternal] = useState<string[]>(() => {
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

  // Window behavior
  const [windowBehavior, setWindowBehavior] = useState<WindowBehavior>({
    closeAction: null,
    showTrayIcon: true,
  });

  // Dock
  const [dockAutoHide, setDockAutoHide] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS_DOCK_AUTO_HIDE);
    return stored !== 'false';
  });

  // =========================================================================
  // FETCH HANDLERS (called on mount)
  // =========================================================================

  const fetchEnrollmentTerms = async () => {
    try {
      const terms = await window.api.getEnrollmentTerms();
      setEnrollmentTerms(terms);
    } catch (error) {
      logger.error('Failed to fetch enrollment terms', error instanceof Error ? error : undefined);
    }
  };

  const fetchDownloadDirectory = async () => {
    try {
      const result = await window.api.getFilesDirectory();
      setCurrentDownloadPath(result.path);
    } catch (error) {
      logger.error('Failed to fetch download directory', error instanceof Error ? error : undefined);
    }
  };

  const fetchWindowBehavior = async () => {
    try {
      const settings = await window.api.getWindowBehavior();
      setWindowBehavior(settings);
    } catch (error) {
      logger.error('Failed to fetch window behavior', error instanceof Error ? error : undefined);
    }
  };

  // =========================================================================
  // UPDATE HANDLERS
  // =========================================================================

  const updateWindowBehavior = async (updates: Partial<WindowBehavior>) => {
    const newSettings = { ...windowBehavior, ...updates };
    setWindowBehavior(newSettings);
    try {
      await window.api.setWindowBehavior(newSettings);
    } catch (error) {
      logger.error('Failed to update window behavior', error instanceof Error ? error : undefined);
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
      logger.error('Failed to sync preferences to main process', e instanceof Error ? e : undefined);
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
        logger.error('Failed to propagate default target grade', error instanceof Error ? error : undefined);
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
        logger.error('Failed to propagate term selection', error instanceof Error ? error : undefined);
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
      localStorage.removeItem(STORAGE_KEYS.CALENDAR_VIEW_MODE);
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
      logger.error('Failed to save local HTML paths settings', error instanceof Error ? error : undefined);
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
      setOpenSectionsInternal([]);
    } else if (updates.defaultState === 'expanded') {
      setOpenSectionsInternal(DEFAULT_SETTINGS_SECTION_ORDER);
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
      logger.error('Failed to change download location', error instanceof Error ? error : undefined);
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
  // MODIFIED COUNTS
  // =========================================================================

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
  const isCalendarModified =
    JSON.stringify(calendarSettings) !== JSON.stringify(DEFAULT_CALENDAR_SETTINGS);
  const isCourseSettingsModified =
    JSON.stringify(courseSettings) !== JSON.stringify(DEFAULT_COURSE_SETTINGS);
  const isSettingsPageSettingsModified =
    settingsPageSettings.defaultState !== DEFAULT_SETTINGS_PAGE_SETTINGS.defaultState;

  const displayModifiedCount =
    (isAppearanceModified ? 1 : 0) +
    (isDashboardModified ? 1 : 0) +
    (landingPage !== '/' ? 1 : 0) +
    (isCalendarModified ? 1 : 0) +
    (isCourseSettingsModified ? 1 : 0) +
    (isSettingsPageSettingsModified ? 1 : 0) +
    (!dockAutoHide ? 1 : 0);

  const academicModifiedCount = isAcademicModified ? 1 : 0;

  const isContentModified =
    JSON.stringify(contentSettings) !== JSON.stringify(DEFAULT_CONTENT_SETTINGS);
  const isLocalHtmlPathsModified =
    JSON.stringify(localHtmlPathsSettings) !==
    JSON.stringify(DEFAULT_LOCAL_HTML_PATHS_SETTINGS);
  const filesModifiedCount =
    (isContentModified ? 1 : 0) +
    (isLocalHtmlPathsModified ? 1 : 0) +
    (fileExplorer.skipExternalLinkWarning !==
    DEFAULT_FILE_EXPLORER_SETTINGS.skipExternalLinkWarning
      ? 1
      : 0) +
    (fileExplorer.downloadLocation !== DEFAULT_FILE_EXPLORER_SETTINGS.downloadLocation
      ? 1
      : 0);

  const syncModifiedCount = isSyncModified ? 1 : 0;
  const accountModifiedCount = 0;
  const behaviorModifiedCount = windowBehavior.closeAction !== null ? 1 : 0;
  const notificationsModifiedCount = isNotificationsModified ? 1 : 0;

  return {
    // Settings state
    syncPrefs,
    appearance,
    notifications,
    academic,
    enrollmentTerms,
    fileExplorer,
    currentDownloadPath,
    courseSettings,
    calendarSettings,
    contentSettings,
    localHtmlPathsSettings,
    dashboardSettings,
    landingPage,
    settingsPageSettings,
    openSections,
    setOpenSectionsInternal,
    windowBehavior,
    dockAutoHide,

    // Fetch handlers
    fetchEnrollmentTerms,
    fetchDownloadDirectory,
    fetchWindowBehavior,

    // Update handlers
    updateSyncPrefs,
    updateAppearance,
    updateNotifications,
    updateAcademic,
    updateFileExplorer,
    updateCourseSettings,
    updateCalendarSettings,
    updateContentSettings,
    updateLocalHtmlPathsSettings,
    updateDashboardSettings,
    updateSettingsPageSettings,
    updateLandingPage,
    updateDockAutoHide,
    updateWindowBehavior,
    handleChangeDownloadLocation,
    handleToggleCourseVisibility,

    // Modified counts
    displayModifiedCount,
    academicModifiedCount,
    filesModifiedCount,
    syncModifiedCount,
    accountModifiedCount,
    behaviorModifiedCount,
    notificationsModifiedCount,
  };
}
