/**
 * Keyboard Shortcuts Data
 *
 * Typed shortcut definitions used by KeyboardShortcutsModal.
 * Key tokens: "mod" resolves to ⌘ (macOS) or Ctrl (Windows/Linux).
 */

export interface ShortcutEntry {
  /** Abstract key tokens, e.g. ["mod", "1"] */
  keys: string[];
  /** Human-readable description */
  label: string;
}

export interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutEntry[];
}

export const KEYBOARD_SHORTCUTS: ShortcutCategory[] = [
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
      { keys: ['?'], label: 'Show keyboard shortcuts' },
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
];
