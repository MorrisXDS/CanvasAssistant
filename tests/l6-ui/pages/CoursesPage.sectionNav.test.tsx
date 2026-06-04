/**
 * @jest-environment jsdom
 *
 * CoursesPage — section-navigation migration (Section-nav Phase 3, ADR-0010 / #115).
 *
 * CoursesPage.tsx was migrated off its hand-rolled `useKeymap`-scope-as-source-of-
 * truth + `useRegisterSubscope` wiring onto the shared `useSectionScope` hook +
 * a visible `<SectionBar>` indicator, mirroring the Calendar #114 bridge pattern:
 *
 *   - `useKeymap<'courses'|'filter'>` STAYS the keymap ROUTER (two intricate
 *     per-scope keybinding sets), but `useSectionScope<'courses'|'filter'>` now
 *     owns the `active` source of truth (Alt+1/Alt+2 direct-jump, the SectionBar
 *     indicator, the help-modal broadcast). A one-directional `useEffect([active])`
 *     mirrors `active` into the router via `setScope`.
 *   - `enableCycle: false` — Q/E stay owned by the FILTER scope (prev/next filter
 *     SECTION), NOT section-cycle. `enableDirectJump: true`, no rebind (only
 *     `alt+shift+*` quick-filters exist, so plain Alt+1/Alt+2 are free).
 *   - `F` toggles the filter panel: opens (active→filter via the one-shot focus
 *     effect) and closes (active→courses). Esc cascades through `active`.
 *   - `gridNavActive = active === 'courses'` gates ALL FOUR grid-nav hotkeys
 *     (A/D/W/S card nav) — the load-bearing risk-4 regression guard.
 *
 * Harness mirrors `tests/l6-ui/components/Calendar/Calendar.sectionNav.test.tsx`
 * (the same Phase-2 shape): the REAL `CoursesPage` is rendered so the real
 * `useSectionScope`, the real `useKeymap` router, and the real `SectionBar` run
 * together (the whole point is the integration). Only the heavy / irrelevant
 * children are stubbed at their module path:
 *   - `CourseGridCard` / `CourseListItem` → stubs that echo `focused` + the course
 *     id into the DOM (the grid-nav observation point — case 6).
 *   - `CoursesFilterPanel` → a stub echoing `keyboardSection` + `keyboardIndex`
 *     (the filter-scope `a`-walk observation point — case 2).
 *   - `ArchivedCoursesSection` → null (irrelevant; pulls in extra surface).
 *   - `useCourseDragDrop` → inert stub (no real DnD under jsdom).
 * `SectionBar` is left REAL — it is the visible indicator under test.
 *
 * `ModalStackProvider` is required so `useStackAwareHotkeys`' modal-stack gate is
 * open (the hook's Alt+1/2 + the page's grid-nav bindings register through it).
 * `KeyboardScopeProvider` is required because the hook broadcasts `activeSections`
 * to it (case 8). Keydown idiom mirrors the Calendar test (real keydown on
 * `document`; `act()` per the jsdom act-guard).
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// jsdom has no ResizeObserver; CoursesPage's grid column-measure effect news one
// up. A minimal no-op stub keeps the mount effect from throwing (the column
// count defaults to 1, which is all the grid-nav tests need).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
  ResizeObserverStub;

// jsdom has no Element.prototype.scrollIntoView; `focusAndScroll` rAF-calls it
// on the focused card. No-op stub so the deferred scroll doesn't throw.
if (!('scrollIntoView' in Element.prototype)) {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView =
    () => {};
}

// ---------------------------------------------------------------------------
// Child stubs — mocked at their OWN module file (Jest resolves module mocks by
// resolved path). CoursesPage imports each directly, so the stub intercepts.
// ---------------------------------------------------------------------------

// Grid / list card stubs: echo `focused` + the course id. CourseListItem
// extends CourseCardProps, so the same stub shape works for both.
jest.mock('../../../src/layers/l6-ui/components/pages/CourseGridCard', () => ({
  CourseGridCard: ({
    course,
    focused,
  }: {
    course: { id: number };
    focused?: boolean;
  }) => <div data-testid={`grid-card-${course.id}`} data-focused={String(!!focused)} />,
}));
jest.mock('../../../src/layers/l6-ui/components/pages/CourseListItem', () => ({
  CourseListItem: ({
    course,
    focused,
  }: {
    course: { id: number };
    focused?: boolean;
  }) => <div data-testid={`list-item-${course.id}`} data-focused={String(!!focused)} />,
}));
// Filter-panel stub: echo the keyboard-driven section + index so the filter
// scope's `a`-walk (case 2) is observable. Mirrors the Calendar test's panel stub.
jest.mock('../../../src/layers/l6-ui/components/pages/CoursesFilterPanel', () => ({
  CoursesFilterPanel: ({
    keyboardSection,
    keyboardIndex,
  }: {
    keyboardSection?: string | null;
    keyboardIndex?: number;
  }) => (
    <div
      data-testid="filter-panel"
      data-kbd-section={String(keyboardSection)}
      data-kbd-index={String(keyboardIndex)}
    />
  ),
}));
jest.mock('../../../src/layers/l6-ui/components/pages/ArchivedCoursesSection', () => ({
  ArchivedCoursesSection: () => null,
}));
// Drag-and-drop: inert. The real hook returns DnD handlers + sortByCustomOrder
// (a function `filterAndSortCourses` calls to reorder ids). The stub supplies an
// IDENTITY sort so the grid renders in seeded order (index N === course N+1).
jest.mock('../../../src/layers/l6-ui/components/pages/useCourseDragDrop', () => ({
  useCourseDragDrop: () => ({
    sortByCustomOrder: (ids: number[]) => ids,
    draggedCourseId: null,
    dragOverCourseId: null,
    handleDragStart: () => {},
    handleDragOver: () => {},
    handleDragLeave: () => {},
    handleDragEnd: () => {},
    handleDrop: () => {},
  }),
}));

// Import AFTER the mocks so the page picks up the stubbed children.
import { ModalStackProvider } from '../../../src/layers/l6-ui/contexts/ModalStackContext';
import { KeyboardScopeProvider } from '../../../src/layers/l6-ui/contexts/KeyboardScopeContext';
import { CoursesPage } from '../../../src/layers/l6-ui/components/pages/CoursesPage';
import { useStore } from '../../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../../test-utils/testEnv';
import type { Course } from '../../../src/layers/l5-presentation/types';

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
 * Render the real CoursesPage with the providers the section hook + router
 * require, seeding `courses` into the store singleton. The page reads
 * `state.courses` via `useStore()` (pre-visibility-filtered upstream — untouched
 * here). Default view is `grid`; filteredCourses preserves seed order (the DnD
 * stub's `sortByCustomOrder` is undefined → no reorder), so grid card index N
 * maps to course N+1.
 */
