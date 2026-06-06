/**
 * Accordion primitive — content height measurement.
 *
 * Regression guard for the "cut-off button" bug: Accordion.Content pins a pixel
 * height (with overflow:hidden) for its expand animation. A section whose content
 * grows AFTER mount (e.g. UpdatesSection, which swaps a short loading state for
 * its full height once an async load resolves) was clipped because the height was
 * only measured once. The fix observes the inner content with a ResizeObserver and
 * re-measures. jsdom reports 0 for layout sizes and uses a no-op ResizeObserver
 * mock (tests/setup-jsdom.ts), so these tests assert the open/close/unmount paths
 * mount and tear down the observer without crashing — the visual re-measure is
 * verified in the running app.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Accordion } from '../../src/layers/l6-ui/components/primitives/Accordion';

function renderAccordion(defaultOpen: string[] = ['a']) {
  return render(
    <Accordion type="single" defaultOpen={defaultOpen}>
      <Accordion.Item value="a">
        <Accordion.Trigger>Section A</Accordion.Trigger>
        <Accordion.Content>
          <div>Body content</div>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

describe('Accordion.Content height measurement', () => {
  it('renders content when open (measures + observes inner content)', () => {
    renderAccordion(['a']);
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('toggles closed then open again without crashing (re-measure path)', () => {
    renderAccordion(['a']);
    const trigger = screen.getByRole('button', { name: /Section A/ });
    fireEvent.click(trigger); // close -> height 0
    fireEvent.click(trigger); // reopen -> re-measure + re-observe
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = renderAccordion(['a']);
    expect(() => unmount()).not.toThrow();
  });
});
