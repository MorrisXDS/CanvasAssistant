/**
 * @jest-environment jsdom
 *
 * Tests for the "Reveal in Files" hook (issue #29):
 *  - `planFileReveal` — the pure decision of what to unfilter/expand.
 *  - `useFileReveal` — applies the plan + scrolls/highlights the row.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  planFileReveal,
  useFileReveal,
  type RevealActions,
} from '../../../src/layers/l6-ui/components/Files/useFileReveal';

function ctx(over: Partial<Parameters<typeof planFileReveal>[1]> = {}) {
  return {
    sourceFilter: 'all',
    expandedCourses: new Set<number>(),
    groupedFiles: new Map<number, Map<string, unknown>>(),
    isFolderExpanded: () => false,
    ...over,
  };
}

describe('planFileReveal', () => {
  test('returns null when there is no revealFileKey', () => {
    expect(planFileReveal(null, ctx())).toBeNull();
    expect(planFileReveal({ revealCourseId: 1 }, ctx())).toBeNull();
  });

  test('plans to expand a collapsed course + its folders, no filter change under "all"', () => {
    const groupedFiles = new Map<number, Map<string, unknown>>([
      [7, new Map([['Week 1', []]])],
    ]);
    const plan = planFileReveal(
      { revealFileKey: 'attachment:ext-9', revealCourseId: 7 },
      ctx({ groupedFiles })
    );
    expect(plan).toEqual({
      fileKey: 'attachment:ext-9',
      setFilterToAll: false,
      courseId: 7,
      expandCourse: true,
      expandFolderPaths: ['Week 1'],
    });
  });

  test('sets filter to all when a non-announcement filter is active', () => {
    const plan = planFileReveal(
      { revealFileKey: 'attachment:e', revealCourseId: 1 },
      ctx({ sourceFilter: 'canvas' })
    );
    expect(plan?.setFilterToAll).toBe(true);
  });

  test('does not re-expand an already-expanded course/folder', () => {
    const groupedFiles = new Map<number, Map<string, unknown>>([
      [3, new Map([['F', []]])],
    ]);
    const plan = planFileReveal(
      { revealFileKey: 'attachment:e', revealCourseId: 3 },
      ctx({
        sourceFilter: 'announcements',
        expandedCourses: new Set([3]),
        groupedFiles,
        isFolderExpanded: () => true,
      })
    );
    expect(plan).toMatchObject({
      setFilterToAll: false,
      expandCourse: false,
      expandFolderPaths: [],
    });
  });
});

describe('useFileReveal', () => {
  const origScroll = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
    // jsdom lacks CSS.escape in some versions.
    if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
      (globalThis as { CSS?: { escape: (s: string) => string } }).CSS = {
        escape: (s: string) => s,
      };
    }
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = origScroll;
    jest.restoreAllMocks();
  });

  function makeActions(over: Partial<RevealActions> = {}): RevealActions {
    return {
      loading: false,
      sourceFilter: 'canvas',
      setSourceFilter: jest.fn(),
      expandedCourses: new Set<number>(),
      groupedFiles: new Map([[5, new Map([['root', []]])]]),
      isFolderExpanded: () => false,
      toggleCourse: jest.fn(),
      toggleFolder: jest.fn(),
      ...over,
    };
  }

  function wrapperFor(state: unknown) {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={[{ pathname: '/files', state }]}>
        {children}
      </MemoryRouter>
    );
  }

  test('applies the plan (unfilter + expand) and highlights the target row', () => {
    const el = document.createElement('div');
    el.setAttribute('data-file-key', 'attachment:ext-1');
    document.body.appendChild(el);

    const actions = makeActions();
    renderHook(() => useFileReveal(actions), {
      wrapper: wrapperFor({ revealFileKey: 'attachment:ext-1', revealCourseId: 5 }),
    });

    expect(actions.setSourceFilter).toHaveBeenCalledWith('all');
    expect(actions.toggleCourse).toHaveBeenCalledWith(5);
    expect(actions.toggleFolder).toHaveBeenCalledWith(5, 'root');
    expect(el.scrollIntoView).toHaveBeenCalled();
    expect(el.className).toContain('revealHighlight');

    document.body.removeChild(el);
  });

  test('does nothing when there is no reveal state', () => {
    const actions = makeActions();
    renderHook(() => useFileReveal(actions), { wrapper: wrapperFor(undefined) });
    expect(actions.setSourceFilter).not.toHaveBeenCalled();
    expect(actions.toggleCourse).not.toHaveBeenCalled();
  });

  test('skips while files are still loading', () => {
    const actions = makeActions({ loading: true });
    renderHook(() => useFileReveal(actions), {
      wrapper: wrapperFor({ revealFileKey: 'attachment:x', revealCourseId: 5 }),
    });
    expect(actions.toggleCourse).not.toHaveBeenCalled();
  });
});
