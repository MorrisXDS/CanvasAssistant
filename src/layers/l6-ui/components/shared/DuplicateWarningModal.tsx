/**
 * DuplicateWarningModal
 *
 * Shown when a Canvas task being accepted matches an existing user task (exact or fuzzy).
 * Single mode: one item, L/S/Esc shortcuts.
 * Bulk mode: multi-select list, A/↑↓/Space/L/S/Enter/Esc shortcuts.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, X, Link2, Plus, Check } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { DuplicateCheckResult } from '../../../l5-presentation/types';
import { formatSmartDate } from '../../constants';

interface DuplicateWarningModalProps {
  mode: 'single' | 'bulk';
  items: DuplicateCheckResult[];
  onConfirm: (
    decisions: Map<number, 'link' | 'separate'>,
    selected: Set<number>
  ) => Promise<void>;
  onCancel: () => void;
}

function formatDate(d: string | null): string {
  if (!d) return 'Not set';
  return formatSmartDate(d);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  } as React.CSSProperties,
  dialog: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    width: '90%',
    maxWidth: '640px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    minWidth: 0,
  } as React.CSSProperties,
  headerTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  headerSub: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  } as React.CSSProperties,
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
  } as React.CSSProperties,
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 'var(--space-4) var(--space-5)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-4)',
  } as React.CSSProperties,
  // Single mode
  matchBadge: (type: 'exact' | 'fuzzy'): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    backgroundColor:
      type === 'exact' ? 'var(--color-warning-bg)' : 'var(--color-info-bg)',
    color: type === 'exact' ? 'var(--color-warning)' : 'var(--color-info)',
  }),
  compareGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
  } as React.CSSProperties,
  compareCol: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  } as React.CSSProperties,
  compareColHeader: (variant: 'canvas' | 'user'): React.CSSProperties => ({
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor:
      variant === 'canvas' ? 'var(--color-info-bg)' : 'var(--color-success-bg)',
    color: variant === 'canvas' ? 'var(--color-info)' : 'var(--color-success)',
  }),
  compareBody: {
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-2)',
  } as React.CSSProperties,
  fieldRow: (conflict: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    padding: conflict ? 'var(--space-1) var(--space-2)' : undefined,
    backgroundColor: conflict ? 'var(--color-warning-bg)' : undefined,
    borderRadius: conflict ? 'var(--radius-sm)' : undefined,
  }),
  fieldLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  } as React.CSSProperties,
  fieldValue: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  fieldValueMuted: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    fontStyle: 'italic' as const,
  } as React.CSSProperties,
  noConflicts: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    padding: 'var(--space-2)',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  } as React.CSSProperties,
  // Bulk mode
  selectAllRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) 0',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  bulkItem: (focused: boolean): React.CSSProperties => ({
    border: `1px solid ${focused ? 'var(--color-navy)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    outline: focused ? '2px solid var(--color-navy)' : 'none',
    outlineOffset: '1px',
  }),
  bulkItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-tertiary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  } as React.CSSProperties,
  bulkItemBody: {
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  // Radio group
  radioGroup: {
    display: 'flex',
    gap: 'var(--space-2)',
  } as React.CSSProperties,
  radioBtn: (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-default)'}`,
    backgroundColor: active ? 'var(--color-primary-bg)' : 'var(--bg-card)',
    color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  }),
  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-5)',
    borderTop: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-tertiary)',
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'secondary'): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: variant === 'secondary' ? '1px solid var(--border-default)' : 'none',
    backgroundColor: variant === 'primary' ? 'var(--color-primary)' : 'var(--bg-card)',
    color: variant === 'primary' ? 'white' : 'var(--text-secondary)',
    cursor: 'pointer',
  }),
  kbdHint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginRight: 'auto',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// ComparePanel — renders Canvas vs existing side by side for one item
// ---------------------------------------------------------------------------
function ComparePanel({
  item,
  canvasTask,
}: {
  item: DuplicateCheckResult;
  canvasTask: { title: string; dueAt: string | null; taskType: string | null };
}) {
  if (!item.match) return null;
  const { task, conflictingFields } = item.match;
  const conflictSet = new Set(conflictingFields.map((f) => f.field));

  const fields: Array<{
    field: string;
    label: string;
    canvasVal: string | null;
    localVal: string | null;
  }> = [
    { field: 'title', label: 'Title', canvasVal: canvasTask.title, localVal: task.title },
    {
      field: 'dueAt',
      label: 'Due date',
      canvasVal: formatDate(canvasTask.dueAt),
      localVal: formatDate(task.dueAt),
    },
    {
      field: 'taskType',
      label: 'Type',
      canvasVal: canvasTask.taskType ?? '—',
      localVal: task.taskType ?? '—',
    },
    {
      field: 'weight',
      label: 'Weight',
      canvasVal: '—',
      localVal: task.weight != null ? `${task.weight}%` : '—',
    },
  ];

  return (
    <div style={s.compareGrid}>
      {/* Canvas column */}
      <div style={s.compareCol}>
        <div style={s.compareColHeader('canvas')}>Canvas (incoming)</div>
        <div style={s.compareBody}>
          {fields.map(({ field, label, canvasVal }) => (
            <div key={field} style={s.fieldRow(conflictSet.has(field))}>
              <span style={s.fieldLabel}>{label}</span>
              <span
                style={canvasVal && canvasVal !== '—' ? s.fieldValue : s.fieldValueMuted}
              >
                {canvasVal ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Your task column */}
      <div style={s.compareCol}>
        <div style={s.compareColHeader('user')}>Your task</div>
        <div style={s.compareBody}>
          {fields.map(({ field, label, localVal }) => (
            <div key={field} style={s.fieldRow(conflictSet.has(field))}>
              <span style={s.fieldLabel}>{label}</span>
              <span
                style={localVal && localVal !== '—' ? s.fieldValue : s.fieldValueMuted}
              >
                {localVal ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------
export function DuplicateWarningModal({
  mode,
  items,
  onConfirm,
  onCancel,
}: DuplicateWarningModalProps) {
  // Per-item decisions: 'link' | 'separate'
  const [decisions, setDecisions] = useState<Map<number, 'link' | 'separate'>>(
    () => new Map(items.map((i) => [i.queueId, 'link']))
  );
  // Per-item selection (bulk mode)
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(items.map((i) => i.queueId))
  );
  // Focused row index (bulk mode keyboard nav)
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const item0 = items[0];
  const isSingle = mode === 'single';

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const setDecision = useCallback((queueId: number, d: 'link' | 'separate') => {
    setDecisions((prev) => new Map(prev).set(queueId, d));
  }, []);

  const toggleSelected = useCallback((queueId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(queueId)) next.delete(queueId);
      else next.add(queueId);
      return next;
    });
  }, []);

  const allSelected = selected.size === items.length;
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.queueId)));
  }, [allSelected, items]);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    try {
      await onConfirm(decisions, selected);
    } finally {
      setIsConfirming(false);
    }
  }, [onConfirm, decisions, selected]);

  // --- Keyboard shortcuts ---
  useHotkeys('esc', onCancel, { enableOnFormTags: false });
  useHotkeys('l', () => {
    if (isSingle && item0) {
      setDecision(item0.queueId, 'link');
      handleConfirm();
    } else {
      const focused = items[focusedIdx];
      if (focused) setDecision(focused.queueId, 'link');
    }
  });
  useHotkeys('s', () => {
    if (isSingle && item0) {
      setDecision(item0.queueId, 'separate');
      handleConfirm();
    } else {
      const focused = items[focusedIdx];
      if (focused) setDecision(focused.queueId, 'separate');
    }
  });
  useHotkeys('enter', () => {
    if (!isSingle) handleConfirm();
  });
  useHotkeys('a', () => {
    if (!isSingle) toggleAll();
  });
  useHotkeys('ArrowUp', () => {
    if (!isSingle) setFocusedIdx((i) => Math.max(0, i - 1));
  });
  useHotkeys('ArrowDown', () => {
    if (!isSingle) setFocusedIdx((i) => Math.min(items.length - 1, i + 1));
  });
  useHotkeys('space', (e) => {
    e.preventDefault();
    if (!isSingle) {
      const focused = items[focusedIdx];
      if (focused) toggleSelected(focused.queueId);
    }
  });

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        style={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={
          isSingle ? 'Duplicate task found' : 'Review duplicates before accepting'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <AlertTriangle size={18} color="var(--color-warning)" />
            <div>
              <div style={s.headerTitle}>
                {isSingle
                  ? item0?.match?.type === 'exact'
                    ? `Duplicate found — ${item0.match.task.title}`
                    : `May match — ${item0?.match?.task.title}`
                  : `Review before accepting (${items.length} item${items.length > 1 ? 's' : ''})`}
              </div>
              {isSingle && (
                <div style={s.headerSub}>
                  {item0?.match?.type === 'exact'
                    ? 'Matches an existing task'
                    : 'May match an existing task'}
                </div>
              )}
            </div>
          </div>
          <button style={s.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={s.body}>
          {isSingle && item0 && item0.match && (
            <>
              {/* Side-by-side comparison */}
              {item0.match.conflictingFields.length > 0 ? (
                <ComparePanel
                  item={item0}
                  canvasTask={{
                    title: 'Canvas assignment', // actual title from queue shown in header
                    dueAt:
                      item0.match.conflictingFields.find((f) => f.field === 'dueAt')
                        ?.canvasValue ?? null,
                    taskType:
                      item0.match.conflictingFields.find((f) => f.field === 'taskType')
                        ?.canvasValue ?? null,
                  }}
                />
              ) : (
                <div style={s.noConflicts}>No field conflicts — values are identical</div>
              )}
              {/* Single mode action buttons (also triggered by L/S keys) */}
              <div
                style={{
                  ...s.radioGroup,
                  justifyContent: 'center',
                  marginTop: 'var(--space-2)',
                }}
              >
                <button
                  style={s.radioBtn(decisions.get(item0.queueId) === 'link')}
                  onClick={() => setDecision(item0.queueId, 'link')}
                >
                  <Link2 size={13} /> Link to existing
                </button>
                <button
                  style={s.radioBtn(decisions.get(item0.queueId) === 'separate')}
                  onClick={() => setDecision(item0.queueId, 'separate')}
                >
                  <Plus size={13} /> Keep separate
                </button>
              </div>
            </>
          )}

          {!isSingle && (
            <>
              {/* Select-all row */}
              <div style={s.selectAllRow} onClick={toggleAll}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{
                    accentColor: 'var(--color-primary)',
                    width: '15px',
                    height: '15px',
                  }}
                />
                <span>
                  <kbd style={{ fontFamily: 'inherit', fontWeight: 'bold' }}>A</kbd>{' '}
                  Select all
                </span>
              </div>

              {/* Item list */}
              {items.map((item, idx) => {
                if (!item.match) return null;
                const isFocused = focusedIdx === idx;
                const isChecked = selected.has(item.queueId);
                const decision = decisions.get(item.queueId) ?? 'link';

                return (
                  <div key={item.queueId} style={s.bulkItem(isFocused)}>
                    <div style={s.bulkItemHeader}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(item.queueId)}
                        style={{
                          accentColor: 'var(--color-primary)',
                          width: '15px',
                          height: '15px',
                        }}
                      />
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap' as const,
                        }}
                      >
                        {item.match.task.title}
                      </span>
                      <span style={s.matchBadge(item.match.type)}>
                        {item.match.type === 'exact' ? '⚠ Exact match' : '~ May match'}
                      </span>
                    </div>

                    <div style={s.bulkItemBody}>
                      {/* Conflicting fields summary */}
                      {item.match.conflictingFields.length > 0 ? (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {item.match.conflictingFields.map((f) => (
                            <span key={f.field} style={{ marginRight: 'var(--space-3)' }}>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {f.label}:
                              </span>{' '}
                              <span style={{ color: 'var(--color-warning)' }}>
                                {f.canvasValue ?? '—'}
                              </span>
                              {' → '}
                              <span>{f.localValue ?? '—'}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          No field conflicts
                        </div>
                      )}

                      {/* Link / separate radio */}
                      <div style={s.radioGroup}>
                        <button
                          style={s.radioBtn(decision === 'link')}
                          onClick={() => setDecision(item.queueId, 'link')}
                          disabled={!isChecked}
                        >
                          <Link2 size={12} /> Link
                        </button>
                        <button
                          style={s.radioBtn(decision === 'separate')}
                          onClick={() => setDecision(item.queueId, 'separate')}
                          disabled={!isChecked}
                        >
                          <Plus size={12} /> Keep separate
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <span style={s.kbdHint}>
            {isSingle
              ? 'L — link · S — separate · Esc — cancel'
              : '↑↓ navigate · Space toggle · A all · L/S set · Enter confirm · Esc cancel'}
          </span>
          <button style={s.btn('secondary')} onClick={onCancel} disabled={isConfirming}>
            Cancel
          </button>
          {isSingle ? (
            <button
              style={s.btn('primary')}
              onClick={handleConfirm}
              disabled={isConfirming}
            >
              <Check size={14} />
              {decisions.get(item0?.queueId ?? 0) === 'link'
                ? 'Link to existing'
                : 'Keep separate'}
            </button>
          ) : (
            <button
              style={s.btn('primary')}
              onClick={handleConfirm}
              disabled={isConfirming || selected.size === 0}
            >
              <Check size={14} />
              Confirm ({selected.size} selected)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DuplicateWarningModal;
