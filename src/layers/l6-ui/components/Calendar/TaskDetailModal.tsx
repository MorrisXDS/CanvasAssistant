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
  Clock,
  Edit2,
  Trash2,
  MapPin,
} from 'lucide-react';
import type { Task } from '../../../l5-presentation/types';
import type { CalendarEvent } from './CalendarGrid';
import { HtmlContent } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import { styles } from './TaskDetailModal.styles';
import { formatSmartDate } from '../../constants';

interface TaskDetailModalProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onToggleComplete?: (task: Task) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function getTimeUntilDue(dueAt: string | null): {
  text: string;
  urgency: 'overdue' | 'urgent' | 'soon' | 'normal';
} {
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
    return {
      text: `${daysAgo} day${daysAgo > 1 ? 's' : ''} overdue`,
      urgency: 'overdue',
    };
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
  const tasks = useStore((state) => state.tasks);
  const courses = useStore((state) => state.courses);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'e' || e.key === 'E') {
        if (onEdit) {
          e.preventDefault();
          onEdit();
        }
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        handleGoToCourse();
      } else if (e.key === 'x' || e.key === 'X') {
        if (task && onToggleComplete) {
          e.preventDefault();
          onToggleComplete(task);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (onDelete) {
          e.preventDefault();
          setShowDeleteConfirm(true);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose, onEdit, onDelete, onToggleComplete]);

  // Reset delete confirm state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen || !event) return null;

  // Check if this is a direct task event OR an imported event linked to a task
  const importedEvent = event.type === 'imported' ? event.event : null;
  const linkedTaskId = importedEvent?.taskId;

  // If imported event has a taskId, look up the actual task to show task view
  const linkedTask = linkedTaskId ? tasks.find((t) => t.id === linkedTaskId) : null;
  const linkedCourse = linkedTask
    ? courses.find((c) => c.id === linkedTask.courseId)
    : null;

  // Use linked task if available, otherwise use direct task event
  const isTask = event.type === 'task' || Boolean(linkedTask);
  const task = event.type === 'task' ? event.task : linkedTask;
  const course = event.type === 'task' ? event.course : linkedCourse;

  const handleGoToCourse = () => {
    if (course) {
      // Don't call onClose() here — React Router unmounts this modal on
      // navigation, and calling setSelectedEvent(null) beforehand would clear
      // the sessionStorage entry our restore-on-mount effect depends on.
      const targetTaskId = task?.id;
      const url = targetTaskId
        ? `/course/${course.id}?highlightTask=${targetTaskId}`
        : `/course/${course.id}`;
      navigate(url);
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
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <div
            style={{
              ...styles.colorIndicator,
              backgroundColor: isTask
                ? course?.color || '#007FA3'
                : importedEvent?.color || '#6366F1',
            }}
          />
          <div style={styles.headerContent}>
            <h2 style={styles.title}>{isTask ? task?.title : importedEvent?.title}</h2>
            {isTask && course && <span style={styles.courseCode}>{course.code}</span>}
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
              {/* Start Date (if set) & Due Date */}
              <div style={styles.section}>
                {/* Show Start Date if set (not epoch) */}
                {task.unlockAt && new Date(task.unlockAt).getTime() >= 86400000 && (
                  <div style={styles.row}>
                    <Clock size={16} color="var(--text-muted)" />
                    <span style={styles.label}>Start:</span>
                    <span style={styles.value}>{formatSmartDate(task.unlockAt)}</span>
                  </div>
                )}
                <div style={styles.row}>
                  <Calendar size={16} color="var(--text-muted)" />
                  <span style={styles.label}>Due:</span>
                  <span style={styles.value}>{formatSmartDate(task.dueAt)}</span>
                </div>
                {/* Location */}
                {task.location && (
                  <div style={styles.row}>
                    <MapPin size={16} color="var(--text-muted)" />
                    <span style={styles.label}>Location:</span>
                    <span style={styles.value}>{task.location}</span>
                  </div>
                )}
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
                        <span
                          style={{ ...styles.statValue, color: 'var(--color-success)' }}
                        >
                          {task.grade.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div style={styles.section}>
                  <div style={styles.descriptionLabel}>Description</div>
                  <HtmlContent
                    html={task.description}
                    style={styles.description}
                    maxHeight={200}
                  />
                </div>
              )}

              {/* Completion Status */}
              <div style={styles.section}>
                <button
                  style={{
                    ...styles.completeButton,
                    backgroundColor: task.isCompleted
                      ? 'var(--color-success-bg)'
                      : 'var(--bg-app)',
                    color: task.isCompleted
                      ? 'var(--color-success)'
                      : 'var(--text-secondary)',
                  }}
                  onClick={handleToggleComplete}
                >
                  {task.isCompleted ? <CheckCircle size={16} /> : <Circle size={16} />}
                  {task.isCompleted ? 'Completed' : 'Mark as Complete'}
                </button>
              </div>
            </>
          )}

          {/* Imported event content */}
          {!isTask && importedEvent && (
            <>
              <div style={styles.section}>
                {/* Check if this is a deadline event (start_at is epoch) or duration event */}
                {(() => {
                  // Use timestamp check (< 1 day from epoch) to handle timezone display issues
                  const isDeadlineEvent =
                    new Date(importedEvent.startAt).getTime() < 86400000;
                  const hasDuration =
                    !isDeadlineEvent &&
                    importedEvent.endAt &&
                    importedEvent.startAt !== importedEvent.endAt;

                  if (isDeadlineEvent) {
                    // Deadline event - only show due date
                    return (
                      <div style={styles.row}>
                        <Calendar size={16} color="var(--text-muted)" />
                        <span style={styles.label}>Due:</span>
                        <span style={styles.value}>
                          {importedEvent.endAt
                            ? formatSmartDate(importedEvent.endAt)
                            : 'No due date'}
                        </span>
                      </div>
                    );
                  } else if (hasDuration) {
                    // Duration event - show both start and end
                    return (
                      <>
                        <div style={styles.row}>
                          <Clock size={16} color="var(--text-muted)" />
                          <span style={styles.label}>Start:</span>
                          <span style={styles.value}>
                            {importedEvent.allDay
                              ? new Date(importedEvent.startAt).toLocaleDateString()
                              : formatSmartDate(importedEvent.startAt)}
                          </span>
                        </div>
                        <div style={styles.row}>
                          <Calendar size={16} color="var(--text-muted)" />
                          <span style={styles.label}>End:</span>
                          <span style={styles.value}>
                            {importedEvent.allDay
                              ? new Date(importedEvent.endAt!).toLocaleDateString()
                              : formatSmartDate(importedEvent.endAt)}
                          </span>
                        </div>
                      </>
                    );
                  } else {
                    // Single point in time event
                    return (
                      <div style={styles.row}>
                        <Calendar size={16} color="var(--text-muted)" />
                        <span style={styles.label}>Date:</span>
                        <span style={styles.value}>
                          {importedEvent.allDay
                            ? new Date(importedEvent.startAt).toLocaleDateString()
                            : formatSmartDate(importedEvent.startAt)}
                        </span>
                      </div>
                    );
                  }
                })()}
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
          {!isTask &&
            importedEvent &&
            (importedEvent.sourceType === 'user' ||
              importedEvent.sourceType === 'imported') && (
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
                      <button
                        style={styles.deleteButton}
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          {/* Edit event for task events */}
          {isTask && onEdit && (
            <div style={styles.footerLeft}>
              <button style={styles.editButton} onClick={onEdit} title="Edit Event (E)">
                <Edit2 size={14} />
                Edit Event
              </button>
            </div>
          )}
          <div style={styles.footerRight}>
            {isTask && course && (
              <button
                style={styles.primaryButton}
                onClick={handleGoToCourse}
                title="Go to Course (G)"
              >
                <BookOpen size={16} />
                Go to Course
              </button>
            )}
            <button style={styles.secondaryButton} onClick={onClose} title="Close (Esc)">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailModal;
