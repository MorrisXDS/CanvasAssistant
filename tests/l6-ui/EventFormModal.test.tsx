/**
 * EventFormModal Tests
 *
 * Covers the Modal-primitive migration (modal 5 of 5 — the LAST handwritten-modal
 * cleanup) for `src/layers/l6-ui/components/Calendar/EventFormModal.tsx`. The
 * component was a handwritten overlay/dialog; it now composes the shared <Modal>
 * primitive (Modal.Header / Modal.Content / Modal.Footer) at size="md",
 * zIndex=1100, closeOnEscape={false}.
 *
 * The component takes everything via PROPS (no store, no direct window.api), so
 * NO store mock is needed. RichTextEditor pulls in TipTap (ProseMirror) which is
 * fragile under jsdom, so it is mocked to a plain <textarea> stub.
 *
 * Load-bearing structural change pinned here:
 *  - The <form> wraps BOTH Modal.Content AND Modal.Footer, so the type="submit"
 *    Save button submits and Ctrl+Enter's formRef.requestSubmit() reaches the
 *    form (cases: happy-path submit + Ctrl+Enter).
 *  - closeOnEscape={false} + the component's own document keydown handler →
 *    Esc fires onClose EXACTLY ONCE (no double-close).
 *  - The `if (showDeleteConfirm || validationAlert) return;` keyboard-yield guard
 *    → while a ConfirmDialog child is open, Esc closes ONLY the child.
 *  - The two ConfirmDialog children moved OUTSIDE the <form>, still inside <Modal>.
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// RichTextEditor mock — the real one mounts TipTap (@tiptap/react +
// ProseMirror), which is heavy/fragile under jsdom. Replace with a plain
// textarea that honours the value/onChange contract so Description still works.
// The component imports it from '../shared/RichTextEditor'.
// ---------------------------------------------------------------------------
jest.mock('../../src/layers/l6-ui/components/shared/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Import AFTER mocks so the component picks up the stubbed RichTextEditor.
import { EventFormModal } from '../../src/layers/l6-ui/components/Calendar/EventFormModal';
import type { Course, DisplayCalendarEvent } from '../../src/shared/ipc-contract';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

let courseCounter = 0;
function makeCourse(overrides: Partial<Course> = {}): Course {
  courseCounter += 1;
  return {
    id: courseCounter,
    externalId: `ext-${courseCounter}`,
    code: `CS${100 + courseCounter}`,
    name: `Course ${courseCounter}`,
    targetGrade: 80,
    targetGradeSource: 'default',
    assessedGrade: null,
    currentGrade: null,
    color: null,
    nickname: null,
    isHidden: false,
    lastSyncedAt: null,
    enrollmentTermId: null,
    credits: 1,
    archivedAt: null,
    archiveSource: null,
    ...overrides,
  };
}

/**
 * A regular (non-task) calendar event for edit-mode tests. taskId null so it's
 * treated as a plain event (not coursework), and a real (non-epoch) startAt so
 * the start field seeds and canSubmit is satisfied.
 */
function makeEvent(overrides: Partial<DisplayCalendarEvent> = {}): DisplayCalendarEvent {
  return {
    id: 555,
    externalId: null,
    sourceType: 'user',
    courseId: null,
    importedCalendarId: null,
    taskId: null,
    title: 'Existing Event',
    description: null,
    startAt: '2026-03-15T10:00:00.000Z',
    endAt: '2026-03-15T11:00:00.000Z',
    allDay: false,
    location: null,
    uid: null,
    recurrenceRule: null,
    recurrenceExceptionDates: null,
    parentEventId: null,
    eventColor: null,
    notes: null,
    reminderMinutes: null,
    isRecurrenceInstance: false,
    color: '#3B82F6',
    ...overrides,
  };
}

interface RenderProps {
  isOpen?: boolean;
  event?: DisplayCalendarEvent | null;
  courses?: Course[];
  onSaveEvent?: jest.Mock;
  onSaveCoursework?: jest.Mock;
  onDelete?: jest.Mock;
  onClose?: jest.Mock;
}

/**
 * Render EventFormModal and flush the init effect (which seeds form state on
 * open) under act() so the jsdom act-guard stays quiet.
 */
