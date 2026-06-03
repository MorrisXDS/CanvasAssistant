/**
 * @jest-environment jsdom
 *
 * CourseDetail — section-navigation migration (Section-nav Phase 1, ADR-0010 / #112).
 *
 * CourseDetail.tsx was migrated off its hand-rolled `sectionFocus` state machine
 * (`useState<SectionFocus>`, `cycleSection`, the manual re-scope `useEffect`, and
 * the page-level `q`/`e` nav-keymap bindings) onto the shared `useSectionScope`
 * hook + a visible `<SectionBar>` indicator. This is a VISIBLE behaviour change.
 *
 * These are the page-wiring coverage for that diff — the hook/primitive have
 * their own unit tests (`useSectionScope.test.tsx`, `SectionBar.test.tsx`). Here
 * we exercise the REAL `useSectionScope` through the real page render (the hook
 * is NOT mocked — the whole point is the integration), and assert the observable
 * page surface:
 *   - the `SectionBar` active chip (`aria-current="true"`) + its render guard,
 *   - the three child `keyboardEnabled` props (the risk-4 regression guard) —
 *     observed via lightweight child stubs that echo `keyboardEnabled` into the DOM,
 *   - Q/E cycle, E-suppressed-in-tasks, Alt+N direct jump, re-scope-on-unavailable,
 *     and the Escape→tasks cascade.
 *
 * Harness shape mirrors `tests/l6-ui/pages/TasksPage.addTask.test.tsx` (production
 * `useStore` singleton seeded directly + `setupTestEnv()` window.api stub +
 * MemoryRouter) and the keydown idiom from `tests/l6-ui/hooks/useSectionScope.test.tsx`
 * (real keydown on `document`; real `ModalStackProvider` so `useStackAwareHotkeys`'
 * gate is open). `KeyboardScopeProvider` is required because the hook broadcasts to
 * `KeyboardScopeContext` (the real `Provider` would throw `setActiveSections` is
 * undefined without it — the default context value is a no-op, but we use the real
 * provider to mirror production wiring).
 *
 * The three keyboard-consuming children + GradeHistoryCard + CourseHeader are
 * mocked at their MODULE-FILE path (Jest resolves module mocks by resolved path,
 * so mocking the deep file intercepts the barrel re-export too — same trick the
 * TasksPage test uses for RichTextEditor) to (a) avoid TipTap/ProseMirror under
 * jsdom and (b) make the `keyboardEnabled` prop directly observable. `SectionBar`
 * is left REAL — it is the visible indicator under test.
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Child-component stubs. Mock each at its OWN module file so the barrel
// re-export (`../CourseDetail/components` / `../Queue`) resolves to the stub,
// WITHOUT requireActual-ing the barrel (which would pull in TaskItem → TipTap).
// Each stub echoes its `keyboardEnabled` prop into the DOM so the test can read
// the value the page passed it.
// ---------------------------------------------------------------------------
jest.mock('../../../src/layers/l6-ui/components/Queue/CanvasUpdatesSection', () => ({
  CanvasUpdatesSection: ({ keyboardEnabled }: { keyboardEnabled?: boolean }) => (
    <div data-testid="queue-section" data-kbd={String(!!keyboardEnabled)} />
  ),
}));
jest.mock(
  '../../../src/layers/l6-ui/components/CourseDetail/components/UnifiedTaskList',
  () => ({
    UnifiedTaskList: ({ keyboardEnabled }: { keyboardEnabled?: boolean }) => (
      <div data-testid="task-list" data-kbd={String(!!keyboardEnabled)} />
    ),
  })
);
jest.mock(
  '../../../src/layers/l6-ui/components/CourseDetail/components/AnnouncementsCard',
  () => ({
    AnnouncementsCard: ({ keyboardEnabled }: { keyboardEnabled?: boolean }) => (
      <div data-testid="announcements-card" data-kbd={String(!!keyboardEnabled)} />
    ),
  })
);
jest.mock(
  '../../../src/layers/l6-ui/components/CourseDetail/components/GradeHistoryCard',
  () => ({
    GradeHistoryCard: () => <div data-testid="grade-history" />,
  })
);
jest.mock(
  '../../../src/layers/l6-ui/components/CourseDetail/components/CourseHeader',
  () => ({
    CourseHeader: () => <div data-testid="course-header" />,
  })
);

// Import AFTER the mocks so the page picks up the stubbed children.
import { ModalStackProvider } from '../../../src/layers/l6-ui/contexts/ModalStackContext';
import { KeyboardScopeProvider } from '../../../src/layers/l6-ui/contexts/KeyboardScopeContext';
import { CourseDetail } from '../../../src/layers/l6-ui/components/pages/CourseDetail';
import { useStore } from '../../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../../test-utils/testEnv';
import type { Course } from '../../../src/layers/l5-presentation/types';
import type { QueuedTask, Notification } from '../../../src/shared/ipc-contract';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COURSE_ID = 1;

/** Richer CourseDetailData shape returned by `window.api.getCourse`. */
function makeCourseDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: COURSE_ID,
    externalId: 'ext-1',
    code: 'CS101',
    name: 'Intro to CS',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: 80,
    currentGrade: 78,
    totalWeight: 100,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    syllabusBody: null,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    credits: 1.0,
    archivedAt: null,
    archiveSource: null,
    gradeCurveAdjustment: 0,
    syllabusPromptDismissedAt: '2024-01-01T00:00:00Z', // dismissed → no syllabus banner
    ...overrides,
  };
}

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: COURSE_ID,
    externalId: 'ext-1',
    code: 'CS101',
    name: 'Intro to CS',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: 80,
    currentGrade: 78,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
    credits: 1.0,
    archivedAt: null,
    archiveSource: null,
    ...overrides,
  };
}

