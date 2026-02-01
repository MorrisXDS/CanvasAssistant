/**
 * Settings Schema - Single source of truth for application settings
 *
 * This module centralizes all localStorage keys, TypeScript interfaces,
 * Zod validation schemas, and default values for the application settings.
 *
 * NOTE: Settings metadata (UI display, search, categories) has been extracted
 * to settingsMetadata.ts and is re-exported here for backward compatibility.
 */

import { z } from 'zod';

// Re-export settings metadata from extracted module
export {
  SETTINGS_METADATA,
  SETTINGS_CATEGORIES,
  getSettingsByCategory,
  searchSettings,
  type SettingsCategory,
  type SettingMetadata,
  type SettingComponentType,
} from './settingsMetadata';

// =============================================================================
// STORAGE KEYS - Single source of truth for localStorage key names
// =============================================================================

export const STORAGE_KEYS = {
  // User preferences
  SYNC_PREFS: 'syncPreferences',
  APPEARANCE: 'appearanceSettings',
  NOTIFICATIONS: 'notificationSettings',
  ACADEMIC: 'academicSettings',
  FILE_EXPLORER: 'fileExplorerSettings',
  COURSES: 'courseSettings',
  CALENDAR: 'calendarSettings',
  CONTENT: 'contentSettings',
  WINDOW_BEHAVIOR: 'windowBehavior',

  // Canvas connection
  CANVAS_URL: 'canvasUrl',

  // Navigation
  LANDING_PAGE: 'landingPage',
  SIDEBAR_COLLAPSED: 'sidebarCollapsed',
  NAV_ORDER: 'navItemOrder',

  // Dashboard layout
  DASHBOARD_SECTION_ORDER: 'dashboardSectionOrder',
  DASHBOARD_COLLAPSED_SECTIONS: 'dashboardCollapsedSections',

  // Calendar view
  CALENDAR_VIEW_MODE: 'calendarViewMode',
  CALENDAR_FILTER_TAGS: 'calendarFilterTags',

  // Course page settings (#12)
  PINNED_COURSES: 'pinnedCourses',
  COURSES_VIEW_MODE: 'coursesViewMode',
  SHOW_HIDDEN_COURSES: 'showHiddenCourses',
  COURSE_SORT_BY: 'courseSortBy',

  // Course detail page
  COURSE_DETAIL_SECTION_ORDER: 'courseDetailSectionOrder',
  COURSE_DETAIL_COLLAPSED_SECTIONS: 'courseDetailCollapsedSections',
  TASK_GROUP_ORDER_PREFIX: 'taskGroupOrder:', // + courseId

  // Files page settings
  FILES_VIEW_MODE: 'filesViewMode',
  FILES_COLLAPSED_COURSES: 'filesCollapsedCourses',
  FILES_COLLAPSED_FOLDERS: 'filesCollapsedFolders',
  FILES_SORT_KEY: 'filesSortKey',
  FILES_SORT_ORDER: 'filesSortOrder',
  FILES_SELECTED_COURSE: 'filesSelectedCourse',
  FILES_FILTER_MODE: 'filesFilterMode',
  FILES_DEFAULT_STATE: 'filesDefaultState',

  // Settings page
  SETTINGS_SECTION_ORDER: 'settingsSectionOrder',
  SETTINGS_DEFAULT_STATE: 'settingsDefaultState',
  SETTINGS_OPEN_SECTIONS: 'settingsOpenSections',
  SETTINGS_DOCK_AUTO_HIDE: 'settingsDockAutoHide',

  // Announcement settings
  ANNOUNCEMENT_SORT_ORDER: 'announcementSortOrder',

  // Onboarding
  ONBOARDING_COMPLETED: 'onboardingCompleted',

  // AI/Intelligence settings
  AI_CONFIG: 'aiConfig',

  // Dashboard settings
  DASHBOARD: 'dashboardSettings',

  // HTML local paths settings
  LOCAL_HTML_PATHS: 'localHtmlPathsSettings',

  // Export/backup settings
  EXPORT_SCHEDULE: 'exportSchedule',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// =============================================================================
// ZOD SCHEMAS - Validation schemas for settings objects
// =============================================================================

/**
 * Sync Preferences Schema
 *
 * Settings that affect sync behavior are read from user_preferences table
 * in the main process. Changes to these settings are applied on next sync.
 *
 * SYNC-AFFECTING SETTINGS:
 * - autoSyncEnabled: Controls auto-sync timer (immediate effect via IPC)
 * - autoSyncInterval: Controls auto-sync frequency (immediate effect via IPC)
 * - syncFiles: Whether to sync Canvas files and folders
 * - syncAnnouncements: Whether to sync course announcements
 * - autoAssignDueDate: Auto-fill due dates for assignments without one
 * - saveHtmlContent: Enable HTML content download for offline viewing
 * - htmlUrlRewriting: 'local' rewrites URLs to local paths, 'original' keeps Canvas URLs
 * - downloadImages: Download images embedded in HTML content
 * - downloadLinkedFiles: Download files linked in HTML content
 */
export const SyncPreferencesSchema = z.object({
  autoSyncEnabled: z.boolean(),
  autoSyncInterval: z.number().min(5).max(120),
  syncFiles: z.boolean(),
  syncAnnouncements: z.boolean(),
  autoAssignDueDate: z.boolean(),
  saveHtmlContent: z.boolean(),
  htmlUrlRewriting: z.enum(['local', 'original']),
  downloadImages: z.boolean(),
  downloadLinkedFiles: z.boolean(),
});

export const AppearanceSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  sidebarCollapsed: z.boolean(),
});

