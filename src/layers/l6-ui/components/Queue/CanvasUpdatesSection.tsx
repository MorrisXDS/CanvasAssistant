/**
 * CanvasUpdatesSection Component
 * Collapsible section showing queued Canvas tasks awaiting user review
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, CloudDownload, CheckCircle2 } from 'lucide-react';
import { QueuedTaskCard, type QueuedTaskEdits } from './QueuedTaskCard';
import { ConfirmDialog } from '../shared';
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
    display: 'flex',
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
    width: '22px', // Match expand toggle width
    flexShrink: 0,
  } as React.CSSProperties,
  colTitle: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,
  colType: {
    width: '120px',
    flexShrink: 0,
  } as React.CSSProperties,
  colDue: {
    width: '70px',
    flexShrink: 0,
    textAlign: 'right' as const,
  } as React.CSSProperties,
  colActions: {
    width: '110px', // 3 buttons * 28px + 6px gaps
    flexShrink: 0,
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
  onBulkAccept,
  onLink,
  defaultExpanded = false,
}: CanvasUpdatesSectionProps) {
  // Collapsed by default (can be changed via settings)
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Show confirmation dialog for bulk accept
  const handleBulkAcceptClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmDialog(true);
  };

  // Handle confirmed bulk accept
  const handleConfirmedBulkAccept = async () => {
    setShowConfirmDialog(false);
    setIsAcceptingAll(true);
    try {
      await onBulkAccept();
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
          {queuedTasks.map((queuedTask) => (
            <QueuedTaskCard
              key={queuedTask.id}
              queuedTask={queuedTask}
              onAccept={onAccept}
              onReject={onReject}
              onLink={onLink}
            />
          ))}
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
    </div>
  );
}

export default CanvasUpdatesSection;
