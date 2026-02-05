/**
 * TaskLinkDialog Component
 * Two-step dialog for linking a Canvas task to a user task
 * Step 1: Select from list of linkable tasks (sorted by match score)
 * Step 2: Resolve which field values to keep
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  GitMerge,
  Link2,
  Calendar,
  FileText,
  Cloud,
  User,
  CheckCircle2,
} from 'lucide-react';
import type { QueuedTask, Task } from '../../../l5-presentation/types';
import { TASK_TYPES, formatSmartDate } from '../../constants';

interface TaskLinkDialogProps {
  isOpen: boolean;
  queuedTask: QueuedTask;
  /** All user tasks from the same course that can be linked */
  linkableTasks: Task[];
  onMerge: (params: {
    queueId: number;
    userTaskId: number;
    keepFromUser?: { notes?: boolean; dueAt?: boolean; title?: boolean };
  }) => Promise<{ success: boolean }>;
  onCancel: () => void;
}

type DialogStep = 'select' | 'resolve';

// Calculate match score between Canvas task and user task (0-100)
function calculateMatchScore(canvasTask: QueuedTask, userTask: Task): number {
  let score = 0;
  let weights = 0;

  // Title similarity (weight: 50)
  const titleWeight = 50;
  weights += titleWeight;
  const titleSimilarity = calculateStringSimilarity(
    canvasTask.title.toLowerCase(),
    userTask.title.toLowerCase()
  );
  score += titleSimilarity * titleWeight;

  // Task type match (weight: 20)
  const typeWeight = 20;
  weights += typeWeight;
  if (canvasTask.taskType && userTask.taskType) {
    if (canvasTask.taskType === userTask.taskType) {
      score += typeWeight;
    } else if (areRelatedTypes(canvasTask.taskType, userTask.taskType)) {
      score += typeWeight * 0.5;
    }
  }

  // Due date proximity (weight: 30)
  const dateWeight = 30;
  weights += dateWeight;
  if (canvasTask.dueAt && userTask.dueAt) {
    const canvasDate = new Date(canvasTask.dueAt).getTime();
    const userDate = new Date(userTask.dueAt).getTime();
    const daysDiff = Math.abs(canvasDate - userDate) / (1000 * 60 * 60 * 24);
    if (daysDiff === 0) {
      score += dateWeight;
    } else if (daysDiff <= 1) {
      score += dateWeight * 0.8;
    } else if (daysDiff <= 3) {
      score += dateWeight * 0.5;
    } else if (daysDiff <= 7) {
      score += dateWeight * 0.2;
    }
  }

  return Math.round((score / weights) * 100);
}

// Simple string similarity using Levenshtein-like approach
function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  // Check for substring match
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    return shorter.length / longer.length;
  }

  // Word overlap
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) matches++;
  }

  return matches / Math.max(wordsA.size, wordsB.size);
}

