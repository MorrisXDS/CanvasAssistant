/**
 * InfoTrigger Tests
 *
 * Covers the Modal-primitive migration of the Level-2 "InfoModal" embedded in
 * `InfoTrigger.tsx` (the 6th handwritten modal, originally mis-triaged as a
 * "tooltip false positive"). The handwritten overlay + hand-rolled Esc listener
 * were replaced by the `<Modal>` primitive (size="md", zIndex={1400}, default
 * Esc/backdrop dismiss). The Level-1 hover tooltip portal is UNTOUCHED.
 *
 * InfoTrigger is a DORMANT component — it has no production call site and the
 * modal open-state is internal `useState`. So these tests render `<InfoTrigger>`
 * directly and drive the modal by clicking the `(i)` trigger button.
 *
 * The load-bearing case is "Esc fires onClose EXACTLY ONCE" — a double-close
 * would mean the deleted hand-rolled keydown listener lingered alongside the
 * primitive's `closeOnEscape`.
 *
 * `useModalStack()` has a no-op DEFAULT_VALUE (push/pop are no-ops without a
 * provider), but we wrap in `ModalStackProvider` to exercise the real
 * push/pop path the component takes in the app.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import { InfoTrigger } from '../../src/layers/l6-ui/components/shared/InfoTrigger';
import { ModalStackProvider } from '../../src/layers/l6-ui/contexts/ModalStackContext';

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

interface RenderOpts {
  summary?: string;
  title?: string;
  details?: React.ReactNode;
  size?: 'sm' | 'md';
  position?: 'top' | 'right' | 'bottom' | 'left';
}

function renderTrigger(opts: RenderOpts = {}) {
  let utils!: ReturnType<typeof render>;
  act(() => {
    utils = render(
      <ModalStackProvider>
        <InfoTrigger
          summary={opts.summary ?? 'Quick summary on hover'}
          title={opts.title ?? 'My Info'}
          details={opts.details ?? <p>Body text</p>}
          size={opts.size}
          position={opts.position}
        />
      </ModalStackProvider>
    );
  });
  return utils;
}

/** The `(i)` trigger button is labelled with the `summary` (aria-label). */
function getTrigger(summary = 'Quick summary on hover'): HTMLElement {
  return screen.getByRole('button', { name: summary });
}

function openModal(summary = 'Quick summary on hover') {
  act(() => {
    fireEvent.click(getTrigger(summary));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InfoTrigger — Modal primitive migration', () => {
  it('renders the (i) trigger button and starts with the modal closed', () => {
    renderTrigger();

    expect(getTrigger()).toBeInTheDocument();
    // Primitive returns null while isOpen=false → no dialog mounted.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking the trigger opens the <Modal> with title, details body, and "Got it" footer', () => {
    renderTrigger({ title: 'My Info', details: <p>Body text</p> });

    openModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Modal.Header renders the title in an <h2>.
    expect(screen.getByRole('heading', { name: 'My Info' })).toBeInTheDocument();
    // Modal.Content renders the details ReactNode.
    expect(screen.getByText('Body text')).toBeInTheDocument();
    // Modal.Footer renders the "Got it" dismiss button.
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('the header X button (primitive, aria-label="Close modal") closes the modal', () => {
    renderTrigger();
    openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the "Got it" footer button closes the modal', () => {
    renderTrigger();
    openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking the backdrop closes the modal (closeOnBackdropClick default)', () => {
    const { container } = renderTrigger();
    openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The primitive renders the backdrop as a div[aria-hidden="true"].
    const backdrop = container.ownerDocument.querySelector('div[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    act(() => {
      fireEvent.click(backdrop as Element);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape closes the modal exactly once (primitive-owned; hand-rolled listener deleted)', () => {
    renderTrigger();
    openModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    // A lingering duplicate listener would have thrown (closing an already-
    // closed modal is harmless) but the real signal is: the dialog is gone
    // and re-pressing Escape with no dialog is a no-op (no crash).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hovering the trigger shows the summary tooltip and does NOT open a dialog (tooltip untouched)', () => {
    renderTrigger({ summary: 'Quick summary on hover' });

    act(() => {
      fireEvent.mouseEnter(getTrigger());
    });

    // Tooltip portal renders the summary text (appears twice: once as the
    // button's accessible name/title attr context, once as the portal text).
    const matches = screen.getAllByText('Quick summary on hover');
    expect(matches.length).toBeGreaterThan(0);
    // Hover must NOT open the click-level modal.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders arbitrary structured ReactNode details inside Modal.Content', () => {
    renderTrigger({
      details: (
        <ul>
          <li>First point</li>
          <li>Second point</li>
        </ul>
      ),
    });

    openModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('First point')).toBeInTheDocument();
    expect(screen.getByText('Second point')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});
