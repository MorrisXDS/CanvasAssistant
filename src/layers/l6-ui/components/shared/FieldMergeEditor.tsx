/**
 * FieldMergeEditor
 *
 * Per-field merge picker for the duplicate-warning flow. For each
 * conflicting field, the user picks whether to keep the Canvas (incoming)
 * value or their existing local value. Non-conflicting fields render once
 * as a quiet summary below — there's nothing to choose.
 *
 * Used in two places:
 *   1. As the body of the single-mode DuplicateWarningModal.
 *   2. As the body of the child modal opened from a bulk row when the user
 *      clicks "Customize fields".
 *
 * The picker UI (clickable cells + green radio indicator + "Use All
 * Canvas"/"Use All Local" quick buttons) is lifted from
 * `TaskLinkDialog.renderResolveStep` so we don't reinvent the visual
 * pattern that already exists in the codebase.
 */

import React from 'react';
import { Calendar, FileText, Cloud, User, CheckCircle2 } from 'lucide-react';
import type { DuplicateCheckResult } from '../../../l5-presentation/types';
import { TASK_TYPES, formatSmartDate } from '../../constants';
import type { CanvasTaskDisplay } from './DuplicateWarningModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FieldKey = 'title' | 'dueAt' | 'taskType';
export type FieldSide = 'canvas' | 'user';
export type FieldChoice = Record<FieldKey, FieldSide>;

interface FieldMergeEditorProps {
  item: DuplicateCheckResult;
  canvasTask: CanvasTaskDisplay;
  choices: FieldChoice;
  onChange: (next: FieldChoice) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getTaskTypeLabel(taskType: string | null | undefined): string {
  if (!taskType) return 'Unspecified';
  const type = TASK_TYPES.find((t) => t.value === taskType);
  return type?.label || taskType;
}

/** Default choice map: Canvas wins for every field in `conflictingFields`. */
export function buildDefaultChoices(_item: DuplicateCheckResult): FieldChoice {
  // _item is part of the signature so callers can pass the item they're
  // initializing for symmetry with isCustomized() — but the default is
  // currently item-independent (always all-canvas).
  return { title: 'canvas', dueAt: 'canvas', taskType: 'canvas' };
}

/** True when any conflicting field is overridden from the Canvas default. */
export function isCustomized(item: DuplicateCheckResult, choices: FieldChoice): boolean {
  if (!item.match) return false;
  for (const f of item.match.conflictingFields) {
    const key = f.field as FieldKey;
    if (key in choices && choices[key] !== 'canvas') return true;
  }
  return false;
}

/**
 * Format a raw conflictingField value for display. Used by both the modal's
 * inline summary line (bulk mode) and the editor cells.
 */
export function formatFieldValue(field: string, rawValue: string | null): string {
  if (rawValue == null) return '—';
  if (field === 'dueAt') return formatSmartDate(rawValue);
  if (field === 'taskType') return getTaskTypeLabel(rawValue);
  return rawValue;
}

// ---------------------------------------------------------------------------
// Styles (lifted from TaskLinkDialog)
// ---------------------------------------------------------------------------
const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  noConflicts: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    padding: 'var(--space-3)',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  } as React.CSSProperties,
  column: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  } as React.CSSProperties,
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid var(--border-light)',
  } as React.CSSProperties,
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
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
  fieldCell: {
    padding: 'var(--space-3) var(--space-4)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    margin: '2px',
  } as React.CSSProperties,
  fieldCellSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    boxShadow: 'inset 0 0 0 2px #10b981',
    borderRadius: '6px',
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
  radioIndicator: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
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
    marginTop: 'var(--space-2)',
    justifyContent: 'center',
  } as React.CSSProperties,
  quickButton: {
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  } as React.CSSProperties,
  otherFields: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
  } as React.CSSProperties,
  otherFieldsTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,
  otherFieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  otherFieldLabel: {
    color: 'var(--text-muted)',
    minWidth: '60px',
  } as React.CSSProperties,
  hint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Field metadata (icons + raw value resolution)
// ---------------------------------------------------------------------------
interface FieldDef {
  key: FieldKey;
  label: string;
  icon: React.ReactNode;
}

