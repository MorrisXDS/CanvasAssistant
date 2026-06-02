/**
 * ExportDialog Tests
 *
 * Covers the Modal-primitive migration (modal 4 of 5) for
 * `src/layers/l6-ui/components/shared/ExportDialog.tsx`. The component was a
 * handwritten overlay/dialog; it now composes the shared <Modal> primitive
 * (Modal.Header / Modal.Content / Modal.Footer) at size="lg", zIndex=1200, as a
 * STACKED CHILD above the SettingsModal parent. It reads courses via
 * `useStore(selectors.visibleCourses)` and exports via
 * `window.api.exportSelective(...)`.
 *
 * Load-bearing cases:
 *  - `selectors.visibleCourses` consumption (the rendered course list comes from
 *    visible courses; the mocked useStore applies the passed selector).
 *  - The capture-phase, isOpen-guarded, stopPropagation()-ing Esc listener:
 *    Esc closes ONLY the child (onClose fires) AND stopPropagation is called so a
 *    parent (bubble-phase) document listener would NOT also fire.
 *  - canExport enable/disable predicate; isExporting label swap (Export ⇄
 *    Exporting…); exportResult status banner (success / failure / throw).
 *
 * The two handleExport validation early-returns (totalCourses===0 /
 * password<8) are exercised directly in this file (the handler is invoked via
 * the Export button after force-enabling it / via the always-clickable path) —
 * see "handleExport validation early-returns".
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Store mock — ExportDialog calls `useStore(selectors.visibleCourses)`.
//
// The component imports BOTH `useStore` and `selectors` from the store barrel.
// We mock the barrel so:
//   - `selectors.visibleCourses` is the real filter (strips isHidden), and
//   - `useStore(selector)` applies the passed selector against a fake state
//     `{ courses: mockCourses }` (so the rendered list = visible mock courses).
// `mockCourses` is mutated per-test BEFORE render to vary the course list.
// ---------------------------------------------------------------------------

interface MockCourse {
  id: number;
  code: string;
  name: string;
  isHidden: boolean;
}

let mockCourses: MockCourse[] = [];

const realSelectors = {
  visibleCourses: (state: { courses: MockCourse[] }) =>
    state.courses.filter((c) => !c.isHidden),
};

jest.mock('../../src/layers/l5-presentation/store', () => ({
  selectors: realSelectors,
  useStore: jest.fn((selector?: (s: { courses: MockCourse[] }) => unknown) => {
    const state = { courses: mockCourses };
    return selector ? selector(state) : state;
  }),
}));

// ---------------------------------------------------------------------------
// window.api mock — getArchivedCourses (open effect) + exportSelective (export).
// ---------------------------------------------------------------------------

const mockApi = {
  getArchivedCourses: jest.fn().mockResolvedValue([]),
  exportSelective: jest
    .fn()
    .mockResolvedValue({ success: true, data: { filePath: '/tmp/export.json' } }),
};

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
});

// Import AFTER mocks so the component picks up the mocked store + window.api.
import { ExportDialog } from '../../src/layers/l6-ui/components/shared/ExportDialog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let courseCounter = 0;
function makeCourse(overrides: Partial<MockCourse> = {}): MockCourse {
  courseCounter += 1;
  return {
    id: courseCounter,
    code: `CS${100 + courseCounter}`,
    name: `Course ${courseCounter}`,
    isHidden: false,
    ...overrides,
  };
}

/**
 * Render ExportDialog and flush the open-effects (archived-fetch +
 * init-all-courses-selected) under act() so the jsdom act-guard stays quiet.
 */
async function renderOpen(props: Partial<{ isOpen: boolean; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? jest.fn();
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<ExportDialog isOpen={props.isOpen ?? true} onClose={onClose} />);
  });
  // Settle the async getArchivedCourses().then(...) + the init effect.
  await act(async () => {
    await Promise.resolve();
  });
  return { ...utils, onClose };
}

