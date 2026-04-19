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
      { keys: ['A', '/', '←'], label: 'Week: prev event in same-hour group (same day)' },
      { keys: ['D', '/', '→'], label: 'Week: next event in same-hour group (same day)' },
      // Day view
      { keys: ['Q'], label: 'Day: prev day' },
      { keys: ['E'], label: 'Day: next day' },
      { keys: ['A', '/', '←'], label: 'Day: prev event in same-hour group (same day)' },
      { keys: ['D', '/', '→'], label: 'Day: next event in same-hour group (same day)' },
      { keys: ['W', '/', '↑'], label: 'Day: prev event (chronological)' },
      { keys: ['S', '/', '↓'], label: 'Day: next event (chronological)' },
      // Actions
      { keys: ['Enter'], label: 'Open focused event (or create on empty day)' },
      { keys: ['E'], label: 'Edit focused event (Month view only; Week/Day = next day)' },
      { keys: ['N'], label: 'Create new event (pre-fills from focus)' },
      { keys: ['X'], label: 'Toggle completion on focused task' },
      {
        keys: ['Delete'],
        label: 'Delete focused event (user-created events only — confirms first)',
      },
      // Confirmation prompts (applies to the inline "Delete event?" prompt
      // inside the detail modal and the standalone ConfirmDialog)
      { keys: ['Enter'], label: 'Confirm prompt: proceed (e.g. Delete)' },
      { keys: ['Escape'], label: 'Confirm prompt: cancel (returns to prior view)' },
      // Event create/edit modal
      { keys: ['mod', 'Enter'], label: 'Event form: save' },
      { keys: ['Escape'], label: 'Event form: close without saving' },
      { keys: ['Alt', '1'], label: 'Event form (create): select Regular event type' },
      { keys: ['Alt', '2'], label: 'Event form (create): select Coursework type' },
      {
        keys: ['Delete'],
        label: 'Event form (edit): delete this event (only when not typing in a field)',
      },
      // Event form field jumps (Alt + letter)
      { keys: ['Alt', 'T'], label: 'Event form: jump to Title' },
      { keys: ['Alt', 'C'], label: 'Event form: jump to Course' },
      { keys: ['Alt', 'S'], label: 'Event form: jump to Start date' },
      { keys: ['Alt', 'D'], label: 'Event form: jump to Due / End date' },
      { keys: ['Alt', 'L'], label: 'Event form: jump to Location' },
      { keys: ['Alt', 'N'], label: 'Event form: jump to Notes' },
      { keys: ['Alt', 'R'], label: 'Event form: jump to Reminder' },
      // Filters
      { keys: ['F'], label: 'Open filters + enter filter mode (also closes panel)' },
      { keys: ['Escape'], label: 'Filter mode: close panel (quit filter mode)' },
      { keys: ['C'], label: 'Filter mode: focus Courses section' },
      { keys: ['Shift', 'D'], label: 'Filter mode: focus Deadline section' },
      { keys: ['P'], label: 'Filter mode: focus Priority section' },
      {
        keys: ['Enter'],
        label:
          'Filter mode: on "Clear all" row → clear all filters (row appears only when filters are active)',
      },
      {
        keys: ['W', '/', '↑', '/', 'Shift', 'Tab'],
        label: 'Filter mode: previous row (section)',
      },
      {
        keys: ['S', '/', '↓', '/', 'Tab'],
        label: 'Filter mode: next row (section)',
      },
      { keys: ['A', '/', '←'], label: 'Filter mode: previous option in row' },
      { keys: ['D', '/', '→'], label: 'Filter mode: next option in row' },
      { keys: ['mod', 'A'], label: 'Filter mode: select all courses (Courses row)' },
      { keys: ['mod', 'N'], label: 'Filter mode: deselect all courses (Courses row)' },
      { keys: ['Space', '/', 'Enter'], label: 'Filter mode: toggle focused option' },
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
      { keys: ['↑', '/', 'W'], label: 'Focus previous task' },
      { keys: ['↓', '/', 'S'], label: 'Focus next task' },
      { keys: ['X'], label: 'Toggle task completion' },
      { keys: ['Enter'], label: 'Open task in course' },
    ],
  },
  {
    title: 'Courses',
    scope: 'courses',
    shortcuts: [
      { keys: ['V'], label: 'Toggle grid/list view' },
      // Grid/list navigation
      {
        keys: ['A', '/', '←'],
        label: 'Focus previous card (grid: left; list: swallowed)',
      },
      {
        keys: ['D', '/', '→'],
        label: 'Focus next card (grid: right; list: swallowed)',
      },
      {
        keys: ['W', '/', '↑'],
        label: 'Focus up (grid: by row; list: previous item)',
      },
      {
        keys: ['S', '/', '↓'],
        label: 'Focus down (grid: by row; list: next item)',
      },
      { keys: ['Enter'], label: 'Open focused course (or first selected)' },
      { keys: ['O'], label: 'Open focused course on Canvas' },
      { keys: ['Shift', 'Enter'], label: 'Open focused course on Canvas' },
      // Bulk / focused actions (selection wins; else act on focused card)
      { keys: ['H'], label: 'Hide selected or focused course' },
      { keys: ['Shift', 'H'], label: 'Unhide selected or focused course' },
      { keys: ['P'], label: 'Pin/unpin selected or focused course' },
      { keys: ['mod', 'Shift', 'A'], label: 'Archive selected or focused course' },
      // Filter mode
      { keys: ['F'], label: 'Toggle filters + enter filter mode' },
      {
        keys: ['Q', '/', 'E'],
        label: 'Filter mode: prev / next section (Subject → Type → Grade → Show Hidden)',
      },
      {
        keys: ['Shift', '←', '/', 'Shift', '→'],
        label: 'Filter mode: prev / next section (alt)',
      },
      {
        keys: ['A', '/', '←', '/', 'D', '/', '→', '/', 'W', '/', '↑', '/', 'S', '/', '↓'],
        label: 'Filter mode: walk options within the focused section',
      },
      {
        keys: ['Space', '/', 'Enter'],
        label: 'Filter mode: toggle focused option (on Clear row → clears all filters)',
      },
      // Quick-access filter shortcuts (work outside filter mode too)
      { keys: ['Alt', 'Shift', 'C'], label: 'Clear all filters' },
      { keys: ['Alt', 'Shift', 'G'], label: 'Cycle Grade filter' },
      { keys: ['Alt', 'Shift', 'T'], label: 'Cycle Type filter' },
      { keys: ['Alt', 'Shift', 'S'], label: 'Cycle Subject filter' },
      { keys: ['Alt', 'Shift', 'H'], label: 'Toggle Show Hidden' },
      // Escape cascade
      {
        keys: ['Escape'],
        label:
          'Exit filter mode → close panel → clear selection → clear focus (falls through)',
      },
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
