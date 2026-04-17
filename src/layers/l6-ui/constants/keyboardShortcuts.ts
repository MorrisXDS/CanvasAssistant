/**
 * Keyboard Shortcuts Data
 *
 * Typed shortcut definitions used by KeyboardShortcutsModal.
 * Key tokens: "mod" resolves to ⌘ (macOS) or Ctrl (Windows/Linux).
 *
 * Categories with a `scope` are page-specific and only shown
 * in the help modal when the user is on the matching page.
 */

export interface ShortcutEntry {
  /** Abstract key tokens, e.g. ["mod", "1"] */
  keys: string[];
  /** Human-readable description */
  label: string;
}

export interface ShortcutCategory {
  title: string;
  /** Page scope — undefined means global (always shown) */
  scope?: string;
  shortcuts: ShortcutEntry[];
}

/** Map of route prefixes to scope identifiers */
export const ROUTE_SCOPE_MAP: Record<string, string> = {
  '/calendar': 'calendar',
  '/tasks': 'tasks',
  '/courses': 'courses',
  '/files': 'files',
  '/announcements': 'announcements',
  '/course/': 'course-detail',
  '/updates': 'updates',
  '/': 'dashboard',
};

/**
 * Resolve the scope for a given pathname.
 * Checks longest prefixes first so /course/123 matches 'course-detail' before '/'.
 */
export function getScopeForPath(pathname: string): string | null {
  // Check specific routes first (longer prefixes take priority)
  const sortedPrefixes = Object.keys(ROUTE_SCOPE_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of sortedPrefixes) {
    if (
      pathname === prefix ||
      pathname.startsWith(prefix + '/') ||
      (prefix === '/' && pathname === '/')
    ) {
      // Special case: '/' should only match exact '/'
      if (prefix === '/' && pathname !== '/') continue;
      return ROUTE_SCOPE_MAP[prefix];
    }
  }
  return null;
}

