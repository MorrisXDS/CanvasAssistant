/**
 * CalendarGridContext — handleEventClick delegation + hover popup tests.
 *
 * The handwritten event-detail quick-view (`renderDetailModal()` + the
 * in-context `detailModal` state + the `onEventClick`-absent `else` branch of
 * `handleEventClick`) was DEAD code — the sole `<CalendarGrid>` consumer
 * (`Calendar/index.tsx`) always passes `onEventClick`, routing clicks to
 * `TaskDetailModal`. That path was deleted; this suite covers the one LIVE
 * behaviour that remains:
 *
 *   handleEventClick(event)  ===  hidePopup(); onEventClick?.(event);
 *
 * i.e. clicking an event always delegates to the `onEventClick` prop and never
 * opens an in-context dialog. The hover popup (`renderPopup()`) is unchanged
 * and is still exercised here (title / full-label / time-range / popup-item
 * click → delegation).
 *
 * Harness: jsdom + RTL. The settings barrel's timezone helpers are mocked to
 * deterministic values so the time-range row is stable and doesn't reach
 * luxon/localStorage. State-changing interactions are wrapped in `act()` per
 * the jsdom act-guard (tests/setup-jsdom.ts).
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
// here for time-range formatting. Pin them deterministically so the popup
// time-range (`Due 2 PM`, `2 PM - 3 PM`) is stable and independent of
// luxon/localStorage.
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
// Exposes the two live handlers: `handleEventClick` (button that delegates to
// the `onEventClick` prop) and `handleEventHover` + `renderPopup` (the hover
// popup that survived the quick-view removal). Clicking a popup item also goes
// through `handleEventClick`.

function Consumer({ event }: { event: CalendarEvent }) {
  const { handleEventClick, handleEventHover, renderPopup, containerRef } =
    useCalendarGrid();
  // showPopup() bails unless containerRef points at a mounted node (it reads
  // containerRef.current.getBoundingClientRect()). Attach it so the hover
  // popup actually renders under jsdom.
  return (
    <div ref={containerRef}>
      <button onClick={() => handleEventClick(event)}>click-event</button>
      <button onMouseEnter={(e) => handleEventHover(e, event)}>hover-event</button>
      {renderPopup()}
    </div>
  );
}

interface HarnessProps {
  event: CalendarEvent;
  courses?: Course[];
  onEventClick?: (event: CalendarEvent) => void;
  onCourseClick?: (courseId: number) => void;
}

function renderHarness({
  event,
  courses = [],
  onEventClick,
  onCourseClick,
}: HarnessProps) {
  return render(
    <CalendarGridProvider
      view="month"
      currentDate={new Date('2026-02-02T00:00:00.000Z')}
      events={[event]}
      courses={courses}
      onEventClick={onEventClick}
      onCourseClick={onCourseClick}
    >
      <Consumer event={event} />
    </CalendarGridProvider>
  );
}

function clickEvent() {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'click-event' }));
  });
}

function hoverEvent() {
  act(() => {
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'hover-event' }));
  });
}

describe('CalendarGridContext — handleEventClick delegation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates a click to the onEventClick prop with the clicked event', () => {
    const onEventClick = jest.fn();
    const event = makeTaskEvent({ title: 'Assignment 1' });
    renderHarness({ event, onEventClick });

    clickEvent();

    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick).toHaveBeenCalledWith(event);
  });

  it('never opens an in-context dialog on click (quick-view is gone)', () => {
    const onEventClick = jest.fn();
    renderHarness({ event: makeTaskEvent(), onEventClick });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    clickEvent();
    // No dialog before or after the click — the old quick-view Modal is deleted.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not throw when onEventClick is absent (no-op delegation)', () => {
    // The dead `else` branch is gone — with no onEventClick the click is a
    // pure no-op (optional-chained call). It must not open a dialog or throw.
    renderHarness({ event: makeTaskEvent() });

    expect(() => clickEvent()).not.toThrow();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the hover popup before delegating the click', () => {
    const onEventClick = jest.fn();
    renderHarness({ event: makeTaskEvent({ title: 'Assignment 1' }), onEventClick });

    // Open the hover popup first.
    hoverEvent();
    expect(screen.getByText('Assignment 1')).toBeInTheDocument();

    // Clicking delegates AND clears the popup (handleEventClick calls hidePopup()).
    clickEvent();
    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Assignment 1')).not.toBeInTheDocument();
  });
});

describe('CalendarGridContext — hover popup (renderPopup)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders no popup before hover', () => {
    renderHarness({ event: makeTaskEvent() });
    expect(screen.queryByText('Assignment 1')).not.toBeInTheDocument();
  });

  it('shows the task title, course-code label and time range on hover', () => {
    renderHarness({
      event: makeTaskEvent({
        title: 'Assignment 1',
        dueAt: '2026-02-02T14:00:00.000Z',
      }),
    });
    hoverEvent();

    // Popup header label = the course code (task branch of handleEventHover);
    // it also appears as the bold full-label inside the item, hence getAllByText.
    expect(screen.getAllByText('CSC301').length).toBeGreaterThanOrEqual(1);
    // Event title + time range.
    expect(screen.getByText('Assignment 1')).toBeInTheDocument();
    expect(screen.getByText('Due 2 PM')).toBeInTheDocument();
  });

  it('renders the imported-event title and time range on hover', () => {
    renderHarness({
      event: makeImportedEvent({
        title: 'Study Group',
        startAt: '2026-02-02T14:00:00.000Z',
        endAt: '2026-02-02T15:00:00.000Z',
      }),
    });
    hoverEvent();

    expect(screen.getByText('Study Group')).toBeInTheDocument();
    expect(screen.getByText('2 PM - 3 PM')).toBeInTheDocument();
  });

  it('clicking a popup item delegates to onEventClick', () => {
    const onEventClick = jest.fn();
    const event = makeTaskEvent({ title: 'Assignment 1' });
    renderHarness({ event, onEventClick });

    hoverEvent();
    const titleNode = screen.getByText('Assignment 1');
    // The popup item is the clickable ancestor wired to handleEventClick.
    const item = titleNode.closest('div[style]')?.parentElement as HTMLElement;
    act(() => {
      fireEvent.click(item);
    });

    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick).toHaveBeenCalledWith(event);
  });

  it('clicking the popup courseMatch link calls onCourseClick (not onEventClick)', () => {
    const onEventClick = jest.fn();
    const onCourseClick = jest.fn();
    const matchedCourse = makeCourse({ id: 99, code: 'PHY101' });
    renderHarness({
      event: makeImportedEvent({ courseId: 99 }),
      courses: [matchedCourse],
      onEventClick,
      onCourseClick,
    });

    hoverEvent();
    const link = screen.getByText(/→ PHY101/);
    act(() => {
      fireEvent.click(link);
    });

    expect(onCourseClick).toHaveBeenCalledTimes(1);
    expect(onCourseClick).toHaveBeenCalledWith(99);
    // The link's e.stopPropagation() prevents the item's handleEventClick.
    expect(onEventClick).not.toHaveBeenCalled();
  });
});
