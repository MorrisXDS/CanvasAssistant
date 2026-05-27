/**
 * useAppShortcuts - Global keyboard shortcuts for navigation
 *
 * Registered in Layout.tsx, active app-wide.
 * - Mod+1..5: Navigate to fixed page order (Dashboard, Calendar, Courses, Files, Settings)
 *
 * These shortcuts intentionally use plain `useHotkeys` (NOT `useStackAwareHotkeys`)
 * because they must fire even when a modal is open — pressing `Mod+1` should always
 * navigate to the Dashboard regardless of stack state. They are the canonical example
 * of the `escapeStackGate` exemption category in ADR-0006.
 */

import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';

/** Fixed nav order — not affected by sidebar drag reordering */
const NAV_ROUTES = ['/', '/calendar', '/courses', '/files', '/settings'];

export function useAppShortcuts(): void {
  const navigate = useNavigate();

  // Mod+1..5 — page navigation. Plain useHotkeys = always fires (ADR-0006 escape).
  useHotkeys('mod+1', () => navigate(NAV_ROUTES[0]), { preventDefault: true });
  useHotkeys('mod+2', () => navigate(NAV_ROUTES[1]), { preventDefault: true });
  useHotkeys('mod+3', () => navigate(NAV_ROUTES[2]), { preventDefault: true });
  useHotkeys('mod+4', () => navigate(NAV_ROUTES[3]), { preventDefault: true });
  useHotkeys('mod+5', () => navigate(NAV_ROUTES[4]), { preventDefault: true });
}
