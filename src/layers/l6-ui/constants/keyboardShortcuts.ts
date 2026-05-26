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
  /**
   * useKeymap scope value this category maps to within the page.
   * When set, the help modal shows this category when the page's active
   * useKeymap scope matches. Undefined = shown for the whole page scope.
   */
  subscope?: string;
  shortcuts: ShortcutEntry[];
}

/** Map of route prefixes to scope identifiers */
export const ROUTE_SCOPE_MAP: Record<string, string> = {
  '/calendar': 'calendar',
  '/tasks': 'tasks',
  '/courses': 'courses',
  '/files': 'files',
  '/settings': 'settings',
  '/announcement/': 'announcement-detail',
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
      { keys: ['↑', '/', 'W'], label: 'Focus previous item' },
      { keys: ['↓', '/', 'S'], label: 'Focus next item' },
      { keys: ['X'], label: 'Toggle task completion (tasks list)' },
      { keys: ['Enter'], label: 'Open focused item' },
      { keys: ['D'], label: 'Dismiss announcement (announcements list)' },
      { keys: ['V'], label: 'View all (tasks or announcements list)' },
      { keys: ['R'], label: 'Refresh / sync' },
    ],
  },
  // Calendar — split by useKeymap scope
  {
    title: 'Calendar',
    scope: 'calendar',
    subscope: 'events',
    shortcuts: [
      { keys: ['mod', '←'], label: 'Previous period (month / week / day)' },
      { keys: ['mod', '→'], label: 'Next period' },
      { keys: ['T'], label: 'Go to today' },
      { keys: ['Tab'], label: 'Cycle view (month → week → day)' },
      { keys: ['Shift', 'Tab'], label: 'Cycle view backward' },
      { keys: ['V'], label: 'Cycle view (same as Tab)' },
      { keys: ['A', '/', '←'], label: 'Month: prev day · Week/Day: prev event in group' },
      { keys: ['D', '/', '→'], label: 'Month: next day · Week/Day: next event in group' },
      {
        keys: ['W', '/', '↑'],
        label: 'Month: prev week · Week/Day: prev event (same day)',
      },
      {
        keys: ['S', '/', '↓'],
        label: 'Month: next week · Week/Day: next event (same day)',
      },
      { keys: ['Shift', 'W'], label: 'Month: prev event in focused day' },
      { keys: ['Shift', 'S'], label: 'Month: next event in focused day' },
      { keys: ['Q'], label: 'Week/Day: prev day column' },
      { keys: ['E'], label: 'Week/Day: next day column (Month: edit focused event)' },
      { keys: ['Enter'], label: 'Open focused event (or create on empty day)' },
      { keys: ['N'], label: 'Create new event (pre-fills from focus)' },
      { keys: ['X'], label: 'Toggle completion on focused task' },
      { keys: ['Delete'], label: 'Delete focused event (confirms first)' },
      { keys: ['F'], label: 'Open filter panel' },
      { keys: ['Alt', 'Shift', 'D'], label: 'Cycle deadline filter' },
      { keys: ['Alt', 'Shift', 'P'], label: 'Cycle priority filter' },
      { keys: ['Alt', 'Shift', 'C'], label: 'Clear all filters' },
      { keys: ['Alt', '1', '..', '9'], label: 'Toggle course filter by index' },
      // Event form
      { keys: ['mod', 'Enter'], label: 'Event form: save' },
      { keys: ['Escape'], label: 'Event form: close · clear event focus' },
      { keys: ['Alt', '1'], label: 'Event form: select Regular type' },
      { keys: ['Alt', '2'], label: 'Event form: select Coursework type' },
      { keys: ['Alt', 'T'], label: 'Event form: jump to Title' },
      { keys: ['Alt', 'C'], label: 'Event form: jump to Course' },
      { keys: ['Alt', 'S'], label: 'Event form: jump to Start date' },
      { keys: ['Alt', 'D'], label: 'Event form: jump to Due / End date' },
      { keys: ['Alt', 'L'], label: 'Event form: jump to Location' },
      { keys: ['Alt', 'N'], label: 'Event form: jump to Notes' },
      { keys: ['Alt', 'R'], label: 'Event form: jump to Reminder' },
    ],
  },
  {
    title: 'Calendar — Filter Panel',
    scope: 'calendar',
    subscope: 'filter',
    shortcuts: [
      { keys: ['C'], label: 'Focus Courses section' },
      { keys: ['Shift', 'D'], label: 'Focus Deadline section' },
      { keys: ['P'], label: 'Focus Priority section' },
      { keys: ['W', '/', '↑', '/', 'Shift', 'Tab'], label: 'Previous row (section)' },
      { keys: ['S', '/', '↓', '/', 'Tab'], label: 'Next row (section)' },
      { keys: ['A', '/', '←'], label: 'Previous option in row' },
      { keys: ['D', '/', '→'], label: 'Next option in row' },
      { keys: ['Space', '/', 'Enter'], label: 'Toggle focused option' },
      { keys: ['Enter'], label: '"Clear all" row → clear all filters' },
      { keys: ['mod', 'A'], label: 'Select all courses (Courses row)' },
      { keys: ['mod', 'N'], label: 'Deselect all courses (Courses row)' },
      { keys: ['F', '/', 'Escape'], label: 'Close filter panel' },
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
      { keys: ['↑', '/', 'W'], label: 'Focus previous task' },
      { keys: ['↓', '/', 'S'], label: 'Focus next task' },
      { keys: ['X'], label: 'Toggle task completion' },
      { keys: ['Enter'], label: 'Open task in course' },
    ],
  },
  // Courses — split by useKeymap scope
  {
    title: 'Courses',
    scope: 'courses',
    subscope: 'courses',
    shortcuts: [
      { keys: ['V'], label: 'Toggle grid/list view' },
      { keys: ['A', '/', '←'], label: 'Focus previous card (grid: left)' },
      { keys: ['D', '/', '→'], label: 'Focus next card (grid: right)' },
      { keys: ['W', '/', '↑'], label: 'Focus up (grid: by row; list: previous)' },
      { keys: ['S', '/', '↓'], label: 'Focus down (grid: by row; list: next)' },
      { keys: ['Enter'], label: 'Open focused course (or first selected)' },
      { keys: ['O'], label: 'Open focused course on Canvas' },
      { keys: ['Shift', 'Enter'], label: 'Open focused course on Canvas' },
      { keys: ['H'], label: 'Hide selected or focused course' },
      { keys: ['Shift', 'H'], label: 'Unhide selected or focused course' },
      { keys: ['P'], label: 'Pin/unpin selected or focused course' },
      { keys: ['mod', 'Shift', 'A'], label: 'Archive selected or focused course' },
      { keys: ['F'], label: 'Open filter panel' },
      { keys: ['Alt', 'Shift', 'C'], label: 'Clear all filters' },
      { keys: ['Alt', 'Shift', 'G'], label: 'Cycle Grade filter' },
      { keys: ['Alt', 'Shift', 'T'], label: 'Cycle Type filter' },
      { keys: ['Alt', 'Shift', 'S'], label: 'Cycle Subject filter' },
      { keys: ['Alt', 'Shift', 'H'], label: 'Toggle Show Hidden' },
      { keys: ['Escape'], label: 'Clear selection → clear focus (falls through)' },
    ],
  },
  {
    title: 'Courses — Filter Panel',
    scope: 'courses',
    subscope: 'filter',
    shortcuts: [
      { keys: ['Q', '/', 'E'], label: 'Previous / next section' },
      { keys: ['Shift', '←', '/', 'Shift', '→'], label: 'Previous / next section (alt)' },
      { keys: ['A', '/', '←', '/', 'W', '/', '↑'], label: 'Previous option in section' },
      { keys: ['D', '/', '→', '/', 'S', '/', '↓'], label: 'Next option in section' },
      { keys: ['Space', '/', 'Enter'], label: 'Toggle focused option' },
      { keys: ['F', '/', 'Escape'], label: 'Close filter panel' },
    ],
  },
  {
    title: 'Announcements',
    scope: 'announcements',
    shortcuts: [
      { keys: ['↑', '/', 'W'], label: 'Focus previous' },
      { keys: ['↓', '/', 'S'], label: 'Focus next' },
      { keys: ['Enter'], label: 'Open announcement' },
      { keys: ['D'], label: 'Dismiss announcement' },
      { keys: ['1'], label: 'Show all' },
      { keys: ['2'], label: 'Show unread' },
      { keys: ['3'], label: 'Show dismissed' },
    ],
  },
  {
    title: 'Announcement Detail',
    scope: 'announcement-detail',
    shortcuts: [
      { keys: ['↑', '/', 'W'], label: 'Scroll up' },
      { keys: ['↓', '/', 'S'], label: 'Scroll down' },
      { keys: ['V'], label: 'View on Canvas (opens in browser)' },
      { keys: ['Escape'], label: 'Back to announcements list' },
    ],
  },
  // Course Detail — split by useKeymap scope
  {
    title: 'Course Detail',
    scope: 'course-detail',
    subscope: 'nav',
    shortcuts: [
      {
        keys: ['Q', '/', 'E'],
        label: 'Cycle sections (Tasks → Queue → Announcements → Preferences)',
      },
      { keys: ['G'], label: 'Go back to previous page' },
      { keys: ['T'], label: 'Start editing Target grade in header' },
      { keys: ['mod', 'E'], label: 'Toggle Settings panel' },
      { keys: ['mod', 'S'], label: 'Save Settings (when panel is open)' },
      { keys: ['mod', 'Shift', 'A'], label: 'Archive this course (confirms first)' },
      { keys: ['Shift', 'O'], label: 'Open this course on Canvas' },
      // Tasks section
      { keys: ['↑', '/', 'W'], label: 'Tasks: focus previous task' },
      { keys: ['↓', '/', 'S'], label: 'Tasks: focus next task' },
      { keys: ['A', '/', '←'], label: 'Tasks: previous filter chip' },
      { keys: ['D', '/', '→'], label: 'Tasks: next filter chip' },
      {
        keys: ['1', '–', '5'],
        label: 'Tasks: jump to All / Pending / Submitted / Graded / Info',
      },
      { keys: ['Enter', '/', 'Space'], label: 'Tasks: expand/collapse focused task' },
      { keys: ['X'], label: 'Tasks: toggle focused task completion' },
      { keys: ['E'], label: 'Tasks: edit focused task' },
      { keys: ['N'], label: 'Tasks: new task' },
      { keys: ['O'], label: 'Tasks: open focused task on Canvas' },
      { keys: ['Shift', 'D'], label: 'Tasks: duplicate focused task' },
      { keys: ['M'], label: 'Tasks: mark as optional (toggle)' },
      { keys: ['Delete'], label: 'Tasks: delete focused task' },
      // Queue section
      { keys: ['A'], label: 'Queue: accept focused queued task' },
      { keys: ['Shift', 'A'], label: 'Queue: accept all (confirms first)' },
      { keys: ['R'], label: 'Queue: reject focused queued task' },
      { keys: ['L'], label: 'Queue: link to existing task' },
      // Announcements sidebar
      { keys: ['Enter'], label: 'Announcements: open focused announcement' },
      { keys: ['D'], label: 'Announcements: dismiss focused announcement' },
      { keys: ['V'], label: 'Announcements: view all for this course' },
      { keys: ['Escape'], label: 'Close menu/form → exit edit → close Settings → back' },
    ],
  },
  {
    title: 'Course Detail — Task Edit',
    scope: 'course-detail',
    subscope: 'edit',
    shortcuts: [
      { keys: ['mod', 'Enter'], label: 'Save task edit' },
      { keys: ['Alt', 'T'], label: 'Jump to Title' },
      { keys: ['Alt', 'D'], label: 'Jump to Description' },
      { keys: ['Alt', 'N'], label: 'Jump to Notes (Canvas tasks)' },
      { keys: ['Alt', 'Y'], label: 'Jump to Type' },
      { keys: ['Alt', 'L'], label: 'Jump to Location' },
      { keys: ['Alt', 'S'], label: 'Jump to Start Date' },
      { keys: ['Alt', 'Shift', 'D'], label: 'Jump to Due Date' },
      { keys: ['Alt', 'W'], label: 'Jump to Weight' },
      { keys: ['Alt', 'G'], label: 'Jump to Score' },
    ],
  },
  {
    title: 'Course Detail — Preferences',
    scope: 'course-detail',
    subscope: 'prefs',
    shortcuts: [
      { keys: ['Alt', 'N'], label: 'Jump to Nickname' },
      { keys: ['Alt', 'C'], label: 'Jump to Color' },
      { keys: ['Alt', 'U'], label: 'Jump to Credits' },
      { keys: ['Alt', 'G'], label: 'Jump to Grade curve' },
      { keys: ['Alt', 'T'], label: 'Edit Target grade in header' },
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
  {
    title: 'Duplicate warning',
    scope: 'updates',
    shortcuts: [
      { keys: ['L'], label: 'Link to existing task' },
      { keys: ['S'], label: 'Keep separate' },
      { keys: ['Esc'], label: 'Cancel' },
      { keys: ['↑', '/', '↓'], label: 'Navigate items (bulk)' },
      { keys: ['Space'], label: 'Toggle selection (bulk)' },
      { keys: ['A'], label: 'Select / deselect all (bulk)' },
      { keys: ['Enter'], label: 'Confirm decisions (bulk)' },
    ],
  },
  {
    title: 'Files',
    scope: 'files',
    shortcuts: [
      { keys: ['↑', '/', 'W'], label: 'Focus previous row' },
      { keys: ['↓', '/', 'S'], label: 'Focus next row' },
      { keys: ['Enter'], label: 'Expand folder / download file' },
      { keys: ['→', '/', 'D'], label: 'Expand focused folder' },
      { keys: ['←', '/', 'A'], label: 'Collapse focused folder' },
      { keys: ['Space'], label: 'Toggle file selection' },
      { keys: ['mod', 'A'], label: 'Select all visible' },
      { keys: ['Esc'], label: 'Clear focus / deselect' },
    ],
  },
  {
    title: 'Settings',
    scope: 'settings',
    shortcuts: [
      { keys: ['1'], label: 'Jump to Display section' },
      { keys: ['2'], label: 'Jump to Academic section' },
      { keys: ['3'], label: 'Jump to Files section' },
      { keys: ['4'], label: 'Jump to Sync section' },
      { keys: ['5'], label: 'Jump to Account section' },
      { keys: ['6'], label: 'Jump to App Behavior section' },
      { keys: ['7'], label: 'Jump to Notifications section' },
      { keys: ['8'], label: 'Jump to Data section' },
      { keys: ['Escape'], label: 'Clear search, then close' },
    ],
  },
];
