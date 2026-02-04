/**
 * QueuedTaskCard Component
 * Minimal row layout for queued Canvas tasks
 * Ultra-compact design with expandable edit form matching task edit style
 */

import React, { useState } from 'react';
import { Check, X, Link2, ChevronDown, ChevronRight } from 'lucide-react';
import type { QueuedTask } from '../../../l5-presentation/types';
import { TASK_TYPES } from '../../constants';

export interface QueuedTaskEdits {
  title?: string;
  dueAt?: string | null;
  startAt?: string | null;
  taskType?: string | null;
  weight?: number | null;
  location?: string | null;
  notes?: string | null;
}

interface QueuedTaskCardProps {
  queuedTask: QueuedTask;
  onAccept: (queueId: number, edits?: QueuedTaskEdits) => void;
  onReject: (queueId: number) => void;
  onLink: (queueId: number) => void;
}

// Format date for input (YYYY-MM-DDTHH:mm format for datetime-local)
function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Format date for display (compact)
function formatDateCompact(dateStr: string | null | undefined): string {
  if (!dateStr) return '–'; // en-dash for empty
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Get task type label (short version)
function getTaskTypeShort(taskType: string | null | undefined): string {
  if (!taskType) return 'Task';
  const type = TASK_TYPES.find((t) => t.value === taskType);
  return type?.label || taskType;
}

const styles = {
  // Row styles
  row: {
    display: 'grid',
    gridTemplateColumns: '28px 2fr 1fr 1fr 1fr',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-light)',
    minHeight: '44px',
    cursor: 'pointer',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  rowHover: {
    backgroundColor: 'var(--bg-secondary)',
  } as React.CSSProperties,
  expandToggle: {
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  title: {
    minWidth: 0,
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  taskType: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    textAlign: 'left' as const,
  } as React.CSSProperties,
  dueDate: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  iconButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as React.CSSProperties,
  rejectBtn: {
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  linkBtn: {
    backgroundColor: 'transparent',
    color: 'var(--color-info)',
  } as React.CSSProperties,
  acceptBtn: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
  } as React.CSSProperties,

  // Expanded form styles (matching AddTaskForm / task edit form)
  expandedForm: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  formInput: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
  } as React.CSSProperties,
  formRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
  } as React.CSSProperties,
  formLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    fontWeight: 'var(--font-medium)',
  } as React.CSSProperties,
  formDateInput: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
  } as React.CSSProperties,
  formSelect: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    width: '100%',
    outline: 'none',
  } as React.CSSProperties,
  formInputSmall: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    width: '100%',
  } as React.CSSProperties,
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-2)',
  } as React.CSSProperties,
  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  } as React.CSSProperties,
  saveButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    backgroundColor: 'var(--color-success)',
    color: 'white',
    cursor: 'pointer',
  } as React.CSSProperties,
  pointsInfo: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  } as React.CSSProperties,
  descriptionViewport: {
    maxHeight: '120px',
    overflowY: 'auto' as const,
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    lineHeight: '1.5',
  } as React.CSSProperties,
  descriptionEmpty: {
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  } as React.CSSProperties,
  notesTextarea: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    minHeight: '80px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    width: '100%',
  } as React.CSSProperties,
};

