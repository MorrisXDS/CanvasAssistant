/**
 * @jest-environment jsdom
 */

/**
 * coreDataSlice regression tests (ADR-0007 PR-T3).
 *
 * Locks the contract PR-B established when it simplified
 * `coreDataSlice.fetchCourses` from a ~75-line block (re-derived term filter
 * + localStorage fallback) to "call api.getCourses(), store the result."
 * Without this coverage, a future refactor could silently reintroduce either
 * bug:
 *  - Re-derived term filtering in the renderer (different math than the
 *    Oracle's SQL) → courses appearing on one route but not another.
 *  - localStorage fallback for term selection → two sources of truth that
 *    can disagree.
 *
 * These tests are regression locks, not new-behaviour drivers. Impl already
 * exists; tests pass on first run. PR-T4 will extract the inline window.api
 * stub used here into a reusable `setupTestEnv()` helper.
 */

import { createCoreDataSlice } from '../../src/layers/l5-presentation/store/slices/coreDataSlice';
import type { Store } from '../../src/layers/l5-presentation/types';
import type { Course } from '../../src/shared/ipc-contract';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a fully-populated Course. Pass overrides for the fields a test cares
 * about; everything else gets sensible defaults that match the IPC contract.
 */
function createCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    externalId: 'ext-1',
    code: 'CS101',
    name: 'Intro to CS',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: 80,
    currentGrade: 78,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
    credits: 1.0,
    archivedAt: null,
    archiveSource: null,
    ...overrides,
  };
}

/**
 * Build a stub window.api with only the methods a test exercises. Unused
 * methods throw if accidentally called — surfaces coupling regressions where
 * the slice starts depending on a new IPC.
 */
function stubWindowApi(api: Record<string, unknown>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
}

/** Reset window.api between tests so stubs don't leak across cases. */
function clearWindowApi(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).api;
}

// =============================================================================
// Tests
// =============================================================================

describe('createCoreDataSlice → fetchCourses', () => {
  beforeEach(() => {
    clearWindowApi();
  });

  it('writes exactly the courses the IPC returned (no filtering, no re-derivation)', async () => {
    // Three courses, one with isHidden:true. The slice must write all three
    // unchanged — proving it trusts the IPC's visibility filtering (which is
    // the Oracle's job per ADR-0007) and does NOT re-derive anything client-
    // side. Including the hidden one in the response is the key assertion:
    // a future refactor that adds `.filter(c => !c.isHidden)` here gets
    // caught.
    const mockCourses: Course[] = [
      createCourse({ id: 1, name: 'Active', isHidden: false }),
      createCourse({ id: 2, name: 'Also Active', isHidden: false }),
      createCourse({
        id: 3,
        name: 'Hidden In Real Life But IPC Said So',
        isHidden: true,
      }),
    ];
    const getCourses = jest.fn().mockResolvedValue(mockCourses);
    stubWindowApi({ getCourses });

    const setSpy = jest.fn();
    const getStub = jest.fn(() => ({}) as Store);
    const slice = createCoreDataSlice(setSpy, getStub);

    await slice.fetchCourses!();

    expect(getCourses).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith({ courses: mockCourses });
  });

  it('does not read localStorage (the deleted "academicSettings" fallback stays deleted)', async () => {
    // PR-B deleted a localStorage.getItem('academicSettings') fallback that
    // re-derived term filtering when the IPC was unavailable. That fallback
    // was a TWO-source-of-truth bug — the renderer's localStorage value
    // could disagree with the database's VisibilityOracle setting. This
    // negative test catches a regression that re-adds ANY localStorage read
    // (the specific key, or a new key with the same anti-pattern).
    const getItemSpy = jest.spyOn(Storage.prototype, 'getItem');
    stubWindowApi({ getCourses: jest.fn().mockResolvedValue([]) });

    const setSpy = jest.fn();
    const getStub = jest.fn(() => ({}) as Store);
    const slice = createCoreDataSlice(setSpy, getStub);

    await slice.fetchCourses!();

    expect(getItemSpy).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
  });
});
