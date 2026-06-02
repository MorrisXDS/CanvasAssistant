/**
 * ImportConfirmationModal tests (regression suite for the Modal-primitive migration).
 *
 * `ImportConfirmationModal` was migrated from handwritten overlay/dialog chrome
 * to the shared `<Modal>` primitive (`Modal.Header`/`Modal.Content`/`Modal.Footer`),
 * and its hand-rolled `document` keydown Escape listener was removed in favour of
 * the primitive's built-in `closeOnEscape`. This suite pins the externally-observable
 * behaviour so the behaviour-preserving refactor is provably non-breaking:
 *   - open/closed/no-preview render guards
 *   - title + summary + footer "Import N Events" count
 *   - Cancel button → onCancel
 *   - Escape (now via the primitive) → onCancel
 *   - Confirm → onConfirm with { name (trimmed, falls back to preview.calendarName), color }
 *   - warnings block, recurring badge
 *   - events-preview expand toggle + per-event details expand
 *
 * Harness: jsdom + RTL. The store is mocked (matches SettingsModal.test.tsx); the
 * settings barrel's time formatter is mocked to a deterministic string so the
 * preview rows don't depend on luxon/effective-timezone settings. The `<Modal>`
 * primitive's `useModalStack()` falls back to a no-op default context outside the
 * provider, so no provider wrapper is required. State-changing interactions are
 * wrapped in `act()` per the jsdom act-guard (tests/setup-jsdom.ts).
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  ICSImportPreview,
  ParsedICSEvent,
} from '../../../../src/shared/ipc-contract';

// --- Mocks (must precede the component import) -------------------------------

// Store: the component reads `state.importedCalendars` (a length read for the
// golden-angle color seed). Provide a stable empty array.
jest.mock('../../../../src/layers/l5-presentation/store', () => ({
  useStore: jest.fn((selector: (s: { importedCalendars: unknown[] }) => unknown) =>
    selector({ importedCalendars: [] })
  ),
}));

// Settings barrel: pin the timezone-aware time formatter so event-row rendering
// is deterministic and doesn't reach into localStorage / luxon settings.
jest.mock('../../../../src/layers/l5-presentation/settings', () => ({
  formatTimeInEffectiveTimezone: jest.fn(() => '2:00 PM'),
}));

import { ImportConfirmationModal } from '../../../../src/layers/l6-ui/components/Calendar/ImportConfirmationModal';

// --- Fixtures ----------------------------------------------------------------

function makeEvent(overrides: Partial<ParsedICSEvent> = {}): ParsedICSEvent {
  return {
    uid: 'evt-1',
    summary: 'Lecture 1',
    description: null,
    dtstart: new Date('2026-01-15T14:00:00Z'),
    dtend: new Date('2026-01-15T15:00:00Z'),
    allDay: false,
    location: null,
    rrule: null,
    exdates: null,
    sequence: 0,
    ...overrides,
  };
}

function makePreview(overrides: Partial<ICSImportPreview> = {}): ICSImportPreview {
  return {
    calendarName: 'My Imported Calendar',
    filename: 'schedule.ics',
    events: [makeEvent()],
    hasRecurringEvents: false,
    dateRange: {
      start: new Date('2026-01-15T00:00:00Z'),
      end: new Date('2026-01-20T00:00:00Z'),
    },
    warnings: [],
    ...overrides,
  };
}

function manyEvents(n: number): ParsedICSEvent[] {
  return Array.from({ length: n }, (_, i) =>
    makeEvent({ uid: `evt-${i}`, summary: `Event ${i}` })
  );
}

describe('ImportConfirmationModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Case 1
  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <ImportConfirmationModal
        isOpen={false}
        preview={makePreview()}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Case 2
  it('renders nothing when preview is null (guard)', () => {
    const { container } = render(
      <ImportConfirmationModal
        isOpen={true}
        preview={null}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Case 3
  it('renders title, summary, and the "Import N Events" footer count when open', () => {
    const preview = makePreview({
      filename: 'schedule.ics',
      events: manyEvents(3),
    });
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={preview}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText('Import Calendar')).toBeInTheDocument();
    expect(screen.getByText('schedule.ics')).toBeInTheDocument();
    // Footer button shows the event count (3).
    expect(screen.getByRole('button', { name: /Import 3 Events/i })).toBeInTheDocument();
  });

  // Case 4
  it('fires onCancel when the Cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={makePreview()}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // Case 5
  it('dismisses via Escape (handled by the primitive) → onCancel fires once', () => {
    const onCancel = jest.fn();
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={makePreview()}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );

    // The primitive attaches a document-level keydown listener for Escape.
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // Case 6
  it('fires onConfirm with the edited (trimmed) name and selected color', () => {
    const onConfirm = jest.fn();
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={makePreview({ calendarName: 'Original Name' })}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Enter calendar name') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: '  Renamed Calendar  ' } });
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Import 1 Events/i }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      name: 'Renamed Calendar',
      color: expect.any(String),
    });
  });

  // Case 6b — empty name falls back to preview.calendarName
  it('falls back to preview.calendarName when the name input is cleared', () => {
    const onConfirm = jest.fn();
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={makePreview({ calendarName: 'Fallback Name' })}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Enter calendar name') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: '   ' } });
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Import 1 Events/i }));
    });

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fallback Name' })
    );
  });

  // Case 7
  it('renders warnings when preview.warnings is non-empty', () => {
    const preview = makePreview({
      warnings: ['Some events have no end time', 'Timezone assumed UTC'],
    });
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={preview}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText('Some events have no end time')).toBeInTheDocument();
    expect(screen.getByText('Timezone assumed UTC')).toBeInTheDocument();
  });

  // Case 8
  it('renders the recurring badge when preview.hasRecurringEvents is true', () => {
    const preview = makePreview({ hasRecurringEvents: true });
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={preview}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText('Contains recurring events')).toBeInTheDocument();
  });

  // Case 9 — events preview expand + per-event detail expand
  it("expands the events list past the initial 5 and toggles a single event's details", () => {
    const preview = makePreview({
      events: manyEvents(7),
      hasRecurringEvents: true,
    });
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={preview}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    // Header shows the total count.
    expect(screen.getByText('Events Preview (7 total)')).toBeInTheDocument();

    // Only the first 5 events render before expanding; "Event 6" is hidden.
    expect(screen.queryByText('Event 6')).not.toBeInTheDocument();

    // The "Show all 7" toggle reveals the rest.
    const toggle = screen.getByRole('button', { name: /Show all 7/i });
    act(() => {
      fireEvent.click(toggle);
    });
    expect(screen.getByText('Event 6')).toBeInTheDocument();
    // Toggle flips to "Show less".
    expect(screen.getByRole('button', { name: /Show less/i })).toBeInTheDocument();

    // Clicking an event row expands its detail block (covers EventPreviewItem's
    // expand branch + the formatDateTime/formatRRule helpers).
    const eventRow = screen.getByText('Event 0');
    act(() => {
      fireEvent.click(eventRow);
    });
    // Expanded detail surfaces the full formatted date+time. The compact
    // per-event meta line shows "at 2:00 PM" for every event, so target the
    // expanded detail's full-date string (only the expanded row renders it).
    expect(screen.getByText('Thu, Jan 15, 2026 at 2:00 PM')).toBeInTheDocument();
  });

  // Case 9b — recurring + location + description detail rows (covers the
  // formatRRule weekly-BYDAY branch and the location/description detail rows).
  it('renders recurring/location/description detail rows for an expanded recurring event', () => {
    const preview = makePreview({
      events: [
        makeEvent({
          uid: 'recur-1',
          summary: 'Weekly Standup',
          rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
          location: 'Room 101',
          description: 'Team sync',
        }),
      ],
    });
    render(
      <ImportConfirmationModal
        isOpen={true}
        preview={preview}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    const eventRow = screen.getByText('Weekly Standup');
    act(() => {
      fireEvent.click(eventRow);
    });

    // formatRRule weekly-with-BYDAY branch.
    expect(screen.getByText('Repeats weekly on Mon, Wed, Fri')).toBeInTheDocument();
    // Location renders both in the compact meta line and the expanded detail
    // row (short value, so neither is truncated) → two occurrences.
    expect(screen.getAllByText('Room 101')).toHaveLength(2);
    // Description detail row (only rendered in the expanded block).
    expect(screen.getByText('Team sync')).toBeInTheDocument();
  });
});
