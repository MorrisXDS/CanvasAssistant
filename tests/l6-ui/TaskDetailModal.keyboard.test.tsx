/**
 * @jest-environment jsdom
 *
 * TaskDetailModal keyboard navigation (ADR-0006 — useModalHotkeys migration).
 *
 * The raw `document.addEventListener('keydown')` listener that used to live in
 * TaskDetailModal (gated on `isOpen`, with hand-rolled INPUT/TEXTAREA/SELECT/
 * contentEditable + Ctrl/Meta/Alt + `showDeleteConfirm` guards) was migrated to
 * a render-null `TaskDetailHotkeys` sub-component rendered INSIDE the `<Modal>`
 * subtree, calling `useModalHotkeys` per key. `useModalHotkeys` carries the
 * built-in ADR-0006 modal-stack gate (fires only while THIS modal is topmost)
 * and the react-hotkeys-hook form-tag / modifier / `e.key` normalisation.
 *
 * These tests pin the migrated behaviour, mirroring the #111
 * AnnouncementDetail.keyboard harness:
 *   - E  fires onEdit when provided; no-op when onEdit undefined
 *   - G  navigates to the course (useNavigate mock) with ?highlightTask
 *   - X  toggles complete with a task; no-op without onToggleComplete
 *   - Esc calls onClose
 *   - Delete AND Backspace open the delete confirm when canDelete; no-op when
 *     canDelete is false
 *   - keys fired from inside a form element are suppressed (hook default)
 *   - Ctrl+E is suppressed (modifier never matches the bare 'e' combo)
 *   - ★ with a SECOND modal pushed on top, E/G/X/Esc/Delete fire NONE of the
 *     actions (the ADR-0006 keystroke-leak fix — the whole point of the PR)
 *   - precedence: after the delete confirm opens (showDeleteConfirm true),
 *     subsequent E/G/X do NOT fire (the hotkey component unmounts / gates off)
 *
 * Harness notes:
 *   - `useModalHotkeys` attaches its listener at `document` level via
 *     react-hotkeys-hook, so we dispatch real KeyboardEvents on `document`
 *     (or on a focused <input> for the form-tag case).
 *   - The component must render inside `<ModalStackProvider>` — the `<Modal>`
 *     primitive calls `useModalStack().push/pop`; `useModalHotkeys` THROWS
 *     outside a `<Modal>` provider and reads topmost from the stack.
 *   - `useNavigate` (react-router-dom) is mocked because handleGoToCourse
 *     navigates directly.
 */

import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import type { Task, Course, DisplayCalendarEvent } from '../../src/shared/ipc-contract';
import {
  ModalStackProvider,
  useModalStack,
} from '../../src/layers/l6-ui/contexts/ModalStackContext';
import { useStore } from '../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../test-utils/testEnv';
import type { CalendarEvent } from '../../src/layers/l6-ui/components/Calendar/CalendarGrid';

// --- Mock react-router-dom's useNavigate (the source navigates directly) -----
const navigateMock = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => navigateMock,
}));

import { TaskDetailModal } from '../../src/layers/l6-ui/components/Calendar/TaskDetailModal';

// --- Fixtures (mirror CalendarGridContext.test.tsx for faithful payloads) ----

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

/**
 * Helper rendered inside the ModalStackProvider so a test can push an extra
 * modal entry onto the stack AFTER the TaskDetailModal's own <Modal> pushes —
 * flipping `topmostId` to the new entry so the TaskDetailModal hotkeys gate off.
 */
function PushModalOnMount({ id }: { id: string }) {
  const { push } = useModalStack();
  React.useEffect(() => {
    push({ id });
  }, [push, id]);
  return null;
}

interface RenderOpts {
  event?: CalendarEvent;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleComplete?: (task: Task) => void;
  onClose?: () => void;
  withTopModal?: boolean;
}

async function renderModal(opts: RenderOpts = {}) {
  const event = opts.event ?? makeTaskEvent();
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ModalStackProvider>
        <TaskDetailModal
          isOpen
          event={event}
          onClose={opts.onClose ?? jest.fn()}
          onEdit={opts.onEdit}
          onDelete={opts.onDelete}
          onToggleComplete={opts.onToggleComplete}
        />
        {/* Rendered AFTER the modal so its push lands last → it is topmost. */}
        {opts.withTopModal ? <PushModalOnMount id="top-modal" /> : null}
      </ModalStackProvider>
    );
  });
  await waitFor(() => expect(result.container).toBeTruthy());
  return result!;
}

/** Dispatch a real keydown on `document` (or a target) so the hook sees it. */
function pressKey(key: string, opts: { target?: EventTarget; ctrlKey?: boolean } = {}) {
  act(() => {
    const evt = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: opts.ctrlKey ?? false,
    });
    if (opts.target) {
      opts.target.dispatchEvent(evt);
    } else {
      document.dispatchEvent(evt);
    }
  });
}