const FIELD_DEFS: FieldDef[] = [
  { key: 'title', label: 'Title', icon: <FileText size={12} /> },
  { key: 'dueAt', label: 'Due date', icon: <Calendar size={12} /> },
  { key: 'taskType', label: 'Type', icon: null },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function FieldMergeEditor({
  item,
  canvasTask,
  choices,
  onChange,
}: FieldMergeEditorProps) {
  if (!item.match) return null;
  const { task: userTask, conflictingFields } = item.match;
  const conflictKeys = new Set(conflictingFields.map((f) => f.field as FieldKey));

  const setField = (key: FieldKey, side: FieldSide) => {
    onChange({ ...choices, [key]: side });
  };

  const useAllCanvas = () =>
    onChange({ title: 'canvas', dueAt: 'canvas', taskType: 'canvas' });
  const useAllUser = () => onChange({ title: 'user', dueAt: 'user', taskType: 'user' });

  // No conflicts at all — short-circuit with the existing muted message.
  if (conflictingFields.length === 0) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.noConflicts}>No field conflicts — values are identical</div>
        <NonConflictSummary
          canvasTask={canvasTask}
          userTask={userTask}
          conflictKeys={conflictKeys}
        />
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.hint}>
        For each conflicting field, pick which value to keep. Canvas is selected by
        default.
      </div>

      <div style={styles.column}>
        {/* Column headers */}
        <div style={styles.fieldRow}>
          <div style={{ ...styles.columnHeader, ...styles.canvasHeader }}>
            <Cloud size={14} />
            Canvas (incoming)
          </div>
          <div style={{ ...styles.columnHeader, ...styles.userHeader }}>
            <User size={14} />
            Your task
          </div>
        </div>

        {/* Conflict picker rows */}
        {FIELD_DEFS.filter((def) => conflictKeys.has(def.key)).map((def) => {
          const canvasRaw = readCanvasValue(def.key, canvasTask);
          const userRaw = readUserValue(def.key, userTask);
          const canvasDisplay = formatFieldValue(def.key, canvasRaw);
          const userDisplay = formatFieldValue(def.key, userRaw);
          const canvasEmpty = !canvasRaw;
          const userEmpty = !userRaw;
          const selected = choices[def.key];

          return (
            <div key={def.key} style={styles.fieldRow}>
              <PickerCell
                selected={selected === 'canvas'}
                label={def.label}
                icon={def.icon}
                value={canvasDisplay}
                muted={canvasEmpty}
                onClick={() => setField(def.key, 'canvas')}
              />
              <PickerCell
                selected={selected === 'user'}
                label={def.label}
                icon={def.icon}
                value={userDisplay}
                muted={userEmpty}
                onClick={() => setField(def.key, 'user')}
              />
            </div>
          );
        })}
      </div>

      {/* Quick options */}
      <div style={styles.quickOptions}>
        <button style={styles.quickButton} onClick={useAllCanvas}>
          Use All Canvas
        </button>
        <button style={styles.quickButton} onClick={useAllUser}>
          Use All Local
        </button>
      </div>

      <NonConflictSummary
        canvasTask={canvasTask}
        userTask={userTask}
        conflictKeys={conflictKeys}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function PickerCell({
  selected,
  label,
  icon,
  value,
  muted,
  onClick,
}: {
  selected: boolean;
  label: string;
  icon: React.ReactNode;
  value: string;
  muted: boolean;
  onClick: () => void;
}) {
  return (
    <div
      style={{ ...styles.fieldCell, ...(selected ? styles.fieldCellSelected : {}) }}
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <span
          style={{
            ...styles.radioIndicator,
            ...(selected ? styles.radioIndicatorSelected : {}),
          }}
        >
          {selected && <CheckCircle2 size={10} color="white" />}
        </span>
        <div>
          <div style={styles.fieldLabel}>
            {icon}
            {label}
          </div>
          <div style={{ ...styles.fieldValue, ...(muted ? styles.fieldValueMuted : {}) }}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shows fields that aren't in dispute — title/dueAt/taskType when they match,
 * plus weight (always user's value) and notes (always preserved).
 */
function NonConflictSummary({
  canvasTask,
  userTask,
  conflictKeys,
}: {
  canvasTask: CanvasTaskDisplay;
  userTask: {
    title: string;
    dueAt: string | null;
    taskType: string | null;
    weight: number | null;
  };
  conflictKeys: Set<FieldKey>;
}) {
  const rows: Array<{ label: string; value: string; annotation?: string }> = [];

  if (!conflictKeys.has('title')) {
    rows.push({ label: 'Title', value: userTask.title });
  }
  if (!conflictKeys.has('dueAt')) {
    rows.push({
      label: 'Due date',
      value: userTask.dueAt ? formatSmartDate(userTask.dueAt) : 'Not set',
    });
  }
  if (!conflictKeys.has('taskType')) {
    rows.push({
      label: 'Type',
      value: getTaskTypeLabel(userTask.taskType ?? canvasTask.taskType ?? null),
    });
  }
  rows.push({
    label: 'Weight',
    value: userTask.weight != null ? `${userTask.weight}%` : '—',
    annotation: '(always your value)',
  });
  rows.push({ label: 'Notes', value: '(preserved)', annotation: '(always your value)' });

  return (
    <div style={styles.otherFields}>
      <div style={styles.otherFieldsTitle}>Other fields (kept as-is)</div>
      {rows.map((row, i) => (
        <div key={i} style={styles.otherFieldRow}>
          <span>
            <span style={styles.otherFieldLabel}>{row.label}:</span> {row.value}
          </span>
          {row.annotation && (
            <span style={{ color: 'var(--text-muted)' }}>{row.annotation}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value readers
// ---------------------------------------------------------------------------
function readCanvasValue(key: FieldKey, t: CanvasTaskDisplay): string | null {
  if (key === 'title') return t.title;
  if (key === 'dueAt') return t.dueAt;
  if (key === 'taskType') return t.taskType;
  return null;
}

function readUserValue(
  key: FieldKey,
  t: { title: string; dueAt: string | null; taskType: string | null }
): string | null {
  if (key === 'title') return t.title;
  if (key === 'dueAt') return t.dueAt;
  if (key === 'taskType') return t.taskType;
  return null;
}

export default FieldMergeEditor;
