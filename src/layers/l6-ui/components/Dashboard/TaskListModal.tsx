/**
 * TaskListModal — Dashboard variant.
 *
 * Displays a modal with a list of pending or overdue tasks. Clicking a task
 * navigates to the course detail page with that task highlighted.
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned — `Modal.Header` carrying a type-specific icon
 * (AlertTriangle for overdue, Clock for pending), title, and a count
 * appended via the header's trailing `children` slot. `Modal.Content`
 * (scrollable) renders the task list. No footer; rows are clickable.
 *
 * Dismiss: standard Esc / backdrop click handled by the primitive — we
 * dropped the local Esc handler that used to do this.
 *
 * z-index: default 1000 — opened from the dashboard, not nested above any
 * other modal in current flows.
 *
 * NOT to be confused with `CourseDetail/components/TaskListModal.tsx`,
 * which is a different component with its own much larger prop surface.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '../shared';
import { formatSmartDate, getBadgeUrgency } from '../../constants';
import type { Task, Course } from '../../../l5-presentation/types';
import { Modal } from '../primitives/Modal';

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

export function TaskListModal({
  isOpen,
  onClose,
  title,
  tasks,
  type,
}: TaskListModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleTaskClick = (task: Task, course: Course) => {
    onClose();
    // Navigate to course detail with task highlight parameter
    navigate(`/course/${course.id}?highlightTask=${task.id}`);
  };

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <Modal.Header
        title={title}
        icon={
          type === 'overdue' ? (
            <AlertTriangle size={20} color="var(--color-error)" />
          ) : (
            <Clock size={20} color="var(--color-blue)" />
          )
        }
        onClose={onClose}
      >
        <span style={styles.count}>({tasks.length})</span>
      </Modal.Header>

      <Modal.Content padded={false} maxHeight="70vh">
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
                      getBadgeUrgency(item.daysUntilDue) === 'critical'
                        ? 'var(--color-critical)'
                        : getBadgeUrgency(item.daysUntilDue) === 'high'
                          ? 'var(--color-high)'
                          : getBadgeUrgency(item.daysUntilDue) === 'medium'
                            ? 'var(--color-medium)'
                            : 'var(--color-low)',
                  }}
                />

                {/* Content */}
                <div style={styles.taskContent}>
                  <div style={styles.taskTopRow}>
                    <span style={styles.courseCode}>{item.course.code}</span>
                    <Badge variant={getBadgeUrgency(item.daysUntilDue)} size="sm">
                      {formatSmartDate(item.task.dueAt)}
                    </Badge>
                  </div>
                  <div style={styles.taskTitle}>{item.task.title}</div>
                  {item.task.weight > 0 && (
                    <div style={styles.taskMeta}>
                      <span style={styles.taskWeight}>{item.task.weight}% weight</span>
                    </div>
                  )}
                </div>

                {/* Go to course indicator */}
                <div style={styles.goIcon}>
                  <ExternalLink size={16} color="var(--text-muted)" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal.Content>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  count: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    marginLeft: 'var(--space-1)',
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