export const NotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  priorityAlerts: z.boolean(),
  syncStatus: z.boolean(),
  dueDateReminders: z.boolean(),
  gradeAlerts: z.boolean(),
  workloadPredictions: z.boolean(),
  riskWarnings: z.boolean(),
  quietWhenUnplugged: z.boolean(),
  quietWhenFullscreen: z.boolean(),
  quietWhenBusy: z.boolean(),
});

export const AcademicSettingsSchema = z.object({
  defaultTargetGrade: z.number().min(0).max(100),
  termSelection: z.union([z.literal('auto'), z.literal('all'), z.string()]),
});

export const FileExplorerSettingsSchema = z.object({
  defaultState: z.enum(['collapsed', 'expanded', 'remember']),
  defaultViewMode: z.enum(['list', 'grid']),
  downloadLocation: z.string().nullable(),
  skipExternalLinkWarning: z.boolean(),
});

export const CourseSettingsSchema = z.object({
  defaultViewMode: z.enum(['grid', 'list']),
  showHiddenByDefault: z.boolean(),
});

export const CalendarSettingsSchema = z.object({
  defaultViewMode: z.enum(['month', 'week']),
});

// Link behavior values
export const LINK_BEHAVIOR = {
  ALWAYS_EXTERNAL: 'always-external',
  PREFER_LOCAL: 'prefer-local',
} as const;

export type LinkBehavior = (typeof LINK_BEHAVIOR)[keyof typeof LINK_BEHAVIOR];

export const ContentSettingsSchema = z.object({
  linkBehavior: z.enum([LINK_BEHAVIOR.ALWAYS_EXTERNAL, LINK_BEHAVIOR.PREFER_LOCAL]),
});

export const AIConfigSchema = z.object({
  // Local ML (Transformers.js) settings
  enableLocalML: z.boolean(),

  // LLM provider settings
  provider: z.enum(['none', 'ollama', 'openai', 'anthropic']),
  ollamaUrl: z.string(),
  ollamaModel: z.string(),
  openaiModel: z.string(),
  anthropicModel: z.string(),
  // API keys are stored in keychain, not localStorage - these are just flags
  hasOpenAIKey: z.boolean(),
  hasAnthropicKey: z.boolean(),

  // Content analysis settings
  autoAnalyzeContent: z.boolean(),
  generateEmbeddings: z.boolean(),
});

export const WindowBehaviorSettingsSchema = z.object({
  // What happens when close button is clicked
  // null = not yet chosen (show dialog on first close)
  closeAction: z.enum(['quit', 'minimize-to-tray']).nullable(),
  // Whether to show the tray icon (always true when minimize-to-tray is selected)
  showTrayIcon: z.boolean(),
});

// =============================================================================
// IMPORTANT WORKS FILTER - Task type filtering for dashboard
// =============================================================================

