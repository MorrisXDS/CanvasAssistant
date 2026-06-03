/**
 * @jest-environment jsdom
 *
 * KeyboardShortcutsModal — "This page's sections" block (ADR-0010, Phase 0).
 *
 * The modal grew a new Tab-1 sub-block that lists the active page's in-page
 * sections (broadcast by `useSectionScope` to `KeyboardScopeContext.activeSections`)
 * with their `Alt+<index1>` direct-jump slots. This is the diff-coverage gate
 * for that branch (the architect plan flagged it REQUIRED, not optional):
 *   - with activeSections set → the "This page's sections" block renders, with a
 *     row + Alt+N badge per section.
 *   - with activeSections null → the block is absent.
 *
 * Seeds `activeSections` by providing the context value directly (the production
 * setter is driven by `useSectionScope`, which no page consumes yet in Phase 0).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KeyboardShortcutsModal } from '../../src/layers/l6-ui/components/shared/KeyboardShortcutsModal';
import {
  KeyboardScopeContext,
  type ActiveSectionInfo,
} from '../../src/layers/l6-ui/contexts/KeyboardScopeContext';
import { ModalStackProvider } from '../../src/layers/l6-ui/contexts/ModalStackContext';

function renderModal(activeSections: ActiveSectionInfo[] | null) {
  const ctxValue = {
    activeSubscope: null,
    setActiveSubscope: () => {},
    activeSections,
    setActiveSections: () => {},
  };
  return render(
    <MemoryRouter initialEntries={['/some-page']}>
      <ModalStackProvider>
        <KeyboardScopeContext.Provider value={ctxValue}>
          <KeyboardShortcutsModal isOpen onClose={() => {}} />
        </KeyboardScopeContext.Provider>
      </ModalStackProvider>
    </MemoryRouter>
  );
}

describe('KeyboardShortcutsModal — sections block', () => {
  test('renders the "This page\'s sections" block when activeSections is set', () => {
    renderModal([
      { id: 'tasks', label: 'Tasks', index1: 1 },
      { id: 'queue', label: 'Queue', index1: 2 },
    ]);

    expect(screen.getByText("This page's sections")).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    // Each section row carries its Alt+<index1> slot (Alt label + digit kbd).
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // Non-mac platform (no window.api) → 'Alt' label, at least one present.
    expect(screen.getAllByText('Alt').length).toBeGreaterThan(0);
  });

  test('omits the sections block when activeSections is null', () => {
    renderModal(null);
    expect(screen.queryByText("This page's sections")).not.toBeInTheDocument();
  });
});
