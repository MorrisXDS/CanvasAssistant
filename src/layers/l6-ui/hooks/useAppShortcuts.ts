/**
 * useAppShortcuts - Global keyboard shortcuts for navigation and search
 *
 * Registered in Layout.tsx, active app-wide.
 * - Mod+1..5: Navigate to fixed page order (Dashboard, Calendar, Courses, Files, Settings)
 * - Mod+F: Focus search input on current page
 */

import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';

/** Fixed nav order — not affected by sidebar drag reordering */
const NAV_ROUTES = ['/', '/calendar', '/courses', '/files', '/settings'];

export function useAppShortcuts(): void {
  const navigate = useNavigate();

  // Mod+1..5 — page navigation
  useHotkeys('mod+1', () => navigate(NAV_ROUTES[0]), { preventDefault: true });
  useHotkeys('mod+2', () => navigate(NAV_ROUTES[1]), { preventDefault: true });
  useHotkeys('mod+3', () => navigate(NAV_ROUTES[2]), { preventDefault: true });
  useHotkeys('mod+4', () => navigate(NAV_ROUTES[3]), { preventDefault: true });
  useHotkeys('mod+5', () => navigate(NAV_ROUTES[4]), { preventDefault: true });

  // Mod+F — focus search input on current page
  useHotkeys('mod+f', () => {
    const input = document.querySelector<HTMLInputElement>('[data-search-input]');
    if (input) {
      input.focus();
      input.select();
    }
  }, { preventDefault: true });
}