/**
 * Filter configuration for Important Works section
 * Uses dynamic task types from actual coursework data
 */
export const ImportantWorksFilterSchema = z.object({
  // Global minimum weight threshold (used when perTypeEnabled is false)
  globalThreshold: z.number().min(0).max(100),

  // Which task types to show (dynamic, based on actual task types in data)
  enabledTypes: z.array(z.string()),

  // Whether to use per-type thresholds
  perTypeEnabled: z.boolean(),

  // Per-type thresholds (only used when perTypeEnabled is true)
  perTypeThresholds: z.record(z.string(), z.number().min(0).max(100)),
});

export type ImportantWorksFilter = z.infer<typeof ImportantWorksFilterSchema>;

export const DashboardSettingsSchema = z.object({
  // Threshold for showing tasks in "Important Works" section (percentage)
  // Kept for backward compatibility, use importantWorksFilter.globalThreshold instead
  importantWorksThreshold: z.number().min(0).max(100),
  // Whether to sort tasks by priority score (false = sort by due date only)
  prioritySortingEnabled: z.boolean(),
  // Advanced filter configuration for Important Works
  importantWorksFilter: ImportantWorksFilterSchema.optional(),
});

export const LocalHtmlPathsSettingsSchema = z.object({
  // Master toggle for local HTML paths feature (disabled by default)
  enabled: z.boolean(),
  // Auto-regenerate HTMLs when dependencies change
  autoRegenerate: z.boolean(),
  // Prompt user when downloading HTML with missing dependencies
  promptForMissing: z.boolean(),
});

export const ExportScheduleSchema = z.object({
  // Whether scheduled backups are enabled (default: false)
  enabled: z.boolean(),
  // Backup frequency
  frequency: z.enum(['never', 'daily', 'weekly', 'monthly']),
  // Time of day for backup (24h format, e.g., "03:00")
  time: z.string().optional(),
  // Day of week for weekly backups (0=Sunday, 6=Saturday)
  dayOfWeek: z.number().min(0).max(6).optional(),
  // Day of month for monthly backups (1-28)
  dayOfMonth: z.number().min(1).max(28).optional(),
  // Backup destination ('default' uses app data directory)
  destination: z.string(),
  // Maximum number of backups to keep (rotation)
  maxBackups: z.number().min(1).max(100),
  // Whether to encrypt backups with password
  encrypt: z.boolean(),
  // Timestamp of last successful backup
  lastRun: z.string().optional(),
  // Timestamp of next scheduled backup
  nextRun: z.string().optional(),
});

export const SettingsPageSettingsSchema = z.object({
  // How settings sections appear when opening (collapsed, expanded, or remember last state)
  defaultState: z.enum(['collapsed', 'expanded', 'remember']),
});

// =============================================================================
// TYPESCRIPT TYPES - Inferred from Zod schemas
// =============================================================================

export type SyncPreferences = z.infer<typeof SyncPreferencesSchema>;
export type AppearanceSettings = z.infer<typeof AppearanceSettingsSchema>;
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export type AcademicSettings = z.infer<typeof AcademicSettingsSchema>;
export type FileExplorerSettings = z.infer<typeof FileExplorerSettingsSchema>;
export type CourseSettings = z.infer<typeof CourseSettingsSchema>;
export type CalendarSettings = z.infer<typeof CalendarSettingsSchema>;
export type ContentSettings = z.infer<typeof ContentSettingsSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type WindowBehaviorSettings = z.infer<typeof WindowBehaviorSettingsSchema>;
export type DashboardSettings = z.infer<typeof DashboardSettingsSchema>;
export type LocalHtmlPathsSettings = z.infer<typeof LocalHtmlPathsSettingsSchema>;
export type ExportSchedule = z.infer<typeof ExportScheduleSchema>;
export type SettingsPageSettings = z.infer<typeof SettingsPageSettingsSchema>;

// Union type for all settings objects
export type SettingsValue =
  | SyncPreferences
  | AppearanceSettings
  | NotificationSettings
  | AcademicSettings
  | FileExplorerSettings
  | CourseSettings
  | CalendarSettings
  | ContentSettings
  | AIConfig
  | WindowBehaviorSettings
  | DashboardSettings
  | LocalHtmlPathsSettings
  | ExportSchedule
  | SettingsPageSettings
  | string
  | boolean
  | string[];

