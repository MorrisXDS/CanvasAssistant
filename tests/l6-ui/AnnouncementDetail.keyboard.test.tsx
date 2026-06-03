/**
 * @jest-environment jsdom
 *
 * AnnouncementDetail keyboard navigation (item 5.1 — useKeymap migration).
 *
 * The raw `document.addEventListener('keydown')` listener that used to live in
 * AnnouncementDetail (committed `fb503b0`) was migrated to `useKeymap`, which
 * carries the built-in ADR-0006 modal-stack gate and the form-tag / `e.key`
 * normalisation. These tests pin the migrated behaviour:
 *   - ↑/W scrolls the <main> container up (scrollBy top < 0)
 *   - ↓/S scrolls <main> down (scrollBy top > 0)
 *   - V opens the announcement on Canvas via window.api.openExternal(url)
 *   - V with no url is a no-op
 *   - keys fired from inside a form element are suppressed (useKeymap default)
 *   - keys are suppressed while a modal is open over the page (the WHOLE point
 *     of the migration — R4 in the plan)
 *
 * `useKeymap` attaches its listener at the document level and scrolls
 * `document.querySelector('main')`, so the harness mounts the component inside a
 * real <main> element. jsdom doesn't implement Element.scrollBy, so we install a
 * spy on HTMLElement.prototype.scrollBy.
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AnnouncementDetail } from '../../src/layers/l6-ui/components/pages/AnnouncementDetail';
import { useStore } from '../../src/layers/l5-presentation/store';
import {
  ModalStackProvider,
  useModalStack,
} from '../../src/layers/l6-ui/contexts/ModalStackContext';
import { setupTestEnv, type TestEnv } from '../test-utils/testEnv';
import type { Course, Notification } from '../../src/layers/l5-presentation/types';

function makeCourse(over: Partial<Course> = {}): Course {
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
    ...over,
  } as Course;
}

function makeNotification(over: Partial<Notification> = {}): Notification {
  return {
    id: 10,
    sourceType: 'announcement',
    sourceId: 'ann-10',
    courseId: 1,
    title: 'Week 1 logistics',
    message: 'See the syllabus.',
    messageHtml: null,
    publishedAt: '2024-01-15T10:00:00Z',
    dismissedAt: null,
    url: 'https://canvas.example/courses/1/announcements/10',
    ...over,
  } as Notification;
}

/**
 * Helper rendered inside the ModalStackProvider so a test can push a modal
 * entry onto the stack (flipping `isAnyOpen` true → useKeymap suppresses).
 */
function PushModalOnMount({ id }: { id: string }) {
  const { push } = useModalStack();
  React.useEffect(() => {
    push({ id });
  }, [push, id]);
  return null;
}

async function renderDetail(opts: { withModal?: boolean } = {}) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ModalStackProvider>
        {opts.withModal ? <PushModalOnMount id="some-modal" /> : null}
        <main data-testid="main-scroll">
          <MemoryRouter initialEntries={['/announcement/10']}>
            <Routes>
              <Route path="/announcement/:id" element={<AnnouncementDetail />} />
            </Routes>
          </MemoryRouter>
        </main>
      </ModalStackProvider>
    );
  });
  // Flush the mount-time notification-fetch effect's state updates.
  await waitFor(() => expect(result.container).toBeTruthy());
  return result!;
}

/** Dispatch a real keydown on `document` so useKeymap's document listener sees it. */
function pressKey(key: string, target?: EventTarget) {
  act(() => {
    const evt = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    if (target) {
      target.dispatchEvent(evt);
    } else {
      document.dispatchEvent(evt);
    }
  });
}

describe('AnnouncementDetail — keyboard navigation (5.1 useKeymap migration)', () => {
  let env: TestEnv;
  let scrollBySpy: jest.SpyInstance;

  beforeEach(() => {
    env = setupTestEnv();
    // jsdom doesn't implement Element.scrollBy, so jest.spyOn can't replace a
    // non-existent property. Define a stub on the prototype first, then spy on
    // it so any <main> element gets a mockable scrollBy.
    if (typeof HTMLElement.prototype.scrollBy !== 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (HTMLElement.prototype as any).scrollBy = function scrollBy() {
        /* jsdom stub */
      };
    }
    scrollBySpy = jest
      .spyOn(HTMLElement.prototype, 'scrollBy')
      .mockImplementation(() => undefined);
    // The mount-time fetch effect calls setAttachments/setFileReferences with
    // the awaited result; the proxy default resolves to undefined, which would
    // break `attachments.length`. Mock both to empty arrays.
    env.api.getAttachments.mockResolvedValue([]);
    env.api.getFileReferences.mockResolvedValue([]);
    useStore.setState({
      courses: [makeCourse({ id: 1 })],
      notifications: [makeNotification()],
    });
  });

  afterEach(async () => {
    await act(async () => {
      useStore.setState({ courses: [], notifications: [] });
    });
    scrollBySpy.mockRestore();
    env.cleanup();
  });

  it('scrolls <main> down on ArrowDown and on s (top > 0)', async () => {
    await renderDetail();

    pressKey('ArrowDown');
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 80, behavior: 'smooth' })
    );

    scrollBySpy.mockClear();
    pressKey('s');
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 80, behavior: 'smooth' })
    );
  });

  it('scrolls <main> up on ArrowUp and on w (top < 0)', async () => {
    await renderDetail();

    pressKey('ArrowUp');
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: -80, behavior: 'smooth' })
    );

    scrollBySpy.mockClear();
    pressKey('w');
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: -80, behavior: 'smooth' })
    );
  });

  it('opens the announcement on Canvas on v (openExternal called with url)', async () => {
    await renderDetail();

    pressKey('v');
    expect(env.api.openExternal).toHaveBeenCalledWith(
      'https://canvas.example/courses/1/announcements/10'
    );
  });

  it('does nothing on v when the notification has no url', async () => {
    useStore.setState({
      courses: [makeCourse({ id: 1 })],
      notifications: [makeNotification({ url: null })],
    });
    await renderDetail();

    pressKey('v');
    expect(env.api.openExternal).not.toHaveBeenCalled();
  });

  it('suppresses keys fired from inside a form element (useKeymap default)', async () => {
    await renderDetail();

    const input = document.createElement('input');
    document.body.appendChild(input);
    pressKey('s', input);
    expect(scrollBySpy).not.toHaveBeenCalled();
    expect(env.api.openExternal).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('suppresses scroll/open keys while a modal is open over the page (modal-stack gate)', async () => {
    await renderDetail({ withModal: true });

    pressKey('s');
    pressKey('w');
    pressKey('v');
    expect(scrollBySpy).not.toHaveBeenCalled();
    expect(env.api.openExternal).not.toHaveBeenCalled();
  });
});
