/**
 * Dashboard Page
 * Main executive overview with bento grid layout
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, FlaskConical, X } from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { useDashboardViewModel } from '../../../l5-presentation/viewModels/DashboardViewModel';
import { QuickStats, StatItem } from './QuickStats';
import { TaskListModal, TaskWithCourse } from './TaskListModal';
import { GradeBreakdownModal } from './GradeBreakdownModal';
import { UnifiedDashboardGrid } from './UnifiedDashboardGrid';
import { TaskContextMenu } from '../Course/TaskContextMenu';
import type { Task } from '../../../l5-presentation/types';
import { formatGrade } from '../../constants';

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

  // Modal states
  const [showPendingTasksModal, setShowPendingTasksModal] = useState(false);
  const [showOverdueTasksModal, setShowOverdueTasksModal] = useState(false);
  const [showGradeModal, setShowGradeModal] = useState(false);

  // Compute task lists with course info for modals
  const courseMap = useMemo(
    () => new Map(state.courses.map((c) => [c.id, c])),
    [state.courses]
  );

  // Filter notifications to only show those from visible courses (or system notifications)
  const visibleNotifications = useMemo(() => {
    return state.notifications.filter(
      (n) => n.courseId === null || courseMap.has(n.courseId)
    );
  }, [state.notifications, courseMap]);

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

  const handleToggleComplete = async (taskId?: number, currentlyCompleted?: boolean) => {
    const api = window.api;
    if (!api?.dispatch) return;

    // Use passed params or fall back to context menu
    const id = taskId ?? contextMenu?.task.id;
    const isCompleted = currentlyCompleted ?? contextMenu?.task.isCompleted;

    if (id === undefined || isCompleted === undefined) return;

    try {
      await api.dispatch('MarkTaskComplete', {
        taskId: id,
        isComplete: !isCompleted,
      });
    } catch (error) {
      console.error('Failed to toggle task complete:', error);
    }
  };

  const handleDuplicateTask = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('DuplicateTask', { taskId: contextMenu.task.id });
    } catch (error) {
      console.error('Failed to duplicate task:', error);
    }
  };

  const handleDeleteTask = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('DeleteTask', { taskId: contextMenu.task.id, force: true });
    } catch (error) {
      console.error('Failed to delete task:', error);
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
      console.error('Failed to open task in Canvas:', error);
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
              const academicSettings = localStorage.getItem('academicSettings');
              if (academicSettings) {
                const settings = JSON.parse(academicSettings);
                termSelection = settings.termSelection || 'auto';
              }
            } catch (e) {
              console.error('[Dashboard] Failed to parse academic settings:', e);
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
          <QuickStats stats={stats} onAction={handleStatAction} />
        </section>

        {/* Unified Dashboard Grid - 2x2 draggable sections */}
        <section ref={mainRowRef}>
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
          onViewInCalendar={contextMenu.task.dueAt ? handleViewInCalendar : undefined}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 'var(--space-6)',
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
    gap: 'var(--space-3)',
  },

  statsRow: {
    width: '100%',
  },
};

export default Dashboard;
