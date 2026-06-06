/**
 * Courses grid layout (option C — aspect-ratio cards).
 *
 * Regression guard for the "one giant stretched card" bug: a sparse grid (e.g. a
 * single course) used to balloon to the full page height because the grid
 * stretched its row (CSS grid `align-content` defaults to `stretch`) and the card
 * was `height: 100%`. Cards now size by a 4:3 aspect-ratio and rows pack to the
 * top. These assertions pin that decision so a future edit can't silently
 * reintroduce the stretch.
 */

import { styles } from '../../src/layers/l6-ui/components/pages/coursesPageStyles';

describe('Courses grid layout (aspect-ratio cards)', () => {
  it('grid packs rows to the top and does not stretch cards', () => {
    expect(styles.grid.alignContent).toBe('start');
    expect(styles.grid.alignItems).toBe('start');
    expect(styles.grid.alignItems).not.toBe('stretch');
  });

  it('cards size by 4:3 aspect-ratio, not a pinned full-row height', () => {
    expect(styles.gridCard.aspectRatio).toBe('4 / 3');
    // height:100% was the stretch culprit — must be gone.
    expect(styles.gridCard.height).toBeUndefined();
  });

  it('leaves min-height at auto so long content grows the card instead of clipping', () => {
    // No explicit minHeight floor: the grid item's content-based auto-minimum
    // keeps a long course name from clipping under overflow:hidden.
    expect(styles.gridCard.minHeight).toBeUndefined();
    expect(styles.gridCard.overflow).toBe('hidden');
  });
});
