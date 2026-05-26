/**
 * CanvasUpdatesSection Component
 * Collapsible section showing queued Canvas tasks awaiting user review
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, CloudDownload, CheckCircle2 } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { QueuedTaskCard, type QueuedTaskEdits } from './QueuedTaskCard';
import { ConfirmDialog } from '../shared';
import { DuplicateWarningModal } from '../shared/DuplicateWarningModal';
import { useFocusedItem } from '../../hooks/useFocusedItem';
import { useDuplicateGate } from '../../hooks/useDuplicateGate';
import type { QueuedTask } from '../../../l5-presentation/types';

interface CanvasUpdatesSectionProps {
  queuedTasks: QueuedTask[];
  onAccept: (
    queueId: number,
    edits?: QueuedTaskEdits
  ) => Promise<{ success: boolean; taskId?: number }>;
  onReject: (queueId: number) => Promise<boolean>;
  onBulkAccept: () => Promise<{ success: boolean; acceptedCount?: number }>;
  onLink: (queueId: number) => void;
  defaultExpanded?: boolean;
  highlightedQueueId?: number;
  onHighlightClear?: () => void;
  /** Keyboard nav active — W/S/↑/↓ walks queued cards; A/R/L act on focus. */
  keyboardEnabled?: boolean;
}

const styles = {
  section: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    marginBottom: 'var(--space-4)',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-info-bg)',
    borderBottom: '1px solid var(--border-light)',
    userSelect: 'none' as const,
  } as React.CSSProperties,
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  headerIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-info)',
    color: 'white',
  } as React.CSSProperties,
  headerTitle: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as React.CSSProperties,
  title: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  } as React.CSSProperties,
  subtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-info)',
    color: 'white',
  } as React.CSSProperties,
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  } as React.CSSProperties,
  bulkButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-success)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  } as React.CSSProperties,
  expandIcon: {
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  content: {
    // No padding - rows go edge to edge
  } as React.CSSProperties,
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '28px 3fr 1.2fr 0.8fr 110px',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-tertiary)',
    borderBottom: '1px solid var(--border-default)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  colSpacer: {
    // Grid handles sizing
  } as React.CSSProperties,
  colTitle: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  colType: {
    textAlign: 'left' as const,
  } as React.CSSProperties,
  colDue: {
    textAlign: 'left' as const,
  } as React.CSSProperties,
  colActions: {
    textAlign: 'center' as const,
  } as React.CSSProperties,
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  emptyIcon: {
    marginBottom: 'var(--space-3)',
  } as React.CSSProperties,
  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  } as React.CSSProperties,
};

