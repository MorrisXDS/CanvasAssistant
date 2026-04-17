/**
 * useDashboardShortcuts - Dashboard page keyboard shortcuts
 *
 * X: toggle completion on focused task
 * R: refresh/sync
 */

import { useHotkeys } from 'react-hotkeys-hook';
import type { UseFocusedItemResult } from './useFocusedItem';

export interface DashboardShortcutActions {
  toggleComplete: (taskId: number, isCompleted: boolean) => void;
  refresh: () => void;
  focusedItem: UseFocusedItemResult<{ id: number; isCompleted?: boolean }>['focusedItem'];
}

export function useDashboardShortcuts(actions: DashboardShortcutActions): void {
  useHotkeys('x', () => {
    const item = actions.focusedItem;
    if (item) actions.toggleComplete(item.id, !!item.isCompleted);
  });
  useHotkeys('r', () => actions.refresh());
}