// Check if task types are related
function areRelatedTypes(type1: string, type2: string): boolean {
  const relatedGroups = [
    ['quiz', 'test', 'exam', 'midterm', 'final'],
    ['assignment', 'homework', 'project'],
    ['lab', 'practical'],
  ];

  for (const group of relatedGroups) {
    if (group.includes(type1) && group.includes(type2)) {
      return true;
    }
  }
  return false;
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
    maxWidth: '900px',
    maxHeight: '85vh',
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
  } as React.CSSProperties,
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-5)',
  } as React.CSSProperties,
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
    minHeight: '300px',
  } as React.CSSProperties,
  column: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
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
    flex: 1,
    overflow: 'auto',
  } as React.CSSProperties,
  field: {
    marginBottom: 'var(--space-3)',
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
    marginBottom: '2px',
  } as React.CSSProperties,
  fieldValue: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  fieldValueMuted: {
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  // Task list styles
  taskList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-2)',
  } as React.CSSProperties,
  taskItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  } as React.CSSProperties,
  taskItemSelected: {
    borderColor: 'var(--color-primary)',
    backgroundColor: 'var(--color-primary-bg)',
  } as React.CSSProperties,
  taskItemInfo: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  taskItemTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  taskItemMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  } as React.CSSProperties,
  emptyList: {
    padding: 'var(--space-6)',
    textAlign: 'center' as const,
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  } as React.CSSProperties,
  // Field resolution styles
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid var(--border-light)',
  } as React.CSSProperties,
  fieldCell: {
    padding: 'var(--space-3) var(--space-4)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    margin: '2px',
  } as React.CSSProperties,
  fieldCellHover: {
    backgroundColor: 'var(--bg-tertiary)',
  } as React.CSSProperties,
  fieldCellSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    boxShadow: 'inset 0 0 0 2px #10b981',
    borderRadius: '6px',
  } as React.CSSProperties,
  fieldCellDisabled: {
    opacity: 0.5,
    cursor: 'default',
  } as React.CSSProperties,
  radioIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid #9ca3af',
    marginRight: 'var(--space-2)',
    flexShrink: 0,
    transition: 'all 0.15s ease',
    backgroundColor: 'transparent',
  } as React.CSSProperties,
  radioIndicatorSelected: {
    borderColor: '#10b981',
    backgroundColor: '#10b981',
    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)',
  } as React.CSSProperties,
  quickOptions: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-4)',
    justifyContent: 'center',
  } as React.CSSProperties,
  quickButton: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  } as React.CSSProperties,
  quickButtonHover: {
    backgroundColor: 'var(--bg-tertiary)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary)',
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
  } as React.CSSProperties,
  cancelButton: {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  } as React.CSSProperties,
  primaryButton: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
  } as React.CSSProperties,
  linkButton: {
    backgroundColor: 'var(--color-info)',
    color: 'white',
  } as React.CSSProperties,
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as React.CSSProperties,
};

interface FieldChoice {
  title: 'canvas' | 'user';
  dueAt: 'canvas' | 'user';
  taskType: 'canvas' | 'user';
}

