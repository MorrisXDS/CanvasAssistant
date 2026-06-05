import { resolveLastSync } from '../../src/layers/l6-ui/components/sidebarSyncDisplay';

describe('resolveLastSync (sidebar sync-status helper)', () => {
  it('returns null when nothing has ever synced (no store time, no courses)', () => {
    expect(resolveLastSync([], null)).toBeNull();
  });

  it('returns the store-level time even when there are NO visible courses', () => {
    // Regression: all courses hidden/archived -> store.courses is empty, but a
    // successful sync set the store-level lastSyncedAt. Must NOT be "Not Synced".
    expect(resolveLastSync([], '2026-06-05T12:00:00Z')).toBe('2026-06-05T12:00:00Z');
  });

  it('returns the only synced course time when there is no store time', () => {
    expect(resolveLastSync([{ lastSyncedAt: '2026-06-01T00:00:00Z' }], null)).toBe(
      '2026-06-01T00:00:00Z'
    );
  });

  it('returns the most recent across multiple courses', () => {
    expect(
      resolveLastSync(
        [
          { lastSyncedAt: '2026-06-01T00:00:00Z' },
          { lastSyncedAt: '2026-06-03T00:00:00Z' },
          { lastSyncedAt: '2026-06-02T00:00:00Z' },
        ],
        null
      )
    ).toBe('2026-06-03T00:00:00Z');
  });

  it('returns the max of store time and course times', () => {
    expect(
      resolveLastSync([{ lastSyncedAt: '2026-06-01T00:00:00Z' }], '2026-06-09T00:00:00Z')
    ).toBe('2026-06-09T00:00:00Z');
    expect(
      resolveLastSync([{ lastSyncedAt: '2026-06-10T00:00:00Z' }], '2026-06-09T00:00:00Z')
    ).toBe('2026-06-10T00:00:00Z');
  });

  it('ignores null/undefined course times', () => {
    expect(
      resolveLastSync(
        [
          { lastSyncedAt: null },
          { lastSyncedAt: undefined },
          { lastSyncedAt: '2026-06-04T00:00:00Z' },
        ],
        null
      )
    ).toBe('2026-06-04T00:00:00Z');
    expect(resolveLastSync([{ lastSyncedAt: null }], null)).toBeNull();
  });
});
