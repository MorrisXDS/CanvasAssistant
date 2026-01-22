/**
 * Dashboard Page
 * Main executive overview with bento grid layout
 */

import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, FlaskConical } from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { useDashboardViewModel } from '../../../l5-presentation/viewModels/DashboardViewModel';
import { QuickStats, StatItem } from './QuickStats';
import { HealthIndicator, HealthState } from './HealthIndicator';
import { PriorityList } from './PriorityList';
import { NotificationsFeed } from './NotificationsFeed';

// Debug flag - set to false in production
const DEBUG_LAYOUT = true;

export function Dashboard() {
  const pageRef = useRef<HTMLDivElement>(null);
  const mainRowRef = useRef<HTMLElement>(null);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Debug: Log window and container dimensions
  useEffect(() => {
    if (!DEBUG_LAYOUT) return;

    const logDimensions = () => {
      const newSize = { width: window.innerWidth, height: window.innerHeight };
      setWindowSize(newSize);

      console.debug('[Dashboard] Window:', newSize);

      if (pageRef.current) {
        const pageRect = pageRef.current.getBoundingClientRect();
        console.debug('[Dashboard] Page container:', {
          width: pageRect.width,
          height: pageRect.height,
          maxWidth: getComputedStyle(pageRef.current).maxWidth,
        });
      }

      if (mainRowRef.current) {
        const mainRowRect = mainRowRef.current.getBoundingClientRect();
        const children = mainRowRef.current.children;
        console.debug('[Dashboard] Main row:', {
          width: mainRowRect.width,
          flexWrap: getComputedStyle(mainRowRef.current).flexWrap,
          childCount: children.length,
        });

        Array.from(children).forEach((child, i) => {
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          console.debug(`[Dashboard] Child ${i}:`, {
            width: rect.width,
            flex: style.flex,
            minWidth: style.minWidth,
          });
        });
      }
    };

    // Log on mount
    logDimensions();

    // Log on resize
    window.addEventListener('resize', logDimensions);
    return () => window.removeEventListener('resize', logDimensions);
  }, []);
  const state = useStore();
  const viewModel = useDashboardViewModel(state);

  // Build stats from view model
  const stats: StatItem[] = [
    {
      label: 'Active Courses',
      value: viewModel.stats.totalCourses,
      icon: 'courses',
    },
    {
      label: 'Pending Tasks',
      value: viewModel.stats.upcomingTasks,
      icon: 'tasks',
    },
    {
      label: 'Overdue Tasks',
      value: viewModel.stats.overdueTasks,
      icon: 'overdue',
      trend: viewModel.stats.overdueTasks > 0
        ? { direction: 'warning', value: `${viewModel.stats.overdueTasks}` }
        : undefined,
    },
    {
      label: 'Avg. Grade',
      value: viewModel.stats.averageGrade
        ? `${viewModel.stats.averageGrade.toFixed(1)}%`
        : 'N/A',
      icon: 'grade',
    },
  ];

  // Derive health status
  const healthStatus: HealthState = state.healthStatus?.overall ?? 'healthy';

  // Format database size
  const formatDbSize = (): string | undefined => {
    // This would come from health check in real implementation
    return undefined;
  };

  // Get last sync time - prefer store's lastSyncedAt (includes scheduled syncs),
  // fall back to most recent course sync time
  const lastSyncedAt = state.lastSyncedAt || state.courses.reduce((latest: string | null, course) => {
    if (!course.lastSyncedAt) return latest;
    if (!latest) return course.lastSyncedAt;
    return new Date(course.lastSyncedAt) > new Date(latest)
      ? course.lastSyncedAt
      : latest;
  }, null);

  const handleTaskClick = (taskId: number) => {
    // TODO: Navigate to task detail or course view
    console.log('Task clicked:', taskId);
  };

  const handleDismissNotification = async (notificationId: number) => {
    await state.dismissNotification(notificationId);
  };

  return (
    <div ref={pageRef} style={styles.page}>
      {/* Page Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button
            style={{
              ...styles.syncButton,
              opacity: state.syncStatus === 'syncing' ? 0.7 : 1,
            }}
            onClick={() => state.triggerSync('full')}
            disabled={state.syncStatus === 'syncing'}
          >
            <RefreshCw
              size={16}
              style={{
                marginRight: 'var(--space-2)',
                animation: state.syncStatus === 'syncing' ? 'spin 1s linear infinite' : 'none',
              }}
            />
            {state.syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
          </button>
          <div>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.subtitle}>
              {viewModel.simulationActive && (
                <span style={styles.simulationBadge}>
                  <FlaskConical size={14} />
                  Simulation Active ({viewModel.simulationCount} grades)
                </span>
              )}
              {!viewModel.simulationActive && 'Your academic overview at a glance'}
            </p>
          </div>
        </div>
      </header>

      {/* Bento Grid Layout */}
      <div style={styles.grid}>
        {/* Top Row: Stats (full width) */}
        <section style={styles.statsRow}>
          <QuickStats stats={stats} />
        </section>

        {/* Main Row: Priority List + Right Column (Health + Notifications) */}
        <section ref={mainRowRef} style={styles.mainRow}>
          <div style={styles.priorityColumn}>
            <PriorityList
              items={viewModel.priorityQueue}
              totalPendingTasks={viewModel.stats.upcomingTasks + viewModel.stats.overdueTasks}
              onTaskClick={handleTaskClick}
              maxItems={8}
            />
          </div>
          <div style={styles.rightColumn}>
            <HealthIndicator
              status={healthStatus}
              lastSyncedAt={lastSyncedAt}
              dbSize={formatDbSize()}
            />
            <NotificationsFeed
              notifications={state.notifications}
              onDismiss={handleDismissNotification}
              maxItems={5}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '1400px',
    margin: '0 auto',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-6)',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-gray-600)',
  },

  simulationBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },

  syncButton: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    flexShrink: 0,
  },

  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-6)',
  },

  statsRow: {
    width: '100%',
  },

  mainRow: {
    display: 'flex',
    gap: 'var(--space-4)',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },

  priorityColumn: {
    flex: '1 1 400px',
    minWidth: 0,
  },

  rightColumn: {
    flex: '0 1 320px',
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
};

export default Dashboard;
