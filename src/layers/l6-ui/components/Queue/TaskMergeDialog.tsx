/**
 * TaskMergeDialog Component
 * Side-by-side comparison dialog for merging a queued Canvas task with a user task
 */

import React, { useState } from 'react';
import { X, GitMerge, Calendar, FileText, Cloud, User } from 'lucide-react';
import type { QueuedTask, Task } from '../../../l5-presentation/types';
import { TASK_TYPES, formatSmartDate } from '../../constants';

interface TaskMergeDialogProps {
  isOpen: boolean;
  queuedTask: QueuedTask;
  userTask: Task;
  onMerge: (params: {
    queueId: number;
    userTaskId: number;
    keepFromUser?: { notes?: boolean; dueAt?: boolean; title?: boolean };
  }) => Promise<{ success: boolean }>;
  onCancel: () => void;
}

// Format date for display
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  return formatSmartDate(dateStr);
}

// Get task type label
function getTaskTypeLabel(taskType: string | null | undefined): string {
  if (!taskType) return 'Unspecified';
  const type = TASK_TYPES.find((t) => t.value === taskType);
  return type?.label || taskType;
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
  } as React.CSSProperties,
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  } as React.CSSProperties,
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-5)',
  } as React.CSSProperties,
  description: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-5)',
    lineHeight: 1.5,
  } as React.CSSProperties,
  comparison: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
  } as React.CSSProperties,
  column: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  } as React.CSSProperties,
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-bold)',
    borderBottom: '1px solid var(--border-default)',
  } as React.CSSProperties,
  canvasHeader: {
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
  } as React.CSSProperties,
  userHeader: {
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
  } as React.CSSProperties,
  columnContent: {
    padding: 'var(--space-4)',
  } as React.CSSProperties,
  field: {
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,
  fieldLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 'var(--space-1)',
  } as React.CSSProperties,
  fieldValue: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    lineHeight: 1.5,
  } as React.CSSProperties,
  fieldValueMuted: {
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  optionsSection: {
    marginTop: 'var(--space-5)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: 'var(--radius-md)',
  } as React.CSSProperties,
  optionsTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-3)',
  } as React.CSSProperties,
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  } as React.CSSProperties,
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: 'var(--color-primary)',
  } as React.CSSProperties,
  optionLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-tertiary)',
  } as React.CSSProperties,
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  } as React.CSSProperties,
  mergeButton: {
    backgroundColor: 'var(--color-primary)',
    color: 'white',
  } as React.CSSProperties,
};

export function TaskMergeDialog({
  isOpen,
  queuedTask,
  userTask,
  onMerge,
  onCancel,
}: TaskMergeDialogProps) {
  const [keepNotes, setKeepNotes] = useState(true);
  const [keepDueDate, setKeepDueDate] = useState(false);
  const [keepTitle, setKeepTitle] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  if (!isOpen) return null;

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await onMerge({
        queueId: queuedTask.id,
        userTaskId: userTask.id,
        keepFromUser: {
          notes: keepNotes,
          dueAt: keepDueDate,
          title: keepTitle,
        },
      });
      onCancel(); // Close dialog on success
    } finally {
      setIsMerging(false);
    }
  };

  // Check if there are differences worth noting
  const hasDifferentTitle = queuedTask.title !== userTask.title;
  const hasDifferentDueDate = queuedTask.dueAt !== userTask.dueAt;
  const userHasNotes = Boolean(userTask.description);

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            <GitMerge size={20} />
            Merge Tasks
          </span>
          <button
            style={styles.closeButton}
            onClick={onCancel}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={styles.content}>
          <p style={styles.description}>
            This Canvas assignment appears to match a task you created. Merging will link
            them together so grades and updates from Canvas automatically sync to your
            task.
          </p>

          <div style={styles.comparison}>
            {/* Canvas Task Column */}
            <div style={styles.column}>
              <div style={{ ...styles.columnHeader, ...styles.canvasHeader }}>
                <Cloud size={16} />
                Canvas Assignment
              </div>
              <div style={styles.columnContent}>
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>
                    <FileText size={12} />
                    Title
                  </div>
                  <div style={styles.fieldValue}>{queuedTask.title}</div>
                </div>
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>
                    <Calendar size={12} />
                    Due Date
                  </div>
                  <div
                    style={{
                      ...styles.fieldValue,
                      ...(queuedTask.dueAt ? {} : styles.fieldValueMuted),
                    }}
                  >
                    {formatDate(queuedTask.dueAt)}
                  </div>
                </div>
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Type</div>
                  <div style={styles.fieldValue}>
                    {getTaskTypeLabel(queuedTask.taskType)}
                  </div>
                </div>
              </div>
            </div>

            {/* User Task Column */}
            <div style={styles.column}>
              <div style={{ ...styles.columnHeader, ...styles.userHeader }}>
                <User size={16} />
                Your Task
              </div>
              <div style={styles.columnContent}>
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>
                    <FileText size={12} />
                    Title
                  </div>
                  <div style={styles.fieldValue}>{userTask.title}</div>
                </div>
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>
                    <Calendar size={12} />
                    Due Date
                  </div>
                  <div
                    style={{
                      ...styles.fieldValue,
                      ...(userTask.dueAt ? {} : styles.fieldValueMuted),
                    }}
                  >
                    {formatDate(userTask.dueAt)}
                  </div>
                </div>
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Type</div>
                  <div style={styles.fieldValue}>
                    {getTaskTypeLabel(userTask.taskType)}
                  </div>
                </div>
                {userTask.description && (
                  <div style={styles.field}>
                    <div style={styles.fieldLabel}>Notes</div>
                    <div
                      style={{
                        ...styles.fieldValue,
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {userTask.description.length > 100
                        ? `${userTask.description.substring(0, 100)}...`
                        : userTask.description}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Merge Options */}
          {(userHasNotes || hasDifferentDueDate || hasDifferentTitle) && (
            <div style={styles.optionsSection}>
              <div style={styles.optionsTitle}>Keep from your task:</div>
              {userHasNotes && (
                <div style={styles.optionRow}>
                  <input
                    type="checkbox"
                    id="keepNotes"
                    checked={keepNotes}
                    onChange={(e) => setKeepNotes(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <label htmlFor="keepNotes" style={styles.optionLabel}>
                    My notes/description
                  </label>
                </div>
              )}
              {hasDifferentDueDate && userTask.dueAt && (
                <div style={styles.optionRow}>
                  <input
                    type="checkbox"
                    id="keepDueDate"
                    checked={keepDueDate}
                    onChange={(e) => setKeepDueDate(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <label htmlFor="keepDueDate" style={styles.optionLabel}>
                    My due date ({formatDate(userTask.dueAt)})
                  </label>
                </div>
              )}
              {hasDifferentTitle && (
                <div style={styles.optionRow}>
                  <input
                    type="checkbox"
                    id="keepTitle"
                    checked={keepTitle}
                    onChange={(e) => setKeepTitle(e.target.checked)}
                    style={styles.checkbox}
                  />
                  <label htmlFor="keepTitle" style={styles.optionLabel}>
                    My title ("{userTask.title}")
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            style={{ ...styles.button, ...styles.cancelButton }}
            onClick={onCancel}
            disabled={isMerging}
          >
            Cancel
          </button>
          <button
            style={{ ...styles.button, ...styles.mergeButton }}
            onClick={handleMerge}
            disabled={isMerging}
          >
            <GitMerge size={16} />
            {isMerging ? 'Merging...' : 'Merge Tasks'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskMergeDialog;
