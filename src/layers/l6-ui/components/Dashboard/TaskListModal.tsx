/**
 * TaskListModal Component
 * Displays a modal with a list of tasks (pending or overdue)
 * Clicking a task navigates to the course detail page with that task highlighted
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Calendar, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '../shared';
import type { Task, Course } from '../../../l5-presentation/types';

export interface TaskWithCourse {
  task: Task;
  course: Course;
  daysUntilDue: number | null;
}

export interface TaskListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tasks: TaskWithCourse[];
  type: 'pending' | 'overdue';
}

function formatDueDate(dueAt: string | null, daysUntilDue: number | null): string {
  if (!dueAt) return 'No due date';

  if (daysUntilDue === null) return 'No due date';
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)} days overdue`;
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;

  const date = new Date(dueAt);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getUrgencyLevel(daysUntilDue: number | null): 'critical' | 'high' | 'medium' | 'low' {
  if (daysUntilDue === null) return 'low';
  if (daysUntilDue < 0) return 'critical';
  if (daysUntilDue <= 1) return 'critical';
  if (daysUntilDue <= 3) return 'high';
  if (daysUntilDue <= 7) return 'medium';
  return 'low';
}

export function TaskListModal({ isOpen, onClose, title, tasks, type }: TaskListModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleTaskClick = (task: Task, course: Course) => {
    onClose();
    // Navigate to course detail with task highlight parameter
    navigate(`/course/${course.id}?highlightTask=${task.id}`);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleBackdropClick}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            {type === 'overdue' ? (
              <AlertTriangle size={20} color="var(--color-error)" />
            ) : (
              <Clock size={20} color="var(--color-blue)" />
            )}
            <h2 style={styles.title}>{title}</h2>
            <span style={styles.count}>({tasks.length})</span>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {tasks.length === 0 ? (
            <div style={styles.emptyState}>
              <span>No {type} tasks</span>
            </div>
          ) : (
            <div style={styles.taskList}>
              {tasks.map((item, index) => (
                <div
                  key={item.task.id}
                  style={{
                    ...styles.taskItem,
                    borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
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
                      backgroundColor:
                        getUrgencyLevel(item.daysUntilDue) === 'critical'
                          ? 'var(--color-critical)'
                          : getUrgencyLevel(item.daysUntilDue) === 'high'
                            ? 'var(--color-high)'
                            : getUrgencyLevel(item.daysUntilDue) === 'medium'
                              ? 'var(--color-medium)'
                              : 'var(--color-low)',
                    }}
                  />

                  {/* Content */}
                  <div style={styles.taskContent}>
                    <div style={styles.taskTopRow}>
                      <span style={styles.courseCode}>{item.course.code}</span>
                      <Badge variant={getUrgencyLevel(item.daysUntilDue)} size="sm">
                        {formatDueDate(item.task.dueAt, item.daysUntilDue)}
                      </Badge>
                    </div>
                    <div style={styles.taskTitle}>{item.task.title}</div>
                    <div style={styles.taskMeta}>
                      {item.task.weight > 0 && (
                        <span style={styles.taskWeight}>{item.task.weight}% weight</span>
                      )}
                    </div>
                  </div>

                  {/* Go to course indicator */}
                  <div style={styles.goIcon}>
                    <ExternalLink size={16} color="var(--text-muted)" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: '560px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-light)',
  },

  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  count: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'background-color var(--transition-fast)',
  },

  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 0,
  },

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  taskList: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskItem: {
    display: 'flex',
    alignItems: 'stretch',
    padding: 'var(--space-3) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  priorityBar: {
    width: '4px',
    borderRadius: '2px',
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
    justifyContent: 'space-between',
    marginBottom: 'var(--space-1)',
  },

  courseCode: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-navy)',
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
  },

  taskWeight: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  goIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'var(--space-3)',
    flexShrink: 0,
  },
};

export default TaskListModal;