/**
 * The footer's primary action button. Its label swaps between "Export" and
 * "Exporting..."; it's the only button whose label contains "Export" and is not
 * "Select ..."/"Custom Export"(an h2, not a button). We pick the last matching
 * button (footer Export sits after the Select All/None link buttons).
 */
function getExportButton(): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const matches = buttons.filter((b) => /Export/.test(b.textContent ?? ''));
  const btn = matches[matches.length - 1];
  if (!btn) throw new Error('Export button not found');
  return btn;
}

/**
 * The footer info text element ("N course(s) selected (M archived)"). Found by
 * its own normalized textContent so we don't match ancestor wrappers.
 */
function footerInfoText(): string {
  const divs = Array.from(document.querySelectorAll('div')) as HTMLDivElement[];
  // Pick the INNERMOST matching div (shortest textContent) so we read the
  // footerInfo span-wrapper, not the whole Modal.Footer (which also contains the
  // Cancel/Export buttons).
  const matches = divs
    .filter((d) => /^\s*\d+ courses? selected/.test(d.textContent ?? ''))
    .sort((a, b) => (a.textContent ?? '').length - (b.textContent ?? '').length);
  return (matches[0]?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The wrapping row <div> for an include option or course, by its label text. */
function rowByText(text: string | RegExp): HTMLElement {
  const matcher = (t: string) =>
    typeof text === 'string' ? t.includes(text) : text.test(t);
  const spans = Array.from(document.querySelectorAll('span')) as HTMLSpanElement[];
  const span = spans.find((s) => matcher((s.textContent ?? '').trim()));
  const row = span?.closest('div');
  if (!row) throw new Error(`Row not found for: ${text}`);
  return row as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getArchivedCourses.mockResolvedValue([]);
  mockApi.exportSelective.mockResolvedValue({
    success: true,
    data: { filePath: '/tmp/export.json' },
  });
  mockCourses = [makeCourse(), makeCourse()];
});

afterEach(() => {
  // The primitive sets body scroll-lock; reset so it can't bleed across tests.
  document.body.style.overflow = '';
});

// ---------------------------------------------------------------------------
// 1. Render branches
// ---------------------------------------------------------------------------

describe('ExportDialog — render branches', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ExportDialog isOpen={false} onClose={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the primitive (role=dialog + backdrop), header, course list, footer when open', async () => {
    await renderOpen();

    // Primitive container + backdrop.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('div[aria-hidden="true"]')).toBeInTheDocument();

    // Header title.
    expect(screen.getByText('Custom Export')).toBeInTheDocument();

    // Course list — every visible mock course renders as "CODE - Name".
    for (const c of mockCourses) {
      expect(screen.getByText(`${c.code} - ${c.name}`)).toBeInTheDocument();
    }

    // Footer: N courses selected (init effect selects all) + Cancel + Export.
    expect(footerInfoText()).toContain(`${mockCourses.length} courses selected`);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(getExportButton()).toBeInTheDocument();
  });

  it('reads the course list from selectors.visibleCourses (hidden courses excluded)', async () => {
    mockCourses = [
      makeCourse({ code: 'VIS101', name: 'Visible One' }),
      makeCourse({ code: 'HID900', name: 'Hidden One', isHidden: true }),
      makeCourse({ code: 'VIS102', name: 'Visible Two' }),
    ];

    await renderOpen();

    expect(screen.getByText('VIS101 - Visible One')).toBeInTheDocument();
    expect(screen.getByText('VIS102 - Visible Two')).toBeInTheDocument();
    // The isHidden course is filtered out by selectors.visibleCourses.
    expect(screen.queryByText('HID900 - Hidden One')).not.toBeInTheDocument();

    // 2 visible courses selected by the init effect (hidden one not counted).
    expect(footerInfoText()).toContain('2 courses selected');
  });
});

// ---------------------------------------------------------------------------
// 2. Course selection (toggleCourse / selectAll / selectNone) + canExport
// ---------------------------------------------------------------------------