export function TaskLinkDialog({
  isOpen,
  queuedTask,
  linkableTasks,
  onMerge,
  onCancel,
}: TaskLinkDialogProps) {
  const [step, setStep] = useState<DialogStep>('select');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [fieldChoices, setFieldChoices] = useState<FieldChoice>({
    title: 'canvas',
    dueAt: 'canvas',
    taskType: 'canvas',
  });
  const [isMerging, setIsMerging] = useState(false);

  // Calculate match scores and sort tasks
  const tasksWithScores = useMemo(() => {
    return linkableTasks
      .map((task) => ({
        task,
        score: calculateMatchScore(queuedTask, task),
      }))
      .sort((a, b) => b.score - a.score);
  }, [queuedTask, linkableTasks]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return linkableTasks.find((t) => t.id === selectedTaskId) || null;
  }, [selectedTaskId, linkableTasks]);

  if (!isOpen) return null;

  const handleSelectTask = (taskId: number) => {
    setSelectedTaskId(taskId);
  };

  const handleProceedToResolve = () => {
    if (selectedTaskId) {
      // Reset field choices with smart defaults
      setFieldChoices({
        title: 'canvas',
        dueAt: 'canvas',
        taskType: 'canvas',
      });
      setStep('resolve');
    }
  };

  const handleBack = () => {
    setStep('select');
  };

  const handleFieldChoice = (field: keyof FieldChoice, value: 'canvas' | 'user') => {
    setFieldChoices((prev) => ({ ...prev, [field]: value }));
  };

  const handleUseAllCanvas = () => {
    setFieldChoices({
      title: 'canvas',
      dueAt: 'canvas',
      taskType: 'canvas',
    });
  };

  const handleUseAllUser = () => {
    setFieldChoices({
      title: 'user',
      dueAt: 'user',
      taskType: 'user',
    });
  };

  const handleCompleteMerge = async () => {
    if (!selectedTaskId) return;

    setIsMerging(true);
    try {
      await onMerge({
        queueId: queuedTask.id,
        userTaskId: selectedTaskId,
        keepFromUser: {
          dueAt: fieldChoices.dueAt === 'user',
          title: fieldChoices.title === 'user',
        },
      });
      onCancel();
    } finally {
      setIsMerging(false);
    }
  };

  // Step 1: Task Selection
  const renderSelectStep = () => (
    <>
      <div style={styles.content}>
        <div style={styles.twoColumn}>
          {/* Canvas Task Column */}
          <div style={styles.column}>
            <div style={{ ...styles.columnHeader, ...styles.canvasHeader }}>
              <Cloud size={16} />
              Canvas Task
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
              {queuedTask.pointsPossible != null && queuedTask.pointsPossible > 0 && (
                <div style={styles.field}>
                  <div style={styles.fieldLabel}>Points</div>
                  <div style={styles.fieldValue}>{queuedTask.pointsPossible}</div>
                </div>
              )}
            </div>
          </div>

          {/* Linkable Tasks Column */}
          <div style={styles.column}>
            <div style={{ ...styles.columnHeader, ...styles.userHeader }}>
              <User size={16} />
              Local Tasks
            </div>
            <div style={styles.columnContent}>
              {tasksWithScores.length === 0 ? (
                <div style={styles.emptyList}>No linkable tasks found</div>
              ) : (
                <div style={styles.taskList}>
                  {tasksWithScores.map(({ task }) => (
                    <div
                      key={task.id}
                      style={{
                        ...styles.taskItem,
                        ...(selectedTaskId === task.id ? styles.taskItemSelected : {}),
                      }}
                      onClick={() => handleSelectTask(task.id)}
                    >
                      <div style={styles.taskItemInfo}>
                        <div style={styles.taskItemTitle}>{task.title}</div>
                        <div style={styles.taskItemMeta}>
                          {getTaskTypeLabel(task.taskType)}
                          {task.dueAt && ` • ${formatDate(task.dueAt)}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={styles.footer}>
        <button style={{ ...styles.button, ...styles.cancelButton }} onClick={onCancel}>
          Cancel
        </button>
        <button
          style={{
            ...styles.button,
            ...styles.linkButton,
            ...(!selectedTaskId ? styles.disabledButton : {}),
          }}
          onClick={handleProceedToResolve}
          disabled={!selectedTaskId}
        >
          <Link2 size={16} />
          Match Selected
        </button>
      </div>
    </>
  );

  // Step 2: Field Resolution
  const renderResolveStep = () => {
    if (!selectedTask) return null;

    const fields: Array<{
      key: keyof FieldChoice;
      label: string;
      icon: React.ReactNode;
      canvasValue: string;
      userValue: string;
      canvasEmpty: boolean;
      userEmpty: boolean;
    }> = [
      {
        key: 'title',
        label: 'Title',
        icon: <FileText size={12} />,
        canvasValue: queuedTask.title,
        userValue: selectedTask.title,
        canvasEmpty: false,
        userEmpty: false,
      },
      {
        key: 'dueAt',
        label: 'Due Date',
        icon: <Calendar size={12} />,
        canvasValue: formatDate(queuedTask.dueAt),
        userValue: formatDate(selectedTask.dueAt),
        canvasEmpty: !queuedTask.dueAt,
        userEmpty: !selectedTask.dueAt,
      },
      {
        key: 'taskType',
        label: 'Type',
        icon: null,
        canvasValue: getTaskTypeLabel(queuedTask.taskType),
        userValue: getTaskTypeLabel(selectedTask.taskType),
        canvasEmpty: !queuedTask.taskType,
        userEmpty: !selectedTask.taskType,
      },
    ];

    return (
      <>
        <div style={styles.content}>
          <div style={styles.column}>
            {/* Header row */}
            <div style={styles.fieldRow}>
              <div style={{ ...styles.columnHeader, ...styles.canvasHeader }}>
                <Cloud size={16} />
                Canvas
              </div>
              <div style={{ ...styles.columnHeader, ...styles.userHeader }}>
                <User size={16} />
                Local
              </div>
            </div>

            {/* Field rows */}
            {fields.map((field) => (
              <div key={field.key} style={styles.fieldRow}>
                {/* Canvas cell */}
                <div
                  style={{
                    ...styles.fieldCell,
                    ...(fieldChoices[field.key] === 'canvas'
                      ? styles.fieldCellSelected
                      : {}),
                  }}
                  onClick={() => handleFieldChoice(field.key, 'canvas')}
                  onMouseEnter={(e) => {
                    if (fieldChoices[field.key] !== 'canvas') {
                      e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (fieldChoices[field.key] !== 'canvas') {
                      e.currentTarget.style.backgroundColor = '';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        ...styles.radioIndicator,
                        ...(fieldChoices[field.key] === 'canvas'
                          ? styles.radioIndicatorSelected
                          : {}),
                      }}
                    >
                      {fieldChoices[field.key] === 'canvas' && (
                        <CheckCircle2 size={10} color="white" />
                      )}
                    </span>
                    <div>
                      <div style={styles.fieldLabel}>
                        {field.icon}
                        {field.label}
                      </div>
                      <div
                        style={{
                          ...styles.fieldValue,
                          ...(field.canvasEmpty ? styles.fieldValueMuted : {}),
                        }}
                      >
                        {field.canvasValue}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Local cell */}
                <div
                  style={{
                    ...styles.fieldCell,
                    ...(fieldChoices[field.key] === 'user'
                      ? styles.fieldCellSelected
                      : {}),
                  }}
                  onClick={() => handleFieldChoice(field.key, 'user')}
                  onMouseEnter={(e) => {
                    if (fieldChoices[field.key] !== 'user') {
                      e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (fieldChoices[field.key] !== 'user') {
                      e.currentTarget.style.backgroundColor = '';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        ...styles.radioIndicator,
                        ...(fieldChoices[field.key] === 'user'
                          ? styles.radioIndicatorSelected
                          : {}),
                      }}
                    >
                      {fieldChoices[field.key] === 'user' && (
                        <CheckCircle2 size={10} color="white" />
                      )}
                    </span>
                    <div>
                      <div style={styles.fieldLabel}>
                        {field.icon}
                        {field.label}
                      </div>
                      <div
                        style={{
                          ...styles.fieldValue,
                          ...(field.userEmpty ? styles.fieldValueMuted : {}),
                        }}
                      >
                        {field.userValue}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick options */}
          <div style={styles.quickOptions}>
            <button
              style={styles.quickButton}
              onClick={handleUseAllCanvas}
              title="Select all values from Canvas for every field"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.color = 'var(--color-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Use All Canvas
            </button>
            <button
              style={styles.quickButton}
              onClick={handleUseAllUser}
              title="Select all values from your local task for every field"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.color = 'var(--color-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              Use All Local
            </button>
          </div>
        </div>

        <div style={styles.footer}>
          <button
            style={{ ...styles.button, ...styles.cancelButton }}
            onClick={handleBack}
            disabled={isMerging}
          >
            Back
          </button>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={handleCompleteMerge}
            disabled={isMerging}
          >
            <GitMerge size={16} />
            {isMerging ? 'Merging...' : 'Complete Merge'}
          </button>
        </div>
      </>
    );
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>
            {step === 'select' ? (
              <>
                <Link2 size={20} />
                Link Canvas Task
              </>
            ) : (
              <>
                <GitMerge size={20} />
                Resolve Fields
              </>
            )}
          </span>
          <button style={styles.closeButton} onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        {step === 'select' ? renderSelectStep() : renderResolveStep()}
      </div>
    </div>
  );
}

export default TaskLinkDialog;
