/**
 * Settings Module - Centralized application settings
 *
 * Re-exports all settings-related functionality:
 * - STORAGE_KEYS - Single source of truth for localStorage keys
 * - SettingsManager - Singleton for setting operations
 * - React hooks - For component access to settings
 * - Types and defaults - For type safety
 */

// Schema exports (keys, types, defaults)
export {
  STORAGE_KEYS,
  // Link behavior constants
  LINK_BEHAVIOR,
  type LinkBehavior,
  // Zod schemas
  SyncPreferencesSchema,
  AppearanceSettingsSchema,
  NotificationSettingsSchema,
  AcademicSettingsSchema,
  FileExplorerSettingsSchema,
  CourseSettingsSchema,
  CalendarSettingsSchema,
  ContentSettingsSchema,
  AIConfigSchema,
  WindowBehaviorSettingsSchema,
  DashboardSettingsSchema,
  SettingsPageSettingsSchema,
  LocalHtmlPathsSettingsSchema,
  ImportantWorksFilterSchema,
  TimezoneSettingsSchema,
  SyncUpdatesFabSettingsSchema,
  // TypeScript types
  type StorageKey,
  type SyncPreferences,
  type AppearanceSettings,
  type NotificationSettings,
  type AcademicSettings,
  type FileExplorerSettings,
  type CourseSettings,
  type CalendarSettings,
  type ContentSettings,
  type AIConfig,
  type WindowBehaviorSettings,
  type DashboardSettings,
  type SettingsPageSettings,
  type LocalHtmlPathsSettings,
  type TimezoneSettings,
  type SyncUpdatesFabSettings,
  type SettingsValue,
  type SettingsTypeMap,
  type ImportantWorksFilter,
  // Default values
  DEFAULT_SYNC_PREFERENCES,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
  DEFAULT_AI_CONFIG,
  DEFAULT_WINDOW_BEHAVIOR_SETTINGS,
  DEFAULT_DASHBOARD_SETTINGS,
  DEFAULT_SETTINGS_PAGE_SETTINGS,
  DEFAULT_LOCAL_HTML_PATHS_SETTINGS,
  DEFAULT_TIMEZONE_SETTINGS,
  DEFAULT_SYNC_UPDATES_FAB_SETTINGS,
  DEFAULT_SETTINGS_SECTION_ORDER,
  DEFAULT_DASHBOARD_ORDER,
  DEFAULT_NAV_ORDER,
  DEFAULT_IMPORTANT_WORKS_FILTER,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMAS,
  // Settings metadata for UI
  SETTINGS_METADATA,
  SETTINGS_CATEGORIES,
  getSettingsByCategory,
  searchSettings,
  type SettingsCategory,
  type SettingComponentType,
  type SettingMetadata,
} from './settingsSchema';

// Manager exports
export {
  SettingsManager,
  settingsManager,
  type SettingChangeEvent,
  type SettingChangeCallback,
} from './SettingsManager';

// Hook exports
export {
  useSetting,
  useSettingUpdate,
  useTheme,
  useSidebarState,
  useNavOrder,
  useDashboardOrder,
  useLandingPage,
  useSettingsManager,
  useTimezone,
  getEffectiveTimezone,
  // Timezone utilities for date handling
  getTimeInEffectiveTimezone,
  getHourInEffectiveTimezone,
  getMinuteOffsetInEffectiveTimezone,
  formatTimeInEffectiveTimezone,
  type Theme,
  type EffectiveTheme,
} from './useSettings';