// =============================================================================
// DEFAULT VALUES - Sensible defaults for all settings
// =============================================================================

export const DEFAULT_SYNC_PREFERENCES: SyncPreferences = {
  autoSyncEnabled: true,
  autoSyncInterval: 30,
  syncFiles: true,
  syncAnnouncements: true,
  autoAssignDueDate: false,
  saveHtmlContent: true,
  htmlUrlRewriting: 'original',
  downloadImages: true,
  downloadLinkedFiles: false,
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  theme: 'system',
  sidebarCollapsed: false,
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  priorityAlerts: true,
  syncStatus: true,
  dueDateReminders: true,
  gradeAlerts: true,
  workloadPredictions: true,
  riskWarnings: true,
  quietWhenUnplugged: false,
  quietWhenFullscreen: true,
  quietWhenBusy: false,
};

export const DEFAULT_ACADEMIC_SETTINGS: AcademicSettings = {
  defaultTargetGrade: 85,
  termSelection: 'auto',
};

export const DEFAULT_FILE_EXPLORER_SETTINGS: FileExplorerSettings = {
  defaultState: 'remember',
  defaultViewMode: 'list',
  // null = use system default ({USER_DOWNLOADS}/CanvasAssistant)
  downloadLocation: null,
  skipExternalLinkWarning: false,
};

export const DEFAULT_COURSE_SETTINGS: CourseSettings = {
  defaultViewMode: 'grid',
  showHiddenByDefault: false,
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  defaultViewMode: 'month',
};

export const DEFAULT_CONTENT_SETTINGS: ContentSettings = {
  linkBehavior: 'always-external',
};

export const DEFAULT_AI_CONFIG: AIConfig = {
  // Local ML disabled by default (needs optional dependency)
  enableLocalML: false,

  // No LLM provider by default
  provider: 'none',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  openaiModel: 'gpt-4o-mini',
  anthropicModel: 'claude-3-haiku-20240307',
  hasOpenAIKey: false,
  hasAnthropicKey: false,

  // Content analysis features
  autoAnalyzeContent: true, // Auto-analyze syllabus/course pages
  generateEmbeddings: false, // Disabled by default (requires local ML)
};

export const DEFAULT_WINDOW_BEHAVIOR_SETTINGS: WindowBehaviorSettings = {
  closeAction: null, // null = not yet chosen, will prompt on first close
  showTrayIcon: true,
};

/**
 * Default filter for Important Works section
 * All task types enabled by default
 */
export const DEFAULT_IMPORTANT_WORKS_FILTER: ImportantWorksFilter = {
  globalThreshold: 10,
  enabledTypes: [
    'assignment',
    'problem_set',
    'quiz',
    'homework',
    'lab',
    'essay',
    'attendance',
    'participation',
    'project',
    'midterm',
    'termtest',
    'final_exam',
    'tutorial',
    'lab_report',
    'reading_response',
    'discussion',
    'reading',
    'external',
    'info',
  ],
  perTypeEnabled: false,
  perTypeThresholds: {},
};

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  importantWorksThreshold: 10, // 10% default (legacy, use importantWorksFilter instead)
  prioritySortingEnabled: false, // Default to simple due date sorting
  importantWorksFilter: DEFAULT_IMPORTANT_WORKS_FILTER,
};

export const DEFAULT_LOCAL_HTML_PATHS_SETTINGS: LocalHtmlPathsSettings = {
  enabled: false, // Disabled by default
  autoRegenerate: true, // Auto-regenerate when files change
  promptForMissing: true, // Prompt when downloading HTML with missing deps
};

export const DEFAULT_EXPORT_SCHEDULE: ExportSchedule = {
  enabled: false, // Disabled by default - manual exports only
  frequency: 'never',
  destination: 'default', // Uses app data directory
  maxBackups: 5, // Keep 5 most recent backups
  encrypt: false,
};

export const DEFAULT_SETTINGS_PAGE_SETTINGS: SettingsPageSettings = {
  defaultState: 'expanded', // All sections expanded by default
};

