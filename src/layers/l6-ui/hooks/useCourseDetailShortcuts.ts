/**
 * useCourseDetailShortcuts - Course detail page keyboard shortcuts
 *
 * N: create new task
 * X: toggle completion on focused task
 * E: edit focused task
 * Delete: delete focused task
 * Space: expand/collapse focused task
 */

import { useHotkeys } from 'react-hotkeys-hook';
import type { UseFocusedItemResult } from './useFocusedItem';

export interface CourseDetailShortcutActions {
  createTask: () => void;
  toggleComplete: (taskId: number, isCompleted: boolean) => void;
  editTask: (taskId: number) => void;
  deleteTask: (taskId: number) => void;
  toggleExpand: (taskId: number) => void;
  focusedItem: UseFocusedItemResult<{ id: number; isCompleted?: boolean }>['focusedItem'];
}

export function useCourseDetailShortcuts(actions: CourseDetailShortcutActions): void {
  useHotkeys('n', () => actions.createTask());
  useHotkeys('x', () => {
    const item = actions.focusedItem;
    if (item) actions.toggleComplete(item.id, !!item.isCompleted);
  });
  useHotkeys('e', () => {
    const item = actions.focusedItem;
    if (item) actions.editTask(item.id);
  });
  useHotkeys('delete, backspace', (e) => {
    const item = actions.focusedItem;
    if (item) {
      e.preventDefault();
      actions.deleteTask(item.id);
    }
  });
  useHotkeys('space', (e) => {
    const item = actions.focusedItem;
    if (item) {
      e.preventDefault();
      actions.toggleExpand(item.id);
    }
  });
}
