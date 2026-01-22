/**
 * TasksPage - Full page view for all tasks
 * Accessible from dashboard "View all" link
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle,
  Circle,
  Calendar,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { Card, Badge, BadgeVariant } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import type { Task, Course } from '../../../l5-presentation/types';

type FilterType = 'all' | 'pending' | 'overdue' | 'completed';

interface TaskWithCourse {
  task: Task;
  course: Course;
  daysUntilDue: number | null;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

function getDaysUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;
  const now = new Date();
  const due = new Date(dueAt);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyLevel(daysUntilDue: number | null): 'critical' | 'high' | 'medium' | 'low' {
  if (daysUntilDue === null) return 'low';
  if (daysUntilDue < 0) return 'critical';
  if (daysUntilDue <= 1) return 'critical';
  if (daysUntilDue <= 3) return 'high';
  if (daysUntilDue <= 7) return 'medium';
  return 'low';
}

function formatDueDate(dueAt: string | null, daysUntilDue: number | null): string {
  if (!dueAt) return 'No due date';

  if (daysUntilDue === null) return 'No due date';
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d overdue`;
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;

  const date = new Date(dueAt);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function TasksPage() {
  const navigate = useNavigate();
  const { tasks, courses } = useStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  const courseMap = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);

  // Process all tasks with course info
  const allTasks = useMemo(() => {
    const now = new Date();
    const result: TaskWithCourse[] = [];

    for (const task of tasks) {
      const course = courseMap.get(task.courseId);
      if (!course) continue;

      const daysUntilDue = getDaysUntilDue(task.dueAt);
      result.push({
        task,
        course,
        daysUntilDue,
        urgencyLevel: getUrgencyLevel(daysUntilDue),
      });
    }

    return result;
  }, [tasks, courseMap]);

  // Filter tasks based on selection
  const filteredTasks = useMemo(() => {
    const now = new Date();
    let filtered = allTasks;

    switch (filter) {
      case 'pending':
        filtered = allTasks.filter(t => !t.task.isCompleted && (!t.task.dueAt || new Date(t.task.dueAt) >= now));
        break;
      case 'overdue':
        filtered = allTasks.filter(t => !t.task.isCompleted && t.task.dueAt && new Date(t.task.dueAt) < now);
        break;
      case 'completed':
        filtered = allTasks.filter(t => t.task.isCompleted);
        break;
    }

    // Sort: overdue first, then by due date
    return filtered.sort((a, b) => {
      // Completed tasks at the bottom
      if (a.task.isCompleted !== b.task.isCompleted) {
        return a.task.isCompleted ? 1 : -1;
      }
      // Then by due date
      if (!a.task.dueAt) return 1;
      if (!b.task.dueAt) return -1;
      return new Date(a.task.dueAt).getTime() - new Date(b.task.dueAt).getTime();
    });
  }, [allTasks, filter]);

  // Stats for filter tabs
  const stats = useMemo(() => {
    const now = new Date();
    return {
      all: allTasks.length,
      pending: allTasks.filter(t => !t.task.isCompleted && (!t.task.dueAt || new Date(t.task.dueAt) >= now)).length,
      overdue: allTasks.filter(t => !t.task.isCompleted && t.task.dueAt && new Date(t.task.dueAt) < now).length,
      completed: allTasks.filter(t => t.task.isCompleted).length,
    };
  }, [allTasks]);

  const handleTaskClick = (task: Task, course: Course) => {
    navigate(`/course/${course.id}?highlightTask=${task.id}`);
  };

  const filterOptions: { value: FilterType; label: string; count: number }[] = [
    { value: 'all', label: 'All Tasks', count: stats.all },
    { value: 'pending', label: 'Pending', count: stats.pending },
    { value: 'overdue', label: 'Overdue', count: stats.overdue },
    { value: 'completed', label: 'Completed', count: stats.completed },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backButton}>
          <ArrowLeft size={16} />
          <span>Dashboard</span>
        </button>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>All Tasks</h1>
          <p style={styles.subtitle}>{filteredTasks.length} tasks</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterRow}>
        {filterOptions.map(option => (
          <button
            key={option.value}
            style={{
              ...styles.filterTab,
              ...(filter === option.value ? styles.filterTabActive : {}),
            }}
            onClick={() => setFilter(option.value)}
          >
            {option.value === 'overdue' && <AlertTriangle size={14} />}
            {option.value === 'pending' && <Clock size={14} />}
            {option.value === 'completed' && <CheckCircle size={14} />}
            {option.label}
            <span style={styles.filterCount}>({option.count})</span>
          </button>
        ))}
      </div>

      {/* Task List */}
      <Card padding="none">
        {filteredTasks.length === 0 ? (
          <div style={styles.emptyState}>
            <span>No {filter === 'all' ? '' : filter} tasks</span>
          </div>
        ) : (
          <div style={styles.taskList}>
            {filteredTasks.map((item, index) => (
              <div
                key={item.task.id}
                style={{
                  ...styles.taskItem,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  opacity: item.task.isCompleted ? 0.7 : 1,
                }}
                onClick={() => handleTaskClick(item.task, item.course)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleTaskClick(item.task, item.course);
                  }
                }}
              >
                {/* Priority indicator */}
                <div
                  style={{
                    ...styles.priorityBar,
                    backgroundColor: item.task.isCompleted
                      ? 'var(--color-success)'
                      : item.urgencyLevel === 'critical'
                        ? 'var(--color-critical)'
                        : item.urgencyLevel === 'high'
                          ? 'var(--color-high)'
                          : item.urgencyLevel === 'medium'
                            ? 'var(--color-medium)'
                            : 'var(--color-low)',
                  }}
                />

                {/* Completion indicator */}
                <div style={styles.statusIcon}>
                  {item.task.isCompleted ? (
                    <CheckCircle size={20} color="var(--color-success)" />
                  ) : (
                    <Circle size={20} color="var(--text-muted)" />
                  )}
                </div>

                {/* Content */}
                <div style={styles.taskContent}>
                  <div style={styles.taskTopRow}>
                    <span
                      style={{
                        ...styles.courseCode,
                        backgroundColor: item.course.color || 'var(--color-navy)',
                      }}
                    >
                      {item.course.code.split(/\s/)[0]}
                    </span>
                    {!item.task.isCompleted && item.task.dueAt && (
                      <Badge variant={item.urgencyLevel as BadgeVariant} size="sm">
                        {formatDueDate(item.task.dueAt, item.daysUntilDue)}
                      </Badge>
                    )}
                  </div>
                  <div
                    style={{
                      ...styles.taskTitle,
                      textDecoration: item.task.isCompleted ? 'line-through' : 'none',
                    }}
                  >
                    {item.task.title}
                  </div>
                  <div style={styles.taskMeta}>
                    {item.task.weight > 0 && (
                      <span style={styles.taskWeight}>{item.task.weight}% weight</span>
                    )}
                    {item.task.grade !== null && (
                      <span style={styles.taskGrade}>{item.task.grade.toFixed(1)}%</span>
                    )}
                    <span style={styles.courseName}>
                      {item.course.nickname || item.course.name}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '0',
  },

  header: {
    marginBottom: 'var(--space-6)',
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },

  headerContent: {},

  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  filterRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  filterTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterTabActive: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
    color: 'white',
  },

  filterCount: {
    opacity: 0.8,
  },

  taskList: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-4) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  priorityBar: {
    width: '4px',
    alignSelf: 'stretch',
    borderRadius: '2px',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  statusIcon: {
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  taskContent: {
    flex: 1,
    minWidth: 0,
  },

  taskTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  courseCode: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },

  taskTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  taskMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  taskWeight: {
    padding: '1px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
  },

  taskGrade: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-success)',
  },

  courseName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },
};

export default TasksPage;
