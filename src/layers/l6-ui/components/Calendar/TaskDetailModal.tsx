/**
 * TaskDetailModal — popup modal showing task/calendar-event details with
 * navigation to course.
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned — custom header (color indicator + title + course code +
 * close button — we do NOT use Modal.Header because the left-edge color
 * indicator is a structural part of the header chrome), Modal.Content
 * (scrollable detail rows), Modal.Footer (Edit on the left via
 * `align="between"`, primary/secondary on the right).
 *
 * Dismiss: standard click-on-backdrop closes (via primitive). Esc is
 * handled by the component's own keymap (shared with E/G/X/Delete
 * shortcuts), so we pass `closeOnEscape={false}` to the primitive to
 * avoid double-handling.
 *
 * Stacking: a `ConfirmDialog` for Delete confirmation may stack on top.
 * ConfirmDialog uses `zIndex={1100}` and its own capture-phase Esc handler;
 * this modal uses the default 1000 tier so the confirm dialog sits above.
 *
 * Inline styles: the previous `TaskDetailModal.styles.ts` file is removed —
 * only this component imported it, and the styles that matter for the
 * remaining custom chrome (header color indicator, content rows, footer
 * sections) are inlined below.
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
  MapPin,
} from 'lucide-react';
import type { Task } from '../../../l5-presentation/types';
import type { CalendarEvent } from './CalendarGrid';
import { HtmlContent } from '../shared';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useStore } from '../../../l5-presentation/store';
import { Modal } from '../primitives/Modal';
import { useModalHotkeys } from '../../hooks/useStackAwareHotkeys';
import { TASK_DETAIL_MODAL_SHORTCUTS } from '../../constants/modalShortcuts';
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

  // Delete is supported for:
  // - Task events (dispatches DeleteTask, removing the underlying task)
  // - User-created / imported standalone calendar events (no linked task)
  const directImportedEvent = event?.type === 'imported' ? event.event : null;
  const isStandaloneCalendarEvent =
    !!directImportedEvent &&
    !directImportedEvent.taskId &&
    (directImportedEvent.sourceType === 'user' ||
      directImportedEvent.sourceType === 'imported');
  const canDelete = !!onDelete && (event?.type === 'task' || isStandaloneCalendarEvent);

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
    <Modal
      isOpen
      onClose={onClose}
      // Our own Esc handler above owns dismissal (also handles E/G/X/Delete
      // shortcuts) — keep the primitive's listener disabled to avoid
      // double-handling.
      closeOnEscape={false}
      size="md"
      shortcuts={TASK_DETAIL_MODAL_SHORTCUTS}
    >
      {/* Hotkeys live INSIDE <Modal> so useModalHotkeys can read
          ModalIdContext and self-gate to "this modal is topmost" (ADR-0006).
          Rendered as the FIRST child of <Modal> — NOT a sibling — because
          ModalIdContext only propagates DOWN. Skipped while the delete
          ConfirmDialog is open so it keeps keyboard ownership (defence-in-
          depth: the ConfirmDialog is itself a <Modal> on the stack, so the
          topmost-gate already disables these keys; the conditional render is
          belt-and-suspenders). */}
      {!showDeleteConfirm && (
        <TaskDetailHotkeys
          onClose={onClose}
          onEdit={onEdit}
          onToggleComplete={onToggleComplete}
          task={task}
          canDelete={canDelete}
          onGoToCourse={handleGoToCourse}
          onRequestDelete={() => setShowDeleteConfirm(true)}
        />
      )}
      {/* Custom header — color indicator on left edge is structural so we
          don't use Modal.Header here. */}
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
        <button style={styles.closeButton} onClick={onClose} aria-label="Close modal">
          <X size={20} />
        </button>
      </div>

      <Modal.Content maxHeight="60vh">
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
      </Modal.Content>

      {/* Footer Actions — Delete is keyboard-only (Del key → ConfirmDialog) */}
      <Modal.Footer align={onEdit ? 'between' : 'end'}>
        {onEdit && (
          <button style={styles.editButton} onClick={onEdit} title="Edit Event (E)">
            <Edit2 size={14} />
            Edit Event
          </button>
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
      </Modal.Footer>

      {/* Delete confirmation (replaces inline confirm) */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={isTask ? 'Delete task?' : 'Delete event?'}
        message={
          isTask
            ? `"${task?.title ?? 'this task'}" will be deleted from the course. This cannot be undone.`
            : `"${importedEvent?.title ?? 'this event'}" will be removed from your calendar. This cannot be undone.`
        }
        type="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete?.();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Render-null inner component — its only job is to call `useModalHotkeys` from
// INSIDE the <Modal> subtree so it can read `ModalIdContext` and self-gate to
// the topmost modal (ADR-0006). Mirrors `DuplicateWarningModal.ParentHotkeys`.
// The parent passes state/callbacks/derived flags down as props so each
// handler acts on fresh values via React's normal re-render.
//
// Guards preserved from the former raw `document` listener:
//   • INPUT/TEXTAREA/SELECT/contentEditable suppression → react-hotkeys-hook's
//     default (`enableOnFormTags:false`, `enableOnContentEditable:false`); we
//     do NOT pass `enableOnFormTags: true`.
//   • Modifier-key skip (Ctrl/Meta/Alt) → bare-letter combos only match an
//     unmodified press, so `Ctrl+E`/`Cmd+E`/`Alt+E` register as different
//     combos and never fire these handlers.
// ---------------------------------------------------------------------------
interface TaskDetailHotkeysProps {
  onClose: () => void;
  onEdit?: () => void;
  onToggleComplete?: (task: Task) => void;
  task: Task | null | undefined;
  canDelete: boolean;
  onGoToCourse: () => void;
  onRequestDelete: () => void;
}

function TaskDetailHotkeys({
  onClose,
  onEdit,
  onToggleComplete,
  task,
  canDelete,
  onGoToCourse,
  onRequestDelete,
}: TaskDetailHotkeysProps) {
  useModalHotkeys('escape', (e) => {
    e.preventDefault();
    onClose();
  });
  useModalHotkeys('e', (e) => {
    if (onEdit) {
      e.preventDefault();
      onEdit();
    }
  });
  useModalHotkeys('g', (e) => {
    e.preventDefault();
    onGoToCourse();
  });
  useModalHotkeys('x', (e) => {
    if (task && onToggleComplete) {
      e.preventDefault();
      onToggleComplete(task);
    }
  });
  useModalHotkeys('delete, backspace', (e) => {
    if (canDelete) {
      e.preventDefault();
      onRequestDelete();
    }
  });
  return null;
}

const styles: Record<string, React.CSSProperties> = {
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
    lineHeight: 1.5,
    maxHeight: '100px',
    overflow: 'auto',
    padding: 'var(--space-2)',
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

  footerRight: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  editButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
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
    whiteSpace: 'nowrap',
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
    whiteSpace: 'nowrap',
  },
};

export default TaskDetailModal;