function makeQueuedTask(overrides: Partial<QueuedTask> = {}): QueuedTask {
  return {
    id: 1,
    externalId: 'q-ext-1',
    courseId: COURSE_ID,
    title: 'Queued assignment',
    description: null,
    dueAt: '2026-07-01T00:00:00Z',
    pointsPossible: 100,
    taskType: 'assignment',
    status: 'pending',
    matchedUserTaskId: null,
    matchConfidence: null,
    firstSeenAt: '2026-01-01T00:00:00Z',
    lastSyncedAt: '2026-01-01T00:00:00Z',
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
}

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    sourceType: 'announcement',
    sourceId: 'a-ext-1',
    courseId: COURSE_ID,
    title: 'Welcome announcement',
    message: 'Hello class',
    messageHtml: null,
    publishedAt: '2026-01-01T00:00:00Z',
    dismissedAt: null,
    url: null,
    ...overrides,
  };
}

interface SeedOptions {
  withQueue?: boolean;
  withAnnouncements?: boolean;
  courseOverrides?: Record<string, unknown>;
}

/**
 * Render CourseDetail at `/course/:id` with the providers it (and the section
 * hook) require, seeding section availability via the store + window.api.
 * Awaits the mount-time fetch so the page is past its `loading` guard.
 */
async function renderCourseDetail(env: TestEnv, opts: SeedOptions = {}) {
  const { withQueue = false, withAnnouncements = false, courseOverrides = {} } = opts;

  const queueSeed = withQueue ? [makeQueuedTask()] : [];

  env.api.getCourse.mockResolvedValue(makeCourseDetail(courseOverrides));
  env.api.getGradeHistory.mockResolvedValue([]);
  env.api.getCourseSyllabus.mockResolvedValue(null);
  env.api.getCourseFiles.mockResolvedValue([]);
  env.api.getCourseNotifications.mockResolvedValue([]);
  // The page's mount effect kicks off `fetchTaskQueue({ courseId })`, which calls
  // `api.getTaskQueueForCourse` and writes the result into `state.taskQueue`. The
  // Proxy stub would otherwise resolve `undefined` and blow away our seed → make
  // it echo the seeded queue so the store stays consistent.
  env.api.getTaskQueueForCourse.mockResolvedValue(queueSeed);
  // The renderer logger calls `window.api.log[level](msg, component)`. The
  // Proxy stub makes `api.log` a jest.fn (callable but not indexable by
  // 'error'/'warn'/…), so any logged error throws. Give it a real shape.
  (env.api as Record<string, unknown>).log = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };

  useStore.setState({
    courses: [makeCourse(courseOverrides)],
    tasks: [],
    taskQueue: queueSeed,
    notifications: withAnnouncements ? [makeNotification()] : [],
  });

  const result = render(
    <ModalStackProvider>
      <KeyboardScopeProvider>
        <MemoryRouter initialEntries={[`/course/${COURSE_ID}`]}>
          <Routes>
            <Route path="/course/:id" element={<CourseDetail />} />
          </Routes>
        </MemoryRouter>
      </KeyboardScopeProvider>
    </ModalStackProvider>
  );
  // Settle the mount-time fetch (getCourse etc.) so `loading` flips false.
  await act(async () => {});
  await act(async () => {});
  return result;
}

