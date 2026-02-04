/**
 * Settings Metadata - UI display and search metadata for settings
 *
 * Extracted from settingsSchema.ts for maintainability.
 * This module contains pure static data for the Settings UI.
 */

// =============================================================================
// SETTINGS METADATA TYPES
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

// =============================================================================
// SETTINGS METADATA - For UI display and search
// =============================================================================

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
    label: 'Collapsed sidebar',
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
  {
    key: 'settingsPage.defaultState',
    label: 'Settings default state',
    description: 'How settings sections appear when opening this page',
    category: 'display',
    component: 'select',
    keywords: ['collapsed', 'expanded', 'remember', 'accordion'],
  },
  {
    key: 'settingsDockAutoHide',
    label: 'Dock auto-hide',
    description: 'Hide the section navigation dock until mouse is near bottom',
    category: 'display',
    component: 'toggle',
    keywords: ['dock', 'navigation', 'hide', 'macOS'],
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
  {
    key: 'localHtmlPathsSettings.enabled',
    label: 'Offline HTML files',
    description:
      'Prompt to download missing images and linked files when opening HTML content',
    category: 'academic',
    component: 'toggle',
    keywords: ['offline', 'local', 'images', 'dependencies'],
  },
  {
    key: 'fileExplorer.skipExternalLinkWarning',
    label: 'Skip external link warning',
    description: 'Open external links from modules without showing a confirmation dialog',
    category: 'academic',
    component: 'toggle',
    keywords: ['external', 'url', 'link', 'warning', 'confirm', 'dialog'],
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

// =============================================================================
// SETTINGS CATEGORIES - Display names and descriptions
// =============================================================================

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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

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