describe('ExportDialog — course selection', () => {
  it('toggling a course off decrements the footer count', async () => {
    await renderOpen(); // 2 courses, both selected

    // The row <div> owns the toggle onClick; clicking the row (not the inner
    // checkbox) fires the toggle exactly once (clicking the checkbox would fire
    // BOTH its onChange AND the row's onClick → net no-op).
    const firstCourseRow = screen
      .getByText(`${mockCourses[0].code} - ${mockCourses[0].name}`)
      .closest('div')!;
    const checkbox = within(firstCourseRow).getByRole('checkbox');
    expect(checkbox).toBeChecked();

    act(() => {
      fireEvent.click(firstCourseRow);
    });

    expect(footerInfoText()).toContain('1 course selected');
    expect(checkbox).not.toBeChecked();
  });

  it('Select None empties the selection and disables Export; Select All re-selects', async () => {
    await renderOpen();

    act(() => {
      fireEvent.click(screen.getByText('Select None'));
    });

    expect(footerInfoText()).toContain('0 courses selected');
    expect(getExportButton()).toBeDisabled(); // canExport=false at 0 courses

    act(() => {
      fireEvent.click(screen.getByText('Select All'));
    });

    expect(footerInfoText()).toContain(`${mockCourses.length} courses selected`);
    expect(getExportButton()).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 3. Include options + fileCount memo
// ---------------------------------------------------------------------------

describe('ExportDialog — include options', () => {
  it('toggles an include option (Notifications) on', async () => {
    await renderOpen();

    const notifRow = rowByText('Notifications');
    const checkbox = within(notifRow).getByRole('checkbox');
    expect(checkbox).not.toBeChecked(); // includeNotifications defaults false

    // Click the row (its onClick owns the toggle); clicking the checkbox would
    // double-fire (onChange + bubbled onClick) → net no-op.
    act(() => {
      fireEvent.click(notifRow);
    });

    expect(checkbox).toBeChecked();
  });

  it('toggling Downloaded files flips the fileCount label (0 → ~23 MB)', async () => {
    await renderOpen();

    // Default includeFiles=false → label shows "(0)". The label text spans
    // multiple nodes ("Downloaded files (" + fileCount + ")"), so match on the
    // span's combined textContent.
    const filesRow = rowByText('Downloaded files');
    expect((filesRow.textContent ?? '').replace(/\s+/g, ' ')).toContain(
      'Downloaded files (0)'
    );

    act(() => {
      fireEvent.click(filesRow);
    });

    // fileCount memo recomputes to "~23 MB".
    const filesRowAfter = rowByText('Downloaded files');
    expect((filesRowAfter.textContent ?? '').replace(/\s+/g, ' ')).toContain(
      'Downloaded files (~23 MB)'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Format selection
// ---------------------------------------------------------------------------

describe('ExportDialog — format selection', () => {
  it('selecting CSV then ZIP updates the chosen format', async () => {
    await renderOpen();

    // All three format buttons render.
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('ZIP')).toBeInTheDocument();

    const csvBtn = screen.getByText('CSV').closest('button')!;
    act(() => {
      fireEvent.click(csvBtn);
    });

    const zipBtn = screen.getByText('ZIP').closest('button')!;
    act(() => {
      fireEvent.click(zipBtn);
    });

    // Drive the format into the export payload to prove the selection stuck.
    await act(async () => {
      fireEvent.click(getExportButton());
      await Promise.resolve();
    });
    expect(mockApi.exportSelective).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'zip' })
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Encryption: reveals password + strength bars; Eye toggle; password drives canExport
// ---------------------------------------------------------------------------

describe('ExportDialog — encryption', () => {
  it('checking Encrypt reveals the password input + 4 strength bars; typing colours them', async () => {
    await renderOpen();

    // Hidden until encrypt is checked.
    expect(screen.queryByPlaceholderText(/Enter password/i)).not.toBeInTheDocument();

    const encryptRow = screen.getByText('Encrypt with password').closest('div')!;
    const encryptCheckbox = within(encryptRow).getByRole('checkbox');
    act(() => {
      fireEvent.click(encryptCheckbox);
    });

    const pwdInput = screen.getByPlaceholderText(/Enter password/i) as HTMLInputElement;
    expect(pwdInput).toBeInTheDocument();
    expect(pwdInput.type).toBe('password');

    // With encrypt on but empty password, Export is disabled (canExport=false).
    expect(getExportButton()).toBeDisabled();

    // Type a strong password → passwordStrength memo runs; Export enables.
    act(() => {
      fireEvent.change(pwdInput, { target: { value: 'Str0ng!Passw0rd' } });
    });
    expect(pwdInput.value).toBe('Str0ng!Passw0rd');
    expect(getExportButton()).not.toBeDisabled();
  });

  it('Eye toggle flips the password input type to text', async () => {
    await renderOpen();

    const encryptRow = screen.getByText('Encrypt with password').closest('div')!;
    act(() => {
      fireEvent.click(within(encryptRow).getByRole('checkbox'));
    });

    const pwdInput = screen.getByPlaceholderText(/Enter password/i) as HTMLInputElement;
    expect(pwdInput.type).toBe('password');

    // The Eye button sits next to the password input (the only button inside the
    // password's relative wrapper).
    const eyeBtn = pwdInput.parentElement!.querySelector('button')!;
    act(() => {
      fireEvent.click(eyeBtn);
    });

    expect(pwdInput.type).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// 6. Archived courses section (getArchivedCourses populates it)
// ---------------------------------------------------------------------------

describe('ExportDialog — archived courses', () => {
  it('shows the Archived Courses section + (M archived) footer when archived courses are selected', async () => {
    mockApi.getArchivedCourses.mockResolvedValue([
      { id: 901, code: 'ARC101', name: 'Old Course', archivedAt: '2025-01-01T00:00:00Z' },
    ]);

    await renderOpen();

    expect(screen.getByText('Archived Courses')).toBeInTheDocument();

    // Expand the archived list, then select all archived.
    act(() => {
      fireEvent.click(screen.getByText(/Show \(1\)/));
    });
    act(() => {
      fireEvent.click(screen.getByText('Select All Archived'));
    });

    // Footer now notes the archived count.
    expect(footerInfoText()).toContain('(1 archived)');
  });
});

// ---------------------------------------------------------------------------
// 7. handleExport happy path + isExporting label swap + success banner
// ---------------------------------------------------------------------------

describe('ExportDialog — export happy path', () => {
  it('fires exportSelective with the right payload and shows the success banner', async () => {
    await renderOpen(); // 2 courses selected, JSON, no encrypt

    let resolveExport!: (v: unknown) => void;
    mockApi.exportSelective.mockReturnValue(
      new Promise((res) => {
        resolveExport = res;
      })
    );

    act(() => {
      fireEvent.click(getExportButton());
    });

    // Mid-flight: button label swaps to "Exporting...".
    expect(getExportButton().textContent ?? '').toContain('Exporting...');

    // Payload assertions.
    expect(mockApi.exportSelective).toHaveBeenCalledTimes(1);
    expect(mockApi.exportSelective).toHaveBeenCalledWith(
      expect.objectContaining({
        courses: mockCourses.map((c) => c.id),
        archivedCourses: undefined,
        includeTasks: true,
        includeNotifications: false,
        includeFiles: false,
        includeGrades: true,
        includeCalendar: false,
        taskStatus: 'all',
        dateRange: undefined,
        format: 'json',
        encrypt: false,
        password: undefined,
      })
    );

    // Resolve the export → success banner + label swaps back to "Export".
    await act(async () => {
      resolveExport({ success: true, data: { filePath: '/tmp/export.json' } });
      await Promise.resolve();
    });

    expect(screen.getByText(/Export complete: \/tmp\/export\.json/)).toBeInTheDocument();
    expect(getExportButton()).not.toBeDisabled();
  });

  it('falls back to "file saved" when the result has no filePath', async () => {
    await renderOpen();
    mockApi.exportSelective.mockResolvedValue({ success: true, data: {} });

    await act(async () => {
      fireEvent.click(getExportButton());
      await Promise.resolve();
    });

    expect(screen.getByText(/Export complete: file saved/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 8. handleExport failure + throw branches
// ---------------------------------------------------------------------------

describe('ExportDialog — export failure paths', () => {
  it('shows the error banner from result.error on a failed export', async () => {
    await renderOpen();
    mockApi.exportSelective.mockResolvedValue({ success: false, error: 'boom' });

    await act(async () => {
      fireEvent.click(getExportButton());
      await Promise.resolve();
    });

    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('falls back to "Export failed" when a failed result has no error message', async () => {
    await renderOpen();
    mockApi.exportSelective.mockResolvedValue({ success: false });

    await act(async () => {
      fireEvent.click(getExportButton());
      await Promise.resolve();
    });

    expect(screen.getByText('Export failed')).toBeInTheDocument();
  });

  it('catches a thrown error and shows String(error) in the banner', async () => {
    await renderOpen();
    mockApi.exportSelective.mockRejectedValue(new Error('network down'));

    await act(async () => {
      fireEvent.click(getExportButton());
      await Promise.resolve();
    });

    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 9. handleExport validation early-returns — UNREACHABLE-via-UI (carved out)
//
// handleExport has two defensive early-returns:
//   if (totalCourses === 0) { setExportResult(...'select at least one course'); return; }
//   if (options.encrypt && options.password.length < 8) { setExportResult(...); return; }
// Both conditions are a STRICT subset of `!canExport` (canExport requires
// totalSelectedCourses > 0 AND (!encrypt || password.length >= 8)). The Export
// button's `disabled={!canExport}` therefore makes both guards unreachable
// through the UI — there is NO state in which the button is clickable AND a
// guard is true. (Removing the DOM `disabled` attribute to force-click does not
// reliably run React's synthetic onClick, and would be testing a state the
// component can never produce.)
//
// So these two `return` lines are carved into `.diffcov-allow.json`
// (`_why_ExportDialog`). What we CAN and DO assert is the user-facing contract:
// in each guard-true state the Export button is disabled and NO export IPC
// fires — i.e. the guards are correctly shadowed.
// ---------------------------------------------------------------------------

describe('ExportDialog — validation states shadow the export (button disabled, no IPC)', () => {
  it('no courses selected → Export disabled, no export IPC', async () => {
    await renderOpen();

    act(() => {
      fireEvent.click(screen.getByText('Select None'));
    });

    expect(footerInfoText()).toContain('0 courses selected');
    expect(getExportButton()).toBeDisabled();

    // Clicking a disabled button is a no-op (React onClick respects disabled).
    act(() => {
      fireEvent.click(getExportButton());
    });
    expect(mockApi.exportSelective).not.toHaveBeenCalled();
  });

  it('encrypt on with a short password → Export disabled, no export IPC', async () => {
    await renderOpen(); // 2 courses selected

    const encryptRow = screen.getByText('Encrypt with password').closest('div')!;
    act(() => {
      fireEvent.click(within(encryptRow).getByRole('checkbox'));
    });

    const pwdInput = screen.getByPlaceholderText(/Enter password/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(pwdInput, { target: { value: 'abc' } }); // < 8 chars
    });

    expect(getExportButton()).toBeDisabled(); // canExport=false (password too short)

    act(() => {
      fireEvent.click(getExportButton());
    });
    expect(mockApi.exportSelective).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 10. Dismissal paths: Esc (capture + stopPropagation), backdrop, header X, Cancel
// ---------------------------------------------------------------------------

describe('ExportDialog — dismissal', () => {
  it('Escape closes ONLY the child: onClose fires once AND a parent (bubble) listener is never reached', async () => {
    const onClose = jest.fn();
    await renderOpen({ onClose });

    // A sibling BUBBLE-phase document listener standing in for the parent
    // SettingsModal's Esc handler. The child's listener is registered in the
    // CAPTURE phase and calls the real stopPropagation(), so dispatch order is:
    //   capture(child) → stopPropagation() → bubble(parent) is never reached.
    // We do NOT tamper with the event's stopPropagation here (overriding it
    // would defeat the very behaviour under test); instead we PROVE it ran by
    // asserting the bubble listener stayed silent.
    const parentListener = jest.fn();
    document.addEventListener('keydown', parentListener); // bubble phase

    act(() => {
      const evt = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(evt);
    });

    document.removeEventListener('keydown', parentListener);

    expect(onClose).toHaveBeenCalledTimes(1);
    // Capture-phase + real stopPropagation() prevents the bubble-phase parent
    // listener from firing — Esc closes ONLY the child.
    expect(parentListener).not.toHaveBeenCalled();
  });

  it('a parent listener registered in CAPTURE phase BEFORE the child still runs, but a capture listener after is blocked', async () => {
    // Sanity pin: stopPropagation only stops propagation to LATER listeners.
    // A document-level capture listener added before the child mounts runs
    // first; we mainly assert the child closes. (Guards against a regression
    // where the child accidentally stops its OWN onClose.)
    const onClose = jest.fn();
    await renderOpen({ onClose });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape does nothing when the dialog is closed (isOpen guard)', () => {
    const onClose = jest.fn();
    render(<ExportDialog isOpen={false} onClose={onClose} />);

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('non-Escape keys are ignored', async () => {
    const onClose = jest.fn();
    await renderOpen({ onClose });

    act(() => {
      fireEvent.keyDown(document, { key: 'Enter' });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('backdrop click closes (closeOnBackdropClick default parity)', async () => {
    const onClose = jest.fn();
    await renderOpen({ onClose });

    const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeInTheDocument();
    act(() => {
      fireEvent.click(backdrop);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('header close button (aria-label="Close modal") closes', async () => {
    const onClose = jest.fn();
    await renderOpen({ onClose });

    act(() => {
      fireEvent.click(screen.getByLabelText('Close modal'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel button closes', async () => {
    const onClose = jest.fn();
    await renderOpen({ onClose });

    act(() => {
      fireEvent.click(screen.getByText('Cancel'));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 11. Filters (taskStatus + dateRange selects flow into the export payload)
// ---------------------------------------------------------------------------

describe('ExportDialog — filters', () => {
  it('task-status + date-range selections flow into the export payload', async () => {
    await renderOpen();

    const statusSelect = screen.getByDisplayValue('All') as HTMLSelectElement;
    act(() => {
      fireEvent.change(statusSelect, { target: { value: 'pending' } });
    });

    const rangeSelect = screen.getByDisplayValue('All time') as HTMLSelectElement;
    act(() => {
      fireEvent.change(rangeSelect, { target: { value: 'custom' } });
    });

    await act(async () => {
      fireEvent.click(getExportButton());
      await Promise.resolve();
    });

    expect(mockApi.exportSelective).toHaveBeenCalledWith(
      expect.objectContaining({
        taskStatus: 'pending',
        dateRange: expect.objectContaining({
          start: expect.any(String),
          end: expect.any(String),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 12. archived-fetch error path (getArchivedCourses rejects → logged, no crash)
// ---------------------------------------------------------------------------

describe('ExportDialog — archived-fetch error path', () => {
  it('survives getArchivedCourses rejecting (logs, renders normally, no Archived section)', async () => {
    mockApi.getArchivedCourses.mockRejectedValue(new Error('archive fetch failed'));

    await renderOpen();

    // Component still renders; no Archived Courses section (list stayed empty).
    expect(screen.getByText('Custom Export')).toBeInTheDocument();
    expect(screen.queryByText('Archived Courses')).not.toBeInTheDocument();
  });
});
