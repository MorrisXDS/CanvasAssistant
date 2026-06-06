/**
 * Layer 5 - Presentation (Zustand Store)
 *
 * Manages global application state in the renderer process.
 * Communicates with main process via IPC for all data operations.
 *
 * Features:
 * - Reactive state management with Zustand
 * - Real-time updates via IPC push events
 * - View model computations for UI
 * - Selectors for optimized re-renders
 */

// Core types
export type {
  Course,
  Task,
  Notification,
  SimulatedGrade,
  SimulationState,
  SystemState,
  HealthStatus,
  SyncStatus,
  PriorityItem,
  CourseSummary,
  StoreState,
  StoreActions,
  Store,
  IpcApi,
  SimulationChangeEvent,
  DbCommitEvent,
} from './types';

// Store
export {
  useStore,
  subscribeToIpcEvents,
  selectors,
  selectSyncDisabled,
  selectSyncDisabledReason,
  getCurrentTermIds,
} from './store';

// View models
export {
  DashboardViewModel,
  DashboardStats,
  computeDashboardViewModel,
  useDashboardViewModel,
  CourseDetailViewModel,
  TaskViewModel,
  GradeBreakdown,
  computeCourseDetailViewModel,
  useCourseDetailViewModel,
} from './viewModels';

// Settings
export {
  // Keys
  STORAGE_KEYS,
  // Types
  type StorageKey,
  type SyncPreferences,
  type AppearanceSettings,
  type NotificationSettings,
  type AcademicSettings,
  type FileExplorerSettings,
  type CourseSettings,
  type CalendarSettings,
  type ContentSettings,
  type SettingsTypeMap,
  // Defaults
  DEFAULT_SYNC_PREFERENCES,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
  DEFAULT_DASHBOARD_ORDER,
  DEFAULT_NAV_ORDER,
  // Manager
  SettingsManager,
  settingsManager,
  // Hooks
  useSetting,
  useSettingUpdate,
  useTheme,
  useSidebarState,
  useNavOrder,
  useDashboardOrder,
  useLandingPage,
  useSettingsManager,
} from './settings';
