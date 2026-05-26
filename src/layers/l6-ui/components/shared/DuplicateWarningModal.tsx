/**
 * DuplicateWarningModal
 *
 * Shown when a Canvas task being accepted matches an existing user task (exact or fuzzy).
 * Single mode: one item, L/S/Esc shortcuts.
 * Bulk mode: multi-select list, A/↑↓/Space/L/S/Enter/Esc shortcuts.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, Link2, Plus, Check, Settings2 } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import type { DuplicateCheckResult } from '../../../l5-presentation/types';
import { Modal } from '../primitives/Modal';
import {
  FieldMergeEditor,
  buildDefaultChoices,
  isCustomized,
  formatFieldValue,
  type FieldChoice,
  type FieldKey,
} from './FieldMergeEditor';

/**
 * Display-shape of the *incoming Canvas* task, keyed by queueId.
 * Lets the modal show real values in its left "Canvas (incoming)" column
 * instead of falling back to conflict-only data.
 */
export interface CanvasTaskDisplay {
  title: string;
  dueAt: string | null;
  taskType: string | null;
}

interface DuplicateWarningModalProps {
  mode: 'single' | 'bulk';
  items: DuplicateCheckResult[];
  /** Real Canvas-side values, keyed by queueId — used by FieldMergeEditor. */
  canvasTaskByQueueId: Map<number, CanvasTaskDisplay>;
  /**
   * Confirm callback. Receives per-item link/separate decisions, the set of
   * items the user actually checked, and the per-item per-field choice map
   * built by FieldMergeEditor (defaulted to all-Canvas for any conflicting
   * field the user didn't customize).
   */
  onConfirm: (
    decisions: Map<number, 'link' | 'separate'>,
    selected: Set<number>,
    fieldChoicesByQueueId: Map<number, FieldChoice>
  ) => Promise<void>;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Styles — only the content-specific bits.  Modal chrome (overlay, dialog,
// header, content, footer) is owned by `<Modal>` from `primitives/Modal.tsx`,
// which handles backdrop, escape, body-scroll-lock, sizing, z-index stacking,
// and footer flex-wrap consistently.  See CLAUDE.md §2 "Use the Modal
// primitive for all dialogs".
// ---------------------------------------------------------------------------
const s = {
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
    // The modal body is `display: flex; flexDirection: column`, which means
    // children default to `flex-shrink: 1`. With many items, flexbox squeezes
    // each card to fit available height — combined with the `overflow: hidden`
    // above (needed for clean rounded corners), the bottom of each card
    // (i.e. the Link / Keep separate / Customize button row) was being
    // clipped invisibly. Lock the natural intrinsic size.
    flexShrink: 0,
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
    border: `1px solid ${active ? 'var(--color-navy)' : 'var(--border-default)'}`,
    backgroundColor: active ? 'var(--color-info-bg)' : 'var(--bg-card)',
    color: active ? 'var(--color-navy)' : 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  }),
  btn: (variant: 'primary' | 'secondary'): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: variant === 'secondary' ? '1px solid var(--border-default)' : 'none',
    backgroundColor: variant === 'primary' ? 'var(--color-navy)' : 'var(--bg-card)',
    color: variant === 'primary' ? 'white' : 'var(--text-secondary)',
    cursor: 'pointer',
  }),
  // Hint sub-bar between content and footer.
  kbdHintBar: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    padding: 'var(--space-2) 24px',
    borderTop: '1px solid var(--border-light)',
    lineHeight: 1.5,
    flexShrink: 0,
  } as React.CSSProperties,
  // Manual footer — we render this instead of Modal.Footer because the
  // primitive's flex-wrap behaviour was packing Cancel + Confirm onto
  // separate rows at some viewport widths (Confirm got clipped off-screen).
  // This footer uses `text-align: right` on a block-level container, which
  // is the most bulletproof way to right-align a small group of inline
  // buttons — no flex math, no wrap edge cases.
  manualFooter: {
    textAlign: 'right' as const,
    padding: '16px 24px 20px',
    borderTop: '1px solid var(--border-default)',
    flexShrink: 0,
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
  manualFooterGap: {
    display: 'inline-block',
    width: 'var(--space-3)',
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------
export function DuplicateWarningModal({
  mode,
  items,
  canvasTaskByQueueId,
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
  // Per-item per-field choice map ('canvas' | 'user' for title/dueAt/taskType).
  // Defaults to Canvas-wins-everything; FieldMergeEditor mutates per item.
  const [fieldChoicesByQueueId, setFieldChoicesByQueueId] = useState<
    Map<number, FieldChoice>
  >(() => {
    const map = new Map<number, FieldChoice>();
    for (const i of items) map.set(i.queueId, buildDefaultChoices(i));
    return map;
  });
  // Bulk mode only: which item (if any) is currently being edited in the
  // child "Customize fields" modal layered above the bulk list.
  const [editingQueueId, setEditingQueueId] = useState<number | null>(null);
  // Snapshot of choices taken when the child modal opens — restored on Cancel.
  const editSnapshotRef = useRef<FieldChoice | null>(null);
  // Child-modal field-picker keyboard navigation: which conflict field is
  // currently "focused" inside the FieldMergeEditor. Reset to 0 each time
  // the child modal opens.
  const [editingFocusedFieldIdx, setEditingFocusedFieldIdx] = useState(0);
  // Focused row index (bulk mode keyboard nav)
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const item0 = items[0];
  const isSingle = mode === 'single';

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

  const setFieldChoice = useCallback((queueId: number, next: FieldChoice) => {
    setFieldChoicesByQueueId((prev) => new Map(prev).set(queueId, next));
  }, []);

  const openCustomize = useCallback(
    (queueId: number) => {
      // Snapshot current choices so Cancel can revert.
      const current = fieldChoicesByQueueId.get(queueId);
      editSnapshotRef.current = current ? { ...current } : null;
      // Reset field-picker focus to the first conflict whenever the child opens.
      setEditingFocusedFieldIdx(0);
      setEditingQueueId(queueId);
    },
    [fieldChoicesByQueueId]
  );

  const closeCustomizeSave = useCallback(() => {
    editSnapshotRef.current = null;
    setEditingQueueId(null);
  }, []);

  const closeCustomizeCancel = useCallback(() => {
    if (editingQueueId != null && editSnapshotRef.current) {
      setFieldChoice(editingQueueId, editSnapshotRef.current);
    }
    editSnapshotRef.current = null;
    setEditingQueueId(null);
  }, [editingQueueId, setFieldChoice]);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    try {
      await onConfirm(decisions, selected, fieldChoicesByQueueId);
    } finally {
      setIsConfirming(false);
    }
  }, [onConfirm, decisions, selected, fieldChoicesByQueueId]);

  // --- Keyboard shortcuts ---
  // Esc gives the child modal priority — if open, close it; otherwise cancel.
  useHotkeys(
    'esc',
    () => {
      if (editingQueueId != null) closeCustomizeCancel();
      else onCancel();
    },
    { enableOnFormTags: false }
  );
  useHotkeys('l', () => {
    if (editingQueueId != null) return;
    if (isSingle && item0) {
      setDecision(item0.queueId, 'link');
      handleConfirm();
    } else {
      const focused = items[focusedIdx];
      if (focused) setDecision(focused.queueId, 'link');
    }
  });
  useHotkeys('s', () => {
    if (editingQueueId != null) return;
    if (isSingle && item0) {
      setDecision(item0.queueId, 'separate');
      handleConfirm();
    } else {
      const focused = items[focusedIdx];
      if (focused) setDecision(focused.queueId, 'separate');
    }
  });
  useHotkeys('enter', () => {
    if (editingQueueId != null) {
      closeCustomizeSave();
    } else if (!isSingle) {
      handleConfirm();
    }
  });
  useHotkeys('a', () => {
    if (editingQueueId != null) return;
    if (!isSingle) toggleAll();
  });
  useHotkeys('c', () => {
    if (editingQueueId != null || isSingle) return;
    const focused = items[focusedIdx];
    if (focused?.match?.conflictingFields.length) openCustomize(focused.queueId);
  });
  // Resolve the item / canvasTask for the child editor up front so the render
  // tree stays simple.
  const editingItem = useMemo(
    () =>
      editingQueueId != null ? items.find((i) => i.queueId === editingQueueId) : null,
    [editingQueueId, items]
  );
  // Conflict-field list for the currently-edited item (drives child-modal
  // arrow navigation).
  const editingConflictFields = editingItem?.match?.conflictingFields ?? [];

  /**
   * Helper used by the child-modal picker hotkeys (Left/Right/1/2): set the
   * choice for the currently focused conflict field.
   */
  const pickFocusedField = useCallback(
    (side: 'canvas' | 'user') => {
      if (editingQueueId == null || !editingItem) return;
      const field = editingConflictFields[editingFocusedFieldIdx]?.field as
        | FieldKey
        | undefined;
      if (!field) return;
      const cur =
        fieldChoicesByQueueId.get(editingQueueId) ?? buildDefaultChoices(editingItem);
      setFieldChoice(editingQueueId, { ...cur, [field]: side });
    },
    [
      editingQueueId,
      editingItem,
      editingConflictFields,
      editingFocusedFieldIdx,
      fieldChoicesByQueueId,
      setFieldChoice,
    ]
  );

  /** Snap all conflict fields to one side (Q / W shortcuts). */
  const pickAll = useCallback(
    (side: 'canvas' | 'user') => {
      if (editingQueueId == null || !editingItem) return;
      setFieldChoice(editingQueueId, { title: side, dueAt: side, taskType: side });
    },
    [editingQueueId, editingItem, setFieldChoice]
  );

  useHotkeys('ArrowUp', () => {
    if (editingQueueId != null) {
      // Walk conflict fields inside the child modal.
      setEditingFocusedFieldIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (!isSingle) setFocusedIdx((i) => Math.max(0, i - 1));
  });
  useHotkeys('ArrowDown', () => {
    if (editingQueueId != null) {
      const max = Math.max(0, editingConflictFields.length - 1);
      setEditingFocusedFieldIdx((i) => Math.min(max, i + 1));
      return;
    }
    if (!isSingle) setFocusedIdx((i) => Math.min(items.length - 1, i + 1));
  });
  useHotkeys('ArrowLeft, 1', () => {
    if (editingQueueId != null) pickFocusedField('canvas');
  });
  useHotkeys('ArrowRight, 2', () => {
    if (editingQueueId != null) pickFocusedField('user');
  });
  // Q/E mirrors the app-wide left/right navigation pair (CourseDetail uses
  // them for section back/forward), so these shortcuts feel like the
  // existing "previous/next" muscle memory.
  useHotkeys('q', () => {
    if (editingQueueId != null) pickAll('canvas');
  });
  useHotkeys('e', () => {
    if (editingQueueId != null) pickAll('user');
  });
  useHotkeys('space', (e) => {
    e.preventDefault();
    if (editingQueueId != null) return;
    if (!isSingle) {
      const focused = items[focusedIdx];
      if (focused) toggleSelected(focused.queueId);
    }
  });

  // Header strings derived once.
  const headerTitle = isSingle
    ? item0?.match?.type === 'exact'
      ? `Duplicate found — ${item0.match.task.title}`
      : `May match — ${item0?.match?.task.title}`
    : `Review before accepting (${items.length} item${items.length > 1 ? 's' : ''})`;
  const headerSubtitle = isSingle
    ? item0?.match?.type === 'exact'
      ? 'Matches an existing task'
      : 'May match an existing task'
    : undefined;

  return (
    <>
      <Modal
        isOpen
        onClose={onCancel}
        size="lg"
        zIndex={1100}
        // Our own useHotkeys('esc') handler manages Esc so it can give the
        // child editor priority. Don't double-handle it.
        closeOnEscape={false}
      >
        <Modal.Header
          title={headerTitle}
          subtitle={headerSubtitle}
          icon={<AlertTriangle size={20} color="var(--color-warning)" />}
          onClose={onCancel}
        />

        <Modal.Content>
          {isSingle && item0 && item0.match && (
            <>
              <FieldMergeEditor
                item={item0}
                canvasTask={
                  canvasTaskByQueueId.get(item0.queueId) ?? {
                    title: item0.match.task.title,
                    dueAt: null,
                    taskType: null,
                  }
                }
                choices={
                  fieldChoicesByQueueId.get(item0.queueId) ?? buildDefaultChoices(item0)
                }
                onChange={(next) => setFieldChoice(item0.queueId, next)}
              />
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
                    accentColor: 'var(--color-navy)',
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
                const hasConflicts = item.match.conflictingFields.length > 0;
                const choices =
                  fieldChoicesByQueueId.get(item.queueId) ?? buildDefaultChoices(item);
                const customized = isCustomized(item, choices);

                return (
                  <div
                    key={item.queueId}
                    style={s.bulkItem(isFocused)}
                    onClick={() => setFocusedIdx(idx)}
                  >
                    <div style={s.bulkItemHeader}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelected(item.queueId)}
                        style={{
                          accentColor: 'var(--color-navy)',
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
                      {customized && (
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-success)',
                            fontStyle: 'italic' as const,
                          }}
                        >
                          (customized)
                        </span>
                      )}
                      <span style={s.matchBadge(item.match.type)}>
                        {item.match.type === 'exact' ? '⚠ Exact match' : '~ May match'}
                      </span>
                    </div>

                    <div style={s.bulkItemBody}>
                      {/* Conflicting fields summary — values formatted per type */}
                      {hasConflicts ? (
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
                                {formatFieldValue(f.field, f.canvasValue)}
                              </span>
                              {' → '}
                              <span>{formatFieldValue(f.field, f.localValue)}</span>
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

                      {/* Link / separate / customize controls */}
                      <div
                        style={{
                          ...s.radioGroup,
                          alignItems: 'center',
                          flexWrap: 'wrap' as const,
                        }}
                      >
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
                        {hasConflicts && (
                          <button
                            style={{
                              // Higher-contrast Customize button so it's
                              // clearly discoverable as a third action.
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: 'var(--space-1) var(--space-3)',
                              borderRadius: 'var(--radius-md)',
                              border: customized
                                ? '1px solid var(--color-success)'
                                : '1px solid var(--color-navy)',
                              backgroundColor: customized
                                ? 'var(--color-success-bg)'
                                : 'var(--color-info-bg)',
                              color: customized
                                ? 'var(--color-success)'
                                : 'var(--color-navy)',
                              fontSize: 'var(--text-xs)',
                              fontWeight: 'var(--font-medium)',
                              cursor:
                                !isChecked || decision !== 'link'
                                  ? 'not-allowed'
                                  : 'pointer',
                              opacity: !isChecked || decision !== 'link' ? 0.5 : 1,
                              marginLeft: 'auto', // push to the right edge
                            }}
                            onClick={() => openCustomize(item.queueId)}
                            disabled={!isChecked || decision !== 'link'}
                            title="Customize which value wins for each conflicting field"
                          >
                            <Settings2 size={13} />
                            {customized ? 'Customized — edit' : 'Customize fields'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </Modal.Content>

        {/* Keyboard hint sub-bar — outside the footer so the footer's flex
          layout for [Cancel] [Confirm] isn't perturbed by a 100%-basis
          sibling. */}
        <div style={s.kbdHintBar}>
          {isSingle
            ? 'L — link · S — separate · Esc — cancel'
            : '↑↓ nav · Space toggle · A all · L/S set · C customize · Enter confirm · Esc cancel'}
        </div>

        <div style={s.manualFooter}>
          <button style={s.btn('secondary')} onClick={onCancel} disabled={isConfirming}>
            Cancel
          </button>
          <span style={s.manualFooterGap} />
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
      </Modal>

      {/* Child modal — per-item field merge editor, opened from bulk row Customize.
        Layered above the parent via zIndex=1200 (parent uses 1100). */}
      {editingItem && editingItem.match && (
        <Modal
          isOpen
          onClose={closeCustomizeCancel}
          size="md"
          zIndex={1200}
          closeOnEscape={false}
        >
          <Modal.Header
            title={`Edit field merge — ${editingItem.match.task.title}`}
            subtitle="Choices apply when you Confirm in the bulk dialog."
            icon={<Settings2 size={20} color="var(--color-navy)" />}
            onClose={closeCustomizeCancel}
          />
          <Modal.Content>
            <FieldMergeEditor
              item={editingItem}
              canvasTask={
                canvasTaskByQueueId.get(editingItem.queueId) ?? {
                  title: editingItem.match.task.title,
                  dueAt: null,
                  taskType: null,
                }
              }
              choices={
                fieldChoicesByQueueId.get(editingItem.queueId) ??
                buildDefaultChoices(editingItem)
              }
              onChange={(next) => setFieldChoice(editingItem.queueId, next)}
              focusedFieldKey={
                (editingConflictFields[editingFocusedFieldIdx]?.field as
                  | FieldKey
                  | undefined) ?? null
              }
            />
          </Modal.Content>
          <div style={s.kbdHintBar}>
            ↑↓ field · ←→ pick · Q canvas · E local · Enter save · Esc cancel
          </div>
          <div style={s.manualFooter}>
            <button
              style={s.btn('secondary')}
              onClick={() =>
                setFieldChoice(editingItem.queueId, buildDefaultChoices(editingItem))
              }
              title="Reset all conflicting fields to Canvas defaults"
            >
              Reset to Canvas defaults
            </button>
            <span style={s.manualFooterGap} />
            <button style={s.btn('secondary')} onClick={closeCustomizeCancel}>
              Cancel
            </button>
            <span style={s.manualFooterGap} />
            <button style={s.btn('primary')} onClick={closeCustomizeSave}>
              <Check size={14} /> Save
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default DuplicateWarningModal;