export const KEYBOARD_SHORTCUTS: ShortcutCategory[] = [
  // ========== Global ==========
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['mod', '1'], label: 'Go to Dashboard' },
      { keys: ['mod', '2'], label: 'Go to Calendar' },
      { keys: ['mod', '3'], label: 'Go to Courses' },
      { keys: ['mod', '4'], label: 'Go to Files' },
      { keys: ['mod', '5'], label: 'Go to Settings' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['mod', 'F'], label: 'Focus search' },
      { keys: ['?'], label: 'Global shortcuts' },
      { keys: ['mod', '?'], label: 'Page shortcuts' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['mod', 'A'], label: 'Select all' },
      { keys: ['Escape'], label: 'Clear selection' },
      { keys: ['Shift', 'Click'], label: 'Range select' },
      { keys: ['mod', 'Click'], label: 'Toggle select' },
    ],
  },

  // ========== Page-specific ==========
  {
    title: 'Dashboard',
    scope: 'dashboard',
    shortcuts: [
      { keys: ['`'], label: 'Switch between top (stats) and bottom (lists)' },
      { keys: ['Tab'], label: 'Cycle lists within the current row' },
      { keys: ['Shift', 'Tab'], label: 'Cycle backward' },
      { keys: ['←', '/', 'J'], label: 'Focus previous item' },
      { keys: ['→', '/', 'K'], label: 'Focus next item' },
      { keys: ['X'], label: 'Toggle task completion (tasks list)' },
      { keys: ['Enter'], label: 'Open focused item' },
      { keys: ['D'], label: 'Dismiss announcement (announcements list)' },
      { keys: ['V'], label: 'View all (tasks or announcements list)' },
      { keys: ['R'], label: 'Refresh / sync' },
    ],
  },
  {
    title: 'Calendar',
    scope: 'calendar',
    shortcuts: [
      { keys: ['mod', '←'], label: 'Previous period (month / week / day)' },
      { keys: ['mod', '→'], label: 'Next period' },
      { keys: ['T'], label: 'Go to today' },
      { keys: ['Tab'], label: 'Cycle view (month → week → day)' },
      { keys: ['Shift', 'Tab'], label: 'Cycle view backward' },
      { keys: ['V'], label: 'Cycle view (same as Tab)' },
      // Month view
      { keys: ['A', '/', '←'], label: 'Month: prev day' },
      { keys: ['D', '/', '→'], label: 'Month: next day' },
      { keys: ['W', '/', '↑'], label: 'Month: prev week (same weekday)' },
      { keys: ['S', '/', '↓'], label: 'Month: next week (same weekday)' },
      { keys: ['Shift', 'W'], label: 'Month: prev event in focused day' },
      { keys: ['Shift', 'S'], label: 'Month: next event in focused day' },
      // Week view
      { keys: ['Q'], label: 'Week: prev day column' },
      { keys: ['E'], label: 'Week: next day column' },
      { keys: ['W', '/', '↑'], label: 'Week: prev event (same day, earlier time)' },
      { keys: ['S', '/', '↓'], label: 'Week: next event (same day, later time)' },
      {
        keys: ['A', '/', '←'],
        label: 'Week: prev event in same-hour group → closest on prev day → prev day col',
      },
      {
        keys: ['D', '/', '→'],
        label: 'Week: next event in same-hour group → closest on next day → next day col',
      },
      // Day view
      { keys: ['A', '/', '←'], label: 'Day: prev day' },
      { keys: ['D', '/', '→'], label: 'Day: next day' },
      { keys: ['W', '/', '↑'], label: 'Day: prev event' },
      { keys: ['S', '/', '↓'], label: 'Day: next event' },
      // Actions
      { keys: ['Enter'], label: 'Open focused event (or create on empty day)' },
      { keys: ['E'], label: 'Edit focused event (Month/Day view)' },
      { keys: ['N'], label: 'Create new event (pre-fills from focus)' },
      { keys: ['X'], label: 'Toggle completion on focused task' },
      // Filters
      { keys: ['F'], label: 'Toggle filters + enter filter mode' },
      { keys: ['C'], label: 'Filter mode: focus Courses section' },
      { keys: ['Shift', 'D'], label: 'Filter mode: focus Deadline section' },
      { keys: ['P'], label: 'Filter mode: focus Priority section' },
      { keys: ['Space'], label: 'Filter mode: toggle focused option' },
      { keys: ['Alt', 'Shift', 'D'], label: 'Cycle deadline filter' },
      { keys: ['Alt', 'Shift', 'P'], label: 'Cycle priority filter' },
      { keys: ['Alt', 'Shift', 'C'], label: 'Clear all filters' },
      { keys: ['Alt', '1', '..', '9'], label: 'Toggle course filter by index' },
    ],
  },
  {
    title: 'Tasks',
    scope: 'tasks',
    shortcuts: [
      { keys: ['1'], label: 'Show all tasks' },
      { keys: ['2'], label: 'Show pending' },
      { keys: ['3'], label: 'Show overdue' },
      { keys: ['4'], label: 'Show completed' },
      { keys: ['N'], label: 'Add new task' },
      { keys: ['←', '/', 'J'], label: 'Focus previous task' },
      { keys: ['→', '/', 'K'], label: 'Focus next task' },
      { keys: ['X'], label: 'Toggle task completion' },
      { keys: ['Enter'], label: 'Open task in course' },
    ],
  },
  {
    title: 'Courses',
    scope: 'courses',
    shortcuts: [
      { keys: ['V'], label: 'Toggle grid/list view' },
      { keys: ['F'], label: 'Toggle filters' },
      { keys: ['Enter'], label: 'Open selected course' },
      { keys: ['H'], label: 'Hide/show selected' },
      { keys: ['P'], label: 'Pin/unpin selected' },
    ],
  },
  {
    title: 'Announcements',
    scope: 'announcements',
    shortcuts: [
      { keys: ['←', '/', 'J'], label: 'Focus previous' },
      { keys: ['→', '/', 'K'], label: 'Focus next' },
      { keys: ['Enter'], label: 'Open announcement' },
      { keys: ['D'], label: 'Dismiss announcement' },
      { keys: ['1'], label: 'Show all' },
      { keys: ['2'], label: 'Show unread' },
      { keys: ['3'], label: 'Show dismissed' },
    ],
  },
  {
    title: 'Course Detail',
    scope: 'course-detail',
    shortcuts: [
      { keys: ['N'], label: 'Create new task' },
      { keys: ['←', '/', 'J'], label: 'Focus previous task' },
      { keys: ['→', '/', 'K'], label: 'Focus next task' },
      { keys: ['X'], label: 'Toggle task completion' },
      { keys: ['E'], label: 'Edit focused task' },
      { keys: ['Delete'], label: 'Delete focused task' },
      { keys: ['Space'], label: 'Expand/collapse task' },
    ],
  },
  {
    title: 'Updates',
    scope: 'updates',
    shortcuts: [
      { keys: ['←', '/', 'J'], label: 'Focus previous item' },
      { keys: ['→', '/', 'K'], label: 'Focus next item' },
      { keys: ['A'], label: 'Accept queued task' },
      { keys: ['1'], label: 'All updates' },
      { keys: ['2'], label: 'Tasks' },
      { keys: ['3'], label: 'Grades' },
      { keys: ['4'], label: 'Files' },
      { keys: ['5'], label: 'Pages' },
      { keys: ['6'], label: 'Announcements' },
    ],
  },
];
