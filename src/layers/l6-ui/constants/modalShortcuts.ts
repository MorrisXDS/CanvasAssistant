/**
 * Modal Shortcuts Data
 *
 * Centralised registry of `ShortcutCategory` entries for the modals exposed by
 * the `<Modal shortcuts={...}>` prop. The `KeyboardShortcutsModal` (the `?`
 * help menu) shows these in Tab 1 when their modal is the topmost on the
 * stack, overriding the underlying page's shortcuts.
 *
 * Design — see [docs/adr/0006-modal-stack-aware-hotkey-suppression.md](../../../../docs/adr/0006-modal-stack-aware-hotkey-suppression.md).
 *
 * `ShortcutCategory` is reused as-is from `keyboardShortcuts.ts`; modal
 * entries simply omit `scope` and `subscope` (those fields are for page-route
 * matching and have no meaning for modals).
 *
 * Categories are populated incrementally as modals migrate to declare their
 * shortcuts via the `<Modal shortcuts={...}>` prop (Phase 5 of ADR-0006
 * rollout). Each entry below corresponds to one such modal.
 */

import type { ShortcutCategory } from './keyboardShortcuts';

// ---------------------------------------------------------------------------
// Modal categories — wired via `<Modal shortcuts={...}>` on each consuming
// modal. The help menu (`KeyboardShortcutsModal`) surfaces the topmost OTHER
// modal's category in Tab 1 when its modal is on the stack.
// ---------------------------------------------------------------------------

/** DuplicateWarningModal — main mode (list of incoming items + action keys). */
export const DUPLICATE_WARNING_SHORTCUTS: ShortcutCategory = {
  title: 'Duplicate warning',
  shortcuts: [
    { keys: ['L'], label: 'Link to existing task' },
    { keys: ['S'], label: 'Keep separate' },
    { keys: ['A'], label: 'Toggle select all (bulk mode)' },
    { keys: ['Space'], label: 'Toggle selection on focused item' },
    { keys: ['↑'], label: 'Previous item' },
    { keys: ['↓'], label: 'Next item' },
    { keys: ['C'], label: 'Customize merge fields' },
    { keys: ['Enter'], label: 'Confirm (bulk mode)' },
    { keys: ['Esc'], label: 'Cancel' },
  ],
};

/** Customize child modal opened from DuplicateWarningModal's [C] / [⚙] buttons. */
export const DUPLICATE_WARNING_CUSTOMIZE_SHORTCUTS: ShortcutCategory = {
  title: 'Customize fields',
  shortcuts: [
    { keys: ['↑'], label: 'Previous conflict field' },
    { keys: ['↓'], label: 'Next conflict field' },
    { keys: ['←', '/', '1'], label: 'Use Canvas value for focused field' },
    { keys: ['→', '/', '2'], label: 'Use your value for focused field' },
    { keys: ['Q'], label: 'Use ALL Canvas values' },
    { keys: ['E'], label: 'Use ALL your task values' },
    { keys: ['Enter'], label: 'Save and close' },
    { keys: ['Esc'], label: 'Cancel changes' },
  ],
};

/** Calendar TaskDetailModal — task detail view with edit/delete/etc. */
export const TASK_DETAIL_MODAL_SHORTCUTS: ShortcutCategory = {
  title: 'Task detail',
  shortcuts: [
    { keys: ['E'], label: 'Edit task' },
    { keys: ['G'], label: 'Go to course' },
    { keys: ['X'], label: 'Mark complete' },
    { keys: ['Del', '/', 'Backspace'], label: 'Delete task' },
    { keys: ['Esc'], label: 'Close' },
  ],
};

/** Generic ConfirmDialog (used in 58+ call sites). */
export const CONFIRM_DIALOG_SHORTCUTS: ShortcutCategory = {
  title: 'Confirm dialog',
  shortcuts: [{ keys: ['Esc'], label: 'Cancel' }],
};

/** Convenience array — wire individual constants into their modals via
 * `<Modal shortcuts={X}>`. The array isn't consumed anywhere; it exists so
 * the file can be audited at a glance. */
export const MODAL_SHORTCUTS: ReadonlyArray<ShortcutCategory> = [
  DUPLICATE_WARNING_SHORTCUTS,
  DUPLICATE_WARNING_CUSTOMIZE_SHORTCUTS,
  TASK_DETAIL_MODAL_SHORTCUTS,
  CONFIRM_DIALOG_SHORTCUTS,
];

// Re-export the type for convenience so modal callers don't need to reach
// into `./keyboardShortcuts` for it.
export type { ShortcutCategory } from './keyboardShortcuts';
