/**
 * TaskLinkDialog — two-step dialog for linking a Canvas (queued) task to an
 * existing user task.
 *
 *   Step 1 ("select"): show the incoming Canvas task next to a ranked list of
 *     candidate user tasks from the same course (sorted by a Levenshtein-ish
 *     match score). User picks one.
 *
 *   Step 2 ("resolve"): for each field that actually differs between the
 *     Canvas task and the selected user task (title / dueAt / taskType),
 *     show the per-field Canvas-vs-Your-task picker so the user can choose
 *     which side wins. Fields whose values already match collapse into the
 *     quiet "Other fields (kept as-is)" summary — there's nothing to pick.
 *
 * Refactor notes (FOLLOWUPS batch 3):
 *   - Outer chrome is now the shared `<Modal>` primitive per CLAUDE.md §2
 *     ("Use the Modal primitive for all dialogs"). Backdrop / centering /
 *     Escape / body-scroll-lock / footer flex-wrap are no longer re-derived
 *     here.
 *   - The Step 2 picker is now `<FieldMergeEditor>` — the same component
 *     introduced in PR #16 for the duplicate-warning flow. We synthesize a
 *     `DuplicateCheckResult` from the selected user task and compute
 *     `conflictingFields` by comparing values. The end result is the same
 *     three pickers, plus the new behaviour of suppressing pickers for
 *     fields that already agree (since there's nothing to pick).
 *   - Public prop contract is unchanged.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { GitMerge, Link2, Calendar, FileText, Cloud, User } from 'lucide-react';
import type {
  QueuedTask,
  Task,
  DuplicateCheckResult,
} from '../../../l5-presentation/types';
import { TASK_TYPES, formatSmartDate, Z_INDEX } from '../../constants';
import { Modal } from '../primitives/Modal';
import {
  FieldMergeEditor,
  type FieldChoice,
  type FieldKey,
} from '../shared/FieldMergeEditor';
import type { CanvasTaskDisplay } from '../shared/DuplicateWarningModal';

interface TaskLinkDialogProps {
  isOpen: boolean;
  queuedTask: QueuedTask;
  /** All user tasks from the same course that can be linked */
  linkableTasks: Task[];
  onMerge: (params: {
    queueId: number;
    userTaskId: number;
    keepFromUser?: {
      notes?: boolean;
      dueAt?: boolean;
      title?: boolean;
      taskType?: boolean;
    };
  }) => Promise<{ success: boolean }>;
  onCancel: () => void;
}

type DialogStep = 'select' | 'resolve';

// ---------------------------------------------------------------------------
// Match scoring (Step 1 candidate ranking)
// ---------------------------------------------------------------------------
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

function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b;
    const longer = a.length < b.length ? b : a;
    return shorter.length / longer.length;
  }

  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) matches++;
  }

  return matches / Math.max(wordsA.size, wordsB.size);
}

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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set';
  return formatSmartDate(dateStr);
}

function getTaskTypeLabel(taskType: string | null | undefined): string {
  if (!taskType) return 'Unspecified';
  const type = TASK_TYPES.find((t) => t.value === taskType);
  return type?.label || taskType;
}

// ---------------------------------------------------------------------------
// FieldMergeEditor adapter
// ---------------------------------------------------------------------------
/**
 * Build a synthetic DuplicateCheckResult for FieldMergeEditor's consumption.
 * The editor expects `match.conflictingFields` to list ONLY the fields whose
 * values differ between the two sides — fields that already agree collapse
 * into the non-conflict summary. We compare the three editable fields
 * (title / dueAt / taskType) and include only the ones that actually differ.
 */
function buildDuplicateCheckResult(
  queuedTask: QueuedTask,
  userTask: Task
): DuplicateCheckResult {
  const conflicts: Array<{
    field: string;
    label: string;
    canvasValue: string | null;
    localValue: string | null;
  }> = [];

  if ((queuedTask.title ?? '') !== (userTask.title ?? '')) {
    conflicts.push({
      field: 'title',
      label: 'Title',
      canvasValue: queuedTask.title,
      localValue: userTask.title,
    });
  }
  if ((queuedTask.dueAt ?? null) !== (userTask.dueAt ?? null)) {
    conflicts.push({
      field: 'dueAt',
      label: 'Due date',
      canvasValue: queuedTask.dueAt,
      localValue: userTask.dueAt,
    });
  }
  if ((queuedTask.taskType ?? null) !== (userTask.taskType ?? null)) {
    conflicts.push({
      field: 'taskType',
      label: 'Type',
      canvasValue: queuedTask.taskType ?? null,
      localValue: userTask.taskType ?? null,
    });
  }

  return {
    queueId: queuedTask.id,
    match: {
      type: 'fuzzy',
      task: {
        id: userTask.id,
        title: userTask.title,
        dueAt: userTask.dueAt,
        weight: userTask.weight ?? null,
        taskType: userTask.taskType ?? null,
      },
      conflictingFields: conflicts,
    },
  };
}

