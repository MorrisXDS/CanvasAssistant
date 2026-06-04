/**
 * @jest-environment jsdom
 *
 * Calendar — section-navigation migration + course-filter rebind
 * (Section-nav Phase 2, ADR-0010 / #114).
 *
 * Two user-facing changes are under test, both load-bearing:
 *
 *   A. COURSE-FILTER REBIND (muscle-memory change). The raw `document` keydown
 *      listener that toggles a course filter by index moved from `Alt+1..9` to
 *      `Alt+Shift+1..9`. Plain `Alt+1..9` is now section-jump (useSectionScope).
 *      The negative case — plain `Alt+1` does NOT toggle a filter — is the
 *      regression guard proving the rebind actually moved.
 *
 *   B. SECTION MIGRATION (bridge). `useKeymap<'events'|'filter'>` stays the
 *      keymap ROUTER, but `useSectionScope<'events'|'filter'>` now owns the
 *      `active` source of truth (Alt+1/Alt+2 direct-jump, the SectionBar
 *      indicator, the help-modal broadcast). A `useEffect([active])` mirrors
 *      `active` into the router. `enableCycle:false` — Q/E stay owned by the
 *      events keymap (day-column nav + edit), NOT section-cycle.
 *
 * Harness: the REAL `CalendarPage` is rendered (so the real `useSectionScope`,
 * the real `useKeymap` router, the real raw `Alt+Shift` listener, and the real
 * `SectionBar` all run together — the whole point is the integration). Only the
 * heavy / irrelevant children are stubbed at their module path:
 *   - `CalendarGrid` (react-window virtualization, DnD) → inert stub.
 *   - the five Calendar modals + `CalendarManagerPanel` + `ConfirmDialog` → null
 *     (they don't participate in section-nav and pull in luxon/portals).
 *   - `CalendarFilterPanel` → a stub that echoes its `keyboardSection` prop into
 *     the DOM (the risk-4 rewired-consumer observation point, plan case 12).
 * `SectionBar` is left REAL — it is the visible indicator under test.
 *
 * `ModalStackProvider` is required so `useStackAwareHotkeys`' modal-stack gate is
 * open (the hook's Alt+1/2 bindings register through it). `KeyboardScopeProvider`
 * is required because the hook broadcasts `activeSections` to it (plan case 13).
 * Keydown idiom mirrors `CourseDetail.sectionNav.test.tsx` (real keydown on
 * `document`; `act()` per the jsdom act-guard).
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Child stubs — mocked at their OWN module file (Jest resolves module mocks by
// resolved path). The Calendar page imports each directly, so the stub
// intercepts. CalendarGrid re-exports types too, but types are erased at
// runtime — the factory only needs to supply the runtime value (the component).
// ---------------------------------------------------------------------------
jest.mock('../../../../src/layers/l6-ui/components/Calendar/CalendarGrid', () => ({
  CalendarGrid: () => <div data-testid="calendar-grid" />,
}));
jest.mock(
  '../../../../src/layers/l6-ui/components/Calendar/ImportConfirmationModal',
  () => ({ ImportConfirmationModal: () => null })
);
jest.mock(
  '../../../../src/layers/l6-ui/components/Calendar/DuplicateCalendarModal',
  () => ({ DuplicateCalendarModal: () => null })
);
jest.mock(
  '../../../../src/layers/l6-ui/components/Calendar/CalendarManagerPanel',
  () => ({ CalendarManagerPanel: () => null })
);
jest.mock('../../../../src/layers/l6-ui/components/Calendar/TaskDetailModal', () => ({
  TaskDetailModal: () => null,
}));
jest.mock('../../../../src/layers/l6-ui/components/Calendar/EventFormModal', () => ({
  EventFormModal: () => null,
}));
jest.mock('../../../../src/layers/l6-ui/components/shared/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));
// CalendarFilterPanel stub — echoes the `keyboardSection` prop the page passes
// (the rewired site #1 consumer, `active !== 'filter' ? null : …`). Keep the
// real type exports (DeadlineFilter/PriorityFilter) so the page's value imports
// resolve — those are types only, erased at runtime; the factory supplies the
// component value.
jest.mock('../../../../src/layers/l6-ui/components/Calendar/CalendarFilterPanel', () => ({
  CalendarFilterPanel: ({
    keyboardSection,
    selectedCourses,
  }: {
    keyboardSection?: string | null;
    selectedCourses?: Set<number> | null;
  }) => (
    <div
      data-testid="filter-panel"
      data-kbd-section={String(keyboardSection)}
      // `selectedCourses` is the page's course-filter state (null === "all"
      // selected). Serialize it so the rebind tests can assert exactly which
      // course toggleCourseFilter touched, sorted for determinism.
      data-selected-courses={
        selectedCourses == null
          ? 'all'
          : JSON.stringify([...selectedCourses].sort((a, b) => a - b))
      }
    />
  ),
}));

// Import AFTER the mocks so the page picks up the stubbed children.
import { ModalStackProvider } from '../../../../src/layers/l6-ui/contexts/ModalStackContext';
import { KeyboardScopeProvider } from '../../../../src/layers/l6-ui/contexts/KeyboardScopeContext';
import { CalendarPage } from '../../../../src/layers/l6-ui/components/Calendar';
import { useStore } from '../../../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../../../test-utils/testEnv';
import type { Course } from '../../../../src/layers/l5-presentation/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCourse(id: number, overrides: Partial<Course> = {}): Course {
  return {
    id,
    externalId: `ext-${id}`,
    code: `CS${id}0${id}`,
    name: `Course ${id}`,
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: null,
    currentGrade: null,
    color: '#007FA3',
    nickname: null,
    isHidden: false,
    lastSyncedAt: null,
    enrollmentTermId: null,
    credits: 1,
    archivedAt: null,
    archiveSource: null,
    ...overrides,
  } as Course;
}

/**
 * Configure the window.api Proxy stub so the Calendar mount effects don't poison
 * the store. The Proxy resolves `undefined` for every method by default, but two
 * store actions WRITE that resolved value back into state:
 *   - `fetchImportedCalendars` → `set({ importedCalendars: await getImportedCalendars() })`
 *   - `fetchCalendarEventsForRange` → `set({ calendarEvents: await … })`
 * resolving `undefined` would null out `importedCalendars` (read as `.length`)
 * and `calendarEvents`. `onFileDropped` must return a cleanup fn (the drag-drop
 * hook calls it on unmount). And the renderer logger needs a real level-indexed
 * shape (the Proxy's bare jest.fn isn't indexable by 'error'/'warn'/…).
 */
