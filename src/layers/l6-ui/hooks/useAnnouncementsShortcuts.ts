/**
 * useAnnouncementsShortcuts - Announcements page keyboard shortcuts
 *
 * Enter: open focused announcement
 * D: dismiss focused announcement
 * 1/2/3: filter tabs (All/Unread/Dismissed)
 */

import { useHotkeys } from 'react-hotkeys-hook';
import type { UseFocusedItemResult } from './useFocusedItem';

export interface AnnouncementsShortcutActions {
  setReadFilter: (filter: string) => void;
  openAnnouncement: (id: number) => void;
  dismissAnnouncement: (id: number) => void;
  focusedItem: UseFocusedItemResult<{ id: number }>['focusedItem'];
}

export function useAnnouncementsShortcuts(actions: AnnouncementsShortcutActions): void {
  useHotkeys('1', () => actions.setReadFilter('all'));
  useHotkeys('2', () => actions.setReadFilter('unread'));
  useHotkeys('3', () => actions.setReadFilter('dismissed'));
  useHotkeys('enter', (e) => {
    const item = actions.focusedItem;
    if (item) {
      e.preventDefault();
      actions.openAnnouncement(item.id);
    }
  });
  useHotkeys('d', () => {
    const item = actions.focusedItem;
    if (item) actions.dismissAnnouncement(item.id);
  });
}