// Dashboard section order
export const DEFAULT_DASHBOARD_ORDER = [
  'priority',
  'notifications',
  'schedule',
  'importantWorks',
];

// Nav item order (default sidebar navigation)
export const DEFAULT_NAV_ORDER = ['/', '/calendar', '/tasks', '/courses', '/files'];

// =============================================================================
// SETTINGS TYPE MAP - Maps storage keys to their types and defaults
// =============================================================================

export interface SettingsTypeMap {
  [STORAGE_KEYS.SYNC_PREFS]: SyncPreferences;
  [STORAGE_KEYS.APPEARANCE]: AppearanceSettings;
  [STORAGE_KEYS.NOTIFICATIONS]: NotificationSettings;
  [STORAGE_KEYS.ACADEMIC]: AcademicSettings;
  [STORAGE_KEYS.FILE_EXPLORER]: FileExplorerSettings;
  [STORAGE_KEYS.COURSES]: CourseSettings;
  [STORAGE_KEYS.CALENDAR]: CalendarSettings;
  [STORAGE_KEYS.CONTENT]: ContentSettings;
  [STORAGE_KEYS.AI_CONFIG]: AIConfig;
  [STORAGE_KEYS.WINDOW_BEHAVIOR]: WindowBehaviorSettings;
  [STORAGE_KEYS.DASHBOARD]: DashboardSettings;
  [STORAGE_KEYS.LOCAL_HTML_PATHS]: LocalHtmlPathsSettings;
  [STORAGE_KEYS.EXPORT_SCHEDULE]: ExportSchedule;
  [STORAGE_KEYS.CANVAS_URL]: string;
  [STORAGE_KEYS.LANDING_PAGE]: string;
  [STORAGE_KEYS.SIDEBAR_COLLAPSED]: boolean;
  [STORAGE_KEYS.NAV_ORDER]: string[];
  [STORAGE_KEYS.DASHBOARD_SECTION_ORDER]: string[];
  [STORAGE_KEYS.CALENDAR_VIEW_MODE]: 'month' | 'week';
  // New keys added in #12
  [STORAGE_KEYS.DASHBOARD_COLLAPSED_SECTIONS]: string[];
  [STORAGE_KEYS.CALENDAR_FILTER_TAGS]: string[];
  [STORAGE_KEYS.PINNED_COURSES]: number[];
  [STORAGE_KEYS.COURSES_VIEW_MODE]: 'grid' | 'list';
  [STORAGE_KEYS.SHOW_HIDDEN_COURSES]: boolean;
  [STORAGE_KEYS.COURSE_SORT_BY]: string;
  [STORAGE_KEYS.COURSE_DETAIL_SECTION_ORDER]: string[];
  [STORAGE_KEYS.COURSE_DETAIL_COLLAPSED_SECTIONS]: string[];
  [STORAGE_KEYS.TASK_GROUP_ORDER_PREFIX]: string; // Prefix for dynamic keys
  [STORAGE_KEYS.FILES_VIEW_MODE]: 'list' | 'grid';
  [STORAGE_KEYS.FILES_COLLAPSED_COURSES]: number[];
  [STORAGE_KEYS.FILES_COLLAPSED_FOLDERS]: string[];
  [STORAGE_KEYS.FILES_SORT_KEY]: string;
  [STORAGE_KEYS.FILES_SORT_ORDER]: 'asc' | 'desc';
  [STORAGE_KEYS.FILES_SELECTED_COURSE]: number | null;
  [STORAGE_KEYS.FILES_FILTER_MODE]: string;
  [STORAGE_KEYS.FILES_DEFAULT_STATE]: 'remember' | 'expanded' | 'collapsed';
  [STORAGE_KEYS.SETTINGS_SECTION_ORDER]: string[];
  [STORAGE_KEYS.SETTINGS_DEFAULT_STATE]: 'collapsed' | 'expanded' | 'remember';
  [STORAGE_KEYS.SETTINGS_OPEN_SECTIONS]: string[];
  [STORAGE_KEYS.SETTINGS_DOCK_AUTO_HIDE]: boolean;
  [STORAGE_KEYS.ANNOUNCEMENT_SORT_ORDER]: 'asc' | 'desc';
  [STORAGE_KEYS.ONBOARDING_COMPLETED]: boolean;
}