async function renderOpen(props: RenderProps = {}) {
  const onSaveEvent = props.onSaveEvent ?? jest.fn().mockResolvedValue(undefined);
  const onSaveCoursework =
    props.onSaveCoursework ?? jest.fn().mockResolvedValue({ success: true });
  const onClose = props.onClose ?? jest.fn();
  const courses = props.courses ?? [makeCourse(), makeCourse()];
  // onDelete is optional — omit entirely when not supplied so the edit-mode
  // Delete branch (`isEditMode && onDelete`) reflects real consumer behaviour.
  const onDelete = props.onDelete;

  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <EventFormModal
        isOpen={props.isOpen ?? true}
        event={props.event ?? null}
        courses={courses}
        onSaveEvent={onSaveEvent}
        onSaveCoursework={onSaveCoursework}
        onDelete={onDelete}
        onClose={onClose}
      />
    );
  });
  // Settle the init effect's synchronous state sets.
  await act(async () => {
    await Promise.resolve();
  });
  return { ...utils, onSaveEvent, onSaveCoursework, onClose, onDelete, courses };
}

/** The footer's submit (Save/Create) button. */
function getSubmitButton(): HTMLButtonElement {
  const btn = document.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  if (!btn) throw new Error('Submit button not found');
  return btn;
}

/** The modal's <h2> title (Modal.Header renders the title in an <h2>). */
function headerTitle(): string {
  const h2 = document.querySelector('[role="dialog"] h2');
  return (h2?.textContent ?? '').trim();
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // The primitive sets body scroll-lock; reset so it can't bleed across tests.
  document.body.style.overflow = '';
});

// ---------------------------------------------------------------------------
// 1. Render branches (isOpen guard)
// ---------------------------------------------------------------------------

