/**
 * Menu Labels - Centralized context menu and action button labels
 *
 * This module contains all user-facing strings for context menus and action buttons.
 * Centralizing these strings makes it easier to:
 * - Maintain consistency across the application
 * - Update copy in one place
 * - Prepare for future internationalization (i18n)
 */

export const MENU_LABELS = {
  // Task context menu actions
  task: {
    edit: 'Edit',
    duplicate: 'Duplicate',
    markComplete: 'Mark Complete',
    markIncomplete: 'Mark Incomplete',
    markOptional: 'Mark as Optional',
    markRequired: 'Mark as Required',
    openInCanvas: 'Open in Canvas',
    viewInCalendar: 'View in Calendar',
    delete: 'Delete',
  },

  // Course actions
  course: {
    archive: 'Archive',
    unarchive: 'Unarchive',
    hide: 'Hide Course',
    show: 'Show Course',
    setTargetGrade: 'Set Target Grade',
    viewInCanvas: 'Open in Canvas',
  },

  // File actions
  file: {
    download: 'Download',
    openFolder: 'Open Folder',
    openInCanvas: 'Open in Canvas',
    copyLink: 'Copy Link',
    delete: 'Delete',
  },

  // Common action labels
  common: {
    viewAll: 'View all',
    cancel: 'Cancel',
    save: 'Save',
    reset: 'Reset',
    close: 'Close',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    update: 'Update',
    remove: 'Remove',
    clear: 'Clear',
    clearSearch: 'Clear search',
    clearAll: 'Clear all',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    showMore: 'Show More',
    showLess: 'Show Less',
    expand: 'Expand',
    collapse: 'Collapse',
    retry: 'Retry',
    refresh: 'Refresh',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    apply: 'Apply',
    submit: 'Submit',
    change: 'Change',
  },
} as const;

// Type helper for accessing menu labels
export type MenuLabels = typeof MENU_LABELS;