async function renderCourses(env: TestEnv, courseCount = 3) {
  const courses = Array.from({ length: courseCount }, (_, i) => makeCourse(i + 1));

  // Force grid view + filter panel closed at start, regardless of any persisted
  // sessionStorage from a prior test (the page seeds these from sessionStorage).
  sessionStorage.clear();
  (env.api as Record<string, unknown>).log = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  useStore.setState({ courses, tasks: [] });

  const result = render(
    <ModalStackProvider>
      <KeyboardScopeProvider>
        <MemoryRouter initialEntries={['/courses']}>
          <CoursesPage />
        </MemoryRouter>
      </KeyboardScopeProvider>
    </ModalStackProvider>
  );
  // Settle mount-time effects (sessionStorage persistence, column measure).
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

/** The index of the currently-focused grid card (-1 if none). */
function focusedGridIndex(courseIds: number[]): number {
  for (let i = 0; i < courseIds.length; i++) {
    const el = screen.queryByTestId(`grid-card-${courseIds[i]}`);
    if (el && el.getAttribute('data-focused') === 'true') return i;
  }
  return -1;
}

/** Open the filter panel via the courses-scope `f` handler and settle. */
async function openFilterPanel() {
  await press('f');
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoursesPage — section navigation (Phase 3)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
  });

  afterEach(async () => {
    await act(async () => {
      useStore.setState({ courses: [], tasks: [] });
    });
    sessionStorage.clear();
    env.cleanup();
  });

  // -------------------------------------------------------------------------
  // SectionBar gating (case 5)
  // -------------------------------------------------------------------------

  it('panel closed → SectionBar hidden (only `courses` available, >1-guard fails)', async () => {
    await renderCourses(env, 3);
    // Only `courses` is available (filter panel closed) → guard hides the bar.
    expect(sectionBarVisible()).toBe(false);
    // The grid is up (3 cards rendered via the stub).
    expect(screen.getByTestId('grid-card-1')).toBeInTheDocument();
  });

  it('panel open → SectionBar rendered with both chips (Courses Alt+1, Filter Alt+2)', async () => {
    await renderCourses(env, 3);
    await openFilterPanel();

    expect(sectionBarVisible()).toBe(true);
    const bar = screen.getByRole('group');
    expect(within(bar).getByText('Courses')).toBeInTheDocument();
    expect(within(bar).getByText('Filter')).toBeInTheDocument();
    // Slot badges: Courses is the 1st available, Filter the 2nd.
    expect(within(bar).getByText('Alt+1')).toBeInTheDocument();
    expect(within(bar).getByText('Alt+2')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // F toggle + one-shot focus (cases 3 & 4)
  // -------------------------------------------------------------------------

  it('F opens the filter panel AND focuses it (active === filter via one-shot effect)', async () => {
    await renderCourses(env, 3);

    await press('f'); // courses-scope `f` → setShowFilters(true) + goTo('filter')
    await act(async () => {}); // one-shot focus catches up once `filter` available

    expect(screen.getByTestId('filter-panel')).toBeInTheDocument();
    expect(sectionBarVisible()).toBe(true);
    expect(activeChipLabel()).toBe('Filter');
  });

  it('F again closes the panel AND resets active to courses (toggle symmetry)', async () => {
    await renderCourses(env, 3);

    await openFilterPanel();
    expect(activeChipLabel()).toBe('Filter');

    // While in the filter scope, `f` is the close handler.
    await press('f');
    await act(async () => {});

    expect(screen.queryByTestId('filter-panel')).not.toBeInTheDocument();
    expect(sectionBarVisible()).toBe(false); // filter unavailable → bar hidden
  });

  it('Esc in the filter scope closes the panel AND resets active to courses', async () => {
    await renderCourses(env, 3);

    await openFilterPanel();
    expect(activeChipLabel()).toBe('Filter');

    // Esc cascade: active !== 'courses' → goTo('courses'). A 2nd Esc would then
    // close the panel; the bridge/one-shot already flips active first.
    await press('Escape');
    await act(async () => {});
    // active is back to courses; the panel may still be open one step (cascade),
    // but the section is no longer `filter`.
    expect(activeChipLabel()).not.toBe('Filter');
  });

  // -------------------------------------------------------------------------
  // CRITICAL one-shot-focus regression pin (the #114 bug) — case 4 explicit
  // -------------------------------------------------------------------------

  it('with the filter panel OPEN, Alt+1 → courses STICKS (one-shot did not re-force filter)', async () => {
    // The #114 continuous-effect bug: a "force filter while open" effect would
    // instantly revert Alt+1 (jump back to courses) to filter while the panel
    // stays open, defeating direct-jump. The one-shot `focusedForThisOpenRef`
    // effect must NOT re-fire — Alt+1 must stick.
    await renderCourses(env, 3);

    await openFilterPanel();
    expect(activeChipLabel()).toBe('Filter');
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument(); // panel OPEN

    // Direct-jump back to courses while the panel stays open.
    await press('1', { altKey: true });
    await act(async () => {});

    // The active section is `courses` AND the panel is STILL open (>1 available,
    // bar still shown). If the one-shot re-fired, active would snap back to filter.
    expect(activeChipLabel()).toBe('Courses');
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument();
    expect(sectionBarVisible()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Direct jump (cases 1 & 2)
  // -------------------------------------------------------------------------

  it('Alt+1 → courses, Alt+2 → filter (direct jump) while the panel is open', async () => {
    await renderCourses(env, 3);

    await openFilterPanel(); // both sections available, active = filter
    expect(activeChipLabel()).toBe('Filter');

    await press('1', { altKey: true }); // 1st available = courses
    await act(async () => {});
    expect(activeChipLabel()).toBe('Courses');

    await press('2', { altKey: true }); // 2nd available = filter
    await act(async () => {});
    expect(activeChipLabel()).toBe('Filter');
  });

  it('Alt+2 jump mirrors to the useKeymap filter scope — the filter `a`-walk then fires', async () => {
    // Bridge proof (case 2/6): Alt+2 sets active=filter; the bridge effect mirrors
    // it into the router scope `'filter'`, so a FILTER-scope-only key (`a` walks a
    // filter option) now fires. Observed via the filter-panel stub's keyboardIndex.
    await renderCourses(env, 3);
    await openFilterPanel(); // default active=filter, section=filters-prefix, index 0

    // Move to the grade section (a real section with >1 option so the index walk
    // is observable), then walk. The `filters-prefix` section may have ≤1 option
    // with these fixtures (no varied prefixes) → walkFilterOption early-returns.
    // `filters-grade` always has 4 options.
    await press('e'); // filter scope: next filter section → filters-type
    await press('e'); // → filters-grade (4 options)
    await act(async () => {});
    expect(screen.getByTestId('filter-panel').getAttribute('data-kbd-section')).toBe(
      'grade'
    );

    // `s` (filter scope) walks the focused option forward within the grade section.
    await press('s');
    await act(async () => {});
    expect(
      Number(screen.getByTestId('filter-panel').getAttribute('data-kbd-index'))
    ).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // gridNavActive tracks `active` — THE risk-4 regression guard (case 6)
  // -------------------------------------------------------------------------

  it('grid-nav hotkeys (A/D/W/S) FIRE when active === courses', async () => {
    const { courses } = await renderCourses(env, 3);
    const ids = courses.map((c) => c.id);

    // Panel closed → active === 'courses' → gridNavActive true. No card focused yet.
    expect(focusedGridIndex(ids)).toBe(-1);

    // D (next card, grid view) → moveFocus(1). From focusedIndex -1, `current`
    // clamps to 0 and `next = current + 1 = 1`, so the first D lands index 1.
    await press('d');
    await act(async () => {});
    expect(focusedGridIndex(ids)).toBe(1);

    // Another D → moveFocus(1): current 1 → next 2.
    await press('d');
    await act(async () => {});
    expect(focusedGridIndex(ids)).toBe(2);

    // A (prev card) → moveFocus(-1): current 2 → next 1.
    await press('a');
    await act(async () => {});
    expect(focusedGridIndex(ids)).toBe(1);
  });

  it('grid-nav hotkeys (A/D/W/S) are SUPPRESSED when active === filter (gridNavActive false)', async () => {
    const { courses } = await renderCourses(env, 3);
    const ids = courses.map((c) => c.id);

    // Establish a known grid focus while in `courses` (first D → index 1).
    await press('d');
    await act(async () => {});
    expect(focusedGridIndex(ids)).toBe(1);

    // Open the filter panel → active === 'filter' → gridNavActive false.
    await openFilterPanel();
    expect(activeChipLabel()).toBe('Filter');

    // D in grid view must NOT move grid focus now (the filter scope owns D as
    // walkFilterOption, and gridNavActive is false so the grid bindings are off).
    // Grid focus index is unchanged from before (still 1).
    await press('d');
    await act(async () => {});
    expect(focusedGridIndex(ids)).toBe(1); // grid nav suppressed

    // Jump back to courses → gridNavActive true again → D moves the grid
    // (moveFocus(1): current 1 → next 2).
    await press('1', { altKey: true });
    await act(async () => {});
    await press('d');
    await act(async () => {});
    expect(focusedGridIndex(ids)).toBe(2);
  });

  // -------------------------------------------------------------------------
  // SectionBar chip click → goTo (case 5 click half)
  // -------------------------------------------------------------------------

  it('clicking the Courses chip while the panel is open jumps back to courses (goTo via onSelect)', async () => {
    await renderCourses(env, 3);

    await openFilterPanel();
    const bar = screen.getByRole('group');
    expect(activeChipLabel()).toBe('Filter');

    await act(async () => {
      fireEvent.click(within(bar).getByText('Courses'));
    });
    expect(activeChipLabel()).toBe('Courses');
  });

  // -------------------------------------------------------------------------
  // enableCycle:false — Q/E stay owned by the filter scope (case 3 of brief)
  // -------------------------------------------------------------------------

  it('Q/E do the filter-section walk (not section-cycle) — enableCycle:false', async () => {
    // With enableCycle:false the hook does NOT bind Q/E on `document`. In the
    // filter scope, E advances the FILTER section (prefix→type→grade…). If the
    // hook had registered its Q/E cycle, E would also try to cycle the section
    // scope — but enableCycle:false means only the filter walk happens.
    await renderCourses(env, 3);
    await openFilterPanel();
    expect(screen.getByTestId('filter-panel').getAttribute('data-kbd-section')).toBe(
      'prefix'
    );

    await press('e'); // filter scope: next filter section → type
    await act(async () => {});
    expect(screen.getByTestId('filter-panel').getAttribute('data-kbd-section')).toBe(
      'type'
    );

    // active stays `filter` throughout — E did not cycle the section scope
    // (cycle is disabled), it only walked the filter section.
    expect(activeChipLabel()).toBe('Filter');
  });

  // -------------------------------------------------------------------------
  // Hook broadcasts activeSections (no useRegisterSubscope regression) — case 8
  // -------------------------------------------------------------------------

  it('the hook broadcasts activeSections to KeyboardScopeContext when the panel opens', async () => {
    const { KeyboardScopeContext } =
      await import('../../../src/layers/l6-ui/contexts/KeyboardScopeContext');

    let observed: unknown = 'unset';
    function Probe() {
      const ctx = React.useContext(KeyboardScopeContext);
      observed = ctx.activeSections;
      return null;
    }

    sessionStorage.clear();
    (env.api as Record<string, unknown>).log = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };
    useStore.setState({ courses: [makeCourse(1), makeCourse(2)], tasks: [] });

    render(
      <ModalStackProvider>
        <KeyboardScopeProvider>
          <MemoryRouter initialEntries={['/courses']}>
            <CoursesPage />
          </MemoryRouter>
          <Probe />
        </KeyboardScopeProvider>
      </ModalStackProvider>
    );
    await act(async () => {});
    await act(async () => {});

    // Panel closed → only `courses` available → broadcast is the single courses
    // section. This proves the hook's broadcast replaced the removed
    // useRegisterSubscope writer.
    {
      const sections = observed as Array<{ id: string; index1: number }> | null;
      expect(Array.isArray(sections)).toBe(true);
      expect(sections!.map((s) => s.id)).toEqual(['courses']);
    }

    // Open the panel → both sections broadcast, filter at slot 2.
    await press('f');
    await act(async () => {});

    {
      const sections = observed as Array<{ id: string; index1: number }> | null;
      expect(sections!.map((s) => s.id)).toEqual(['courses', 'filter']);
      expect(sections!.find((s) => s.id === 'filter')?.index1).toBe(2);
    }
  });
});
