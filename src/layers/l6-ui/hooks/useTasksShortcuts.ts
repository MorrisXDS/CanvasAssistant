/**
 * useTasksShortcuts - Tasks page keyboard shortcuts
 *
 * 1/2/3/4: filter tabs (All/Pending/Overdue/Completed)
 * N: add new task
 * X: toggle completion on focused task
 * Enter: open focused task in course
 */

import { useHotkeys } from 'react-hotkeys-hook';
import type { UseFocusedItemResult } from './useFocusedItem';

export interface TasksShortcutActions {
  setFilter: (filter: string) => void;
  openAddTask: () => void;
  toggleComplete: (taskId: number, isCompleted: boolean) => void;
  openTask: (taskId: number) => void;
  focusedItem: UseFocusedItemResult<{ id: number; isCompleted?: boolean }>['focusedItem'];
}

export function useTasksShortcuts(actions: TasksShortcutActions): void {
  useHotkeys('1', () => actions.setFilter('all'));
  useHotkeys('2', () => actions.setFilter('pending'));
  useHotkeys('3', () => actions.setFilter('overdue'));
  useHotkeys('4', () => actions.setFilter('completed'));
  useHotkeys('n', () => actions.openAddTask());
  useHotkeys('x', () => {
    const item = actions.focusedItem;
    if (item) actions.toggleComplete(item.id, !!item.isCompleted);
  });
  useHotkeys('enter', (e) => {
    const item = actions.focusedItem;
    if (item) {
      e.preventDefault();
      actions.openTask(item.id);
    }
  });
}
