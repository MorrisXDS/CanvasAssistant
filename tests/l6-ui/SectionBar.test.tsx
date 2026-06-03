/**
 * @jest-environment jsdom
 *
 * SectionBar — presentational chip-row primitive (ADR-0010, Phase 0).
 *
 * Pins:
 *   - renders one chip per AVAILABLE section; unavailable sections are omitted.
 *   - highlights the active chip via aria-current="true".
 *   - shows each chip's `Alt+<index1>` badge.
 *   - clicking a chip calls onSelect(id) with the right id.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionBar } from '../../src/layers/l6-ui/components/primitives/SectionBar';

const SECTIONS = [
  { id: 'a', label: 'Alpha', isAvailable: true, index1: 1 },
  { id: 'b', label: 'Beta', isAvailable: false, index1: null },
  { id: 'c', label: 'Gamma', isAvailable: true, index1: 2 },
];

describe('SectionBar', () => {
  test('renders one chip per AVAILABLE section and omits unavailable ones', () => {
    render(<SectionBar sections={SECTIONS} active="a" onSelect={() => {}} />);

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    // 'Beta' is unavailable → omitted entirely.
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();

    // Two chips (buttons), not three.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  test('marks the active chip with aria-current="true" and no other chip', () => {
    render(<SectionBar sections={SECTIONS} active="c" onSelect={() => {}} />);

    const active = screen.getByText('Gamma').closest('button');
    const inactive = screen.getByText('Alpha').closest('button');
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(inactive).not.toHaveAttribute('aria-current');
  });

  test('shows each available chip its Alt+<index1> badge', () => {
    render(<SectionBar sections={SECTIONS} active="a" onSelect={() => {}} />);
    expect(screen.getByText('Alt+1')).toBeInTheDocument();
    expect(screen.getByText('Alt+2')).toBeInTheDocument();
  });

  test('clicking a chip calls onSelect with that section id', () => {
    const onSelect = jest.fn();
    render(<SectionBar sections={SECTIONS} active="a" onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Gamma').closest('button')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  test('omits the Alt badge when index1 is null on an available chip', () => {
    // Defensive: an available chip with a null slot shows no badge.
    render(
      <SectionBar
        sections={[{ id: 'x', label: 'Ex', isAvailable: true, index1: null }]}
        active="x"
        onSelect={() => {}}
      />
    );
    expect(screen.getByText('Ex')).toBeInTheDocument();
    expect(screen.queryByText(/^Alt\+/)).not.toBeInTheDocument();
  });
});
