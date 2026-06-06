/**
 * Type definitions for the Settings context
 *
 * Extracted from SettingsContext.tsx for reuse by extracted hooks.
 */

import type React from 'react';
import type { RefObject } from 'react';
import { searchSettings } from '../../../l5-presentation/settings';
import type {
  SyncPreferences,
  AppearanceSettings,
  NotificationSettings,
  AcademicSettings,
  FileExplorerSettings,
  CourseSettings,
  CalendarSettings,
  ContentSettings,
  DashboardSettings,
  SettingsCategory,
  SettingsPageSettings,
  LocalHtmlPathsSettings,
} from '../../../l5-presentation/settings';
import type { Course } from '../../../l5-presentation/types';

// =============================================================================
// SUPPORTING TYPES
// =============================================================================

export interface EnrollmentTerm {
  id: number;
  externalId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

export interface TokenValidationResult {
  status: 'success' | 'error' | null;
  message: string | null;
}

export interface NewTokenValidation {
  valid: boolean | null;
  userName: string | null;
  error: string | null;
}

export interface WindowBehavior {
  closeAction: 'quit' | 'minimize-to-tray' | null;
  showTrayIcon: boolean;
}

export interface ExportMessage {
  type: 'success' | 'error';
  text: string;
}

export interface SectionRefs {
  display: RefObject<HTMLDivElement>;
  academic: RefObject<HTMLDivElement>;
  files: RefObject<HTMLDivElement>;
  sync: RefObject<HTMLDivElement>;
  account: RefObject<HTMLDivElement>;
  behavior: RefObject<HTMLDivElement>;
  notifications: RefObject<HTMLDivElement>;
  data: RefObject<HTMLDivElement>;
  updates: RefObject<HTMLDivElement>;
}

// =============================================================================
// CONTEXT TYPE
// =============================================================================

export interface SettingsContextType {
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
  handleMouseDown: () => void;
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
  displayModifiedCount: number;
  academicModifiedCount: number;
  filesModifiedCount: number;
  syncModifiedCount: number;
  accountModifiedCount: number;
  behaviorModifiedCount: number;
  notificationsModifiedCount: number;
}
