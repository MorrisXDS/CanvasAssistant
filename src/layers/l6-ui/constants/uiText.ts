/**
 * UI Text Constants - Centralized user-facing strings
 *
 * This module contains all user-facing text strings used throughout the UI.
 * Centralizing these strings makes it easier to:
 * - Maintain consistency across the application
 * - Update copy in one place
 * - Prepare for future internationalization (i18n)
 */

export const UI_TEXT = {
  // ==========================================================================
  // ONBOARDING
  // ==========================================================================
  onboarding: {
    connection: {
      title: 'Connect to Canvas',
      subtitle: 'Enter your Canvas credentials to get started',
      canvasUrlLabel: 'Canvas URL',
      canvasUrlPlaceholder: 'https://your-school.instructure.com',
      canvasUrlHint: 'Your school\'s Canvas URL (e.g., q.utoronto.ca)',
      tokenLabel: 'Access Token',
      tokenPlaceholder: 'Paste your Canvas access token here',
      tokenHint: 'Canvas → Account → Settings → New Access Token',
      validateButton: 'Connect',
      validating: 'Validating...',
      connected: 'Connected',
      welcomeMessage: (name: string) => `Welcome, ${name}!`,
    },
    theme: {
      title: 'Choose Your Theme',
      subtitle: 'Select your preferred appearance',
      light: 'Light',
      dark: 'Dark',
      auto: 'Auto',
      autoDescription: 'Match system preference',
    },
    storage: {
      title: 'File Storage',
      subtitle: 'Choose where to save downloaded files',
      defaultLocation: 'Default location',
      customLocation: 'Custom location',
      selectFolder: 'Select Folder',
    },
    goals: {
      title: 'Set Your Goals',
      subtitle: 'Set your default target grade for courses',
      targetGradeLabel: 'Default Target Grade',
    },
    complete: {
      title: 'All Set!',
      subtitle: 'Your setup is complete. Let\'s get started.',
      startButton: 'Start Using Canvas Assistant',
    },
    navigation: {
      back: 'Back',
      next: 'Next',
      skip: 'Skip',
    },
  },

  // ==========================================================================
  // RE-AUTHENTICATION
  // ==========================================================================
  reauth: {
    title: 'Canvas Token Expired',
    description: 'Your Canvas access token has expired or been revoked. Please enter a new token to continue syncing.',
    tokenLabel: 'New Access Token',
    tokenPlaceholder: 'Paste your new token here',
    tokenHint: 'Canvas → Account → Settings → New Access Token',
    validateButton: 'Validate Token',
    validating: 'Validating...',
    success: 'Token validated successfully!',
    error: {
      invalid: 'Invalid token. Please check and try again.',
      network: 'Network error. Please check your connection.',
      generic: 'Validation failed. Please try again.',
    },
  },

  // ==========================================================================
  // SYNC
  // ==========================================================================
  sync: {
    status: {
      syncing: 'Syncing...',
      idle: 'Up to date',
      error: 'Sync error',
      offline: 'Offline',
      pendingChanges: (count: number) => `${count} pending change${count !== 1 ? 's' : ''}`,
    },
    conflict: {
      title: 'Sync Conflict',
      description: 'There are conflicting changes between your local data and Canvas.',
      keepLocal: 'Keep Local',
      keepLocalDescription: 'Use your local changes',
      useCanvas: 'Use Canvas',
      useCanvasDescription: 'Use the version from Canvas',
      resolveAll: 'Resolve All',
      field: {
        localValue: 'Local value',
        canvasValue: 'Canvas value',
        lastModified: 'Last modified',
      },
    },
    trigger: {
      button: 'Sync Now',
      syncing: 'Syncing...',
      lastSync: (time: string) => `Last sync: ${time}`,
      neverSynced: 'Never synced',
    },
  },

  // ==========================================================================
  // SETTINGS
  // ==========================================================================
  settings: {
    title: 'Settings',
    sections: {
      general: 'General',
      canvas: 'Canvas Connection',
      sync: 'Sync',
      academic: 'Academic',
      appearance: 'Appearance',
      notifications: 'Notifications',
      files: 'Files',
      courses: 'Courses',
      calendar: 'Calendar',
      dashboard: 'Dashboard',
      data: 'Data & Privacy',
    },
    canvas: {
      connected: 'Connected',
      disconnected: 'Not connected',
      disconnect: 'Disconnect',
      reconnect: 'Reconnect',
      urlLabel: 'Canvas URL',
      tokenLabel: 'Access Token',
    },
    sync: {
      autoSync: 'Auto Sync',
      autoSyncDescription: 'Automatically sync data with Canvas',
      syncInterval: 'Sync Interval',
      syncFiles: 'Sync Files',
      syncAnnouncements: 'Sync Announcements',
    },
    appearance: {
      theme: 'Theme',
      themeOptions: {
        light: 'Light',
        dark: 'Dark',
        system: 'System',
      },
    },
    data: {
      resetTitle: 'Reset Data',
      resetDescription: 'Clear all local data and start fresh',
      resetButton: 'Reset All Data',
      resetWarning: 'This will delete all your local data including settings, cached files, and sync history. This cannot be undone.',
      exportTitle: 'Export Data',
      exportDescription: 'Download a copy of your data',
      exportButton: 'Export Data',
    },
  },

  // ==========================================================================
  // COMMON ACTIONS
  // ==========================================================================
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    done: 'Done',
    apply: 'Apply',
    reset: 'Reset',
    retry: 'Retry',
    refresh: 'Refresh',
    back: 'Back',
    next: 'Next',
    submit: 'Submit',
    create: 'Create',
    update: 'Update',
    remove: 'Remove',
    clear: 'Clear',
    select: 'Select',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    viewAll: 'View All',
    showMore: 'Show More',
    showLess: 'Show Less',
    expand: 'Expand',
    collapse: 'Collapse',
    openInCanvas: 'Open in Canvas',
    openInBrowser: 'Open in Browser',
    copyLink: 'Copy Link',
    download: 'Download',
    upload: 'Upload',
  },

  // ==========================================================================
  // COMMON LABELS
  // ==========================================================================
  labels: {
    loading: 'Loading...',
    noData: 'No data',
    notSet: '(not set)',
    none: 'None',
    all: 'All',
    other: 'Other',
    unknown: 'Unknown',
    required: 'Required',
    optional: 'Optional',
    enabled: 'Enabled',
    disabled: 'Disabled',
    yes: 'Yes',
    no: 'No',
    on: 'On',
    off: 'Off',
    default: 'Default',
    custom: 'Custom',
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
  },

  // ==========================================================================
  // EMPTY STATES
  // ==========================================================================
  empty: {
    courses: {
      title: 'No Courses',
      description: 'No courses found. Sync with Canvas to see your courses.',
    },
    tasks: {
      title: 'No Tasks',
      description: 'No tasks to show. Check back later for new assignments.',
    },
    notifications: {
      title: 'No Notifications',
      description: 'You\'re all caught up! No new announcements.',
    },
    files: {
      title: 'No Files',
      description: 'No files found in this folder.',
    },
    calendar: {
      title: 'No Events',
      description: 'No events scheduled for this period.',
    },
    search: {
      title: 'No Results',
      description: 'No results found for your search.',
    },
  },

  // ==========================================================================
  // ERROR MESSAGES
  // ==========================================================================
  errors: {
    generic: 'Something went wrong. Please try again.',
    network: 'Network error. Please check your connection.',
    timeout: 'Request timed out. Please try again.',
    notFound: 'The requested resource was not found.',
    unauthorized: 'You are not authorized to perform this action.',
    forbidden: 'Access denied.',
    validation: 'Please check your input and try again.',
    sync: {
      failed: 'Sync failed. Please try again.',
      conflict: 'Sync conflict detected.',
      offline: 'Cannot sync while offline.',
    },
    canvas: {
      connection: 'Failed to connect to Canvas.',
      tokenInvalid: 'Invalid Canvas token.',
      tokenExpired: 'Canvas token has expired.',
      rateLimited: 'Rate limited by Canvas. Please wait and try again.',
    },
  },

  // ==========================================================================
  // SUCCESS MESSAGES
  // ==========================================================================
  success: {
    saved: 'Changes saved successfully.',
    deleted: 'Successfully deleted.',
    synced: 'Sync completed successfully.',
    copied: 'Copied to clipboard.',
    downloaded: 'Download started.',
    connected: 'Connected successfully.',
    updated: 'Updated successfully.',
  },

  // ==========================================================================
  // CONFIRMATION DIALOGS
  // ==========================================================================
  confirm: {
    delete: {
      title: 'Delete Item',
      message: 'Are you sure you want to delete this item? This action cannot be undone.',
    },
    discard: {
      title: 'Discard Changes',
      message: 'You have unsaved changes. Are you sure you want to discard them?',
    },
    reset: {
      title: 'Reset to Default',
      message: 'Are you sure you want to reset to default settings?',
    },
    disconnect: {
      title: 'Disconnect from Canvas',
      message: 'Are you sure you want to disconnect from Canvas? You will need to re-enter your credentials to sync again.',
    },
    clearData: {
      title: 'Clear All Data',
      message: 'This will permanently delete all your local data including settings, cached files, and sync history. This cannot be undone.',
    },
  },

  // ==========================================================================
  // DASHBOARD
  // ==========================================================================
  dashboard: {
    title: 'Dashboard',
    sections: {
      priority: 'Priority Tasks',
      schedule: 'Today\'s Schedule',
      recommendations: 'Recommendations',
      insights: 'Insights',
      courses: 'My Courses',
    },
    welcome: (name: string) => `Welcome back, ${name}!`,
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
    },
    stats: {
      tasksToday: 'Tasks due today',
      tasksThisWeek: 'Tasks this week',
      overdueItems: 'Overdue items',
      upcomingDeadlines: 'Upcoming deadlines',
    },
  },

  // ==========================================================================
  // CALENDAR
  // ==========================================================================
  calendar: {
    title: 'Calendar',
    views: {
      month: 'Month',
      week: 'Week',
      day: 'Day',
    },
    navigation: {
      today: 'Today',
      previous: 'Previous',
      next: 'Next',
    },
    event: {
      createTitle: 'Create Event',
      editTitle: 'Edit Event',
      deleteTitle: 'Delete Event',
      titleLabel: 'Title',
      titlePlaceholder: 'Event title',
      dateLabel: 'Date',
      timeLabel: 'Time',
      allDay: 'All day',
      repeat: 'Repeat',
      description: 'Description',
      color: 'Color',
      calendar: 'Calendar',
    },
    import: {
      title: 'Import Calendar',
      selectFile: 'Select ICS file',
      importing: 'Importing...',
      success: (count: number) => `Successfully imported ${count} event${count !== 1 ? 's' : ''}.`,
    },
  },

  // ==========================================================================
  // COURSES
  // ==========================================================================
  courses: {
    title: 'Courses',
    viewModes: {
      grid: 'Grid',
      list: 'List',
    },
    details: {
      assignments: 'Assignments',
      announcements: 'Announcements',
      files: 'Files',
      grades: 'Grades',
      targetGrade: 'Target Grade',
      currentGrade: 'Current Grade',
    },
    actions: {
      hide: 'Hide Course',
      unhide: 'Show Course',
      setTarget: 'Set Target Grade',
    },
  },

  // ==========================================================================
  // TASKS
  // ==========================================================================
  tasks: {
    title: 'Tasks',
    status: {
      pending: 'Pending',
      completed: 'Completed',
      overdue: 'Overdue',
    },
    priority: {
      high: 'High Priority',
      medium: 'Medium Priority',
      low: 'Low Priority',
    },
    actions: {
      markComplete: 'Mark Complete',
      markIncomplete: 'Mark Incomplete',
      viewDetails: 'View Details',
    },
    filters: {
      all: 'All Tasks',
      upcoming: 'Upcoming',
      overdue: 'Overdue',
      completed: 'Completed',
    },
  },

  // ==========================================================================
  // FILES
  // ==========================================================================
  files: {
    title: 'Files',
    viewModes: {
      list: 'List',
      grid: 'Grid',
    },
    actions: {
      download: 'Download',
      openFolder: 'Open Folder',
      refresh: 'Refresh',
    },
    status: {
      downloaded: 'Downloaded',
      notDownloaded: 'Not downloaded',
      downloading: 'Downloading...',
    },
  },
} as const;

// Type helper for accessing nested text
export type UITextKey = typeof UI_TEXT;
