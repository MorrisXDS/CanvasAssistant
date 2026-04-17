/**
 * useCalendarShortcuts - Calendar page keyboard shortcuts
 *
 * Left/Right: prev/next period
 * T: go to today
 * V: cycle view mode (month/week)
 * F: toggle filter panel
 */

import { useHotkeys } from 'react-hotkeys-hook';

export interface CalendarShortcutActions {
  goToPrev: () => void;
  goToNext: () => void;
  goToToday: () => void;
  cycleView: () => void;
  toggleFilters: () => void;
}

export function useCalendarShortcuts(actions: CalendarShortcutActions): void {
  useHotkeys('left', (e) => {
    e.preventDefault();
    actions.goToPrev();
  });
  useHotkeys('right', (e) => {
    e.preventDefault();
    actions.goToNext();
  });
  useHotkeys('t', () => actions.goToToday());
  useHotkeys('v', () => actions.cycleView());
  useHotkeys('f', () => actions.toggleFilters());
}
