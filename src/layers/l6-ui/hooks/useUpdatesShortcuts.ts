/**
 * useUpdatesShortcuts - Updates page keyboard shortcuts
 *
 * A: accept focused queued task
 * 1-6: switch info filter tabs
 */

import { useHotkeys } from 'react-hotkeys-hook';
import type { UseFocusedItemResult } from './useFocusedItem';

export interface UpdatesShortcutActions {
  setFilter: (filter: string) => void;
  acceptTask: (entityId: number) => void;
  focusedItem: UseFocusedItemResult<{ entityId?: number }>['focusedItem'];
}

const FILTER_MAP: Record<string, string> = {
  '1': 'all',
  '2': 'task',
  '3': 'grade',
  '4': 'file',
  '5': 'page',
  '6': 'announcement',
};

export function useUpdatesShortcuts(actions: UpdatesShortcutActions): void {
  useHotkeys('1, 2, 3, 4, 5, 6', (e, handler) => {
    const key = handler.keys?.join('') || '';
    const filter = FILTER_MAP[key];
    if (filter) actions.setFilter(filter);
  });
  useHotkeys('a', () => {
    const item = actions.focusedItem;
    if (item?.entityId) actions.acceptTask(item.entityId);
  });
}