describe('TaskDetailModal — keyboard navigation (ADR-0006 useModalHotkeys migration)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
    navigateMock.mockClear();
    // The component reads tasks/courses from the production store singleton.
    useStore.setState({ tasks: [makeTask()], courses: [makeCourse()] });
  });

  afterEach(async () => {
    await act(async () => {
      useStore.setState({ tasks: [], courses: [] });
    });
    env.cleanup();
  });

  // --- Case 1: E fires onEdit (both branches of `if (onEdit)`) ---------------

  it('fires onEdit on E when onEdit is provided', async () => {
    const onEdit = jest.fn();
    await renderModal({ onEdit });

    pressKey('e');
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on E when onEdit is undefined', async () => {
    await renderModal({ onEdit: undefined });

    // Nothing to assert a call on; assert no throw and modal still mounted.
    expect(() => pressKey('e')).not.toThrow();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  // --- Case 2: G navigates to the course -------------------------------------

  it('navigates to the course on G (with ?highlightTask for a task event)', async () => {
    await renderModal({ event: makeTaskEvent({ id: 10 }, { id: 1 }) });

    pressKey('g');
    expect(navigateMock).toHaveBeenCalledWith('/course/1?highlightTask=10');
  });

  // --- Case 3: X toggles complete (both branches of the guard) ---------------

  it('toggles complete on X when a task and onToggleComplete are present', async () => {
    const onToggleComplete = jest.fn();
    const event = makeTaskEvent({ id: 10 });
    await renderModal({ event, onToggleComplete });

    pressKey('x');
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
    expect(onToggleComplete.mock.calls[0][0]).toMatchObject({ id: 10 });
  });

  it('is a no-op on X when onToggleComplete is undefined (guard false branch)', async () => {
    // A task event but no onToggleComplete → `task && onToggleComplete` is false.
    await renderModal({ event: makeTaskEvent(), onToggleComplete: undefined });

    expect(() => pressKey('x')).not.toThrow();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('is a no-op on X when there is no task (imported standalone event)', async () => {
    const onToggleComplete = jest.fn();
    // Standalone imported event (no taskId) → `task` is null → guard false.
    await renderModal({
      event: makeImportedEvent({ taskId: null, sourceType: 'imported' }),
      onToggleComplete,
    });

    pressKey('x');
    expect(onToggleComplete).not.toHaveBeenCalled();
  });

  // --- Case 4: Esc closes -----------------------------------------------------

  it('calls onClose on Escape', async () => {
    const onClose = jest.fn();
    await renderModal({ onClose });

    pressKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // --- Case 5: Delete / Backspace open the confirm (both guard branches) ------

  it('opens the delete confirm on Delete when canDelete (task event + onDelete)', async () => {
    await renderModal({ event: makeTaskEvent(), onDelete: jest.fn() });

    pressKey('Delete');
    // ConfirmDialog renders with the "Delete task?" title.
    await waitFor(() => expect(screen.getByText('Delete task?')).toBeTruthy());
  });

  it('opens the delete confirm on Backspace when canDelete', async () => {
    await renderModal({ event: makeTaskEvent(), onDelete: jest.fn() });

    pressKey('Backspace');
    await waitFor(() => expect(screen.getByText('Delete task?')).toBeTruthy());
  });

  it('is a no-op on Delete when canDelete is false (no onDelete)', async () => {
    await renderModal({ event: makeTaskEvent(), onDelete: undefined });

    pressKey('Delete');
    // No confirm dialog appears.
    expect(screen.queryByText('Delete task?')).toBeNull();
  });

  it('is a no-op on Delete for an imported event linked to a task (not standalone, no onDelete path)', async () => {
    // Imported event WITH a taskId → not a standalone calendar event and
    // event.type !== 'task' → canDelete false even with onDelete.
    await renderModal({
      event: makeImportedEvent({ taskId: 999, sourceType: 'imported' }),
      onDelete: jest.fn(),
    });

    pressKey('Delete');
    expect(screen.queryByText('Delete event?')).toBeNull();
    expect(screen.queryByText('Delete task?')).toBeNull();
  });

  // --- Case 6: form-tag suppression (hook default) ---------------------------

  it('suppresses E fired from inside a focused <input> (enableOnFormTags:false default)', async () => {
    const onEdit = jest.fn();
    await renderModal({ onEdit });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    pressKey('e', { target: input });
    expect(onEdit).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  // --- Case 7: modifier skip --------------------------------------------------

  it('suppresses Ctrl+E (modifier never matches the bare "e" combo)', async () => {
    const onEdit = jest.fn();
    await renderModal({ onEdit });

    pressKey('e', { ctrlKey: true });
    expect(onEdit).not.toHaveBeenCalled();
  });

  // --- Case 8: ★ ADR-0006 win — no keystroke leak under a stacked modal ------

  it('fires NO actions when a second modal is pushed on top (ADR-0006 topmost gate)', async () => {
    const onEdit = jest.fn();
    const onClose = jest.fn();
    const onToggleComplete = jest.fn();
    await renderModal({
      event: makeTaskEvent(),
      onEdit,
      onClose,
      onToggleComplete,
      onDelete: jest.fn(),
      withTopModal: true,
    });

    pressKey('e');
    pressKey('g');
    pressKey('x');
    pressKey('Escape');
    pressKey('Delete');

    expect(onEdit).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onToggleComplete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete task?')).toBeNull();
  });

  // --- Case 9: precedence — showDeleteConfirm gates the hotkeys --------------

  it('does not fire E/G/X once the delete confirm is open (hotkey component unmounted)', async () => {
    const onEdit = jest.fn();
    const onToggleComplete = jest.fn();
    await renderModal({
      event: makeTaskEvent(),
      onEdit,
      onToggleComplete,
      onDelete: jest.fn(),
    });

    // Open the delete confirm.
    pressKey('Delete');
    await waitFor(() => expect(screen.getByText('Delete task?')).toBeTruthy());

    navigateMock.mockClear();
    // Subsequent action keys must NOT fire the TaskDetailModal handlers.
    pressKey('e');
    pressKey('g');
    pressKey('x');

    expect(onEdit).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(onToggleComplete).not.toHaveBeenCalled();
  });
});