function seedApi(env: TestEnv) {
  env.api.getImportedCalendars.mockResolvedValue([]);
  env.api.getCalendarEventsForRange.mockResolvedValue([]);
  env.api.getTasks.mockResolvedValue([]);
  env.api.onFileDropped.mockReturnValue(() => {});
  (env.api as Record<string, unknown>).log = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Render the real CalendarPage with the providers the section hook + router
 * require, seeding `courses` into the store singleton (the page reads
 * `courses` via `useStore()`; `toggleCourseFilter` is local state derived from
 * it). Settle the mount-time fetch effects.
 */
async function renderCalendar(env: TestEnv, courseCount = 3) {
  const courses = Array.from({ length: courseCount }, (_, i) => makeCourse(i + 1));

  seedApi(env);

  useStore.setState({
    courses,
    tasks: [],
    calendarEvents: [],
    importedCalendars: [],
  });

  const result = render(
    <ModalStackProvider>
      <KeyboardScopeProvider>
        <MemoryRouter initialEntries={['/calendar']}>
          <CalendarPage />
        </MemoryRouter>
      </KeyboardScopeProvider>
    </ModalStackProvider>
  );
  // Settle mount-time fetches / deferred-value passes.
  await act(async () => {});
  await act(async () => {});
  return { ...result, courses };
}

/** Dispatch a real keydown on `document` (every listener's target). */
async function press(key: string, opts: { altKey?: boolean; shiftKey?: boolean } = {}) {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        altKey: opts.altKey ?? false,
        shiftKey: opts.shiftKey ?? false,
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

/** The SectionBar's active chip label (strips the `Alt+N` badge text). */
function activeChipLabel(): string | null {
  const active = document.querySelector('[aria-current="true"]');
  return active ? (active.textContent ?? '').replace(/Alt\+\d+/g, '').trim() : null;
}

/** True when the SectionBar (role=group) is rendered. */
function sectionBarVisible(): boolean {
  return screen.queryByRole('group') !== null;
}

/**
 * The page's `selectedCourses` state, echoed by the filter-panel stub. Only
 * readable while the panel is OPEN (the stub only renders then). Returns 'all'
 * (null state), a sorted id array, or undefined when the panel is closed.
 */
function selectedCourses(): 'all' | number[] | undefined {
  const panel = screen.queryByTestId('filter-panel');
  if (!panel) return undefined;
  const raw = panel.getAttribute('data-selected-courses');
  if (raw === 'all') return 'all';
  return raw ? (JSON.parse(raw) as number[]) : undefined;
}

/** Open the filter panel via the events-scope `f` handler and settle. */
async function openFilterPanel() {
  await press('f');
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Calendar — section navigation + course-filter rebind (Phase 2)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
  });

  afterEach(async () => {
    await act(async () => {
      useStore.setState({
        courses: [],
        tasks: [],
        calendarEvents: [],
        importedCalendars: [],
      });
    });
    env.cleanup();
  });

  // -------------------------------------------------------------------------
  // A. The course-filter rebind — the muscle-memory change (plan cases 1–5)
  // -------------------------------------------------------------------------

  it('Alt+Shift+1 toggles the FIRST course filter (the rebind); a second press round-trips back to "all"', async () => {
    await renderCalendar(env, 3); // courses 1,2,3
    await openFilterPanel(); // panel open so selectedCourses is observable
    expect(selectedCourses()).toBe('all'); // null === all selected

    // Alt+Shift+1 → toggleCourseFilter(courses[0].id === 1). From "all", the
    // first toggle drops course 1 → set becomes {2,3}.
    await press('1', { altKey: true, shiftKey: true });
    expect(selectedCourses()).toEqual([2, 3]);

    // Pressing it again re-adds course 1 → all three selected → collapses back
    // to null ("all"). Proves the index resolved to courses[0] specifically.
    await press('1', { altKey: true, shiftKey: true });
    expect(selectedCourses()).toBe('all');
  });

  it('Alt+Shift+2 / Alt+Shift+3 resolve to the 2nd / 3rd course; out-of-range Alt+Shift+9 (only 3 courses) is a no-op', async () => {
    await renderCalendar(env, 3);
    await openFilterPanel();

    await press('2', { altKey: true, shiftKey: true }); // drop course 2 → {1,3}
    expect(selectedCourses()).toEqual([1, 3]);

    await press('3', { altKey: true, shiftKey: true }); // drop course 3 too → {1}
    expect(selectedCourses()).toEqual([1]);

    // Out-of-range: only 3 courses, so `courses[9 - 1]` is undefined → the bounds
    // guard skips the branch → state unchanged.
    await press('9', { altKey: true, shiftKey: true });
    expect(selectedCourses()).toEqual([1]);
  });

  it('plain Alt+1 does NOT toggle a course filter (the rebind regression guard)', async () => {
    // THE load-bearing negative case. The course-filter branch now requires
    // `e.shiftKey`; plain Alt+1 is section-jump and must never reach it.
    await renderCalendar(env, 3);
    await openFilterPanel();
    expect(selectedCourses()).toBe('all');

    // Plain Alt+1 (no Shift) — would have toggled course 1 under the OLD binding.
    await press('1', { altKey: true, shiftKey: false });

    // Filter state is UNCHANGED — the rebind moved the trigger to Alt+Shift.
    expect(selectedCourses()).toBe('all');
  });

  it('Alt+Shift+<non-digit> (macOS composed glyph) is a no-op — parseInt(NaN) preserved', async () => {
    // macOS Option+Shift+digit composes a glyph; `e.key` is e.g. `'›'` not `'2'`.
    // `parseInt('›', 10)` → NaN → the `digit >= 1` bounds check fails → silent
    // no-op. Assert a non-digit Alt+Shift press leaves the filter untouched.
    await renderCalendar(env, 3);
    await openFilterPanel();
    expect(selectedCourses()).toBe('all');

    await press('›', { altKey: true, shiftKey: true });
    expect(selectedCourses()).toBe('all'); // NaN path → no toggle, no crash
  });

  it('Alt+Shift+C (clear) still works and is not shadowed by the digit branch', async () => {
    // The Alt+Shift+D/P/C branch sits ABOVE the digit branch and returns early
    // for d/p/c; a digit key falls through it. Drive a toggle first, then clear.
    await renderCalendar(env, 3);
    await openFilterPanel();

    await press('2', { altKey: true, shiftKey: true }); // {1,3}
    expect(selectedCourses()).toEqual([1, 3]);

    await press('c', { altKey: true, shiftKey: true }); // clearFilters → null
    expect(selectedCourses()).toBe('all');
  });

  // -------------------------------------------------------------------------
  // B. Section migration — SectionBar + F toggle + direct jump (plan cases 6–11)
  // -------------------------------------------------------------------------

  it('panel closed → SectionBar is hidden (only `events` available, >1-guard fails)', async () => {
    await renderCalendar(env, 3);
    // Filter section is unavailable (panel closed) → only `events` → guard hides.
    expect(sectionBarVisible()).toBe(false);
    // The filter panel child does not render the keyboardSection it gets while
    // closed (the panel only renders when showFilters is true); but the grid is up.
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
  });

  it('F opens the filter panel AND focuses it (active === filter; SectionBar shows filter chip)', async () => {
    await renderCalendar(env, 3);

    await press('f'); // events-scope `f` → setShowFilters(true) + goTo('filter')
    // The open-and-focus effect catches up once `filter` availability lands.
    await act(async () => {});

    // SectionBar now shows two chips; `Filter` is the active one.
    expect(sectionBarVisible()).toBe(true);
    const bar = screen.getByRole('group');
    expect(within(bar).getByText('Calendar')).toBeInTheDocument();
    expect(within(bar).getByText('Filter')).toBeInTheDocument();
    expect(activeChipLabel()).toBe('Filter');
  });

  it('Alt+1 → events active, Alt+2 → filter active (direct jump) while the panel is open', async () => {
    await renderCalendar(env, 3);

    await press('f'); // open panel → both sections available, active = filter
    await act(async () => {});
    expect(activeChipLabel()).toBe('Filter');

    await press('1', { altKey: true }); // direct-jump to 1st available = events
    expect(activeChipLabel()).toBe('Calendar');

    await press('2', { altKey: true }); // direct-jump to 2nd available = filter
    expect(activeChipLabel()).toBe('Filter');
  });

  it('Esc in the filter scope closes the panel AND resets active to events (SectionBar hidden)', async () => {
    await renderCalendar(env, 3);

    await press('f'); // open → active = filter
    await act(async () => {});
    expect(activeChipLabel()).toBe('Filter');

    // The filter scope's `'Escape,f'` handler: setShowFilters(false) + goTo('events').
    await press('Escape');
    await act(async () => {});

    // Panel closed → filter unavailable → SectionBar hidden, active back to events.
    expect(sectionBarVisible()).toBe(false);
  });

  it('F again while the panel is open closes it and resets to events (toggle symmetry)', async () => {
    await renderCalendar(env, 3);

    await press('f'); // open → active = filter
    await act(async () => {});
    expect(activeChipLabel()).toBe('Filter');

    // While in the filter scope, `f` is the close handler (`'Escape,f'`).
    await press('f');
    await act(async () => {});

    expect(sectionBarVisible()).toBe(false);
  });

  it('clicking the Calendar chip while the panel is open jumps back to events (goTo via onSelect)', async () => {
    await renderCalendar(env, 3);

    await press('f');
    await act(async () => {});
    const bar = screen.getByRole('group');
    expect(activeChipLabel()).toBe('Filter');

    await act(async () => {
      fireEvent.click(within(bar).getByText('Calendar'));
    });
    expect(activeChipLabel()).toBe('Calendar');
  });

  // -------------------------------------------------------------------------
  // Rewired consumers (risk-4 guard) — plan cases 12 & 13
  // -------------------------------------------------------------------------

  it('filter panel keyboardSection is null when active===events, non-null when active===filter (site #1 rewire)', async () => {
    await renderCalendar(env, 3);

    await press('f'); // open → active = filter, default filterSection = filters-courses
    await act(async () => {});

    // Panel now renders; the page passes keyboardSection derived from
    // `active !== 'filter' ? null : <mapped filterSection>`. active===filter +
    // filterSection 'filters-courses' → 'courses'.
    const panel = screen.getByTestId('filter-panel');
    expect(panel.getAttribute('data-kbd-section')).toBe('courses');

    // Jump back to events via Alt+1 → keyboardSection should flip to null.
    await press('1', { altKey: true });
    await act(async () => {});
    expect(screen.getByTestId('filter-panel').getAttribute('data-kbd-section')).toBe(
      'null'
    );
  });

  it('the hook broadcasts activeSections to KeyboardScopeContext (no activeSubscope writer left)', async () => {
    // Render inside a real KeyboardScopeProvider and observe `activeSections` via
    // a probe consumer. With the panel open, both `events`+`filter` broadcast.
    const { KeyboardScopeContext } =
      await import('../../../../src/layers/l6-ui/contexts/KeyboardScopeContext');

    let observed: unknown = 'unset';
    function Probe() {
      const ctx = React.useContext(KeyboardScopeContext);
      observed = ctx.activeSections;
      return null;
    }

    seedApi(env);
    useStore.setState({
      courses: [makeCourse(1), makeCourse(2)],
      tasks: [],
      calendarEvents: [],
      importedCalendars: [],
    });

    render(
      <ModalStackProvider>
        <KeyboardScopeProvider>
          <MemoryRouter initialEntries={['/calendar']}>
            <CalendarPage />
          </MemoryRouter>
          <Probe />
        </KeyboardScopeProvider>
      </ModalStackProvider>
    );
    await act(async () => {});
    await act(async () => {});

    // Panel closed → only `events` is available → broadcast is the single events
    // section (index1 = 1). This proves the hook's broadcast replaced the removed
    // useRegisterSubscope writer (which wrote a different field, activeSubscope).
    await press('f');
    await act(async () => {});

    const sections = observed as Array<{ id: string; index1: number }> | null;
    expect(Array.isArray(sections)).toBe(true);
    expect(sections!.map((s) => s.id)).toEqual(['events', 'filter']);
    expect(sections!.find((s) => s.id === 'filter')?.index1).toBe(2);
  });
});
