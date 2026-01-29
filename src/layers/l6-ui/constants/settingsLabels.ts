/**
 * Settings Labels - Centralized settings UI strings
 *
 * This module contains all user-facing strings for the settings modal
 * that are not covered by uiText.ts or SETTINGS_METADATA.
 * Centralizing these strings makes it easier to:
 * - Maintain consistency across the application
 * - Update copy in one place
 * - Prepare for future internationalization (i18n)
 */

export const SETTINGS_LABELS = {
  // Search
  search: {
    placeholder: 'Search settings...',
    noResults: 'No settings found',
    noResultsFor: (query: string) => `No settings found for "${query}"`,
  },

  // Button labels
  buttons: {
    testConnection: 'Test Connection',
    testing: 'Testing...',
    connecting: 'Connecting...',
    connectToCanvas: 'Connect to Canvas',
    updateToken: 'Update Token',
    removeConnection: 'Remove Connection',
    change: 'Change',
    quickBackup: 'Quick Backup',
    backupData: 'Backup Data',
    exportCsv: 'Export CSV',
    customExport: 'Custom Export...',
    importBackup: 'Import Backup...',
    importSettings: 'Import Settings...',
    exportSettings: 'Export Settings',
    resetAll: 'Reset All',
    validateToken: 'Validate Token',
    validating: 'Validating...',
    replaceToken: 'Replace Token',
    replacing: 'Replacing...',
    keepConnected: 'Keep Connected',
  },

  // Dropdown option labels
  options: {
    syncInterval: {
      never: 'Never',
      minutes15: '15 minutes',
      minutes30: '30 minutes',
      hour1: '1 hour',
      hours2: '2 hours',
    },
    closeAction: {
      ask: 'Ask every time',
      minimize: 'Minimize to tray',
      quit: 'Quit application',
    },
    folderState: {
      collapsed: 'All Collapsed',
      expanded: 'All Expanded',
      remember: 'Remember State',
    },
    termSelection: {
      autoDetect: 'Auto-detect current',
      showAll: 'Show all semesters',
      availableLabel: 'Available Semesters',
    },
    linkBehavior: {
      browser: 'Open in browser',
      local: 'Prefer local',
    },
    viewMode: {
      grid: 'Grid',
      list: 'List',
      month: 'Month',
      week: 'Week',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
  },

  // Section titles
  sections: {
    canvasConnection: 'Canvas LMS Connection',
    courseVisibility: 'Course Visibility',
    alertTypes: 'Alert types',
    intelligenceAlerts: 'Intelligence alerts',
    smartQuietMode: 'Smart quiet mode',
    dangerZone: 'Danger Zone',
    export: 'Export',
    import: 'Import',
  },

  // Placeholders
  placeholders: {
    canvasUrl: 'https://your-institution.instructure.com',
    newToken: 'Enter your new Canvas access token',
  },

  // Status badges
  status: {
    connected: 'Connected',
    notConnected: 'Not Connected',
    modified: 'modified',
  },

  // Quiet mode section
  quietMode: {
    description: 'Automatically suppress notifications when:',
  },

  // Data management
  data: {
    exportTasks: 'Export Tasks',
    exportGrades: 'Export Grades',
    resetAllData: 'Reset All Data',
    resetAllDescription: 'Delete all synced data. This cannot be undone.',
    deleteTokenLabel: 'Also delete Canvas API token (requires re-authentication)',
    resetConfirmWithToken:
      'This will delete all synced data including courses, tasks, files, announcements, AND your Canvas API token. You will need to re-authenticate after this action. This action cannot be undone.',
    resetConfirmWithoutToken:
      'This will delete all synced data including courses, tasks, files, and announcements. This action cannot be undone. Your Canvas connection will be preserved.',
  },

  // Token replacement modal
  tokenModal: {
    title: 'Replace Canvas Token',
    description:
      'Enter your new Canvas API token. You can generate one from your Canvas account settings.',
    newTokenLabel: 'New Access Token',
    tokenValid: 'Token valid',
    tokenValidFor: (userName: string) => `Token valid for ${userName}`,
  },

  // Disconnect confirmation
  disconnect: {
    title: 'Remove Canvas Connection',
    message:
      "This will delete your API token and remove the Canvas URL. You'll be taken back to the setup screen to reconnect.",
    confirmText: 'Remove Connection',
    cancelText: 'Keep Connected',
  },

  // Empty states
  empty: {
    noCourses: 'No courses synced yet.',
    loading: 'Loading...',
  },

  // Validation messages
  validation: {
    tokenValid: 'Token is valid and working',
    tokenReplaced: 'Token replaced successfully',
  },
} as const;

// Type helper for accessing settings labels
export type SettingsLabels = typeof SETTINGS_LABELS;
