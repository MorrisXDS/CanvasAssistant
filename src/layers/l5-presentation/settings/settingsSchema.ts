/**
 * Settings Schema - Single source of truth for application settings
 *
 * This module centralizes all localStorage keys, TypeScript interfaces,
 * Zod validation schemas, and default values for the application settings.
 */

import { z } from 'zod';

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

  // Announcement settings
  ANNOUNCEMENT_SORT_ORDER: 'announcementSortOrder',

  // Onboarding
  ONBOARDING_COMPLETED: 'onboardingCompleted',

  // AI/Intelligence settings
  AI_CONFIG: 'aiConfig',

  // Dashboard settings
  DASHBOARD: 'dashboardSettings',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

// =============================================================================
// ZOD SCHEMAS - Validation schemas for settings objects
// =============================================================================

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
});

export const CourseSettingsSchema = z.object({
  defaultViewMode: z.enum(['grid', 'list']),
  showHiddenByDefault: z.boolean(),
});

export const CalendarSettingsSchema = z.object({
  defaultViewMode: z.enum(['month', 'week']),
});

export const ContentSettingsSchema = z.object({
  linkBehavior: z.enum(['always-external', 'prefer-local']),
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

export const DashboardSettingsSchema = z.object({
  // Threshold for showing tasks in "Important Works" section (percentage)
  importantWorksThreshold: z.number().min(0).max(100),
  // Whether to sort tasks by priority score (false = sort by due date only)
  prioritySortingEnabled: z.boolean(),
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

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  importantWorksThreshold: 10, // 10% default
  prioritySortingEnabled: false, // Default to simple due date sorting
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
  [STORAGE_KEYS.ANNOUNCEMENT_SORT_ORDER]: 'asc' | 'desc';
  [STORAGE_KEYS.ONBOARDING_COMPLETED]: boolean;
}

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
  [STORAGE_KEYS.CANVAS_URL]: '',
  [STORAGE_KEYS.LANDING_PAGE]: '/',
  [STORAGE_KEYS.SIDEBAR_COLLAPSED]: false,
  [STORAGE_KEYS.NAV_ORDER]: DEFAULT_NAV_ORDER,
  [STORAGE_KEYS.DASHBOARD_SECTION_ORDER]: DEFAULT_DASHBOARD_ORDER,
  [STORAGE_KEYS.CALENDAR_VIEW_MODE]: 'month',
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
};

// =============================================================================
// SETTINGS METADATA - For UI display and search
// =============================================================================

export type SettingsCategory = 'account' | 'display' | 'academic' | 'notifications';

export type SettingComponentType =
  | 'toggle'
  | 'select'
  | 'input'
  | 'slider'
  | 'button-group'
  | 'custom';

export interface SettingMetadata {
  /** The setting key (for nested settings, use dot notation like 'syncPrefs.autoSyncEnabled') */
  key: string;
  /** Display label */
  label: string;
  /** Description for UI display and search */
  description: string;
  /** Category for grouping */
  category: SettingsCategory;
  /** Component type for rendering */
  component: SettingComponentType;
  /** Search keywords (additional terms to match) */
  keywords?: string[];
}

/**
 * Metadata for all settings exposed in the Settings UI.
 * Used for:
 * - Grouping settings by category
 * - Search functionality
 * - Tooltips and help text
 */
export const SETTINGS_METADATA: SettingMetadata[] = [
  // =================================
  // ACCOUNT & CONNECTION
  // =================================
  {
    key: 'canvasUrl',
    label: 'Canvas URL',
    description: "Your institution's Canvas LMS URL",
    category: 'account',
    component: 'input',
    keywords: ['institution', 'instructure', 'connection', 'api'],
  },
  {
    key: 'canvasToken',
    label: 'Canvas API Token',
    description: 'Access token for Canvas API authentication',
    category: 'account',
    component: 'custom',
    keywords: ['api', 'key', 'authentication', 'credentials'],
  },
  {
    key: 'syncPrefs.autoSyncEnabled',
    label: 'Auto-sync',
    description: 'Automatically sync data from Canvas in the background',
    category: 'account',
    component: 'toggle',
    keywords: ['automatic', 'background', 'refresh'],
  },
  {
    key: 'syncPrefs.autoSyncInterval',
    label: 'Sync interval',
    description: 'How often to automatically sync data from Canvas',
    category: 'account',
    component: 'select',
    keywords: ['frequency', 'minutes', 'schedule'],
  },
  {
    key: 'syncPrefs.syncFiles',
    label: 'Sync files',
    description: 'Include course files and folders in sync',
    category: 'account',
    component: 'toggle',
    keywords: ['documents', 'downloads', 'attachments'],
  },
  {
    key: 'syncPrefs.syncAnnouncements',
    label: 'Sync announcements',
    description: 'Include course announcements in sync',
    category: 'account',
    component: 'toggle',
    keywords: ['news', 'updates', 'messages'],
  },
  {
    key: 'windowBehavior.closeAction',
    label: 'Close button behavior',
    description: 'What happens when you click the close button',
    category: 'account',
    component: 'select',
    keywords: ['quit', 'minimize', 'tray', 'exit'],
  },

  // =================================
  // DISPLAY & LAYOUT
  // =================================
  {
    key: 'appearance.theme',
    label: 'Theme',
    description: 'Application color theme',
    category: 'display',
    component: 'button-group',
    keywords: ['dark', 'light', 'mode', 'color'],
  },
  {
    key: 'appearance.sidebarCollapsed',
    label: 'Sidebar collapsed',
    description: 'Start with sidebar collapsed on launch',
    category: 'display',
    component: 'toggle',
    keywords: ['navigation', 'narrow', 'compact'],
  },
  {
    key: 'landingPage',
    label: 'Landing page',
    description: 'The page shown when the app launches',
    category: 'display',
    component: 'button-group',
    keywords: ['home', 'startup', 'default'],
  },
  {
    key: 'dashboard.prioritySortingEnabled',
    label: 'Priority sorting',
    description: 'Sort tasks by urgency and priority score instead of due date only',
    category: 'display',
    component: 'toggle',
    keywords: ['order', 'ranking', 'importance'],
  },
  {
    key: 'dashboard.importantWorksThreshold',
    label: 'Important works threshold',
    description: 'Show tasks with grade weight above this percentage in Important Works',
    category: 'display',
    component: 'slider',
    keywords: ['weight', 'percent', 'significant'],
  },
  {
    key: 'courses.defaultViewMode',
    label: 'Courses view',
    description: 'Default view mode for the courses page',
    category: 'display',
    component: 'button-group',
    keywords: ['grid', 'list', 'layout'],
  },
  {
    key: 'calendar.defaultViewMode',
    label: 'Calendar view',
    description: 'Default view mode when opening the calendar',
    category: 'display',
    component: 'button-group',
    keywords: ['month', 'week', 'schedule'],
  },
  {
    key: 'fileExplorer.defaultViewMode',
    label: 'Files view',
    description: 'Default view mode for the files page',
    category: 'display',
    component: 'button-group',
    keywords: ['grid', 'list', 'layout'],
  },
  {
    key: 'fileExplorer.defaultState',
    label: 'Folder default state',
    description: 'How folders appear when opening the Files page',
    category: 'display',
    component: 'select',
    keywords: ['collapsed', 'expanded', 'remember'],
  },

  // =================================
  // ACADEMIC & COURSES
  // =================================
  {
    key: 'academic.defaultTargetGrade',
    label: 'Default target grade',
    description: 'Applied to new courses. Individual course targets can be overridden.',
    category: 'academic',
    component: 'slider',
    keywords: ['goal', 'percent', 'score'],
  },
  {
    key: 'academic.termSelection',
    label: 'Semester selection',
    description: "Which semester's courses to display",
    category: 'academic',
    component: 'select',
    keywords: ['term', 'quarter', 'year', 'filter'],
  },
  {
    key: 'courses.showHiddenByDefault',
    label: 'Show hidden courses',
    description: 'Display hidden courses in the courses list by default',
    category: 'academic',
    component: 'toggle',
    keywords: ['visibility', 'filter'],
  },
  {
    key: 'syncPrefs.autoAssignDueDate',
    label: 'Auto-fill due dates',
    description: 'Set today 23:59 as due date for coursework without one',
    category: 'academic',
    component: 'toggle',
    keywords: ['deadline', 'missing', 'guess'],
  },
  {
    key: 'content.linkBehavior',
    label: 'Link click behavior',
    description: 'How to handle clicks on links in announcements and course content',
    category: 'academic',
    component: 'select',
    keywords: ['external', 'browser', 'local'],
  },
  {
    key: 'fileExplorer.downloadLocation',
    label: 'Download location',
    description: 'Where downloaded files are stored on your computer',
    category: 'academic',
    component: 'custom',
    keywords: ['folder', 'path', 'directory'],
  },
  {
    key: 'syncPrefs.saveHtmlContent',
    label: 'Save HTML content',
    description:
      'Download pages, assignments, and announcements as HTML for offline viewing',
    category: 'academic',
    component: 'toggle',
    keywords: ['offline', 'download', 'local'],
  },

  // =================================
  // NOTIFICATIONS
  // =================================
  {
    key: 'notifications.enabled',
    label: 'Enable notifications',
    description: 'Show desktop notifications',
    category: 'notifications',
    component: 'toggle',
    keywords: ['alerts', 'desktop', 'popup'],
  },
  {
    key: 'notifications.priorityAlerts',
    label: 'Priority alerts',
    description: 'Intelligence flags high-priority or at-risk tasks',
    category: 'notifications',
    component: 'toggle',
    keywords: ['urgent', 'important', 'warning'],
  },
  {
    key: 'notifications.syncStatus',
    label: 'Sync status',
    description: 'Notify on sync success or failure',
    category: 'notifications',
    component: 'toggle',
    keywords: ['update', 'refresh', 'complete'],
  },
  {
    key: 'notifications.dueDateReminders',
    label: 'Due date reminders',
    description: 'Smart reminders before assignments are due',
    category: 'notifications',
    component: 'toggle',
    keywords: ['deadline', 'upcoming', 'alert'],
  },
  {
    key: 'notifications.gradeAlerts',
    label: 'Grade alerts',
    description: 'Notify when new grades are posted',
    category: 'notifications',
    component: 'toggle',
    keywords: ['score', 'marks', 'results'],
  },
  {
    key: 'notifications.workloadPredictions',
    label: 'Workload predictions',
    description: 'AI predicts busy periods and suggests planning',
    category: 'notifications',
    component: 'toggle',
    keywords: ['ai', 'intelligence', 'busy'],
  },
  {
    key: 'notifications.riskWarnings',
    label: 'Risk warnings',
    description: 'Alert when predicted time exceeds remaining time',
    category: 'notifications',
    component: 'toggle',
    keywords: ['danger', 'late', 'overdue'],
  },
  {
    key: 'notifications.quietWhenFullscreen',
    label: 'Quiet in fullscreen',
    description: 'Pause notifications during presentations or focus sessions',
    category: 'notifications',
    component: 'toggle',
    keywords: ['dnd', 'do not disturb', 'focus'],
  },
  {
    key: 'notifications.quietWhenUnplugged',
    label: 'Quiet on battery',
    description: 'Pause notifications when on battery power',
    category: 'notifications',
    component: 'toggle',
    keywords: ['power', 'laptop', 'save'],
  },
  {
    key: 'notifications.quietWhenBusy',
    label: 'Quiet when busy',
    description: 'Pause when inferred status is Busy or Exam',
    category: 'notifications',
    component: 'toggle',
    keywords: ['status', 'exam', 'studying'],
  },
];

/**
 * Get settings by category
 */
export function getSettingsByCategory(category: SettingsCategory): SettingMetadata[] {
  return SETTINGS_METADATA.filter((s) => s.category === category);
}

/**
 * Search settings by query (fuzzy match on label, description, and keywords)
 */
export function searchSettings(query: string): SettingMetadata[] {
  if (!query.trim()) return SETTINGS_METADATA;

  const normalizedQuery = query.toLowerCase().trim();
  const terms = normalizedQuery.split(/\s+/);

  return SETTINGS_METADATA.filter((setting) => {
    const searchableText = [
      setting.label,
      setting.description,
      ...(setting.keywords || []),
    ]
      .join(' ')
      .toLowerCase();

    // All terms must match somewhere in the searchable text
    return terms.every((term) => searchableText.includes(term));
  });
}

/**
 * Category display names and icons
 */
export const SETTINGS_CATEGORIES: Record<
  SettingsCategory,
  { label: string; description: string }
> = {
  account: {
    label: 'Account & Connection',
    description: 'Canvas connection, sync settings, and app behavior',
  },
  display: {
    label: 'Display & Layout',
    description: 'Theme, views, and dashboard customization',
  },
  academic: {
    label: 'Academic & Courses',
    description: 'Grades, terms, course visibility, and file management',
  },
  notifications: {
    label: 'Notifications',
    description: 'Alerts, reminders, and quiet mode settings',
  },
};
