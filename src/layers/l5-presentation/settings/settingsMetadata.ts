/**
 * Settings Metadata - UI display and search metadata for settings
 *
 * Extracted from settingsSchema.ts for maintainability.
 * This module contains pure static data for the Settings UI.
 */

// =============================================================================
// SETTINGS METADATA TYPES
// =============================================================================

export type SettingsCategory =
  | 'display'
  | 'academic'
  | 'files'
  | 'sync'
  | 'account'
  | 'behavior'
  | 'notifications'
  | 'data'
  | 'updates';

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
    label: 'High-weight task threshold',
    description: 'Only show tasks worth more than this percentage of your grade',
    category: 'display',
    component: 'slider',
    keywords: ['weight', 'percent', 'significant', 'important', 'priority'],
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
    label: 'Settings dock auto-hide',
    description: 'Auto-hide the quick navigation bar at the bottom of settings',
    category: 'display',
    component: 'toggle',
    keywords: ['dock', 'navigation', 'hide', 'bar', 'bottom'],
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
    description: 'Set today at 11:59 PM as due date for coursework without one',
    category: 'academic',
    component: 'toggle',
    keywords: ['deadline', 'missing', 'guess'],
  },

  // =================================
  // FILES & CONTENT
  // =================================
  {
    key: 'fileExplorer.downloadLocation',
    label: 'Download location',
    description: 'Where downloaded files are stored on your computer',
    category: 'files',
    component: 'custom',
    keywords: ['folder', 'path', 'directory'],
  },
  {
    key: 'content.linkBehavior',
    label: 'Link click behavior',
    description: 'How to handle clicks on links in course content',
    category: 'files',
    component: 'select',
    keywords: ['external', 'browser', 'local'],
  },
  {
    key: 'localHtmlPathsSettings.enabled',
    label: 'Download for offline',
    description: 'Download linked images when viewing HTML content offline',
    category: 'files',
    component: 'toggle',
    keywords: ['offline', 'local', 'images', 'dependencies', 'html'],
  },
  {
    key: 'fileExplorer.skipExternalLinkWarning',
    label: 'Skip external link warning',
    description: 'Open external links from modules without showing a confirmation dialog',
    category: 'files',
    component: 'toggle',
    keywords: ['external', 'url', 'link', 'warning', 'confirm', 'dialog'],
  },

  // =================================
  // SYNC
  // =================================
  {
    key: 'syncPrefs.autoSyncInterval',
    label: 'Auto-sync interval',
    description: 'How often to automatically sync data from Canvas',
    category: 'sync',
    component: 'select',
    keywords: ['frequency', 'minutes', 'schedule', 'automatic', 'background'],
  },
  {
    key: 'syncPrefs.syncFiles',
    label: 'Sync files',
    description: 'Download course files and folders (uses more storage)',
    category: 'sync',
    component: 'toggle',
    keywords: ['documents', 'downloads', 'attachments'],
  },
  {
    key: 'syncPrefs.syncAnnouncements',
    label: 'Sync announcements',
    description: 'Include course announcements in sync',
    category: 'sync',
    component: 'toggle',
    keywords: ['news', 'updates', 'messages'],
  },

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

  // =================================
  // APP BEHAVIOR
  // =================================
  {
    key: 'windowBehavior.closeAction',
    label: 'Close button behavior',
    description: 'What happens when you click the close button',
    category: 'behavior',
    component: 'select',
    keywords: ['quit', 'minimize', 'tray', 'exit', 'window'],
  },
  {
    key: 'windowBehavior.resetSize',
    label: 'Reset window size',
    description: 'Restore the window to its default adaptive size and position',
    category: 'behavior',
    component: 'custom',
    keywords: ['window', 'size', 'position', 'reset', 'default', 'resize'],
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
    label: 'Sync notifications',
    description: 'Show notification when sync completes or fails',
    category: 'notifications',
    component: 'toggle',
    keywords: ['update', 'refresh', 'complete', 'status'],
  },
  {
    key: 'notifications.dueDateReminders',
    label: 'Due date reminders',
    description: 'Get notified before assignments are due',
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
    key: 'notifications.quietWhenUnplugged',
    label: 'On battery power',
    description: 'Pause notifications when running on battery power',
    category: 'notifications',
    component: 'toggle',
    keywords: ['power', 'laptop', 'save'],
  },

  // =================================
  // DATA & BACKUP
  // =================================
  {
    key: 'exportSchedule.enabled',
    label: 'Automatic backups',
    description: 'Automatically back up your database on a schedule',
    category: 'data',
    component: 'toggle',
    keywords: ['backup', 'scheduled', 'automatic', 'database', 'scheduled backups'],
  },
  {
    key: 'exportSchedule.frequency',
    label: 'Backup frequency',
    description: 'How often to create automatic backups',
    category: 'data',
    component: 'select',
    keywords: ['daily', 'weekly', 'monthly', 'schedule', 'scheduled backups'],
  },
  {
    key: 'exportSchedule.time',
    label: 'Backup time',
    description: 'Time of day to run the automatic backup',
    category: 'data',
    component: 'select',
    keywords: ['hour', 'schedule', 'when', 'scheduled backups'],
  },
  {
    key: 'exportSchedule.maxBackups',
    label: 'Keep backups',
    description: 'Maximum number of backups to keep before rotating old ones',
    category: 'data',
    component: 'slider',
    keywords: ['rotate', 'retention', 'limit', 'storage', 'scheduled backups'],
  },
  {
    key: 'exportSchedule.encrypt',
    label: 'Encrypt backups',
    description: 'Password-protect backup files with AES-256 encryption',
    category: 'data',
    component: 'toggle',
    keywords: ['password', 'security', 'protection', 'secure', 'scheduled backups'],
  },
  {
    key: 'data.backup',
    label: 'Create backup',
    description: 'Create a full database backup for app recovery',
    category: 'data',
    component: 'custom',
    keywords: [
      'backup',
      'save',
      'download',
      'database',
      'backup & restore',
      'backup and restore',
    ],
  },
  {
    key: 'data.restore',
    label: 'Restore backup',
    description: 'Restore data from a database backup file',
    category: 'data',
    component: 'custom',
    keywords: [
      'restore',
      'upload',
      'load',
      'import',
      'backup & restore',
      'backup and restore',
    ],
  },
  {
    key: 'data.csvExport',
    label: 'Export as CSV',
    description: 'Export tasks or grades to CSV for spreadsheets',
    category: 'data',
    component: 'custom',
    keywords: ['csv', 'spreadsheet', 'excel', 'export', 'tasks', 'grades', 'data export'],
  },
  {
    key: 'data.reset',
    label: 'Reset all data',
    description: 'Delete all courses, tasks, grades, and settings',
    category: 'data',
    component: 'custom',
    keywords: ['clear', 'delete', 'remove', 'wipe'],
  },

  // =================================
  // UPDATES
  // =================================
  {
    key: 'updatePreferences.enabled',
    label: 'Check for updates automatically',
    description: 'Periodically check GitHub Releases for a newer version',
    category: 'updates',
    component: 'toggle',
    keywords: ['auto', 'notify', 'channel', 'release', 'new version'],
  },
  {
    key: 'updatePreferences.intervalHours',
    label: 'Check interval',
    description: 'How often to poll for a newer version when automatic checks are on',
    category: 'updates',
    component: 'select',
    keywords: ['frequency', 'daily', 'weekly', 'schedule'],
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
  display: {
    label: 'Display & Layout',
    description: 'Theme, views, and dashboard customization',
  },
  academic: {
    label: 'Academic',
    description: 'Grades, terms, and course preferences',
  },
  files: {
    label: 'Files & Content',
    description: 'Downloads, links, and offline content',
  },
  sync: {
    label: 'Sync',
    description: 'Automatic sync and data updates',
  },
  account: {
    label: 'Account',
    description: 'Canvas LMS connection',
  },
  behavior: {
    label: 'App Behavior',
    description: 'Window and system tray settings',
  },
  notifications: {
    label: 'Notifications',
    description: 'Alerts, reminders, and quiet mode',
  },
  data: {
    label: 'Data Management',
    description: 'Backup, restore, export, and reset options',
  },
  updates: {
    label: 'Updates',
    description: 'Check for new versions of the app',
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
 * Search settings by query (fuzzy match on label, description, keywords, and category label)
 */
export function searchSettings(query: string): SettingMetadata[] {
  if (!query.trim()) return SETTINGS_METADATA;

  const normalizedQuery = query.toLowerCase().trim();
  const terms = normalizedQuery.split(/\s+/);

  return SETTINGS_METADATA.filter((setting) => {
    // Include category label (but NOT description - that would match too broadly)
    const categoryInfo = SETTINGS_CATEGORIES[setting.category];
    const searchableText = [
      setting.label,
      setting.description,
      categoryInfo.label,
      ...(setting.keywords || []),
    ]
      .join(' ')
      .toLowerCase();

    // All terms must match somewhere in the searchable text
    return terms.every((term) => searchableText.includes(term));
  });
}
