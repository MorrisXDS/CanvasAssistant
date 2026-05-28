/**
 * Dashboard IPC → store → component full-chain test (ADR-0007 PR-T6).
 *
 * Closes architectural gap 8 from the test-coverage roadmap. Where PR-T5's
 * `Dashboard.test.tsx` seeded state directly via `useStore.setState`, this
 * file drives the same UI via the production action path:
 *
 *   env.api.getCourses.mockResolvedValue([...])
 *     → useStore.getState().fetchCourses()
 *     → coreDataSlice awaits the IPC, set({ courses })
 *     → Dashboard subscribes → selector recomputes → DOM updates
 *
 * Same wrappers / mount-time stubs / cleanup as PR-T5. The difference is the
 * SEED PATH: actions, not direct setState. This is what "IPC → store →
 * component integration" actually means.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModalStackProvider } from '../../../src/layers/l6-ui/contexts/ModalStackContext';
import { Dashboard } from '../../../src/layers/l6-ui/components/Dashboard/Dashboard';
import { useStore } from '../../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../../test-utils/testEnv';
import type { Course, Notification } from '../../../src/layers/l5-presentation/types';

// =============================================================================
// Helpers (sibling to Dashboard.test.tsx; duplication accepted until a third
// consumer justifies extraction into tests/test-utils/dashboardTestSetup.ts).
// =============================================================================

function makeCourse(overrides: Partial<Course> = {}): Course {
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

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    sourceType: 'announcement',
    sourceId: 'ann-1',
    courseId: 1,
    title: 'Test Notification',
    message: 'Test message body',
    messageHtml: null,
    publishedAt: '2024-01-15T10:00:00Z',
    dismissedAt: null,
    url: null,
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <ModalStackProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </ModalStackProvider>
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('Dashboard integration — IPC → store → component chain', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
    // Mount-time IPC stubs (same as PR-T5; Dashboard's children auto-fetch
    // these and the proxy's default `undefined` would corrupt state).
    env.api.getImportedCalendars.mockResolvedValue([]);
    env.api.getCalendarEventsForRange.mockResolvedValue([]);
  });

  afterEach(() => {
    useStore.setState({ courses: [], notifications: [] });
    env.cleanup();
  });

  it('initial fetch populates the UI with only visible-course notifications', async () => {
    // The IPC returns one course + two notifications. One notification is
    // for a course that the IPC did NOT include — simulating either the
    // brief staleness window or a future IPC bug that leaks a hidden
    // notification. The selector defends.
    env.api.getCourses.mockResolvedValue([makeCourse({ id: 1, code: 'CS101' })]);
    env.api.getNotifications.mockResolvedValue([
      makeNotification({ id: 10, courseId: 1, title: 'Visible Note' }),
      makeNotification({ id: 11, courseId: 999, title: 'Stale Note' }),
    ]);

    renderDashboard();

    // Sequential awaits — fetchNotifications reads state.courses to decide
    // which IDs to query. Without fetchCourses first, it falls into the
    // 'all' branch (different code path).
    await act(async () => {
      await useStore.getState().fetchCourses();
      await useStore.getState().fetchNotifications();
    });

    expect(screen.getByText('Visible Note')).toBeInTheDocument();
    expect(screen.queryByText('Stale Note')).not.toBeInTheDocument();
  });

  it('mid-session course removal via re-fetch propagates to Dashboard', async () => {
    // Initial: two visible courses, each with a notification.
    env.api.getCourses.mockResolvedValue([
      makeCourse({ id: 1, code: 'CS101' }),
      makeCourse({ id: 2, code: 'MAT201' }),
    ]);
    env.api.getNotifications.mockResolvedValue([
      makeNotification({ id: 10, courseId: 1, title: 'Note One' }),
      makeNotification({ id: 11, courseId: 2, title: 'Note Two' }),
    ]);

    renderDashboard();

    await act(async () => {
      await useStore.getState().fetchCourses();
      await useStore.getState().fetchNotifications();
    });

    expect(screen.getByText('Note One')).toBeInTheDocument();
    expect(screen.getByText('Note Two')).toBeInTheDocument();

    // User hides course 2 (or auto-archive runs). The IPC's next getCourses
    // call returns only course 1. Notifications are NOT re-fetched yet —
    // the staleness window the selector exists to defend.
    env.api.getCourses.mockResolvedValue([makeCourse({ id: 1, code: 'CS101' })]);

    await act(async () => {
      await useStore.getState().fetchCourses();
    });

    // Note One stays — course 1 still visible.
    expect(screen.getByText('Note One')).toBeInTheDocument();
    // Note Two drops — its course is gone from state, selector filters it out.
    expect(screen.queryByText('Note Two')).not.toBeInTheDocument();
  });
});