// Default order for settings sections
export const DEFAULT_SETTINGS_SECTION_ORDER = [
  'account',
  'display',
  'academic',
  'notifications',
  'data',
];

export const SETTINGS_DEFAULTS: Partial<SettingsTypeMap> = {
  [STORAGE_KEYS.SYNC_PREFS]: DEFAULT_SYNC_PREFERENCES,
  [STORAGE_KEYS.APPEARANCE]: DEFAULT_APPEARANCE_SETTINGS,
  [STORAGE_KEYS.NOTIFICATIONS]: DEFAULT_NOTIFICATION_SETTINGS,
  [STORAGE_KEYS.ACADEMIC]: DEFAULT_ACADEMIC_SETTINGS,
  [STORAGE_KEYS.FILE_EXPLORER]: DEFAULT_FILE_EXPLORER_SETTINGS,
  [STORAGE_KEYS.COURSES]: DEFAULT_COURSE_SETTINGS,
  [STORAGE_KEYS.CALENDAR]: DEFAULT_CALENDAR_SETTINGS,
  [STORAGE_KEYS.CONTENT]: DEFAULT_CONTENT_SETTINGS,
  [STORAGE_KEYS.AI_CONFIG]: DEFAULT_AI_CONFIG,
  [STORAGE_KEYS.WINDOW_BEHAVIOR]: DEFAULT_WINDOW_BEHAVIOR_SETTINGS,
  [STORAGE_KEYS.DASHBOARD]: DEFAULT_DASHBOARD_SETTINGS,
  [STORAGE_KEYS.LOCAL_HTML_PATHS]: DEFAULT_LOCAL_HTML_PATHS_SETTINGS,
  [STORAGE_KEYS.EXPORT_SCHEDULE]: DEFAULT_EXPORT_SCHEDULE,
  [STORAGE_KEYS.CANVAS_URL]: '',
  [STORAGE_KEYS.LANDING_PAGE]: '/',
  [STORAGE_KEYS.SIDEBAR_COLLAPSED]: false,
  [STORAGE_KEYS.NAV_ORDER]: DEFAULT_NAV_ORDER,
  [STORAGE_KEYS.DASHBOARD_SECTION_ORDER]: DEFAULT_DASHBOARD_ORDER,
  [STORAGE_KEYS.CALENDAR_VIEW_MODE]: 'month',
  [STORAGE_KEYS.FILES_DEFAULT_STATE]: 'remember',
  [STORAGE_KEYS.SETTINGS_SECTION_ORDER]: DEFAULT_SETTINGS_SECTION_ORDER,
};

// Schema map for validation
export const SETTINGS_SCHEMAS: Partial<Record<string, z.ZodType>> = {
  [STORAGE_KEYS.SYNC_PREFS]: SyncPreferencesSchema,
  [STORAGE_KEYS.APPEARANCE]: AppearanceSettingsSchema,
  [STORAGE_KEYS.NOTIFICATIONS]: NotificationSettingsSchema,
  [STORAGE_KEYS.ACADEMIC]: AcademicSettingsSchema,
  [STORAGE_KEYS.FILE_EXPLORER]: FileExplorerSettingsSchema,
  [STORAGE_KEYS.COURSES]: CourseSettingsSchema,
  [STORAGE_KEYS.CALENDAR]: CalendarSettingsSchema,
  [STORAGE_KEYS.CONTENT]: ContentSettingsSchema,
  [STORAGE_KEYS.AI_CONFIG]: AIConfigSchema,
  [STORAGE_KEYS.WINDOW_BEHAVIOR]: WindowBehaviorSettingsSchema,
  [STORAGE_KEYS.DASHBOARD]: DashboardSettingsSchema,
  [STORAGE_KEYS.LOCAL_HTML_PATHS]: LocalHtmlPathsSettingsSchema,
  [STORAGE_KEYS.EXPORT_SCHEDULE]: ExportScheduleSchema,
};

// Settings metadata (SETTINGS_METADATA, SETTINGS_CATEGORIES, getSettingsByCategory,
// searchSettings, SettingsCategory, SettingMetadata, SettingComponentType) is now
// imported from ./settingsMetadata.ts and re-exported at the top of this file.