/** Dispatch a real keydown on `document` (the useHotkeys listener target). */
async function press(key: string, opts: { altKey?: boolean } = {}) {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        altKey: opts.altKey ?? false,
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

/** The SectionBar's active chip (the one with aria-current="true"). */
function activeChipLabel(): string | null {
  const active = document.querySelector('[aria-current="true"]');
  return active ? (active.textContent ?? '').replace(/Alt\+\d+/g, '').trim() : null;
}

/** Read the data-kbd flag echoed by a child stub (null when not rendered). */
function kbd(testId: string): boolean | null {
  const el = screen.queryByTestId(testId);
  if (!el) return null;
  return el.getAttribute('data-kbd') === 'true';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CourseDetail — section navigation (useSectionScope migration)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
  });

  afterEach(async () => {
    await act(async () => {
      useStore.setState({ courses: [], tasks: [], taskQueue: [], notifications: [] });
    });
    env.cleanup();
  });

  it('starts in Tasks; SectionBar shows all available chips with Tasks active', async () => {
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });

    // SectionBar renders (>1 available) and Tasks is the active chip.
    const bar = screen.getByRole('group');
    expect(within(bar).getByText('Tasks')).toBeInTheDocument();
    expect(within(bar).getByText('Queue')).toBeInTheDocument();
    expect(within(bar).getByText('Announcements')).toBeInTheDocument();
    expect(activeChipLabel()).toBe('Tasks');

    // The Tasks child is keyboard-enabled; the others are not.
    expect(kbd('task-list')).toBe(true);
    expect(kbd('queue-section')).toBe(false);
    expect(kbd('announcements-card')).toBe(false);
  });

  it('Q cycles backward through available sections (wraps)', async () => {
    // Available order: [tasks, queue, announcements]. Q (backward) from tasks
    // wraps to the LAST available → announcements.
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });
    expect(activeChipLabel()).toBe('Tasks');

    await press('q');
    expect(activeChipLabel()).toBe('Announcements');
    expect(kbd('announcements-card')).toBe(true);
    expect(kbd('task-list')).toBe(false);

    await press('q');
    expect(activeChipLabel()).toBe('Queue');
    expect(kbd('queue-section')).toBe(true);
    expect(kbd('announcements-card')).toBe(false);
  });

  it('E cycles forward through available sections when NOT in Tasks', async () => {
    // Move off Tasks first (Q → announcements), then E should cycle forward.
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });

    await press('q'); // tasks -> announcements (backward wrap)
    expect(activeChipLabel()).toBe('Announcements');

    await press('e'); // announcements -> tasks (forward wrap)
    expect(activeChipLabel()).toBe('Tasks');
    expect(kbd('task-list')).toBe(true);
  });

  it('E is SUPPRESSED in the Tasks section (page edit-task handler wins); Q still cycles out', async () => {
    // Load-bearing composability case (suppressForwardCycleInSection: 'tasks').
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });
    expect(activeChipLabel()).toBe('Tasks');

    // E in Tasks → the hook's forward-cycle binding is disabled → active stays
    // 'tasks' and the task list stays keyboard-enabled (so its own E = edit wins).
    await press('e');
    expect(activeChipLabel()).toBe('Tasks');
    expect(kbd('task-list')).toBe(true);

    // Q is never suppressed → still cycles out of tasks (backward wrap → announcements).
    await press('q');
    expect(activeChipLabel()).toBe('Announcements');
    expect(kbd('task-list')).toBe(false);
  });

  it('Alt+N direct-jumps to the Nth AVAILABLE section (queue unavailable → Alt+2 = announcements)', async () => {
    // Available order with NO queue: [tasks, announcements]. Alt+2 → announcements.
    await renderCourseDetail(env, { withQueue: false, withAnnouncements: true });
    expect(activeChipLabel()).toBe('Tasks');
    // Queue chip is absent (unavailable).
    expect(screen.queryByText('Queue')).not.toBeInTheDocument();

    await press('2', { altKey: true });
    expect(activeChipLabel()).toBe('Announcements');
    expect(kbd('announcements-card')).toBe(true);

    await press('1', { altKey: true });
    expect(activeChipLabel()).toBe('Tasks');
    expect(kbd('task-list')).toBe(true);
  });

  it('SectionBar is ABSENT when only Tasks is available', async () => {
    // No queue, no announcements, no settings → only tasks → render guard hides bar.
    await renderCourseDetail(env, { withQueue: false, withAnnouncements: false });

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    // Tasks list still renders and is keyboard-enabled (the base section).
    expect(kbd('task-list')).toBe(true);
  });

  it('clicking a SectionBar chip jumps to that section (goTo)', async () => {
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });
    const bar = screen.getByRole('group');

    await act(async () => {
      fireEvent.click(within(bar).getByText('Announcements'));
    });

    expect(activeChipLabel()).toBe('Announcements');
    expect(kbd('announcements-card')).toBe(true);
    expect(kbd('task-list')).toBe(false);
  });

  it('the three keyboardEnabled props track `active` — exactly one true, following the cycle', async () => {
    // Risk-4 regression guard: queue/tasks/announcements keyboardEnabled all
    // flip with `active`.
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });

    const flags = () => ({
      tasks: kbd('task-list'),
      queue: kbd('queue-section'),
      announcements: kbd('announcements-card'),
    });

    // Start: tasks.
    expect(flags()).toEqual({ tasks: true, queue: false, announcements: false });

    // E is suppressed in tasks; use Alt+2 to jump to queue (2nd available).
    await press('2', { altKey: true });
    expect(activeChipLabel()).toBe('Queue');
    expect(flags()).toEqual({ tasks: false, queue: true, announcements: false });

    // From queue, E cycles forward → announcements.
    await press('e');
    expect(activeChipLabel()).toBe('Announcements');
    expect(flags()).toEqual({ tasks: false, queue: false, announcements: true });
  });

  it('re-scopes to Tasks when the active section becomes unavailable (queue empties)', async () => {
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });

    // Jump to queue (2nd available via Alt+2).
    await press('2', { altKey: true });
    expect(activeChipLabel()).toBe('Queue');
    expect(kbd('queue-section')).toBe(true);

    // Empty the queue in the store → queue unavailable → hook re-scopes to first
    // available (tasks). The queue child also unmounts (its render guard).
    await act(async () => {
      useStore.setState({ taskQueue: [] });
    });
    await act(async () => {});

    expect(activeChipLabel()).toBe('Tasks');
    expect(screen.queryByTestId('queue-section')).not.toBeInTheDocument();
    expect(kbd('task-list')).toBe(true);
  });

  it('Escape cascade resets the active section back to Tasks (goTo("tasks"))', async () => {
    await renderCourseDetail(env, { withQueue: true, withAnnouncements: true });

    // Move off tasks first.
    await press('q'); // -> announcements
    expect(activeChipLabel()).toBe('Announcements');

    // Escape with no open menu/form/edit/settings → section step fires → tasks.
    await press('Escape');
    expect(activeChipLabel()).toBe('Tasks');
    expect(kbd('task-list')).toBe(true);
  });
});
