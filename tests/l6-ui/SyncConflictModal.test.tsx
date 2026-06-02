/**
 * SyncConflictModal Tests
 *
 * Covers the Modal-primitive migration (modal 3 of 5). The component is
 * self-contained — it reads nothing from the Zustand store and calls no
 * `window.api`/IPC — so the harness is minimal: render with props + jest.fn()
 * callbacks. `useModalStack()` has a no-op DEFAULT_VALUE (push/pop are no-ops
 * without a provider), so no ModalStackProvider wrapper is needed.
 *
 * The load-bearing case is "Esc fires onClose EXACTLY ONCE" — the hand-rolled
 * document keydown listener was deleted in the migration; Esc is now owned by
 * the primitive's closeOnEscape. A double-fire would mean the old listener
 * lingered.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import {
  SyncConflictModal,
  type SyncConflictData,
} from '../../src/layers/l6-ui/components/shared/SyncConflictModal';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let conflictCounter = 0;
function makeConflict(overrides: Partial<SyncConflictData> = {}): SyncConflictData {
  conflictCounter += 1;
  return {
    id: `conflict-${conflictCounter}`,
    entity: 'task',
    entityId: 100 + conflictCounter,
    externalId: `ext-${conflictCounter}`,
    entityName: `Assignment ${conflictCounter}`,
    field: 'title',
    fieldLabel: 'Title',
    localValue: 'My local title',
    canvasValue: 'Canvas title',
    timestamp: '2026-01-15T10:00:00Z',
    courseName: 'CS101',
    courseId: 1,
    ...overrides,
  };
}

interface RenderOpts {
  isOpen?: boolean;
  conflicts?: SyncConflictData[];
  termEndDate?: string | null;
}

function renderModal(opts: RenderOpts = {}) {
  const onResolve = jest.fn();
  const onResolveAll = jest.fn();
  const onClose = jest.fn();
  const conflicts = opts.conflicts ?? [makeConflict()];

  let utils!: ReturnType<typeof render>;
  act(() => {
    utils = render(
      <SyncConflictModal
        isOpen={opts.isOpen ?? true}
        conflicts={conflicts}
        onResolve={onResolve}
        onResolveAll={onResolveAll}
        onClose={onClose}
        termEndDate={opts.termEndDate}
      />
    );
  });

  return { ...utils, onResolve, onResolveAll, onClose, conflicts };
}

afterEach(() => {
  // Reset body scroll-lock the primitive sets, so leaked state can't bleed.
  document.body.style.overflow = '';
});

// ---------------------------------------------------------------------------
// Null / empty branches
// ---------------------------------------------------------------------------

describe('SyncConflictModal — null/empty branches', () => {
  it('renders nothing when isOpen=false', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when conflicts is empty', () => {
    const { container } = renderModal({ conflicts: [] });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Single-conflict render (no footer)
// ---------------------------------------------------------------------------

describe('SyncConflictModal — single conflict', () => {
  it('renders header + body and NO bulk footer', () => {
    renderModal({ conflicts: [makeConflict({ entityName: 'Essay 1', field: 'title' })] });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sync Conflict' })).toBeInTheDocument();
    expect(screen.getByText('Conflict 1 of 1')).toBeInTheDocument();

    // field label + both value boxes / choice buttons present
    expect(screen.getByRole('button', { name: 'Keep Mine' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use Canvas' })).toBeInTheDocument();

    // footer guard (conflicts.length > 1) is false → no bulk buttons
    expect(screen.queryByText(/Keep All Mine/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use All Canvas/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Multi-conflict render (footer present)
// ---------------------------------------------------------------------------

describe('SyncConflictModal — multiple conflicts', () => {
  it('renders correct progress and the bulk footer buttons', () => {
    renderModal({ conflicts: [makeConflict(), makeConflict()] });

    expect(screen.getByText('Conflict 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep All Mine (2)' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use All Canvas (2)' })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Per-field resolve callbacks
// ---------------------------------------------------------------------------

describe('SyncConflictModal — handleResolve', () => {
  it('"Keep Mine" calls onResolve with useCanvasValue=false and the current conflictId', () => {
    const c = makeConflict();
    const { onResolve, onClose } = renderModal({ conflicts: [c] });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep Mine' }));
    });

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        conflictId: c.id,
        useCanvasValue: false,
        rememberChoice: false,
        rememberForAll: false,
        expiresAt: null,
      })
    );
    // single conflict → isLast → closes
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"Use Canvas" calls onResolve with useCanvasValue=true', () => {
    const c = makeConflict();
    const { onResolve } = renderModal({ conflicts: [c] });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Use Canvas' }));
    });

    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({ conflictId: c.id, useCanvasValue: true })
    );
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('SyncConflictModal — pagination', () => {
  it('resolving a non-last conflict advances the cursor without closing', () => {
    const { onClose } = renderModal({
      conflicts: [makeConflict(), makeConflict()],
    });

    expect(screen.getByText('Conflict 1 of 2')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep Mine' }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Conflict 2 of 2')).toBeInTheDocument();
  });

  it('resolving the last conflict closes the modal', () => {
    const { onClose } = renderModal({
      conflicts: [makeConflict(), makeConflict()],
    });

    // advance to last
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep Mine' }));
    });
    expect(screen.getByText('Conflict 2 of 2')).toBeInTheDocument();

    // resolve the last one
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Use Canvas' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

describe('SyncConflictModal — bulk actions', () => {
  it('"Keep All Mine" calls onResolveAll(false)', () => {
    const { onResolveAll } = renderModal({
      conflicts: [makeConflict(), makeConflict()],
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep All Mine (2)' }));
    });

    expect(onResolveAll).toHaveBeenCalledTimes(1);
    expect(onResolveAll).toHaveBeenCalledWith(false);
  });

  it('"Use All Canvas" calls onResolveAll(true)', () => {
    const { onResolveAll } = renderModal({
      conflicts: [makeConflict(), makeConflict()],
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Use All Canvas (2)' }));
    });

    expect(onResolveAll).toHaveBeenCalledTimes(1);
    expect(onResolveAll).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// Esc / backdrop / header-close (primitive ownership)
// ---------------------------------------------------------------------------

describe('SyncConflictModal — close paths', () => {
  it('Escape fires onClose EXACTLY ONCE (hand-rolled listener removed)', () => {
    const { onClose } = renderModal({ conflicts: [makeConflict()] });

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click fires onClose', () => {
    const { onClose, container } = renderModal({ conflicts: [makeConflict()] });

    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    act(() => {
      fireEvent.click(backdrop as Element);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('header close button fires onClose', () => {
    const { onClose } = renderModal({ conflicts: [makeConflict()] });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Remember-choice / expiration branch
// ---------------------------------------------------------------------------

describe('SyncConflictModal — remember choice / expiration', () => {
  it('checking "remember my choice" reveals the expiration selector + apply-to-all', () => {
    renderModal({ conflicts: [makeConflict({ entity: 'task' })] });

    // The remember-choice checkbox is the first checkbox.
    const rememberLabel = screen.getByText(/Remember my choice for/);
    const rememberCheckbox = rememberLabel
      .closest('label')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(screen.queryByText('Remember until:')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(rememberCheckbox);
    });

    expect(screen.getByText('Remember until:')).toBeInTheDocument();
    // apply-to-all checkbox now present (task → "coursework in this course")
    expect(
      screen.getByText('Apply to all coursework in this course')
    ).toBeInTheDocument();
  });

  it('passes the expiration into onResolve when remember is checked', () => {
    const c = makeConflict();
    const { onResolve } = renderModal({ conflicts: [c] });

    const rememberLabel = screen.getByText(/Remember my choice for/);
    const rememberCheckbox = rememberLabel
      .closest('label')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    act(() => {
      fireEvent.click(rememberCheckbox);
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep Mine' }));
    });

    const payload = onResolve.mock.calls[0][0];
    expect(payload.rememberChoice).toBe(true);
    // default preset is '3-months' (no termEndDate) → a real ISO expiry
    expect(payload.expiresAt).toEqual(expect.any(String));
  });

  it('selecting "Custom date..." reveals the date input', () => {
    renderModal({ conflicts: [makeConflict()] });

    const rememberLabel = screen.getByText(/Remember my choice for/);
    const rememberCheckbox = rememberLabel
      .closest('label')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    act(() => {
      fireEvent.click(rememberCheckbox);
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: 'custom' } });
    });

    expect(document.querySelector('input[type="date"]')).not.toBeNull();
  });

  it('with a termEndDate the expiration select offers an end-of-term option', () => {
    renderModal({
      conflicts: [makeConflict()],
      termEndDate: '2026-05-30T00:00:00Z',
    });

    const rememberLabel = screen.getByText(/Remember my choice for/);
    const rememberCheckbox = rememberLabel
      .closest('label')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    act(() => {
      fireEvent.click(rememberCheckbox);
    });

    expect(screen.getByText(/End of term/)).toBeInTheDocument();
  });
});
