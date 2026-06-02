/**
 * @jest-environment jsdom
 *
 * AnnouncementDetail "reveal in Files" (issue #29): a resolved file reference
 * shows a secondary button that navigates to the Files page with the file's
 * canonical key (`attachment:<externalId>`) + course id in router state.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnnouncementDetail } from '../../src/layers/l6-ui/components/pages/AnnouncementDetail';
import { useStore } from '../../src/layers/l5-presentation/store';
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
    message: 'See syllabus.pdf now',
    messageHtml: null,
    publishedAt: '2024-01-15T10:00:00Z',
    dismissedAt: null,
    url: null,
    ...over,
  } as Notification;
}

const resolvedRef = {
  id: 1,
  notificationId: 10,
  attachmentId: 500,
  startPosition: 4, // 'See ' = 4 chars, then 'syllabus.pdf'
  endPosition: 16,
  matchedText: 'syllabus.pdf',
  originalUrl: null,
  attachment: {
    id: 500,
    notificationId: 10,
    externalId: 'ext-99',
    displayName: 'syllabus.pdf',
    filename: 'syllabus.pdf',
    url: 'https://canvas/files/500/download',
    sizeBytes: 1234,
    contentType: 'application/pdf',
    localPath: null,
    downloadStatus: 'pending',
    downloadedAt: null,
  },
};

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{JSON.stringify(loc.state)}</div>;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/announcement/10']}>
      <Routes>
        <Route path="/announcement/:id" element={<AnnouncementDetail />} />
        <Route path="/files" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AnnouncementDetail — reveal in Files (#29)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
    env.api.getAttachments.mockResolvedValue([resolvedRef.attachment]);
    env.api.getFileReferences.mockResolvedValue([resolvedRef]);
    useStore.setState({
      courses: [makeCourse({ id: 1 })],
      notifications: [makeNotification()],
    });
  });

  afterEach(() => {
    useStore.setState({ courses: [], notifications: [] });
    env.cleanup();
  });

  it('navigates to /files with the attachment key + course id when reveal is clicked', async () => {
    renderDetail();

    // Wait for the file reference (and its reveal button) to render.
    const revealBtn = await screen.findByRole('button', {
      name: /show syllabus\.pdf in the files page/i,
    });

    fireEvent.click(revealBtn);

    const probe = await screen.findByTestId('loc');
    const state = JSON.parse(probe.textContent || '{}');
    expect(state).toEqual({
      revealFileKey: 'attachment:ext-99',
      revealCourseId: 1,
    });
  });

  it('does not render a reveal button when there are no resolved references', async () => {
    env.api.getFileReferences.mockResolvedValue([]);
    renderDetail();

    // The message body still renders.
    await screen.findByText(/See syllabus\.pdf now|syllabus\.pdf/);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /in the files page/i })
      ).not.toBeInTheDocument();
    });
  });
});
