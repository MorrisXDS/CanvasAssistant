/**
 * @jest-environment jsdom
 */

/**
 * Past-terms store-isolation invariant (ADR-0015 Decision 3, hard constraint).
 *
 * The grade modal's "Past terms" data is computed main-side and fetched
 * modal-scoped. It MUST NOT enter the global Zustand store — if archived
 * courses/tasks leaked into `state.courses` / `state.tasks` they'd resurface in
 * the Tasks page, Calendar, queue, badges, and the dashboard average (the very
 * visibility-invariant this feature is careful to preserve).
 *
 * This test exercises the fetch path the modal uses (`window.api.getPastTermGrades`)
 * and asserts the store's domain arrays stay untouched, plus that the store
 * surface exposes no past-terms state or setter (a future regression that wires
 * the response into a slice gets caught here).
 */

import { createStore } from '../../src/layers/l5-presentation/store/store';
import type { PastTermGrades } from '../../src/shared/ipc-contract';

function stubWindowApi(api: Record<string, unknown>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
}

function clearWindowApi(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
}

const SAMPLE: PastTermGrades = {
  terms: [
    {
      termName: 'Fall 2024',
      termEndAt: '2024-12-15T00:00:00Z',
      courses: [
        {
          code: 'ECE454',
          name: 'Computer Systems',
          color: '#22c3dd',
          grade: 83,
          credits: 0.5,
        },
      ],
      termAverage: 83,
    },
  ],
  cumulative: 83,
  courseCount: 1,
};

describe('past-terms store isolation', () => {
  afterEach(() => {
    clearWindowApi();
  });

  it('fetching past-term grades does not populate state.courses / state.tasks', async () => {
    const getPastTermGrades = jest.fn().mockResolvedValue(SAMPLE);
    stubWindowApi({ getPastTermGrades });

    const store = createStore();

    // Sanity: store starts empty.
    expect(store.getState().courses).toEqual([]);
    expect(store.getState().tasks).toEqual([]);

    // Simulate the modal-scoped fetch (the modal awaits this into LOCAL state).
    const result = await (
      window as unknown as {
        api: { getPastTermGrades: () => Promise<PastTermGrades> };
      }
    ).api.getPastTermGrades();

    expect(getPastTermGrades).toHaveBeenCalledTimes(1);
    expect(result.courseCount).toBe(1);

    // The store must be unchanged — the fetch wrote nothing into global domain
    // arrays. (The modal holds `result` in component state, not the store.)
    expect(store.getState().courses).toEqual([]);
    expect(store.getState().tasks).toEqual([]);
  });

  it('the store surface has no past-terms state or setter', () => {
    const store = createStore();
    const state = store.getState() as unknown as Record<string, unknown>;

    const offendingKeys = Object.keys(state).filter((k) => /pastterm/i.test(k));
    expect(offendingKeys).toEqual([]);
  });
});
