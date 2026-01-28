/**
 * ImportantWorksCard - Displays high-weight tasks
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Inbox, Calendar } from 'lucide-react';
import { Card } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import {
  STORAGE_KEYS,
  useSetting,
  DEFAULT_DASHBOARD_SETTINGS,
} from '../../../l5-presentation/settings';
import { getBadgeUrgency, formatDueDate } from '../../constants/formatters';
import type { Task, Course } from '../../../l5-presentation/types';

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

/**
 * Get badge color based on urgency
 */
function getUrgencyColor(urgency: string): string {
  switch (urgency) {
    case 'critical':
      return 'var(--color-danger)';
    case 'high':
      return 'var(--color-warning)';
    case 'medium':
      return 'var(--color-blue)';
    case 'low':
    default:
      return 'var(--text-muted)';
  }
}

export function ImportantWorksCard({ maxItems = 4 }: ImportantWorksCardProps) {
  const navigate = useNavigate();
  const tasks = useStore((state) => state.tasks);
  const courses = useStore((state) => state.courses);

  // Get threshold from settings
  const [dashboardSettings] = useSetting(STORAGE_KEYS.DASHBOARD);
  const threshold =
    dashboardSettings?.importantWorksThreshold ??
    DEFAULT_DASHBOARD_SETTINGS.importantWorksThreshold;

  // Create course lookup map
  const courseMap = useMemo(() => {
    const map = new Map<number, Course>();
    for (const course of courses) {
      map.set(course.id, course);
    }
    return map;
  }, [courses]);

  // Filter and sort important tasks
  const importantTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      // Must not be completed
      if (task.isCompleted) return false;
      // Must have weight above threshold
      if (!task.weight || task.weight <= threshold) return false;
      return true;
    });

    // Sort by weight descending, then by due date ascending (null at end)
    return filtered
      .sort((a, b) => {
        // First by weight (descending)
        const weightDiff = (b.weight ?? 0) - (a.weight ?? 0);
        if (weightDiff !== 0) return weightDiff;

        // Then by due date (ascending, null at end)
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      })
      .slice(0, maxItems);
  }, [tasks, threshold, maxItems]);

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
      title="Important Works"
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
          <span style={styles.emptyText}>No tasks with weight above {threshold}%</span>
        </div>
      ) : (
        <div style={styles.list}>
          {importantTasks.map((task, index) => {
            const course = courseMap.get(task.courseId);
            const daysUntilDue = task.dueAt ? getDaysUntilDue(task.dueAt) : null;
            const urgency = daysUntilDue !== null ? getBadgeUrgency(daysUntilDue) : 'low';
            const dueLabel =
              daysUntilDue !== null ? formatDueDate(task.dueAt!, daysUntilDue) : null;

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
                <div style={styles.weightBadge}>
                  <Star size={12} style={{ color: 'var(--color-warning)' }} />
                  <span style={styles.weightValue}>{task.weight}%</span>
                </div>
                <div style={styles.content}>
                  <div style={styles.header}>
                    {course && <span style={styles.courseCode}>{course.code}</span>}
                    {dueLabel && (
                      <span
                        style={{
                          ...styles.dueBadge,
                          color: getUrgencyColor(urgency),
                          backgroundColor: `${getUrgencyColor(urgency)}15`,
                        }}
                      >
                        {dueLabel}
                      </span>
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
                  <span style={styles.taskTitle}>{task.title}</span>
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
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 24px',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  weightBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-warning-50)',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  weightValue: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-warning)',
  },

  content: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  courseCode: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    flexShrink: 0,
  },

  dueBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
  },

  calendarButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-blue)',
    borderRadius: 'var(--radius-sm)',
    transition: 'background-color var(--transition-fast)',
  },

  taskTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default ImportantWorksCard;