describe('EventFormModal — render branches', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <EventFormModal
        isOpen={false}
        event={null}
        courses={[]}
        onSaveEvent={jest.fn()}
        onSaveCoursework={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the primitive (role=dialog + backdrop) + header + footer when open', async () => {
    await renderOpen();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('div[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2/3. Create-mode vs edit-mode header + button set (Delete only in edit mode)
// ---------------------------------------------------------------------------

describe('EventFormModal — create vs edit mode', () => {
  it('create mode → header "New Event" + type selector + "Create Event" submit + NO Delete', async () => {
    await renderOpen({ event: null });

    expect(headerTitle()).toBe('New Event');
    // Type selector (create-mode only).
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('Coursework')).toBeInTheDocument();
    // Footer submit label.
    expect(getSubmitButton().textContent).toContain('Create Event');
    // No Delete button in create mode.
    expect(screen.queryByText('Delete Event')).not.toBeInTheDocument();
  });

  it('edit mode (with onDelete) → header "Edit Event" + Delete button + "Save Changes"', async () => {
    await renderOpen({ event: makeEvent(), onDelete: jest.fn() });

    expect(headerTitle()).toBe('Edit Event');
    // Delete button renders (footer align="between" branch).
    expect(screen.getByText('Delete Event')).toBeInTheDocument();
    // Submit label is "Save Changes" in edit mode.
    expect(getSubmitButton().textContent).toContain('Save Changes');
    // The type selector is NOT shown in edit mode.
    expect(screen.queryByText('Regular')).not.toBeInTheDocument();
  });

  it('edit mode WITHOUT onDelete → no Delete button (footer align="end")', async () => {
    await renderOpen({ event: makeEvent(), onDelete: undefined });
    expect(headerTitle()).toBe('Edit Event');
    expect(screen.queryByText('Delete Event')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Type toggle (create) — header + field blocks swap
// ---------------------------------------------------------------------------

describe('EventFormModal — type toggle', () => {
  it('clicking Coursework flips header to "New Coursework" + shows coursework fields', async () => {
    await renderOpen({ event: null });

    expect(headerTitle()).toBe('New Event');
    // Event-only field present before toggle.
    expect(screen.getByText('All day event')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText('Coursework'));
    });

    expect(headerTitle()).toBe('New Coursework');
    // Coursework fields appear.
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Weight (%)')).toBeInTheDocument();
    // Event-only field gone.
    expect(screen.queryByText('All day event')).not.toBeInTheDocument();
    // Submit label updates.
    expect(getSubmitButton().textContent).toContain('Create Coursework');
  });
});

// ---------------------------------------------------------------------------
// 5/6. Field entry + canSubmit predicate
// ---------------------------------------------------------------------------

describe('EventFormModal — canSubmit predicate', () => {
  it('create event → Save disabled with empty title, enabled once title typed', async () => {
    await renderOpen({ event: null });

    const titleInput = document.getElementById('event-form-title') as HTMLInputElement;
    // Title starts empty in create mode.
    expect(titleInput.value).toBe('');
    expect(getSubmitButton()).toBeDisabled();

    act(() => {
      fireEvent.change(titleInput, { target: { value: 'Study session' } });
    });

    expect(titleInput.value).toBe('Study session');
    // startAt is pre-filled by the create-mode default → canSubmit true.
    expect(getSubmitButton()).not.toBeDisabled();
  });

  it('create coursework → Save stays disabled without a course; enables once a course is selected', async () => {
    const courses = [makeCourse(), makeCourse()];
    await renderOpen({ event: null, courses });

    act(() => {
      fireEvent.click(screen.getByText('Coursework'));
    });

    const titleInput = document.getElementById('event-form-title') as HTMLInputElement;
    act(() => {
      fireEvent.change(titleInput, { target: { value: 'Assignment 1' } });
    });
    // Title set but no course → canSubmit false (coursework requires courseId).
    expect(getSubmitButton()).toBeDisabled();

    const courseSelect = document.getElementById(
      'event-form-course'
    ) as HTMLSelectElement;
    act(() => {
      fireEvent.change(courseSelect, { target: { value: String(courses[0].id) } });
    });

    // Now title + course → canSubmit true.
    expect(getSubmitButton()).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 7/8/9. Submit path — clicking Save (type="submit") fires the right callback
// ---------------------------------------------------------------------------

describe('EventFormModal — submit path (form wraps Content + Footer)', () => {
  it('create event happy path → onSaveEvent with payload + onClose', async () => {
    const { onSaveEvent, onClose } = await renderOpen({ event: null });

    const titleInput = document.getElementById('event-form-title') as HTMLInputElement;
    act(() => {
      fireEvent.change(titleInput, { target: { value: 'Lab meeting' } });
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
      await Promise.resolve();
    });

    expect(onSaveEvent).toHaveBeenCalledTimes(1);
    expect(onSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Lab meeting',
        allDay: false,
        startAt: expect.any(String),
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('create coursework happy path → onSaveCoursework with payload + onClose on success', async () => {
    const courses = [makeCourse(), makeCourse()];
    const { onSaveCoursework, onClose } = await renderOpen({ event: null, courses });

    act(() => {
      fireEvent.click(screen.getByText('Coursework'));
    });
    act(() => {
      fireEvent.change(document.getElementById('event-form-title') as HTMLInputElement, {
        target: { value: 'Problem set 3' },
      });
    });
    act(() => {
      fireEvent.change(
        document.getElementById('event-form-course') as HTMLSelectElement,
        {
          target: { value: String(courses[1].id) },
        }
      );
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
      await Promise.resolve();
    });

    expect(onSaveCoursework).toHaveBeenCalledTimes(1);
    expect(onSaveCoursework).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: courses[1].id,
        title: 'Problem set 3',
        unlockAt: expect.any(String),
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('coursework create with success:false → onClose NOT called', async () => {
    const courses = [makeCourse()];
    const onSaveCoursework = jest.fn().mockResolvedValue({ success: false });
    const { onClose } = await renderOpen({ event: null, courses, onSaveCoursework });

    act(() => {
      fireEvent.click(screen.getByText('Coursework'));
    });
    act(() => {
      fireEvent.change(document.getElementById('event-form-title') as HTMLInputElement, {
        target: { value: 'Quiz' },
      });
    });
    act(() => {
      fireEvent.change(
        document.getElementById('event-form-course') as HTMLSelectElement,
        {
          target: { value: String(courses[0].id) },
        }
      );
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
      await Promise.resolve();
    });

    expect(onSaveCoursework).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('edit save → onSaveEvent + onClose', async () => {
    const { onSaveEvent, onClose } = await renderOpen({
      event: makeEvent({ title: 'Old title' }),
      onDelete: jest.fn(),
    });

    const titleInput = document.getElementById('event-form-title') as HTMLInputElement;
    expect(titleInput.value).toBe('Old title'); // seeded from the event prop
    act(() => {
      fireEvent.change(titleInput, { target: { value: 'New title' } });
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
      await Promise.resolve();
    });

    expect(onSaveEvent).toHaveBeenCalledTimes(1);
    expect(onSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New title' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('empty title → submitting the form does NOT call onSaveEvent (handleSubmit guard)', async () => {
    const { onSaveEvent } = await renderOpen({ event: null });

    // Force a form submit even though the button is disabled (covers the
    // `if (!title.trim()) return;` guard at the top of handleSubmit).
    const form = document.querySelector('[role="dialog"] form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
      await Promise.resolve();
    });

    expect(onSaveEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 10/11. Delete-confirm ConfirmDialog flow (edit mode → Delete → confirm)
// ---------------------------------------------------------------------------

describe('EventFormModal — delete flow', () => {
  it('Delete Event → ConfirmDialog → Delete confirms → onDelete + onClose', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const { onClose } = await renderOpen({ event: makeEvent(), onDelete });

    act(() => {
      fireEvent.click(screen.getByText('Delete Event'));
    });

    // The danger ConfirmDialog renders (title + "Are you sure" message).
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // Click its confirm "Delete" button (the ConfirmDialog's confirm button).
    const confirmButtons = screen.getAllByText('Delete');
    // The ConfirmDialog confirm button is the one inside the danger dialog;
    // grab the button element directly.
    const confirmBtn = confirmButtons
      .map((el) => el.closest('button'))
      .find((b): b is HTMLButtonElement => b !== null);
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(confirmBtn!);
      await Promise.resolve();
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Delete Event → ConfirmDialog Cancel → dialog closes, onDelete NOT called', async () => {
    const onDelete = jest.fn();
    await renderOpen({ event: makeEvent(), onDelete });

    act(() => {
      fireEvent.click(screen.getByText('Delete Event'));
    });
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // The ConfirmDialog's Cancel button (cancelText="Cancel"). There are two
    // "Cancel" buttons now (form footer + dialog); the dialog's is the LAST one.
    const cancels = screen.getAllByText('Cancel');
    act(() => {
      fireEvent.click(cancels[cancels.length - 1]);
    });

    expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 12/13. Esc behavior (own handler + closeOnEscape={false} + child-yield guard)
// ---------------------------------------------------------------------------

describe('EventFormModal — Esc behavior', () => {
  it('Esc fires onClose EXACTLY ONCE (closeOnEscape={false} + own handler — no double close)', async () => {
    const { onClose } = await renderOpen({ event: null });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    // If the primitive's listener ALSO fired (closeOnEscape not set to false),
    // this would be 2. The component owns Esc → exactly once.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc is SUPPRESSED in the form while the delete-confirm child is open (guard yields keyboard)', async () => {
    const onDelete = jest.fn();
    const { onClose } = await renderOpen({ event: makeEvent(), onDelete });

    act(() => {
      fireEvent.click(screen.getByText('Delete Event'));
    });
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();

    // Press Esc: the ConfirmDialog's capture-phase handler closes it; the
    // form's keydown handler is guarded by `if (showDeleteConfirm ...) return;`
    // so the FORM's onClose must NOT fire.
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    // Delete-confirm dialog closed.
    expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
    // Form was NOT closed.
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 14. Ctrl+Enter submits via the form (requestSubmit through the primitive split)
// ---------------------------------------------------------------------------

describe('EventFormModal — Ctrl/Cmd+Enter submit', () => {
  it('Ctrl+Enter submits the form → onSaveEvent (proves form wraps the submit button)', async () => {
    const { onSaveEvent } = await renderOpen({ event: null });

    act(() => {
      fireEvent.change(document.getElementById('event-form-title') as HTMLInputElement, {
        target: { value: 'Quick add' },
      });
    });

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
      await Promise.resolve();
    });

    expect(onSaveEvent).toHaveBeenCalledTimes(1);
    expect(onSaveEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Quick add' })
    );
  });
});

// ---------------------------------------------------------------------------
// 15/16/17. Dismissal paths: header X, Cancel, backdrop
// ---------------------------------------------------------------------------

describe('EventFormModal — dismissal', () => {
  it('header close button (aria-label="Close modal") → onClose', async () => {
    const { onClose } = await renderOpen({ event: null });
    act(() => {
      fireEvent.click(screen.getByLabelText('Close modal'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel button → onClose', async () => {
    const { onClose } = await renderOpen({ event: null });
    // The footer Cancel is the first "Cancel" (no dialog open).
    act(() => {
      fireEvent.click(screen.getByText('Cancel'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click → onClose (closeOnBackdropClick default-true parity)', async () => {
    const { onClose } = await renderOpen({ event: null });
    const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;
    act(() => {
      fireEvent.click(backdrop);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 18. Alt-key shortcuts (type toggle) — pins the keydown handler still wired
// ---------------------------------------------------------------------------

describe('EventFormModal — Alt-key shortcuts', () => {
  it('Alt+2 switches to coursework, Alt+1 back to event (create mode)', async () => {
    await renderOpen({ event: null });

    act(() => {
      fireEvent.keyDown(document, { key: '2', altKey: true });
    });
    expect(headerTitle()).toBe('New Coursework');

    act(() => {
      fireEvent.keyDown(document, { key: '1', altKey: true });
    });
    expect(headerTitle()).toBe('New Event');
  });
});