export function QueuedTaskCard({
  queuedTask,
  onAccept,
  onReject,
  onLink,
}: QueuedTaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Form state - populated from Canvas data
  const [editTitle, setEditTitle] = useState(queuedTask.title);
  const [editDueAt, setEditDueAt] = useState(formatDateForInput(queuedTask.dueAt));
  const [editStartAt, setEditStartAt] = useState(''); // User-only, starts empty
  const [editTaskType, setEditTaskType] = useState(queuedTask.taskType || 'assignment');
  const [editWeight, setEditWeight] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState(''); // User's personal notes

  const handleToggleExpand = () => {
    if (!isExpanded) {
      // Reset edit values when expanding - populate from Canvas data
      setEditTitle(queuedTask.title);
      setEditDueAt(formatDateForInput(queuedTask.dueAt));
      setEditStartAt(''); // Start date is user-only, not from Canvas
      setEditTaskType(queuedTask.taskType || 'assignment');
      setEditWeight(''); // Weight is user-only
      setEditLocation(''); // Location is user-only
      setEditNotes(''); // Notes is user-only
    }
    setIsExpanded(!isExpanded);
  };

  const handleRowDoubleClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) return;
    handleToggleExpand();
  };

  const handleAcceptWithEdits = () => {
    const edits: QueuedTaskEdits = {};

    // Check each field for changes from original Canvas data
    if (editTitle !== queuedTask.title) {
      edits.title = editTitle;
    }
    // Description is read-only from Canvas, not editable
    const originalDue = formatDateForInput(queuedTask.dueAt);
    if (editDueAt !== originalDue) {
      edits.dueAt = editDueAt ? new Date(editDueAt).toISOString() : null;
    }
    if (editStartAt) {
      edits.startAt = new Date(editStartAt).toISOString();
    }
    if (editTaskType !== (queuedTask.taskType || 'assignment')) {
      edits.taskType = editTaskType;
    }
    if (editWeight) {
      edits.weight = parseFloat(editWeight) || null;
    }
    if (editLocation) {
      edits.location = editLocation;
    }
    if (editNotes.trim()) {
      edits.notes = editNotes.trim();
    }

    // Only pass edits if something changed
    const hasEdits = Object.keys(edits).length > 0;
    onAccept(queuedTask.id, hasEdits ? edits : undefined);
  };

  return (
    <>
      {/* Main Row */}
      <div
        style={{
          ...styles.row,
          ...(isHovered ? styles.rowHover : {}),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDoubleClick={handleRowDoubleClick}
      >
        {/* Expand Toggle */}
        <button
          style={styles.expandToggle}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleExpand();
          }}
          title={isExpanded ? 'Collapse' : 'Edit before accepting'}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Title */}
        <span style={styles.title} title={queuedTask.title}>
          {queuedTask.title}
        </span>

        {/* Task Type */}
        <span style={styles.taskType}>{getTaskTypeShort(queuedTask.taskType)}</span>

        {/* Due Date */}
        <span style={styles.dueDate}>{formatDateCompact(queuedTask.dueAt)}</span>

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={{ ...styles.iconButton, ...styles.rejectBtn }}
            onClick={(e) => {
              e.stopPropagation();
              onReject(queuedTask.id);
            }}
            title="Dismiss"
          >
            <X size={16} />
          </button>
          <button
            style={{ ...styles.iconButton, ...styles.linkBtn }}
            onClick={(e) => {
              e.stopPropagation();
              onLink(queuedTask.id);
            }}
            title="Link to existing task"
          >
            <Link2 size={16} />
          </button>
          <button
            style={{ ...styles.iconButton, ...styles.acceptBtn }}
            onClick={(e) => {
              e.stopPropagation();
              onAccept(queuedTask.id);
            }}
            title="Accept"
          >
            <Check size={16} />
          </button>
        </div>
      </div>

      {/* Expanded Edit Form (matches task edit form style) */}
      {isExpanded && (
        <div style={styles.expandedForm}>
          {/* Title */}
          <input
            type="text"
            placeholder="Task title *"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            style={styles.formInput}
            autoFocus
          />

          {/* Description (Read-only from Canvas) */}
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description (from Canvas)</label>
            <div
              style={styles.descriptionViewport}
              dangerouslySetInnerHTML={{
                __html:
                  queuedTask.description ||
                  '<span style="color: var(--text-muted); font-style: italic;">No description provided</span>',
              }}
            />
          </div>

          {/* Notes (User's personal notes) */}
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Add your personal notes..."
              style={styles.notesTextarea}
            />
          </div>

          {/* Row 1: Type + Start Date + Due Date */}
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Type</label>
              <select
                value={editTaskType}
                onChange={(e) => setEditTaskType(e.target.value)}
                style={styles.formSelect}
              >
                {TASK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Start</label>
              <input
                type="datetime-local"
                value={editStartAt}
                onChange={(e) => setEditStartAt(e.target.value)}
                style={styles.formDateInput}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Due</label>
              <input
                type="datetime-local"
                value={editDueAt}
                onChange={(e) => setEditDueAt(e.target.value)}
                style={styles.formDateInput}
              />
            </div>
          </div>

          {/* Row 2: Weight + Location */}
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Weight %</label>
              <input
                type="number"
                placeholder="e.g., 10"
                value={editWeight}
                onChange={(e) => setEditWeight(e.target.value)}
                style={styles.formInputSmall}
                min="0"
                max="100"
              />
              {queuedTask.pointsPossible != null && queuedTask.pointsPossible > 0 && (
                <span style={styles.pointsInfo}>
                  Canvas points: {queuedTask.pointsPossible}
                </span>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Location</label>
              <input
                type="text"
                placeholder="e.g., Room 101"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                style={styles.formInputSmall}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={styles.formActions}>
            <button style={styles.cancelButton} onClick={() => setIsExpanded(false)}>
              Cancel
            </button>
            <button
              style={styles.saveButton}
              onClick={handleAcceptWithEdits}
              disabled={!editTitle.trim()}
            >
              Accept Task
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default QueuedTaskCard;
