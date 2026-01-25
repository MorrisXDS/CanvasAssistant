/**
 * TaskDetailModal Component
 * Popup modal showing task details with navigation to course
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Calendar,
  BookOpen,
  Target,
  CheckCircle,
  Circle,
  ExternalLink,
  Clock,
  Edit2,
  Trash2,
} from 'lucide-react';
import type { Task, Course } from '../../../l5-presentation/types';
import type { CalendarEvent } from './CalendarGrid';

interface TaskDetailModalProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onToggleComplete?: (task: Task) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No due date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getTimeUntilDue(dueAt: string | null): { text: string; urgency: 'overdue' | 'urgent' | 'soon' | 'normal' } {
  if (!dueAt) return { text: '', urgency: 'normal' };

  const now = new Date();
  const due = new Date(dueAt);
  const hoursUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil < 0) {
    const hoursAgo = Math.abs(hoursUntil);
    if (hoursAgo < 24) {
      return { text: `${Math.round(hoursAgo)} hours overdue`, urgency: 'overdue' };
    }
    const daysAgo = Math.round(hoursAgo / 24);
    return { text: `${daysAgo} day${daysAgo > 1 ? 's' : ''} overdue`, urgency: 'overdue' };
  }

  if (hoursUntil < 24) {
    return { text: `Due in ${Math.round(hoursUntil)} hours`, urgency: 'urgent' };
  }

  if (hoursUntil < 72) {
    const days = Math.round(hoursUntil / 24);
    return { text: `Due in ${days} day${days > 1 ? 's' : ''}`, urgency: 'soon' };
  }

  const days = Math.round(hoursUntil / 24);
  return { text: `Due in ${days} days`, urgency: 'normal' };
}

export function TaskDetailModal({
  isOpen,
  event,
  onClose,
  onToggleComplete,
  onEdit,
  onDelete,
}: TaskDetailModalProps) {
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  // Reset delete confirm state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen || !event) return null;

  const isTask = event.type === 'task';
  const task = isTask ? event.task : null;
  const course = isTask ? event.course : null;
  const importedEvent = event.type === 'imported' ? event.event : null;

  const handleGoToCourse = () => {
    if (course) {
      onClose();
      navigate(`/course/${course.id}`);
    }
  };

  const handleToggleComplete = () => {
    if (task && onToggleComplete) {
      onToggleComplete(task);
    }
  };

  const timeUntil = task?.dueAt ? getTimeUntilDue(task.dueAt) : null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div
            style={{
              ...styles.colorIndicator,
              backgroundColor: isTask ? (course?.color || '#007FA3') : (importedEvent?.color || '#6366F1'),
            }}
          />
          <div style={styles.headerContent}>
            <h2 style={styles.title}>
              {isTask ? task?.title : importedEvent?.title}
            </h2>
            {isTask && course && (
              <span style={styles.courseCode}>{course.code}</span>
            )}
            {!isTask && importedEvent?.calendarName && (
              <span style={styles.courseCode}>{importedEvent.calendarName}</span>
            )}
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Task-specific content */}
          {isTask && task && (
            <>
              {/* Due Date & Status */}
              <div style={styles.section}>
                <div style={styles.row}>
                  <Calendar size={16} color="var(--text-muted)" />
                  <span style={styles.label}>Due:</span>
                  <span style={styles.value}>{formatDate(task.dueAt)}</span>
                </div>
                {timeUntil && timeUntil.text && (
                  <div
                    style={{
                      ...styles.urgencyBadge,
                      backgroundColor:
                        timeUntil.urgency === 'overdue'
                          ? 'var(--color-error-bg)'
                          : timeUntil.urgency === 'urgent'
                          ? 'var(--color-warning-bg)'
                          : timeUntil.urgency === 'soon'
                          ? 'var(--color-info-bg)'
                          : 'var(--bg-app)',
                      color:
                        timeUntil.urgency === 'overdue'
                          ? 'var(--color-error)'
                          : timeUntil.urgency === 'urgent'
                          ? 'var(--color-warning)'
                          : timeUntil.urgency === 'soon'
                          ? 'var(--color-info)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    <Clock size={12} />
                    {timeUntil.text}
                  </div>
                )}
              </div>

              {/* Weight & Grade */}
              {(task.weight > 0 || task.grade !== null) && (
                <div style={styles.section}>
                  <div style={styles.statsRow}>
                    {task.weight > 0 && (
                      <div style={styles.statItem}>
                        <span style={styles.statLabel}>Weight</span>
                        <span style={styles.statValue}>{task.weight}%</span>
                      </div>
                    )}
                    {task.grade !== null && (
                      <div style={styles.statItem}>
                        <span style={styles.statLabel}>Grade</span>
                        <span style={{ ...styles.statValue, color: 'var(--color-success)' }}>
                          {task.grade.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {task.pointsPossible !== null && (
                      <div style={styles.statItem}>
                        <span style={styles.statLabel}>Points</span>
                        <span style={styles.statValue}>{task.pointsPossible}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div style={styles.section}>
                  <div style={styles.descriptionLabel}>Description</div>
                  <div
                    style={styles.description}
                    dangerouslySetInnerHTML={{ __html: task.description }}
                  />
                </div>
              )}

              {/* Completion Status */}
              <div style={styles.section}>
                <button
                  style={{
                    ...styles.completeButton,
                    backgroundColor: task.isCompleted ? 'var(--color-success-bg)' : 'var(--bg-app)',
                    color: task.isCompleted ? 'var(--color-success)' : 'var(--text-secondary)',
                  }}
                  onClick={handleToggleComplete}
                >
                  {task.isCompleted ? (
                    <CheckCircle size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                  {task.isCompleted ? 'Completed' : 'Mark as Complete'}
                </button>
              </div>
            </>
          )}

          {/* Imported event content */}
          {!isTask && importedEvent && (
            <>
              <div style={styles.section}>
                <div style={styles.row}>
                  <Calendar size={16} color="var(--text-muted)" />
                  <span style={styles.label}>Date:</span>
                  <span style={styles.value}>
                    {importedEvent.allDay
                      ? new Date(importedEvent.startAt).toLocaleDateString()
                      : formatDate(importedEvent.startAt)}
                  </span>
                </div>
                {importedEvent.location && (
                  <div style={styles.row}>
                    <Target size={16} color="var(--text-muted)" />
                    <span style={styles.label}>Location:</span>
                    <span style={styles.value}>{importedEvent.location}</span>
                  </div>
                )}
              </div>
              {importedEvent.description && (
                <div style={styles.section}>
                  <div style={styles.descriptionLabel}>Description</div>
                  <div style={styles.description}>{importedEvent.description}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div style={styles.footer}>
          {/* Left side - Edit/Delete for editable events */}
          {!isTask && importedEvent && (importedEvent.sourceType === 'user' || importedEvent.sourceType === 'imported') && (
            <div style={styles.footerLeft}>
              {showDeleteConfirm ? (
                <div style={styles.deleteConfirm}>
                  <span style={styles.deleteText}>Delete event?</span>
                  <button
                    style={styles.confirmDeleteButton}
                    onClick={() => {
                      onDelete?.();
                      setShowDeleteConfirm(false);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    style={styles.cancelDeleteButton}
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {onEdit && (
                    <button style={styles.editButton} onClick={onEdit}>
                      <Edit2 size={14} />
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button style={styles.deleteButton} onClick={() => setShowDeleteConfirm(true)}>
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <div style={styles.footerRight}>
            {isTask && course && (
              <button style={styles.primaryButton} onClick={handleGoToCourse}>
                <BookOpen size={16} />
                Go to Course
              </button>
            )}
            <button style={styles.secondaryButton} onClick={onClose}>
              Close
            </button>
          </div>
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
    padding: 'var(--space-4)',
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  colorIndicator: {
    width: '4px',
    height: '100%',
    minHeight: '40px',
    borderRadius: '2px',
    flexShrink: 0,
  },

  headerContent: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
    lineHeight: 1.3,
  },

  courseCode: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-1)',
    display: 'block',
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
    color: 'var(--text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
  },

  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-4)',
  },

  section: {
    marginBottom: 'var(--space-4)',
  },

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },

  label: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },

  value: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontWeight: 'var(--font-medium)',
  },

  urgencyBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },

  statsRow: {
    display: 'flex',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    minWidth: '80px',
  },

  statLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  statValue: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  descriptionLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 'var(--space-2)',
  },

  description: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    maxHeight: '150px',
    overflow: 'auto',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  completeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-4)',
    borderTop: '1px solid var(--border-light)',
  },

  footerLeft: {
    display: 'flex',
    gap: 'var(--space-2)',
    alignItems: 'center',
  },

  footerRight: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginLeft: 'auto',
  },

  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  deleteButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  deleteConfirm: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  deleteText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  confirmDeleteButton: {
    padding: 'var(--space-1) var(--space-3)',
    backgroundColor: 'var(--color-error)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  cancelDeleteButton: {
    padding: 'var(--space-1) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  secondaryButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
};

export default TaskDetailModal;
