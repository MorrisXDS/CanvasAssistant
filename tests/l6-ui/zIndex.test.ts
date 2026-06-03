/**
 * Invariant tests for the centralized z-index scale (`Z_INDEX`).
 *
 * z-index is style-only and `<Modal>` is NOT portaled, so "renders above" has
 * no meaningful jsdom assertion. Instead we lock the *invariants of the scale*:
 *   1. the full ascending ordering chain,
 *   2. `help` is the numeric ceiling (nothing sits above it),
 *   3. the modal-tier values are FROZEN at the modal-cleanup convention
 *      (modal=1100, modalChild=1200, infoTrigger=1400, help=1500) so a future
 *      edit can't silently drift them,
 *   4. no NON-modal band sits at/above `modal` — with the single deliberate,
 *      documented exception of `titleBar` (window chrome must stay grabbable
 *      above ordinary modals; still below infoTrigger/help).
 */

import { Z_INDEX, type ZIndexBand } from '../../src/layers/l6-ui/constants/zIndex';

describe('Z_INDEX scale invariants', () => {
  // The canonical ascending order of every band, lowest → highest.
  const ASCENDING_BANDS: ZIndexBand[] = [
    'base',
    'raised',
    'elevated',
    'stickyHeader',
    'sidebar',
    'overlayChrome',
    'modal',
    'modalChild',
    'titleBar',
    'infoTrigger',
    'help',
  ];

  test('declares exactly the expected bands (no silent additions/removals)', () => {
    expect(Object.keys(Z_INDEX).sort()).toEqual([...ASCENDING_BANDS].sort());
  });

  test('ordering invariant: strictly ascending base → help', () => {
    const values = ASCENDING_BANDS.map((b) => Z_INDEX[b]);
    // Each band is strictly greater than the previous one.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    // And the array equals its own sorted copy (no out-of-order band).
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  test('load-bearing pairwise ordering', () => {
    // The bug-fix-relevant boundaries called out in the plan.
    expect(Z_INDEX.overlayChrome).toBeLessThan(Z_INDEX.modal);
    expect(Z_INDEX.modal).toBeLessThan(Z_INDEX.modalChild);
    expect(Z_INDEX.modalChild).toBeLessThan(Z_INDEX.titleBar);
    expect(Z_INDEX.titleBar).toBeLessThan(Z_INDEX.infoTrigger);
    expect(Z_INDEX.infoTrigger).toBeLessThan(Z_INDEX.help);
  });

  test('ceiling invariant: help is the numeric maximum of the scale', () => {
    const max = Math.max(...Object.values(Z_INDEX));
    expect(max).toBe(Z_INDEX.help);
    // No other band shares the ceiling value.
    const atCeiling = Object.entries(Z_INDEX).filter(([, v]) => v === max);
    expect(atCeiling).toEqual([['help', Z_INDEX.help]]);
  });

  test('modal-tier values are frozen at the established convention', () => {
    // These were baked by the modal cleanup (PRs #94–#100). Do NOT drift them.
    expect(Z_INDEX.modal).toBe(1100);
    expect(Z_INDEX.modalChild).toBe(1200);
    expect(Z_INDEX.infoTrigger).toBe(1400);
    expect(Z_INDEX.help).toBe(1500);
  });

  test('titleBar is the one deliberate non-modal band above the modal tier', () => {
    expect(Z_INDEX.titleBar).toBe(1300);
    // Above ordinary + child modals (window controls stay grabbable)...
    expect(Z_INDEX.titleBar).toBeGreaterThan(Z_INDEX.modal);
    expect(Z_INDEX.titleBar).toBeGreaterThan(Z_INDEX.modalChild);
    // ...but below infoTrigger and Help.
    expect(Z_INDEX.titleBar).toBeLessThan(Z_INDEX.infoTrigger);
    expect(Z_INDEX.titleBar).toBeLessThan(Z_INDEX.help);
  });

  test('no non-modal band sits at/above modal (except titleBar by design)', () => {
    const MODAL_TIER: ReadonlyArray<ZIndexBand> = [
      'modal',
      'modalChild',
      'titleBar', // deliberate window-chrome exception
      'infoTrigger',
      'help',
    ];
    for (const [name, value] of Object.entries(Z_INDEX) as [ZIndexBand, number][]) {
      if (!MODAL_TIER.includes(name)) {
        expect(value).toBeLessThan(Z_INDEX.modal);
      }
    }
  });

  test('lower-tier bands sit below the sidebar / overlay chrome', () => {
    // Sanity on the in-page content tier so a future edit can't promote a
    // page-content band into the chrome/modal range unnoticed.
    expect(Z_INDEX.base).toBeLessThan(Z_INDEX.raised);
    expect(Z_INDEX.elevated).toBeLessThan(Z_INDEX.stickyHeader);
    expect(Z_INDEX.stickyHeader).toBeLessThan(Z_INDEX.sidebar);
    expect(Z_INDEX.sidebar).toBeLessThan(Z_INDEX.overlayChrome);
  });
});
