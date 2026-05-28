/**
 * Dashboard Page
 * Main executive overview with bento grid layout
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FlaskConical, X } from 'lucide-react';
import { useStore, selectors } from '../../../l5-presentation/store';
import { useDashboardViewModel } from '../../../l5-presentation/viewModels/DashboardViewModel';
import { QuickStats, StatItem } from './QuickStats';
import { TaskListModal, TaskWithCourse } from './TaskListModal';
import { GradeBreakdownModal } from './GradeBreakdownModal';
import { UnifiedDashboardGrid } from './UnifiedDashboardGrid';
import { TaskContextMenu } from '../Course/TaskContextMenu';
import type { Task } from '../../../l5-presentation/types';
import { formatGrade } from '../../constants';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import { createLogger } from '../../utils/rendererLogger';
import { useStackAwareHotkeys } from '../../hooks/useStackAwareHotkeys';

const log = createLogger('Dashboard');

// Debug flag - set to true only when debugging layout issues
const DEBUG_LAYOUT = false;

export function Dashboard() {
  const pageRef = useRef<HTMLDivElement>(null);
  const mainRowRef = useRef<HTMLElement>(null);
  const [_windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Debug: Log window and container dimensions using ResizeObserver
  useEffect(() => {
    if (!DEBUG_LAYOUT) return;

    const logDimensions = () => {
      const newSize = { width: window.innerWidth, height: window.innerHeight };
      setWindowSize(newSize);

      log.debug(`Window: ${JSON.stringify(newSize)}`);

      if (pageRef.current) {
        const pageRect = pageRef.current.getBoundingClientRect();
        log.debug(
          `Page container: ${JSON.stringify({
            width: pageRect.width,
            height: pageRect.height,
            maxWidth: getComputedStyle(pageRef.current).maxWidth,
          })}`
        );
      }

      if (mainRowRef.current) {
        const mainRowRect = mainRowRef.current.getBoundingClientRect();
        const children = mainRowRef.current.children;
        log.debug(
          `Main row: ${JSON.stringify({
            width: mainRowRect.width,
            flexWrap: getComputedStyle(mainRowRef.current).flexWrap,
            childCount: children.length,
          })}`
        );

        Array.from(children).forEach((child, i) => {
          const rect = child.getBoundingClientRect();
          const style = getComputedStyle(child);
          log.debug(
            `Child ${i}: ${JSON.stringify({
              width: rect.width,
              flex: style.flex,
              minWidth: style.minWidth,
            })}`
          );
        });
      }
    };

    // Initial log
    logDimensions();

    // Use ResizeObserver for reliable resize detection (including maximize)
    const resizeObserver = new ResizeObserver(() => {
      logDimensions();
    });

    if (pageRef.current) {
      resizeObserver.observe(pageRef.current);
    }

    // Also listen to window resize as backup
    window.addEventListener('resize', logDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', logDimensions);
    };
  }, []);
  const navigate = useNavigate();
  const state = useStore();

  const viewModel = useDashboardViewModel(state);

  // Focusable list types
  type DashboardListId =
    | 'stats'
    | 'priority'
    | 'notifications'
    | 'schedule'
    | 'importantWorks';
  const ALL_LISTS: DashboardListId[] = [
    'stats',
    'priority',
    'notifications',
    'schedule',
    'importantWorks',
  ];

  const FOCUS_KEY = 'dashboard-focused-list';
  const [focusedList, setFocusedList] = useState<DashboardListId>(() => {
    const saved = sessionStorage.getItem(FOCUS_KEY) as DashboardListId | null;
    if (saved && ALL_LISTS.includes(saved)) return saved;
    return 'priority';
  });

  // Persist focused list across navigation
  useEffect(() => {
    sessionStorage.setItem(FOCUS_KEY, focusedList);
  }, [focusedList]);

  // Keyboard shortcuts
  useStackAwareHotkeys('r', () => {
    if (state.syncStatus !== 'syncing') {
      let termSelection: 'all' | 'auto' | string = 'auto';
      try {
        const academicSettings = localStorage.getItem(STORAGE_KEYS.ACADEMIC);
        if (academicSettings) {
          const settings = JSON.parse(academicSettings);
          termSelection = settings.termSelection || 'auto';
        }
      } catch (e) {
        log.error(
          'Failed to parse academic settings',
          e instanceof Error ? e : undefined
        );
      }
      state.triggerSync('full', { termSelection });
    }
  });

  // Modal states
  const [showPendingTasksModal, setShowPendingTasksModal] = useState(false);
  const [showOverdueTasksModal, setShowOverdueTasksModal] = useState(false);
  const [showGradeModal, setShowGradeModal] = useState(false);

  // Compute task lists with course info for modals
  const courseMap = useMemo(
    () => new Map(state.courses.map((c) => [c.id, c])),
    [state.courses]
  );

  // Filter notifications to only show those from visible courses (or system notifications).
  // Uses the centralized selector (per CLAUDE.md §8) — closes the brief staleness
  // window between `fetchCourses` and `fetchNotifications` re-fetches.
  //
  // useMemo-wrap is essential: `selectors.visibleNotifications` returns a fresh
  // array on every call, which without memoization would re-trigger every
  // downstream `useMemo`/`useEffect` that depends on this reference — surfaced
  // by PR-T5's Dashboard integration test as an infinite re-render loop in dev
  // mode. Stable references via React's useMemo bypass that hazard.
  const visibleNotifications = useMemo(
    () => selectors.visibleNotifications(state),
    [state.courses, state.notifications]
  );

  // Top row = Stats; bottom row = the four grid lists (see availableBottomLists below)
  const TOP_LISTS: DashboardListId[] = ['stats'];

  // Determine which bottom-row lists have content (Tab skips empty ones)
  const availableBottomLists = useMemo(() => {
    const lists: DashboardListId[] = [];

    if (viewModel.priorityQueue.length > 0) lists.push('priority');

    if (visibleNotifications.some((n) => !n.dismissedAt)) lists.push('notifications');

    // Schedule: has today's calendar events or tasks with start times today
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hasTodayItem =
      state.calendarEvents.some((e) => {
        const start = new Date(e.startAt);
        return start >= today && start < tomorrow;
      }) ||
      state.tasks.some((t) => {
        if (!t.unlockAt) return false;
        const start = new Date(t.unlockAt);
        return start.getTime() >= 86400000 && start >= today && start < tomorrow;
      });
    if (hasTodayItem) lists.push('schedule');

    // Important works: any pending task with weight > 0
    const hasImportant = state.tasks.some((t) => !t.isCompleted && (t.weight ?? 0) > 0);
    if (hasImportant) lists.push('importantWorks');

    return lists;
  }, [viewModel.priorityQueue, visibleNotifications, state.calendarEvents, state.tasks]);

  // Current group the focused list belongs to
  const currentGroup: DashboardListId[] = TOP_LISTS.includes(focusedList)
    ? TOP_LISTS
    : availableBottomLists;

  // If the currently focused list has no content, move to the first available one in the bottom row
  useEffect(() => {
    if (TOP_LISTS.includes(focusedList)) return; // stats is always valid
    if (availableBottomLists.length === 0) return;
    if (!availableBottomLists.includes(focusedList)) {
      setFocusedList(availableBottomLists[0]);
    }
  }, [availableBottomLists, focusedList]);

  // Blur any native DOM focus so the browser's :focus ring doesn't compete with our highlight
  const blurNative = () => {
    const active = document.activeElement;
    if (active && active instanceof HTMLElement && active !== document.body) {
      active.blur();
    }
  };

  // Tab on Dashboard:
  //   Top row (Stats): cycle between the 4 stat cards (like Right/Left)
  //   Bottom row: cycle between lists (Tasks, Announcements, Schedule, Important Works)
  // Always preventDefault so native Tab doesn't leak focus to other elements
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      blurNative();

      // On the top row (Stats), Tab moves between stat cards — delegate to Left/Right handler
      if (TOP_LISTS.includes(focusedList)) {
        const syntheticKey = e.shiftKey ? 'ArrowLeft' : 'ArrowRight';
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: syntheticKey, bubbles: true })
        );
        return;
      }

      // Bottom row: cycle between lists
      if (currentGroup.length <= 1) return;
      setFocusedList((prev) => {
        const idx = currentGroup.indexOf(prev);
        const next = e.shiftKey
          ? (idx - 1 + currentGroup.length) % currentGroup.length
          : (idx + 1) % currentGroup.length;
        return currentGroup[next];
      });
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentGroup, focusedList]);

  // Backtick (`): switch between top row (stats) and bottom row (grid lists)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '`') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      blurNative();
      setFocusedList((prev) => {
        if (TOP_LISTS.includes(prev)) {
          // Switch to first available bottom list
          return availableBottomLists[0] ?? prev;
        }
        // Switch to first top list (stats)
        return TOP_LISTS[0];
      });
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [availableBottomLists]);

  const { pendingTasks, overdueTasks } = useMemo(() => {
    const now = new Date();
    const pending: TaskWithCourse[] = [];
    const overdue: TaskWithCourse[] = [];

    for (const task of state.tasks) {
      if (task.isCompleted) continue;
      const course = courseMap.get(task.courseId);
      if (!course) continue;

      // Calculate days until due using calendar days (not 24-hour periods)
      let daysUntilDue: number | null = null;
      if (task.dueAt) {
        const due = new Date(task.dueAt);
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        daysUntilDue = Math.round(
          (dueDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const taskWithCourse: TaskWithCourse = { task, course, daysUntilDue };

      if (task.dueAt && new Date(task.dueAt) < now) {
        overdue.push(taskWithCourse);
      } else if (task.dueAt) {
        pending.push(taskWithCourse);
      }
    }

    // Sort by due date
    pending.sort((a, b) => {
      if (!a.task.dueAt) return 1;
      if (!b.task.dueAt) return -1;
      return new Date(a.task.dueAt).getTime() - new Date(b.task.dueAt).getTime();
    });

    overdue.sort((a, b) => {
      if (!a.task.dueAt) return 1;
      if (!b.task.dueAt) return -1;
      return new Date(a.task.dueAt).getTime() - new Date(b.task.dueAt).getTime();
    });

    return { pendingTasks: pending, overdueTasks: overdue };
  }, [state.tasks, courseMap]);

  // Handle stat card actions
  const handleStatAction = (action: string) => {
    switch (action) {
      case 'pending':
        setShowPendingTasksModal(true);
        break;
      case 'overdue':
        setShowOverdueTasksModal(true);
        break;
      case 'grade':
        setShowGradeModal(true);
        break;
    }
  };

  // Build stats from view model
  const stats: StatItem[] = [
    {
      label: 'Active Courses',
      value: viewModel.stats.totalCourses,
      icon: 'courses',
      link: '/courses',
    },
    {
      label: 'Pending Tasks',
      value: viewModel.stats.upcomingTasks,
      icon: 'tasks',
      action: 'pending',
    },
    {
      label: 'Overdue Tasks',
      value: viewModel.stats.overdueTasks,
      icon: 'overdue',
      trend:
        viewModel.stats.overdueTasks > 0
          ? { direction: 'warning', value: `${viewModel.stats.overdueTasks}` }
          : undefined,
      action: 'overdue',
    },
    {
      label: 'Avg. Grade',
      value:
        viewModel.stats.averageGrade !== null
          ? formatGrade(viewModel.stats.averageGrade)
          : 'N/A',
      icon: 'grade',
      action: 'grade',
    },
  ];

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    task: Task & { isOptional?: boolean };
    position: { x: number; y: number };
  } | null>(null);

  const handleTaskClick = (taskId: number) => {
    // Find the task to get its course ID
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) {
      navigate(`/course/${task.courseId}?highlightTask=${taskId}`);
    }
  };

  const handleTaskDoubleClick = (taskId: number) => {
    // Navigate to course detail with task highlight
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) {
      navigate(`/course/${task.courseId}?highlightTask=${taskId}`);
    }
  };

  const handleTaskContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    setContextMenu({
      task: { ...task, isOptional: task.isOptional ?? false },
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const markTaskComplete = useStore((state) => state.markTaskComplete);
  const handleToggleComplete = async (taskId?: number, currentlyCompleted?: boolean) => {
    // Use passed params or fall back to context menu
    const id = taskId ?? contextMenu?.task.id;
    const isCompleted = currentlyCompleted ?? contextMenu?.task.isCompleted;

    if (id === undefined || isCompleted === undefined) return;

    try {
      await markTaskComplete(id, !isCompleted);
    } catch (error) {
      log.error(
        'Failed to toggle task complete',
        error instanceof Error ? error : undefined
      );
    }
  };

  const handleDuplicateTask = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('DuplicateTask', { taskId: contextMenu.task.id });
    } catch (error) {
      log.error('Failed to duplicate task', error instanceof Error ? error : undefined);
    }
  };

  const handleDeleteTask = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('DeleteTask', { taskId: contextMenu.task.id, force: true });
    } catch (error) {
      log.error('Failed to delete task', error instanceof Error ? error : undefined);
    }
  };

  const handleOpenInCanvas = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.getTaskCanvasUrl || !api?.openExternal) return;

    try {
      const result = await api.getTaskCanvasUrl(contextMenu.task.id);
      if (result.success && result.data?.canvasUrl) {
        api.openExternal(result.data.canvasUrl);
      }
    } catch (error) {
      log.error(
        'Failed to open task in Canvas',
        error instanceof Error ? error : undefined
      );
    }
  };

  const handleViewInCalendar = () => {
    if (!contextMenu?.task.dueAt) return;
    navigate('/calendar', {
      state: { taskId: contextMenu.task.id, targetDate: contextMenu.task.dueAt },
    });
    setContextMenu(null);
  };

  const handleDismissNotification = async (notificationId: number) => {
    await state.dismissNotification(notificationId);
  };

  // Get sync message from state
  const syncButtonText =
    state.syncStatus === 'syncing' ? state.syncMessage || 'Syncing...' : 'Sync Now';

  return (
    <div ref={pageRef} style={styles.page}>
      {/* Auto-sync Banner */}
      {state.isAutoSync && state.syncStatus === 'syncing' && (
        <div style={styles.autoSyncBanner}>
          <div style={styles.autoSyncContent}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Auto syncing in progress...</span>
          </div>
          <button
            style={styles.autoSyncDismiss}
            onClick={() => state.dismissAutoSyncBanner()}
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
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
        <button
          style={{
            ...styles.syncButton,
            opacity: state.syncStatus === 'syncing' ? 0.7 : 1,
          }}
          onClick={() => {
            // Read term selection from academic settings
            let termSelection: 'all' | 'auto' | string = 'auto';
            try {
              const academicSettings = localStorage.getItem(STORAGE_KEYS.ACADEMIC);
              if (academicSettings) {
                const settings = JSON.parse(academicSettings);
                termSelection = settings.termSelection || 'auto';
              }
            } catch (e) {
              log.error(
                'Failed to parse academic settings',
                e instanceof Error ? e : undefined
              );
            }
            state.triggerSync('full', { termSelection });
          }}
          disabled={state.syncStatus === 'syncing'}
        >
          <RefreshCw
            size={16}
            style={{
              marginRight: 'var(--space-2)',
              animation:
                state.syncStatus === 'syncing' ? 'spin 1s linear infinite' : 'none',
            }}
          />
          {syncButtonText}
        </button>
      </header>

      {/* Bento Grid Layout */}
      <div style={styles.grid}>
        {/* Top Row: Stats (full width) */}
        <section style={styles.statsRow}>
          <QuickStats
            stats={stats}
            onAction={handleStatAction}
            isKeyboardActive={focusedList === 'stats'}
          />
        </section>

        {/* Unified Dashboard Grid - 2x2 draggable sections */}
        <section ref={mainRowRef} style={{ minHeight: 0, height: '100%' }}>
          <UnifiedDashboardGrid
            priorityItems={viewModel.priorityQueue}
            totalPendingTasks={
              viewModel.stats.upcomingTasks + viewModel.stats.overdueTasks
            }
            notifications={visibleNotifications}
            onTaskClick={handleTaskClick}
            onTaskDoubleClick={handleTaskDoubleClick}
            onTaskContextMenu={handleTaskContextMenu}
            onToggleComplete={handleToggleComplete}
            onDismissNotification={handleDismissNotification}
            focusedList={focusedList}
          />
        </section>
      </div>

      {/* Modals */}
      <TaskListModal
        isOpen={showPendingTasksModal}
        onClose={() => setShowPendingTasksModal(false)}
        title="Pending Tasks"
        tasks={pendingTasks}
        type="pending"
      />
      <TaskListModal
        isOpen={showOverdueTasksModal}
        onClose={() => setShowOverdueTasksModal(false)}
        title="Overdue Tasks"
        tasks={overdueTasks}
        type="overdue"
      />
      <GradeBreakdownModal
        isOpen={showGradeModal}
        onClose={() => setShowGradeModal(false)}
        courseSummaries={viewModel.courseSummaries}
        averageGrade={viewModel.stats.averageGrade}
      />

      {/* Task Context Menu */}
      {contextMenu && (
        <TaskContextMenu
          task={{
            id: contextMenu.task.id,
            title: contextMenu.task.title,
            isCompleted: contextMenu.task.isCompleted,
            isOptional: contextMenu.task.isOptional,
            sourceType: contextMenu.task.sourceType,
            dueAt: contextMenu.task.dueAt,
            calendarEventId: contextMenu.task.calendarEventId,
          }}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            navigate(
              `/course/${contextMenu.task.courseId}?highlightTask=${contextMenu.task.id}`
            );
            setContextMenu(null);
          }}
          onDuplicate={() => {
            handleDuplicateTask();
            setContextMenu(null);
          }}
          onToggleComplete={() => {
            handleToggleComplete();
            setContextMenu(null);
          }}
          onOpenInCanvas={() => {
            handleOpenInCanvas();
            setContextMenu(null);
          }}
          onDelete={() => {
            handleDeleteTask();
            setContextMenu(null);
          }}
          onViewInCalendar={handleViewInCalendar}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  autoSyncBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) var(--space-4)',
    marginBottom: 'var(--space-4)',
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
  },

  autoSyncContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  autoSyncDismiss: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-info)',
    borderRadius: 'var(--radius-sm)',
    opacity: 0.7,
    transition: 'opacity var(--transition-fast)',
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
    flexDirection: 'column',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
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
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    gap: 'var(--space-3)',
    flex: 1,
    minHeight: 0,
  },

  statsRow: {
    width: '100%',
  },
};

export default Dashboard;
