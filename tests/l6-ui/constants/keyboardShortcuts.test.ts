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

  // 5.4 — the Updates 'Updates'-scope row-nav entries now list ALL aliases:
  // J/K (legacy, kept) + W/S + ↑/↓ + ←/→. The hook (`useFocusedItem` with
  // `bindBothNavAxes: true`) binds all four families; the registry must list them
  // honestly (§2 registry-vs-binding honesty rule). The separate 'Duplicate
  // warning' updates-scope category MUST stay untouched (its own S = Keep separate).
  describe('5.4 — Updates row-nav lists J/K + W/S + arrow aliases', () => {
    function updatesNavCategory(): ShortcutCategory {
      // There are TWO updates-scope categories (Updates + Duplicate warning);
      // disambiguate by title, exactly as the Fix-1/Fix-2 tests do.
      const cat = KEYBOARD_SHORTCUTS.find(
        (c) => c.scope === 'updates' && c.title === 'Updates'
      );
      expect(cat).toBeDefined();
      return cat!;
    }

    it("'Focus previous item' lists all of ↑, W, ←, J", () => {
      const prev = updatesNavCategory().shortcuts.find(
        (s) => s.label === 'Focus previous item'
      );
      expect(prev).toBeDefined();
      for (const token of ['↑', 'W', '←', 'J']) {
        expect(hasKey(prev!, token)).toBe(true);
      }
    });

    it("'Focus next item' lists all of ↓, S, →, K", () => {
      const next = updatesNavCategory().shortcuts.find(
        (s) => s.label === 'Focus next item'
      );
      expect(next).toBeDefined();
      for (const token of ['↓', 'S', '→', 'K']) {
        expect(hasKey(next!, token)).toBe(true);
      }
    });

    it('did NOT bleed edits into the Duplicate warning category (its S = Keep separate survives)', () => {
      const dup = KEYBOARD_SHORTCUTS.find(
        (c) => c.scope === 'updates' && c.title === 'Duplicate warning'
      );
      expect(dup).toBeDefined();
      const keepSeparate = dup!.shortcuts.find(
        (s) => s.keys.length === 1 && s.keys[0] === 'S'
      );
      expect(keepSeparate).toBeDefined();
      expect(keepSeparate!.label).toBe('Keep separate');
    });
  });

  // C3 — the section-nav static rows were dropped from the registry; the dynamic
  // "This page's sections" block (rendered by KeyboardShortcutsModal from
  // useSectionScope's live broadcast) is now the SOLE source of the Alt+1..N
  // section-jump help text. These negative assertions pin the deletion.
  //
  // CRITICAL TRAP: the Calendar EVENT-FORM rows use the SAME key array
  // (['Alt','1'] / ['Alt','2']) as the dropped section rows but a DIFFERENT label
  // ("Event form: select Regular/Coursework type"). The negative assertions MUST
  // disambiguate by LABEL — asserting by the key array would wrongly flag the
  // kept event-form rows as gone.
  describe('C3 — section-nav static rows dropped (dynamic block owns them)', () => {
    it('Calendar category has NO "Section:" static row, but KEEPS the event-form Alt+1/Alt+2 rows', () => {
      // The Calendar events category is scope:'calendar', subscope:'events' —
      // it held the dropped section rows AND keeps the event-form Alt+1/2 rows.
      const calendar = findCategory('calendar', 'events');
      expect(calendar).toBeDefined();

      // Dropped: any entry whose label begins with 'Section:' (the two removed
      // section-jump rows were 'Section: Calendar grid' / 'Section: Filter panel …').
      const sectionRows = calendar!.shortcuts.filter((s) =>
        s.label.startsWith('Section:')
      );
      expect(sectionRows).toEqual([]);

      // KEPT (the trap): the event-form Alt+1 / Alt+2 rows share the ['Alt','1'] /
      // ['Alt','2'] keys but carry a distinct 'Event form:' label — they survive.
      const regularType = calendar!.shortcuts.find(
        (s) => s.label === 'Event form: select Regular type'
      );
      const courseworkType = calendar!.shortcuts.find(
        (s) => s.label === 'Event form: select Coursework type'
      );
      expect(regularType).toBeDefined();
      expect(regularType!.keys).toEqual(['Alt', '1']);
      expect(courseworkType).toBeDefined();
      expect(courseworkType!.keys).toEqual(['Alt', '2']);
    });

    it('Calendar category KEEPS the Q/E grid entries and the Alt+Shift course-filter row', () => {
      const calendar = findCategory('calendar', 'events')!;
      // Q/E grid-nav entries survive (they were never section-cycle here).
      expect(
        calendar.shortcuts.some((s) => s.keys.length === 1 && s.keys[0] === 'Q')
      ).toBe(true);
      expect(
        calendar.shortcuts.some((s) => s.keys.length === 1 && s.keys[0] === 'E')
      ).toBe(true);
      // The Alt+Shift+1..9 course-filter row (NOT section-nav) survives.
      const courseFilter = calendar.shortcuts.find(
        (s) => s.label === 'Toggle course filter by index'
      );
      expect(courseFilter).toBeDefined();
      expect(hasKey(courseFilter!, 'Alt')).toBe(true);
      expect(hasKey(courseFilter!, 'Shift')).toBe(true);
    });

    it('Courses category has NO "Jump to Courses/Filter section" rows, KEEPS the Alt+Shift filter cycles', () => {
      const courses = findCategory('courses', 'courses');
      expect(courses).toBeDefined();

      // Dropped: 'Jump to Courses section' / 'Jump to Filter panel (when open)'.
      const jumpRows = courses!.shortcuts.filter(
        (s) =>
          s.label === 'Jump to Courses section' ||
          s.label === 'Jump to Filter panel (when open)'
      );
      expect(jumpRows).toEqual([]);
      // Belt-and-suspenders: no bare ['Alt','1'] / ['Alt','2'] survive in Courses
      // (unlike Calendar, this category has no legit event-form Alt+digit rows).
      const bareAltDigit = courses!.shortcuts.filter(
        (s) =>
          s.keys.length === 2 &&
          s.keys[0] === 'Alt' &&
          (s.keys[1] === '1' || s.keys[1] === '2')
      );
      expect(bareAltDigit).toEqual([]);

      // KEPT: the Alt+Shift+C/G/T/S/H filter cycles survive (e.g. Clear all filters).
      const clear = courses!.shortcuts.find((s) => s.label === 'Clear all filters');
      expect(clear).toBeDefined();
      expect(hasKey(clear!, 'Alt')).toBe(true);
      expect(hasKey(clear!, 'Shift')).toBe(true);
    });

    it('CourseDetail nav category has NO "Jump directly to section N" row, KEEPS the Q/E cycle entry', () => {
      const nav = findCategory('course-detail', 'nav');
      expect(nav).toBeDefined();

      // Dropped: the single Alt+1–N summary row.
      const summaryRow = nav!.shortcuts.filter(
        (s) => s.label === 'Jump directly to section N (available sections only)'
      );
      expect(summaryRow).toEqual([]);

      // KEPT: the Q/E section-cycle entry survives (label begins 'Cycle sections').
      const cycle = nav!.shortcuts.find((s) => s.label.startsWith('Cycle sections'));
      expect(cycle).toBeDefined();
      expect(hasKey(cycle!, 'Q')).toBe(true);
      expect(hasKey(cycle!, 'E')).toBe(true);
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

  // 5.6 — regression for the trailing-slash bug. The ROUTE_SCOPE_MAP keys
  // '/course/' and '/announcement/' already END in '/'. The old matcher did
  // `pathname.startsWith(prefix + '/')` → `startsWith('/course//')`, which NEVER
  // matches a real `/course/123` path — so the page-help scope on the Course
  // Detail and Announcement Detail pages always resolved to `null`, and the `?`
  // help modal showed the GLOBAL shortcuts instead of the page-specific ones.
  // The fix normalises the needle so '/course/' keys produce '/course/' (not
  // '/course//') while still keeping the trailing '/' that stops '/course/' from
  // greedily swallowing '/courses'.
  describe('getScopeForPath — 5.6 trailing-slash bug fix (regression)', () => {
    it("resolves '/course/:id' to 'course-detail' (was null before the fix)", () => {
      expect(getScopeForPath('/course/123')).toBe('course-detail');
    });

    it("resolves '/announcement/:id' to 'announcement-detail' (was null before the fix)", () => {
      expect(getScopeForPath('/announcement/45')).toBe('announcement-detail');
    });

    // R1 — the load-bearing greedy-prefix guard. The trailing-slash fix must NOT
    // let '/course/' match '/courses' or '/announcement/' match '/announcements'.
    it("does NOT let '/course/' swallow '/courses' (R1 greedy-prefix guard)", () => {
      expect(getScopeForPath('/courses')).toBe('courses');
    });

    it("does NOT let '/announcement/' swallow '/announcements' (R1 greedy-prefix guard)", () => {
      expect(getScopeForPath('/announcements')).toBe('announcements');
    });

    // R2 — the '/' special-case must still resolve ONLY for exact root and not be
    // dragged in by the refactored needle logic.
    it("keeps '/' exact-only → 'dashboard'", () => {
      expect(getScopeForPath('/')).toBe('dashboard');
    });

    it("resolves '/calendar' and a calendar sub-path", () => {
      expect(getScopeForPath('/calendar')).toBe('calendar');
      expect(getScopeForPath('/calendar/week')).toBe('calendar');
    });

    it('returns null for an unknown path', () => {
      expect(getScopeForPath('/nope')).toBeNull();
    });
  });

  // 5.2 — the Settings-scope Esc entry is relabelled to the honest 'Close'
  // (SettingsModalContent only closes via the Modal primitive; it does not
  // clear-search-then-close).
  describe('5.2 — Settings Esc label is honest', () => {
    it("the Settings-scope Escape entry label is exactly 'Close'", () => {
      const settings = findCategory('settings');
      expect(settings).toBeDefined();
      const esc = settings!.shortcuts.find(
        (s) => s.keys.length === 1 && s.keys[0] === 'Escape'
      );
      expect(esc).toBeDefined();
      expect(esc!.label).toBe('Close');
      expect(esc!.label).not.toBe('Clear search, then close');
    });
  });

  // 5.3 — the 3 Dashboard row-nav entries (backtick switch-row, Tab cycle,
  // Shift+Tab cycle-backward) are re-documented in the registry: they ARE
  // implemented and live in `Dashboard.tsx:235-291` (two raw `document`
  // keydown handlers), but PR #111 wrongly removed them from the registry as
  // "unimplemented", so the Help modal silently omitted 3 working shortcuts.
  // They are restored here alongside the other real entries (↑/W, ↓/S, X,
  // Enter, D, V, R).
  describe('5.3 — Dashboard row-nav entries present, real entries survive', () => {
    it('contains the backtick / Tab / Shift+Tab row-nav entries with honest labels', () => {
      const dashboard = findCategory('dashboard');
      expect(dashboard).toBeDefined();
      const backtick = dashboard!.shortcuts.find(
        (s) => s.keys.length === 1 && s.keys[0] === '`'
      );
      const tabOnly = dashboard!.shortcuts.find(
        (s) => s.keys.length === 1 && s.keys[0] === 'Tab'
      );
      const shiftTab = dashboard!.shortcuts.find(
        (s) => hasKey(s, 'Shift') && hasKey(s, 'Tab')
      );
      expect(backtick).toBeDefined();
      expect(backtick!.label).toBe('Switch between top (stats) and bottom (lists) row');
      expect(tabOnly).toBeDefined();
      expect(tabOnly!.label).toBe(
        'Cycle stat cards (top row) / cycle lists (bottom row)'
      );
      expect(shiftTab).toBeDefined();
      expect(shiftTab!.label).toBe('Cycle backward');
    });

    it('keeps the real Dashboard entries (↑/W, ↓/S, X, Enter, D, V, R)', () => {
      const dashboard = findCategory('dashboard')!;
      // Up/W previous, Down/S next.
      expect(dashboard.shortcuts.some((s) => hasKey(s, '↑') && hasKey(s, 'W'))).toBe(
        true
      );
      expect(dashboard.shortcuts.some((s) => hasKey(s, '↓') && hasKey(s, 'S'))).toBe(
        true
      );
      // Single-key real entries.
      for (const token of ['X', 'Enter', 'D', 'V', 'R']) {
        expect(
          dashboard.shortcuts.some((s) => s.keys.length === 1 && s.keys[0] === token)
        ).toBe(true);
      }
    });
  });
});