export function CanvasUpdatesSection({
  queuedTasks,
  onAccept,
  onReject,
  onBulkAccept: _onBulkAccept,
  onLink,
  defaultExpanded = false,
  highlightedQueueId,
  onHighlightClear,
  keyboardEnabled = false,
}: CanvasUpdatesSectionProps) {
  const { gatedAccept, gatedBulkAccept, confirmDecisions, gateState, closeModal } =
    useDuplicateGate();

  // Collapsed by default (can be changed via settings)
  // Force expand if there's a highlighted queue item
  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded || highlightedQueueId != null
  );
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Auto-expand when keyboard focus arrives so users can actually see the
  // card they're walking.
  useEffect(() => {
    if (keyboardEnabled && !isExpanded) setIsExpanded(true);
  }, [keyboardEnabled, isExpanded]);

  // Focused-card navigation when keyboard is active.
  const { focusedIndex, focusedItem, getFocusProps } = useFocusedItem(queuedTasks, {
    persistKey: 'course-detail-queue',
    enabled: keyboardEnabled,
    verticalNav: true,
  });

  useHotkeys(
    'a',
    (e) => {
      if (!focusedItem || !keyboardEnabled) return;
      if (e.shiftKey) return; // Shift+A = bulk accept below
      e.preventDefault();
      gatedAccept(focusedItem);
    },
    { enabled: keyboardEnabled },
    [focusedItem, gatedAccept, keyboardEnabled]
  );
  useHotkeys(
    'shift+a',
    (e) => {
      if (!keyboardEnabled) return;
      e.preventDefault();
      setShowConfirmDialog(true);
    },
    { enabled: keyboardEnabled },
    [keyboardEnabled]
  );
  useHotkeys(
    'r',
    (e) => {
      if (!focusedItem || !keyboardEnabled) return;
      e.preventDefault();
      onReject(focusedItem.id);
    },
    { enabled: keyboardEnabled },
    [focusedItem, onReject, keyboardEnabled]
  );
  useHotkeys(
    'l',
    (e) => {
      if (!focusedItem || !keyboardEnabled) return;
      e.preventDefault();
      onLink(focusedItem.id);
    },
    { enabled: keyboardEnabled },
    [focusedItem, onLink, keyboardEnabled]
  );

  // Auto-expand when highlight is set
  useEffect(() => {
    if (highlightedQueueId != null) {
      // Force expand - QueuedTaskCard handles its own scroll
      setIsExpanded(true);

      // Clear highlight after 3 seconds
      const timer = setTimeout(() => {
        onHighlightClear?.();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [highlightedQueueId, onHighlightClear]);

  // Show confirmation dialog for bulk accept
  const handleBulkAcceptClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDialog(true);
  };

  // Handle confirmed bulk accept — routes through duplicate gate
  const handleConfirmedBulkAccept = async () => {
    setShowConfirmDialog(false);
    setIsAcceptingAll(true);
    try {
      await gatedBulkAccept(queuedTasks);
    } finally {
      setIsAcceptingAll(false);
    }
  };

  // Don't render if no queued tasks
  if (queuedTasks.length === 0) {
    return null;
  }

  return (
    <div style={styles.section}>
      <div style={styles.header} onDoubleClick={() => setIsExpanded(!isExpanded)}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <CloudDownload size={18} />
          </div>
          <div style={styles.headerTitle}>
            <span style={styles.title}>
              Canvas Updates
              <span style={styles.badge}>{queuedTasks.length}</span>
            </span>
            <span style={styles.subtitle}>Double-click to review new assignments</span>
          </div>
        </div>
        <div style={styles.headerRight}>
          {queuedTasks.length > 1 && (
            <button
              style={styles.bulkButton}
              onClick={handleBulkAcceptClick}
              disabled={isAcceptingAll}
            >
              <CheckCircle2 size={14} />
              {isAcceptingAll ? 'Accepting...' : 'Accept All'}
            </button>
          )}
          <span
            style={{ ...styles.expandIcon, cursor: 'pointer', padding: '4px' }}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div style={styles.content}>
          {/* Table Header */}
          <div style={styles.tableHeader}>
            <div style={styles.colSpacer} />
            <span style={styles.colTitle}>Title</span>
            <span style={styles.colType}>Type</span>
            <span style={styles.colDue}>Due</span>
            <span style={styles.colActions}>Actions</span>
          </div>
          {/* Rows */}
          {queuedTasks.map((queuedTask, i) => {
            const isFocused = focusedIndex === i;
            const { 'data-focus-index': fIdx, 'data-focus-scope': fScope } =
              getFocusProps(i);
            return (
              <div
                key={queuedTask.id}
                data-focus-index={fIdx}
                data-focus-scope={fScope}
                style={{
                  ...(isFocused
                    ? {
                        outline: '2px solid var(--color-navy)',
                        outlineOffset: '-2px',
                        borderRadius: '4px',
                        position: 'relative',
                      }
                    : {}),
                }}
              >
                <QueuedTaskCard
                  queuedTask={queuedTask}
                  onAccept={(queueId, edits) => {
                    const task = queuedTasks.find((t) => t.id === queueId);
                    if (task) gatedAccept(task, edits);
                    else onAccept(queueId, edits);
                  }}
                  onReject={onReject}
                  onLink={onLink}
                  isHighlighted={queuedTask.id === highlightedQueueId}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Accept All Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Accept All Tasks"
        message={`Are you sure you want to accept all ${queuedTasks.length} Canvas tasks? They will be added to your coursework immediately.`}
        confirmText="Accept All"
        cancelText="Cancel"
        type="info"
        onConfirm={handleConfirmedBulkAccept}
        onCancel={() => setShowConfirmDialog(false)}
      />

      {/* Duplicate warning gate */}
      {gateState && (
        <DuplicateWarningModal
          mode={gateState.mode}
          items={gateState.items}
          onConfirm={confirmDecisions}
          onCancel={closeModal}
        />
      )}
    </div>
  );
}

export default CanvasUpdatesSection;