function buildCanvasDisplay(queuedTask: QueuedTask): CanvasTaskDisplay {
  return {
    title: queuedTask.title,
    dueAt: queuedTask.dueAt,
    taskType: queuedTask.taskType ?? null,
  };
}

// ---------------------------------------------------------------------------
// Styles — only the content of Step 1 needs custom styling now; the modal
// chrome (overlay, dialog frame, header, footer) lives in `<Modal>`.
// ---------------------------------------------------------------------------
const styles = {
  twoColumn: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-4)',
    minHeight: '320px',
    maxHeight: '60vh',
  } as React.CSSProperties,
  column: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
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
  // Use --color-navy here — `--color-primary` does not exist in theme.css
  // and would render an invisible white-on-white selection (see PR #16 fix).
  taskItemSelected: {
    borderColor: 'var(--color-navy)',
    backgroundColor: 'var(--color-info-bg)',
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
  // Footer button styles. We can't use the shared `<Button>` primitive yet
  // because the dialog mixes a neutral cancel, an info-coloured "Match
  // Selected", and a success-coloured "Complete Merge" — none of which are
  // 1:1 with the standard primary/danger variants.
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
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

  // Reset internal state every time the dialog closes so the next invocation
  // starts on Step 1 with no stale selection.
  useEffect(() => {
    if (!isOpen) {
      setStep('select');
      setSelectedTaskId(null);
      setFieldChoices({ title: 'canvas', dueAt: 'canvas', taskType: 'canvas' });
      setIsMerging(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectTask = (taskId: number) => {
    setSelectedTaskId(taskId);
  };

  const handleProceedToResolve = () => {
    if (selectedTaskId) {
      // Reset field choices with smart defaults (Canvas wins by default).
      setFieldChoices({ title: 'canvas', dueAt: 'canvas', taskType: 'canvas' });
      setStep('resolve');
    }
  };

  const handleBack = () => {
    setStep('select');
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
          taskType: fieldChoices.taskType === 'user',
        },
      });
      onCancel();
    } finally {
      setIsMerging(false);
    }
  };

  // -------------------------------------------------------------------------
  // Step 1: Canvas-side preview + ranked list of user tasks to pick from.
  // -------------------------------------------------------------------------
  const renderSelectContent = () => (
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
            <div style={styles.fieldValue}>{getTaskTypeLabel(queuedTask.taskType)}</div>
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
  );

  // -------------------------------------------------------------------------
  // Step 2: Field resolution via the shared FieldMergeEditor.
  // -------------------------------------------------------------------------
  const renderResolveContent = () => {
    if (!selectedTask) return null;
    const item = buildDuplicateCheckResult(queuedTask, selectedTask);
    const canvasTask = buildCanvasDisplay(queuedTask);
    return (
      <FieldMergeEditor
        item={item}
        canvasTask={canvasTask}
        choices={fieldChoices}
        onChange={setFieldChoices}
      />
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const isSelectStep = step === 'select';
  const headerTitle = isSelectStep ? 'Link Canvas Task' : 'Resolve Fields';
  const headerSubtitle = isSelectStep
    ? 'Pick a local task to merge this Canvas task into.'
    : 'For each differing field, choose which value to keep.';
  const headerIcon = isSelectStep ? <Link2 size={20} /> : <GitMerge size={20} />;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="xl" zIndex={Z_INDEX.modal}>
      <Modal.Header
        title={headerTitle}
        subtitle={headerSubtitle}
        icon={headerIcon}
        onClose={onCancel}
      />
      <Modal.Content>
        {isSelectStep ? renderSelectContent() : renderResolveContent()}
      </Modal.Content>
      <Modal.Footer align="end">
        {isSelectStep ? (
          <>
            <button
              style={{ ...styles.button, ...styles.cancelButton }}
              onClick={onCancel}
            >
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
          </>
        ) : (
          <>
            <button
              style={{ ...styles.button, ...styles.cancelButton }}
              onClick={handleBack}
              disabled={isMerging}
            >
              Back
            </button>
            <button
              style={{
                ...styles.button,
                ...styles.primaryButton,
                ...(isMerging ? styles.disabledButton : {}),
              }}
              onClick={handleCompleteMerge}
              disabled={isMerging}
            >
              <GitMerge size={16} />
              {isMerging ? 'Merging...' : 'Complete Merge'}
            </button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}

// Re-export FieldKey for completeness; not currently consumed externally but
// keeps the boundary explicit if a caller ever wants to drive the choice.
export type { FieldKey };

export default TaskLinkDialog;
