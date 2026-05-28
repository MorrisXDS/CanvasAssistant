/**
 * Dashboard component integration test (ADR-0007 PR-T5).
 *
 * Closes gap 3 from the test-coverage roadmap: confirms Dashboard
 * actually consumes `selectors.visibleNotifications` at runtime, and that
 * the selector + React subscription chain + DOM rendering all wire
 * together correctly.
 *
 * Pattern: production singleton + setState reset. This is the Zustand v5
 * textbook approach for component tests. PR-T4's `env.store` (fresh
 * instance) doesn't help here — Dashboard imports the production `useStore`
 * singleton from '.../l5-presentation/store', not the fresh one from
 * `setupTestEnv()`. Tests must seed and clean the singleton directly.
 *
 * `env.api` (the Proxy-backed window.api stub from PR-T4) IS used — it
 * prevents the Dashboard's child components from blowing up if they reach
 * out to window.api at mount time.
 *
 * This is the FIRST L6 component test against the real store in this
 * codebase. The existing `SettingsModal.test.tsx` uses `jest.mock` to
 * replace the entire store module; that loses real selector integration.
 * The two patterns coexist post-PR-T5 — future cleanup might consolidate
 * onto one.
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
// Helpers
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

describe('Dashboard integration — visibleNotifications selector', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
    // Dashboard's children auto-fetch calendars + events at mount via
    // useEffect. The proxy's default `undefined` return would otherwise be
    // written into state and crash downstream `.some()` / `.map()` reads.
    // Stub the mount-critical methods with empty arrays.
    env.api.getImportedCalendars.mockResolvedValue([]);
    env.api.getCalendarEventsForRange.mockResolvedValue([]);
  });

  afterEach(() => {
    // Reset the singleton's state for keys this test touched. Other test
    // files that mount components must follow the same pattern.
    useStore.setState({ courses: [], notifications: [] });
    env.cleanup();
  });

  it('renders notifications whose course is in state, filters staleness, passes system through', () => {
    useStore.setState({
      courses: [makeCourse({ id: 1, code: 'CS101' })],
      notifications: [
        makeNotification({ id: 10, courseId: 1, title: 'Visible Note' }),
        makeNotification({ id: 11, courseId: 999, title: 'Stale Note' }),
        makeNotification({ id: 12, courseId: null, title: 'System Note' }),
      ],
    });

    renderDashboard();

    // Visible-course notification: rendered.
    expect(screen.getByText('Visible Note')).toBeInTheDocument();
    // System notification (courseId === null): also rendered.
    expect(screen.getByText('System Note')).toBeInTheDocument();
    // Staleness: notification for a course not in state — must NOT render.
    expect(screen.queryByText('Stale Note')).not.toBeInTheDocument();
  });

  it('re-renders when a course leaves state.courses (notification drops out)', () => {
    // Seed: one course visible, one notification tied to it.
    useStore.setState({
      courses: [makeCourse({ id: 1, code: 'CS101' })],
      notifications: [makeNotification({ id: 10, courseId: 1, title: 'Will Drop' })],
    });

    renderDashboard();

    expect(screen.getByText('Will Drop')).toBeInTheDocument();

    // Simulate the staleness window: course leaves state.courses before
    // notifications get re-fetched. Selector defends; UI drops the row.
    act(() => {
      useStore.setState({ courses: [] });
    });

    expect(screen.queryByText('Will Drop')).not.toBeInTheDocument();
  });
});
