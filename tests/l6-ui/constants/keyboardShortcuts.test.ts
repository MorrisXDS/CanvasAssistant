/**
 * Tests for the page-scoped keyboard-shortcut registry (`keyboardShortcuts.ts`).
 *
 * This registry drives the `?` Help modal's per-page display. It carries NO key
 * handling — handlers live in each page's `useKeymap` / `useStackAwareHotkeys`
 * call. These assertions pin the help-text accuracy fixes from
 * `fix/keyboard-registry-accuracy` (5 pure-data edits):
 *
 *   1. `C` (Customize) added to the `updates`-scope "Duplicate warning" block.
 *   2. The `A`-key label in that block aligned to `modalShortcuts.ts`.
 *   3. Dead `Shift+W` / `Shift+S` removed from the Calendar events block.
 *   4. Spurious standalone-`Enter` removed from the Calendar filter block.
 *   5. `Backspace` documented alongside `Delete` in the Calendar events delete
 *      entry and the CourseDetail nav task-delete entry.
 *
 * `modalShortcuts.ts` is imported only as a comparison fixture for the
 * registry-vs-modal consistency assertions (fixes 1 & 2). It is unchanged.
 */

import {
  KEYBOARD_SHORTCUTS,
  getScopeForPath,
  type ShortcutCategory,
  type ShortcutEntry,
} from '../../../src/layers/l6-ui/constants/keyboardShortcuts';
import { DUPLICATE_WARNING_SHORTCUTS } from '../../../src/layers/l6-ui/constants/modalShortcuts';

/** Find a category by scope (+ optional subscope). */
function findCategory(scope: string, subscope?: string): ShortcutCategory | undefined {
  return KEYBOARD_SHORTCUTS.find(
    (c) => c.scope === scope && (subscope === undefined || c.subscope === subscope)
  );
}

/** True if a shortcut entry's keys array contains the given token. */
function hasKey(entry: ShortcutEntry, token: string): boolean {
  return entry.keys.includes(token);
}

describe('keyboardShortcuts registry', () => {
  it('exports KEYBOARD_SHORTCUTS as a non-empty array of well-formed categories', () => {
    expect(Array.isArray(KEYBOARD_SHORTCUTS)).toBe(true);
    expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0);
    for (const cat of KEYBOARD_SHORTCUTS) {
      expect(typeof cat.title).toBe('string');
      expect(Array.isArray(cat.shortcuts)).toBe(true);
      for (const s of cat.shortcuts) {
        expect(Array.isArray(s.keys)).toBe(true);
        expect(s.keys.length).toBeGreaterThan(0);
        expect(typeof s.label).toBe('string');
      }
    }
  });

  describe('Fix 1 — Duplicate warning block has a C (Customize) entry', () => {
    it('contains a C entry whose label matches modalShortcuts.ts exactly', () => {
      const dup = findCategory('updates', undefined);
      // There are two `updates`-scoped categories (Updates + Duplicate warning);
      // disambiguate by title.
      const block = KEYBOARD_SHORTCUTS.find(
        (c) => c.scope === 'updates' && c.title === 'Duplicate warning'
      );
      expect(block).toBeDefined();
      const cEntry = block!.shortcuts.find((s) => s.keys[0] === 'C');
      expect(cEntry).toBeDefined();

      const modalC = DUPLICATE_WARNING_SHORTCUTS.shortcuts.find((s) => s.keys[0] === 'C');
      expect(modalC).toBeDefined();
      expect(cEntry!.label).toBe(modalC!.label);
      // Pin the concrete wording too so a one-sided drift is caught.
      expect(cEntry!.label).toBe('Customize merge fields');
      // `dup` (first updates-scope match) is intentionally unused beyond the guard.
      expect(dup).toBeDefined();
    });
  });

  describe('Fix 2 — Duplicate warning A-key label aligned to modalShortcuts.ts', () => {
    it("the A entry label is 'Toggle select all (bulk mode)' and matches the modal registry", () => {
      const block = KEYBOARD_SHORTCUTS.find(
        (c) => c.scope === 'updates' && c.title === 'Duplicate warning'
      )!;
      const aEntry = block.shortcuts.find((s) => s.keys[0] === 'A');
      expect(aEntry).toBeDefined();
      expect(aEntry!.label).toBe('Toggle select all (bulk mode)');

      const modalA = DUPLICATE_WARNING_SHORTCUTS.shortcuts.find(
        (s) => s.keys[0] === 'A'
      )!;
      expect(aEntry!.label).toBe(modalA.label);
    });
  });

  describe('Fix 3 — Calendar events block has no dead Shift+W / Shift+S entries', () => {
    it('contains no entry pairing Shift with W or S', () => {
      const events = findCategory('calendar', 'events');
      expect(events).toBeDefined();
      const offending = events!.shortcuts.filter(
        (s) => hasKey(s, 'Shift') && (hasKey(s, 'W') || hasKey(s, 'S'))
      );
      expect(offending).toEqual([]);
    });
  });

  describe('Fix 4 — Calendar filter block has no standalone Enter-only entry', () => {
    it('does not contain an entry whose keys array is exactly [Enter]', () => {
      const filter = findCategory('calendar', 'filter');
      expect(filter).toBeDefined();
      const enterOnly = filter!.shortcuts.filter(
        (s) => s.keys.length === 1 && s.keys[0] === 'Enter'
      );
      expect(enterOnly).toEqual([]);
      // The combined Space/Enter toggle entry is still present and correct.
      const combo = filter!.shortcuts.find(
        (s) => hasKey(s, 'Space') && hasKey(s, 'Enter')
      );
      expect(combo).toBeDefined();
    });
  });

  describe('Fix 5a — Calendar events delete entry documents Backspace', () => {
    it('the delete-event entry includes both Delete and Backspace', () => {
      const events = findCategory('calendar', 'events')!;
      const del = events.shortcuts.find((s) =>
        s.label.startsWith('Delete focused event')
      );
      expect(del).toBeDefined();
      expect(hasKey(del!, 'Delete')).toBe(true);
      expect(hasKey(del!, 'Backspace')).toBe(true);
    });
  });

  describe('Fix 5b — CourseDetail nav task-delete entry documents Backspace', () => {
    it('the Tasks delete entry includes both Delete and Backspace', () => {
      const nav = findCategory('course-detail', 'nav');
      expect(nav).toBeDefined();
      const del = nav!.shortcuts.find((s) => s.label === 'Tasks: delete focused task');
      expect(del).toBeDefined();
      expect(hasKey(del!, 'Delete')).toBe(true);
      expect(hasKey(del!, 'Backspace')).toBe(true);
    });
  });

  describe('getScopeForPath — branch coverage', () => {
    it('resolves a matching prefix to its scope (exact + sub-path)', () => {
      // Exact-prefix match.
      expect(getScopeForPath('/calendar')).toBe('calendar');
      // Sub-path match via `startsWith(prefix + '/')`.
      expect(getScopeForPath('/calendar/week')).toBe('calendar');
      // '/updates' resolves over the '/' fallback (longest-prefix-first ordering).
      expect(getScopeForPath('/updates')).toBe('updates');
      // Exact root maps to dashboard (the special-cased '/' branch).
      expect(getScopeForPath('/')).toBe('dashboard');
    });

    it('returns null for a non-matching path', () => {
      // No prefix in ROUTE_SCOPE_MAP matches, and '/' only matches exact '/'.
      expect(getScopeForPath('/nonexistent-route')).toBeNull();
    });
  });
});
