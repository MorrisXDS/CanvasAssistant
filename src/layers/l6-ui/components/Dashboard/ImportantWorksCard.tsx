/**
 * ImportantWorksCard - Displays high-weight tasks
 */

import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Inbox, Calendar } from 'lucide-react';
import { Card } from '../shared';
import { ImportantWorksFilter } from './ImportantWorksFilter';
import { useStore } from '../../../l5-presentation/store';
import {
  STORAGE_KEYS,
  useSetting,
  DEFAULT_DASHBOARD_SETTINGS,
  DEFAULT_IMPORTANT_WORKS_FILTER,
  type ImportantWorksFilter as FilterType,
  type DashboardSettings,
} from '../../../l5-presentation/settings';
import { formatDueDate, getCourseColor, CARD_TITLES } from '../../constants';
import { isDeadlineEvent, formatDurationDisplay } from '../Calendar/calendarUtils';
import type { Task, Course, DisplayCalendarEvent } from '../../../l5-presentation/types';

interface ImportantWorksCardProps {
  maxItems?: number;
}

/**
 * Calculate days until due
 */
function getDaysUntilDue(dueAt: string): number | null {
  if (!dueAt) return null;

  const now = new Date();
  const due = new Date(dueAt);

  // Set both to start of day for accurate day calculation
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

export function ImportantWorksCard({ maxItems = 4 }: ImportantWorksCardProps) {
  const navigate = useNavigate();
  const tasks = useStore((state) => state.tasks);
  const courses = useStore((state) => state.courses);
  const calendarEvents = useStore((state) => state.calendarEvents);

  // Get settings from storage
  const [dashboardSettings, setDashboardSettings] = useSetting(STORAGE_KEYS.DASHBOARD);

  // Get the filter config (use default if not set)
  const filter: FilterType = useMemo(
    () => dashboardSettings?.importantWorksFilter ?? DEFAULT_IMPORTANT_WORKS_FILTER,
    [dashboardSettings]
  );

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilter: FilterType) => {
      const currentSettings: DashboardSettings =
        dashboardSettings ?? DEFAULT_DASHBOARD_SETTINGS;
      setDashboardSettings({
        ...currentSettings,
        importantWorksFilter: newFilter,
        // Sync legacy threshold with global threshold
        importantWorksThreshold: newFilter.globalThreshold,
      });
    },
    [dashboardSettings, setDashboardSettings]
  );

  // Create course lookup map
  const courseMap = useMemo(() => {
    const map = new Map<number, Course>();
    for (const course of courses) {
      map.set(course.id, course);
    }
    return map;
  }, [courses]);

  // Create calendar event lookup map (by event ID)
  const calendarEventMap = useMemo(() => {
    const map = new Map<number, DisplayCalendarEvent>();
    for (const event of calendarEvents) {
      map.set(event.id, event);
    }
    return map;
  }, [calendarEvents]);

  // Filter and sort important tasks
  const importantTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      // Must not be completed
      if (task.isCompleted) return false;

      // Must have a task type
      const taskType = task.taskType;
      if (!taskType) return false;

      // Check if type is enabled (if no types enabled, show all)
      if (filter.enabledTypes.length > 0 && !filter.enabledTypes.includes(taskType)) {
        return false;
      }

      // Get applicable threshold
      const threshold =
        filter.perTypeEnabled && filter.perTypeThresholds[taskType] !== undefined
          ? filter.perTypeThresholds[taskType]
          : filter.globalThreshold;

      // Must have weight above threshold
      if (!task.weight || task.weight < threshold) return false;

      return true;
    });

    // Sort by due date ascending (null at end), then by weight descending
    return filtered
      .sort((a, b) => {
        // First by due date (ascending, null at end)
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        const dateDiff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        if (dateDiff !== 0) return dateDiff;

        // Then by weight (descending)
        return (b.weight ?? 0) - (a.weight ?? 0);
      })
      .slice(0, maxItems);
  }, [tasks, filter, maxItems]);

  const handleTaskClick = (task: Task) => {
    // Navigate to course detail with task highlight
    navigate(`/course/${task.courseId}?task=${task.id}`);
  };

  const handleCalendarClick = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to calendar with event highlighted
    if (task.calendarEventId) {
      navigate(`/calendar?event=${task.calendarEventId}`);
    }
  };

  return (
    <Card
      title={CARD_TITLES.dashboard.importantWorks}
      headerAction={
        <ImportantWorksFilter filter={filter} onFilterChange={handleFilterChange} />
      }
      padding="md"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {importantTasks.length === 0 ? (
        <div style={styles.emptyState}>
          <Inbox
            size={28}
            color="var(--text-muted)"
            style={{ marginBottom: 'var(--space-2)' }}
          />
          <span style={styles.emptyText}>
            No matching tasks above {filter.globalThreshold}% weight
          </span>
        </div>
      ) : (
        <div style={styles.list}>
          {importantTasks.map((task, index) => {
            const course = courseMap.get(task.courseId);
            const calendarEvent = task.calendarEventId
              ? calendarEventMap.get(task.calendarEventId)
              : undefined;

            // Determine time display:
            // - Duration event (has real start time): show time range
            // - Deadline event (start is epoch): show relative deadline
            // - No due date: show nothing
            let timeDisplay: string | null = null;

            if (calendarEvent && !isDeadlineEvent(calendarEvent)) {
              // Duration event - show time range
              timeDisplay = formatDurationDisplay(calendarEvent);
            } else if (task.dueAt) {
              // Deadline event - show relative deadline with time
              const daysUntilDue = getDaysUntilDue(task.dueAt);
              if (daysUntilDue !== null) {
                const deadlineDate = formatDueDate(task.dueAt, daysUntilDue);
                const deadlineTime = new Date(task.dueAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                });
                // Always prefix with "Due" if not already present
                const duePrefix = deadlineDate.toLowerCase().startsWith('due')
                  ? ''
                  : 'Due ';
                timeDisplay = `${duePrefix}${deadlineDate} ${deadlineTime}`;
              }
            }

            return (
              <div
                key={task.id}
                style={{
                  ...styles.item,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                }}
                onClick={() => handleTaskClick(task)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTaskClick(task);
                  }
                }}
              >
                {/* Layout B: Title-first card style */}
                <div style={styles.content}>
                  {/* Row 1: Task title */}
                  <span style={styles.taskTitle}>{task.title}</span>

                  {/* Row 2: Metadata (weight • course • due date) */}
                  <div style={styles.metadataRow}>
                    <span style={styles.weightInline}>
                      <Star size={10} style={{ color: 'var(--color-warning)' }} />
                      <span>{task.weight}%</span>
                    </span>

                    <span style={styles.separator}>•</span>

                    {course && (
                      <span
                        style={{
                          ...styles.courseCode,
                          backgroundColor: course.color || getCourseColor(course.id),
                        }}
                        title={course.code}
                      >
                        {course.code}
                      </span>
                    )}

                    {timeDisplay && (
                      <>
                        <span style={styles.separator}>•</span>
                        <span style={styles.dueText}>{timeDisplay}</span>
                      </>
                    )}

                    {task.calendarEventId && (
                      <button
                        style={styles.calendarButton}
                        onClick={(e) => handleCalendarClick(task, e)}
                        title="View in calendar"
                      >
                        <Calendar size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    textAlign: 'center',
    flex: 1,
    minHeight: '150px',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: '0 -24px -24px -24px',
    flex: 1,
  },

  item: {
    display: 'flex',
    padding: 'var(--space-3) 24px',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  taskTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  metadataRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  weightInline: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-warning)',
    minWidth: '45px', // Fixed width for alignment (accommodates up to 99.99%)
  },

  separator: {
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
  },

  courseCode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-sm)',
    color: 'white',
    letterSpacing: '0.02em',
    width: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    display: 'inline-block',
  },

  dueText: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
  },

  calendarButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-blue)',
    borderRadius: 'var(--radius-sm)',
    transition: 'background-color var(--transition-fast)',
  },
};

export default ImportantWorksCard;
