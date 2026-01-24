/**
 * Sync Conflict Resolution Modal
 *
 * Displays conflicts between local and Canvas data,
 * allowing users to choose which value to keep.
 */

import React, { useState } from 'react';
import { AlertTriangle, X, Check, RefreshCw } from 'lucide-react';

export interface SyncConflictData {
  id: string;
  entity: 'course' | 'task' | 'notification';
  entityId: number;
  externalId: string;
  entityName: string;
  field: string;
  fieldLabel: string;
  localValue: unknown;
  canvasValue: unknown;
  timestamp: string;
}

export interface ConflictResolutionData {
  conflictId: string;
  useCanvasValue: boolean;
  rememberChoice: boolean;
  rememberForAll: boolean;
}

interface SyncConflictModalProps {
  isOpen: boolean;
  conflicts: SyncConflictData[];
  onResolve: (resolution: ConflictResolutionData) => void;
  onResolveAll: (useCanvasValues: boolean) => void;
  onClose: () => void;
}

export function SyncConflictModal({
  isOpen,
  conflicts,
  onResolve,
  onResolveAll,
  onClose,
}: SyncConflictModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [rememberForAll, setRememberForAll] = useState(false);

  if (!isOpen || conflicts.length === 0) return null;

  const currentConflict = conflicts[currentIndex];
  const isLast = currentIndex === conflicts.length - 1;

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(not set)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') {
      if (value.length > 100) return value.substring(0, 100) + '...';
      return value || '(empty)';
    }
    return JSON.stringify(value);
  };

  const handleResolve = (useCanvasValue: boolean) => {
    onResolve({
      conflictId: currentConflict.id,
      useCanvasValue,
      rememberChoice,
      rememberForAll,
    });

    // Move to next conflict or close
    if (isLast) {
      onClose();
    } else {
      setCurrentIndex(currentIndex + 1);
      setRememberChoice(false);
      setRememberForAll(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <AlertTriangle size={20} color="var(--color-warning)" />
            <h2 style={styles.title}>Sync Conflict</h2>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Progress */}
        <div style={styles.progress}>
          <span style={styles.progressText}>
            Conflict {currentIndex + 1} of {conflicts.length}
          </span>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((currentIndex + 1) / conflicts.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Conflict Details */}
        <div style={styles.content}>
          <div style={styles.entityInfo}>
            <span style={styles.entityType}>{currentConflict.entity}</span>
            <span style={styles.entityName}>{currentConflict.entityName}</span>
          </div>

          <div style={styles.fieldInfo}>
            <span style={styles.fieldLabel}>{currentConflict.fieldLabel}</span>
            <span style={styles.fieldName}>({currentConflict.field})</span>
          </div>

          {/* Values comparison */}
          <div style={styles.valuesContainer}>
            <div style={styles.valueBox}>
              <div style={styles.valueHeader}>
                <span style={styles.valueLabel}>Your Value</span>
              </div>
              <div style={styles.valueContent}>
                {formatValue(currentConflict.localValue)}
              </div>
              <button
                style={styles.choiceButton}
                onClick={() => handleResolve(false)}
              >
                <Check size={16} />
                Keep My Value
              </button>
            </div>

            <div style={styles.valueDivider}>
              <RefreshCw size={16} color="var(--text-muted)" />
            </div>

            <div style={styles.valueBox}>
              <div style={styles.valueHeader}>
                <span style={styles.valueLabel}>Canvas Value</span>
              </div>
              <div style={styles.valueContent}>
                {formatValue(currentConflict.canvasValue)}
              </div>
              <button
                style={{ ...styles.choiceButton, ...styles.canvasButton }}
                onClick={() => handleResolve(true)}
              >
                <Check size={16} />
                Use Canvas Value
              </button>
            </div>
          </div>

          {/* Remember options */}
          <div style={styles.rememberOptions}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => {
                  setRememberChoice(e.target.checked);
                  if (!e.target.checked) setRememberForAll(false);
                }}
              />
              <span>Remember my choice for this {currentConflict.entity}'s {currentConflict.fieldLabel}</span>
            </label>

            {rememberChoice && (
              <label style={{ ...styles.checkbox, marginLeft: 'var(--space-4)' }}>
                <input
                  type="checkbox"
                  checked={rememberForAll}
                  onChange={(e) => setRememberForAll(e.target.checked)}
                />
                <span>Apply to all {currentConflict.entity}s</span>
              </label>
            )}
          </div>
        </div>

        {/* Footer with bulk actions */}
        <div style={styles.footer}>
          <button
            style={styles.bulkButton}
            onClick={() => onResolveAll(false)}
          >
            Keep All My Values
          </button>
          <button
            style={styles.bulkButton}
            onClick={() => onResolveAll(true)}
          >
            Use All Canvas Values
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-light)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
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
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-md)',
  },
  progress: {
    padding: 'var(--space-3) var(--space-5)',
    backgroundColor: 'var(--bg-secondary)',
  },
  progressText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-2)',
    display: 'block',
  },
  progressBar: {
    height: '4px',
    backgroundColor: 'var(--border-light)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--color-blue)',
    transition: 'width 0.3s ease',
  },
  content: {
    padding: 'var(--space-5)',
    overflowY: 'auto',
    flex: 1,
  },
  entityInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  entityType: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-inverse)',
    backgroundColor: 'var(--color-navy)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase',
  },
  entityName: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },
  fieldInfo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  fieldLabel: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },
  fieldName: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
  },
  valuesContainer: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'stretch',
    marginBottom: 'var(--space-4)',
  },
  valueBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    border: '1px solid var(--border-light)',
  },
  valueHeader: {
    marginBottom: 'var(--space-2)',
  },
  valueLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },
  valueContent: {
    fontSize: 'var(--text-base)',
    color: 'var(--text-primary)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-sm)',
    minHeight: '40px',
    marginBottom: 'var(--space-3)',
    flex: 1,
    wordBreak: 'break-word',
  },
  valueDivider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 var(--space-2)',
  },
  choiceButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-green)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },
  canvasButton: {
    backgroundColor: 'var(--color-blue)',
  },
  rememberOptions: {
    borderTop: '1px solid var(--border-light)',
    paddingTop: 'var(--space-4)',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginBottom: 'var(--space-2)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-secondary)',
  },
  bulkButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
  },
};

export default SyncConflictModal;
