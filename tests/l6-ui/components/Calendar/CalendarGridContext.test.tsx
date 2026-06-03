/**
 * CalendarGridContext event-detail quick-view tests
 * (regression suite for the Modal-primitive migration).
 *
 * The handwritten event-detail popup rendered by `renderDetailModal()` in
 * `CalendarGridContext.tsx` was migrated from a `position:'fixed'` + `rgba`
 * overlay (the §2 anti-pattern) to the shared `<Modal>` primitive with a
 * custom colored header + `Modal.Content` (no footer). Default Esc/backdrop
 * dismissal now applies (the old overlay had backdrop-click only — Esc is the
 * one intentional behaviour ADDITION; the whole-card 0.85 completed-opacity
 * was intentionally dropped, line-through title preserved).
 *
 * IMPORTANT — reachability: this quick-view is UNREACHABLE in production. The
 * sole `<CalendarGrid>` consumer always passes `onEventClick`, which routes to
 * `TaskDetailModal` instead. `handleEventClick` only sets the in-context
 * `detailModal` in the `else` branch (no `onEventClick`). So the test renders a
 * tiny consumer inside `CalendarGridProvider` WITHOUT an `onEventClick` prop,
 * then triggers a click to open the in-context quick-view directly.
 *
 * Harness: jsdom + RTL. The `<Modal>` primitive's `useModalStack()` falls back
 * to a no-op default context outside a provider, so no stack-provider wrapper
 * is required (mirrors ImportConfirmationModal.test.tsx). The settings barrel's
 * timezone helpers are mocked to deterministic values so the time-range row is
 * stable and doesn't reach luxon/localStorage. State-changing interactions are
 * wrapped in `act()` per the jsdom act-guard (tests/setup-jsdom.ts).
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  Task,
  Course,
  DisplayCalendarEvent,
} from '../../../../src/shared/ipc-contract';

// --- Mocks (must precede the component import) -------------------------------

// Settings barrel: calendarHelpers imports the effective-timezone helpers from
// here for time-range formatting. Pin them deterministically so the "Time" row
// (`Due 2 PM`, `2 PM - 3 PM`) is stable and independent of luxon/localStorage.
jest.mock('../../../../src/layers/l5-presentation/settings', () => ({
  getTimeInEffectiveTimezone: jest.fn((dateStr: string) => {
    const d = new Date(dateStr);
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }),
  getHourInEffectiveTimezone: jest.fn((dateStr: string) =>
    new Date(dateStr).getUTCHours()
  ),
}));

import {
  CalendarGridProvider,
  useCalendarGrid,
  type CalendarEvent,
} from '../../../../src/layers/l6-ui/components/Calendar/CalendarGridContext';

// --- Fixtures ----------------------------------------------------------------

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    externalId: 'c-1',
    code: 'CSC301',
    name: 'Intro to Software Engineering',
    targetGrade: 85,
    targetGradeSource: 'user',
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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 10,
    externalId: 't-10',
    sourceType: 'canvas',
    courseId: 1,
    title: 'Assignment 1',
    description: 'Build a parser',
    unlockAt: null,
    dueAt: '2026-02-02T14:00:00.000Z',
    dueTimeKnown: true,
    weight: 20,
    grade: null,
    pointsPossible: 100,
    priorityScore: 0,
    isCompleted: false,
    isOptional: false,
    completedAt: null,
    submissionStatus: null,
    taskType: 'assignment',
    taskGroupId: null,
    calendarEventId: null,
    location: null,
    notes: null,
    ...overrides,
  } as Task;
}

function makeTaskEvent(
  taskOverrides: Partial<Task> = {},
  courseOverrides: Partial<Course> = {}
): CalendarEvent {
  return {
    type: 'task',
    task: makeTask(taskOverrides),
    course: makeCourse(courseOverrides),
  };
}

function makeImportedEvent(overrides: Partial<DisplayCalendarEvent> = {}): CalendarEvent {
  const event: DisplayCalendarEvent = {
    id: 50,
    externalId: 'ev-50',
    sourceType: 'imported',
    courseId: null,
    importedCalendarId: 7,
    taskId: null,
    title: 'Study Group',
    description: 'Review session',
    startAt: '2026-02-02T14:00:00.000Z',
    endAt: '2026-02-02T15:00:00.000Z',
    allDay: false,
    location: 'Library Room 4',
    uid: null,
    recurrenceRule: null,
    recurrenceExceptionDates: null,
    parentEventId: null,
    eventColor: null,
    notes: null,
    reminderMinutes: null,
    isRecurrenceInstance: false,
    color: '#6366F1',
    calendarName: 'My Calendar',
    ...overrides,
  } as DisplayCalendarEvent;
  return { type: 'imported', event };
}

// --- Consumer harness --------------------------------------------------------
//
// Renders a button that opens the in-context detail quick-view via the
// `else` branch of `handleEventClick` (only fires when `onEventClick` is
// ABSENT), plus the modal itself via `{renderDetailModal()}`.

function Consumer({ event }: { event: CalendarEvent }) {
  const { handleEventClick, renderDetailModal } = useCalendarGrid();
  return (
    <div>
      <button onClick={() => handleEventClick(event)}>open-detail</button>
      {renderDetailModal()}
    </div>
  );
}

interface HarnessProps {
  event: CalendarEvent;
  courses?: Course[];
  onCourseClick?: (courseId: number) => void;
}

function renderHarness({ event, courses = [], onCourseClick }: HarnessProps) {
  return render(
    <CalendarGridProvider
      view="month"
      currentDate={new Date('2026-02-02T00:00:00.000Z')}
      events={[event]}
      courses={courses}
      onCourseClick={onCourseClick}
      // NO onEventClick — this is what routes the click into the in-context
      // quick-view (the `else` branch). Passing it would route to the host's
      // TaskDetailModal instead and this quick-view would never open.
    >
      <Consumer event={event} />
    </CalendarGridProvider>
  );
}

function openDetail() {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'open-detail' }));
  });
}

describe('CalendarGridContext — event-detail quick-view (Modal primitive)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Case 1 — closed initially
  it('renders no dialog before the event is clicked', () => {
    renderHarness({ event: makeTaskEvent() });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Case 2 — opens as a role=dialog with the event title
  it('opens a role="dialog" with the event title on click', () => {
    renderHarness({ event: makeTaskEvent({ title: 'Assignment 1' }) });
    openDetail();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Assignment 1')).toBeInTheDocument();
  });

  // Case 3a — task branch: Time / Course / Type / Weight rows
  it('renders task detail rows (time, course, type, weight) for a task event', () => {
    renderHarness({
      event: makeTaskEvent({
        dueAt: '2026-02-02T14:00:00.000Z',
        taskType: 'assignment',
        weight: 20,
      }),
    });
    openDetail();

    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Due 2 PM')).toBeInTheDocument();
    expect(screen.getByText('Course')).toBeInTheDocument();
    expect(screen.getByText('Intro to Software Engineering')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('assignment')).toBeInTheDocument();
    expect(screen.getByText('Weight')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    // Description block.
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Build a parser')).toBeInTheDocument();
  });

  // Case 3a' — task with weight 0 hides the Weight row
  it('omits the Weight row when task weight is 0', () => {
    renderHarness({ event: makeTaskEvent({ weight: 0 }) });
    openDetail();
    expect(screen.queryByText('Weight')).not.toBeInTheDocument();
  });

  // Case 3b — imported/calendar branch: Calendar label + Location + time range
  it('renders calendar/location rows for an imported event (non-task branch)', () => {
    renderHarness({
      event: makeImportedEvent({
        calendarName: 'My Calendar',
        location: 'Library Room 4',
        startAt: '2026-02-02T14:00:00.000Z',
        endAt: '2026-02-02T15:00:00.000Z',
      }),
    });
    openDetail();

    // Non-task → "Calendar" label, not "Course"; no Type/Weight rows.
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('My Calendar')).toBeInTheDocument();
    expect(screen.queryByText('Course')).not.toBeInTheDocument();
    expect(screen.queryByText('Type')).not.toBeInTheDocument();
    // Location row (only on the non-task branch).
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Library Room 4')).toBeInTheDocument();
    // Time range start - end.
    expect(screen.getByText('2 PM - 3 PM')).toBeInTheDocument();
  });

  // Case 4 — backdrop click closes (replaces the old overlay onClick → hide)
  it('closes the dialog when the backdrop is clicked', () => {
    renderHarness({ event: makeTaskEvent() });
    openDetail();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The primitive renders an aria-hidden backdrop div with the close click.
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeTruthy();
    act(() => {
      fireEvent.click(backdrop);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Case 5 — Escape closes (the added behaviour, via the primitive)
  it('closes the dialog on Escape (behaviour added by the primitive)', () => {
    renderHarness({ event: makeTaskEvent() });
    openDetail();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Case 6 — the × close button closes the dialog
  it('closes the dialog via the × close button', () => {
    renderHarness({ event: makeTaskEvent() });
    openDetail();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Case 7a — task "Go to course" link calls onCourseClick with the task's course id
  it('calls onCourseClick with the task course id and closes via "Go to" link (task branch)', () => {
    const onCourseClick = jest.fn();
    renderHarness({
      event: makeTaskEvent({}, { id: 42, code: 'MAT223' }),
      onCourseClick,
    });
    openDetail();

    const link = screen.getByRole('button', { name: /Go to MAT223/ });
    act(() => {
      fireEvent.click(link);
    });
    expect(onCourseClick).toHaveBeenCalledTimes(1);
    expect(onCourseClick).toHaveBeenCalledWith(42);
    // Closing the modal is part of the link handler.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Case 7b — imported event matched to a course renders the courseMatch link
  it('calls onCourseClick with the matched course id (courseMatch branch)', () => {
    const onCourseClick = jest.fn();
    // Direct courseId match (PASS 0 in matchEventToCourse → high confidence).
    const matchedCourse = makeCourse({ id: 99, code: 'PHY101' });
    renderHarness({
      event: makeImportedEvent({ courseId: 99 }),
      courses: [matchedCourse],
      onCourseClick,
    });
    openDetail();

    const link = screen.getByRole('button', { name: /Go to PHY101/ });
    act(() => {
      fireEvent.click(link);
    });
    expect(onCourseClick).toHaveBeenCalledTimes(1);
    expect(onCourseClick).toHaveBeenCalledWith(99);
  });

  // Case 8 — completed task → line-through title + "(Completed)" suffix
  it('renders a line-through title with "(Completed)" for a completed task', () => {
    renderHarness({
      event: makeTaskEvent({ title: 'Done Assignment', isCompleted: true }),
    });
    openDetail();

    // The "(Completed)" suffix is appended to the title node.
    const titleNode = screen.getByText(/Done Assignment/);
    expect(titleNode).toHaveTextContent('Done Assignment (Completed)');
    expect(titleNode).toHaveStyle({ textDecoration: 'line-through' });
  });
});
