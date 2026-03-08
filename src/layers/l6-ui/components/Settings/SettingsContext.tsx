/**
 * SettingsContext - Centralized state management for Settings
 *
 * This context holds all settings state and handlers, allowing section
 * components to access what they need without prop drilling.
 *
 * Implementation is decomposed into focused hooks:
 * - useCanvasConnection: Connection state + token handlers
 * - useSettingsSync: All IPC-synced settings state and update handlers
 * - useExportImport: Export/import state + handlers
 * - useSectionDrag: Drag-and-drop section ordering
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
} from 'react';
import { useStore } from '../../../l5-presentation/store';
import {
  STORAGE_KEYS,
  searchSettings,
  type SettingsCategory,
} from '../../../l5-presentation/settings';
import type { SettingsContextType, SectionRefs } from './settingsContextTypes';
import { useCanvasConnection } from './useCanvasConnection';
import { useSettingsSync } from './useSettingsSync';
import { useExportImport } from './useExportImport';
import { useSectionDrag } from './useSectionDrag';

// Re-export types that consumers depend on
export type { EnrollmentTerm } from './settingsContextTypes';

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
  const { courses } = useStore();

  // =========================================================================
  // COMPOSED HOOKS
  // =========================================================================

  const canvasConnection = useCanvasConnection();
  const settingsSync = useSettingsSync();
  const exportImport = useExportImport();
  const sectionDrag = useSectionDrag();

  // =========================================================================
  // SEARCH STATE
  // =========================================================================

  const [searchQuery, setSearchQuery] = useState('');

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

  // =========================================================================
  // DRAG-AWARE ACCORDION
  // =========================================================================

  const setOpenSections = sectionDrag.createDragAwareSetOpenSections(
    settingsSync.setOpenSectionsInternal
  );

  // =========================================================================
  // SECTION REFS
  // =========================================================================

  const sectionRefs: SectionRefs = {
    display: useRef<HTMLDivElement>(null),
    academic: useRef<HTMLDivElement>(null),
    files: useRef<HTMLDivElement>(null),
    sync: useRef<HTMLDivElement>(null),
    account: useRef<HTMLDivElement>(null),
    behavior: useRef<HTMLDivElement>(null),
    notifications: useRef<HTMLDivElement>(null),
    data: useRef<HTMLDivElement>(null),
  };

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

    applyTheme(settingsSync.appearance.theme);

    if (settingsSync.appearance.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [settingsSync.appearance.theme]);

  // Check connection and fetch data on mount
  useEffect(() => {
    if (isOpen) {
      canvasConnection.checkCanvasConnection();
      settingsSync.fetchEnrollmentTerms();
      settingsSync.fetchDownloadDirectory();
      settingsSync.fetchWindowBehavior();
    } else {
      canvasConnection.resetUrlInitialized();
      setSearchQuery('');
    }
  }, [isOpen]);

  // Save open sections when changed
  useEffect(() => {
    if (settingsSync.settingsPageSettings.defaultState === 'remember') {
      localStorage.setItem(
        STORAGE_KEYS.SETTINGS_OPEN_SECTIONS,
        JSON.stringify(settingsSync.openSections)
      );
    }
  }, [settingsSync.openSections, settingsSync.settingsPageSettings.defaultState]);

  // Escape clears search if active, otherwise does nothing
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && searchQuery) {
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, searchQuery, setSearchQuery]);

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
    openSections: settingsSync.openSections,
    setOpenSections,
    settingsPageSettings: settingsSync.settingsPageSettings,
    updateSettingsPageSettings: settingsSync.updateSettingsPageSettings,

    // Canvas connection
    canvasUrl: canvasConnection.canvasUrl,
    setCanvasUrl: canvasConnection.setCanvasUrl,
    isConnected: canvasConnection.isConnected,
    isConnecting: canvasConnection.isConnecting,
    connectionError: canvasConnection.connectionError,
    checkCanvasConnection: canvasConnection.checkCanvasConnection,
    handleReconnect: canvasConnection.handleReconnect,
    handleDisconnect: canvasConnection.handleDisconnect,

    // Token validation
    isValidatingToken: canvasConnection.isValidatingToken,
    tokenValidationResult: canvasConnection.tokenValidationResult,
    handleValidateToken: canvasConnection.handleValidateToken,

    // Token replacement
    showTokenReplaceModal: canvasConnection.showTokenReplaceModal,
    setShowTokenReplaceModal: canvasConnection.setShowTokenReplaceModal,
    newToken: canvasConnection.newToken,
    setNewToken: canvasConnection.setNewToken,
    isValidatingNewToken: canvasConnection.isValidatingNewToken,
    newTokenValidation: canvasConnection.newTokenValidation,
    setNewTokenValidation: canvasConnection.setNewTokenValidation,
    isReplacingToken: canvasConnection.isReplacingToken,
    handleOpenTokenReplace: canvasConnection.handleOpenTokenReplace,
    handleValidateNewToken: canvasConnection.handleValidateNewToken,
    handleReplaceToken: canvasConnection.handleReplaceToken,

    // Sync preferences
    syncPrefs: settingsSync.syncPrefs,
    updateSyncPrefs: settingsSync.updateSyncPrefs,

    // Appearance
    appearance: settingsSync.appearance,
    updateAppearance: settingsSync.updateAppearance,

    // Notifications
    notifications: settingsSync.notifications,
    updateNotifications: settingsSync.updateNotifications,

    // Academic
    academic: settingsSync.academic,
    updateAcademic: settingsSync.updateAcademic,
    enrollmentTerms: settingsSync.enrollmentTerms,

    // File explorer
    fileExplorer: settingsSync.fileExplorer,
    updateFileExplorer: settingsSync.updateFileExplorer,
    currentDownloadPath: settingsSync.currentDownloadPath,
    handleChangeDownloadLocation: settingsSync.handleChangeDownloadLocation,

    // Course settings
    courseSettings: settingsSync.courseSettings,
    updateCourseSettings: settingsSync.updateCourseSettings,
    handleToggleCourseVisibility: settingsSync.handleToggleCourseVisibility,

    // Calendar settings
    calendarSettings: settingsSync.calendarSettings,
    updateCalendarSettings: settingsSync.updateCalendarSettings,

    // Content settings
    contentSettings: settingsSync.contentSettings,
    updateContentSettings: settingsSync.updateContentSettings,

    // Local HTML paths
    localHtmlPathsSettings: settingsSync.localHtmlPathsSettings,
    updateLocalHtmlPathsSettings: settingsSync.updateLocalHtmlPathsSettings,

    // Dashboard settings
    dashboardSettings: settingsSync.dashboardSettings,
    updateDashboardSettings: settingsSync.updateDashboardSettings,

    // Landing page
    landingPage: settingsSync.landingPage,
    updateLandingPage: settingsSync.updateLandingPage,

    // Window behavior
    windowBehavior: settingsSync.windowBehavior,
    updateWindowBehavior: settingsSync.updateWindowBehavior,

    // Confirmation dialogs
    showClearDataConfirm: exportImport.showClearDataConfirm,
    setShowClearDataConfirm: exportImport.setShowClearDataConfirm,
    deleteTokenOnClear: exportImport.deleteTokenOnClear,
    setDeleteTokenOnClear: exportImport.setDeleteTokenOnClear,
    showDisconnectConfirm: exportImport.showDisconnectConfirm,
    setShowDisconnectConfirm: exportImport.setShowDisconnectConfirm,

    // Export/Import
    isExporting: exportImport.isExporting,
    exportMessage: exportImport.exportMessage,
    setExportMessage: exportImport.setExportMessage,
    showExportDialog: exportImport.showExportDialog,
    setShowExportDialog: exportImport.setShowExportDialog,
    showCsvDropdown: exportImport.showCsvDropdown,
    setShowCsvDropdown: exportImport.setShowCsvDropdown,
    handleExportDatabase: exportImport.handleExportDatabase,
    handleImportDatabase: exportImport.handleImportDatabase,
    handleExportSettings: exportImport.handleExportSettings,
    handleImportSettings: exportImport.handleImportSettings,

    // Password modal for encrypted imports
    showPasswordModal: exportImport.showPasswordModal,
    importPassword: exportImport.importPassword,
    setImportPassword: exportImport.setImportPassword,
    isDecrypting: exportImport.isDecrypting,
    handleDecryptImport: exportImport.handleDecryptImport,
    handleCancelPasswordModal: exportImport.handleCancelPasswordModal,

    // Restart modal for database import
    showRestartModal: exportImport.showRestartModal,
    handleRestartApp: exportImport.handleRestartApp,

    // Section ordering
    sectionOrder: sectionDrag.sectionOrder,
    draggedSection: sectionDrag.draggedSection,
    dragOverSection: sectionDrag.dragOverSection,
    handleMouseDown: sectionDrag.handleMouseDown,
    handleDragStart: sectionDrag.handleDragStart,
    handleDragEnd: sectionDrag.handleDragEnd,
    handleDragOver: sectionDrag.handleDragOver,
    handleDragLeave: sectionDrag.handleDragLeave,
    handleDrop: sectionDrag.handleDrop,
    getDragWrapperStyle: sectionDrag.getDragWrapperStyle,

    // Dock
    dockAutoHide: settingsSync.dockAutoHide,
    updateDockAutoHide: settingsSync.updateDockAutoHide,
    sectionRefs,

    // Modified counts
    displayModifiedCount: settingsSync.displayModifiedCount,
    academicModifiedCount: settingsSync.academicModifiedCount,
    filesModifiedCount: settingsSync.filesModifiedCount,
    syncModifiedCount: settingsSync.syncModifiedCount,
    accountModifiedCount: settingsSync.accountModifiedCount,
    behaviorModifiedCount: settingsSync.behaviorModifiedCount,
    notificationsModifiedCount: settingsSync.notificationsModifiedCount,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
