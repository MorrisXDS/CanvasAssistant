/**
 * useCoursesShortcuts - Courses page keyboard shortcuts
 *
 * V: toggle grid/list view
 * F: toggle filter panel
 * Enter: open focused/selected course
 * H: hide/show selected courses
 * P: pin/unpin selected courses
 */

import { useHotkeys } from 'react-hotkeys-hook';

export interface CoursesShortcutActions {
  toggleView: () => void;
  toggleFilters: () => void;
  openSelected: () => void;
  hideSelected: () => void;
  pinSelected: () => void;
}

export function useCoursesShortcuts(actions: CoursesShortcutActions): void {
  useHotkeys('v', () => actions.toggleView());
  useHotkeys('f', () => actions.toggleFilters());
  useHotkeys('enter', (e) => {
    e.preventDefault();
    actions.openSelected();
  });
  useHotkeys('h', () => actions.hideSelected());
  useHotkeys('p', () => actions.pinSelected());
}
