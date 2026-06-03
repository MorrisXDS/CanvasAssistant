/**
 * CorruptionDialog — database-corruption recovery dialog.
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned modal with header (icon + title), scrollable content
 * (description + error details + status banners) and a footer of stacked
 * action rows.
 *
 * Esc handling: `closeOnEscape={false}` and `closeOnBackdropClick={false}`
 * because the user must explicitly pick a recovery path (Export / Reset /
 * Continue). Dismissing the dialog without a choice would leave the app
 * in a known-bad state. The header's close button is also hidden — the
 * `onClose` callback is reserved for the parent to invoke after a
 * successful `reset` / `continue` action completes.
 *
 * z-index: 1100 — same tier as ReAuthModal so corruption recovery wins
 * over a stale re-auth prompt if both somehow trigger together.
 */

import React, { useState } from 'react';
import { Button } from './Button';
import { Modal } from '../primitives/Modal';
import { Z_INDEX } from '../../constants';

export interface CorruptionInfo {
  errors: string[];
  canContinue: boolean;
}

export interface CorruptionDialogProps {
  corruption: CorruptionInfo;
  onAction: (
    action: 'reset' | 'continue' | 'export'
  ) => Promise<{ success: boolean; exportPath?: string; error?: string }>;
  onClose: () => void;
}

export function CorruptionDialog({
  corruption,
  onAction,
  onClose,
}: CorruptionDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'reset' | 'continue' | 'export') => {
    setIsLoading(true);
    setLoadingAction(action);
    setError(null);

    try {
      const result = await onAction(action);
      if (result.success) {
        if (action === 'export' && result.exportPath) {
          setExportPath(result.exportPath);
        } else if (action === 'continue' || action === 'reset') {
          onClose();
        }
      } else {
        setError(result.error || 'Operation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  return (
    <Modal
      isOpen
      // No accidental dismissal — user must pick Export / Reset / Continue.
      closeOnEscape={false}
      closeOnBackdropClick={false}
      size="lg"
      zIndex={Z_INDEX.modal}
    >
      <Modal.Header
        title="Database Issue Detected"
        icon={
          <span
            style={{ fontSize: '1.5rem', color: 'var(--color-critical)' }}
            aria-hidden="true"
          >
            !
          </span>
        }
        showCloseButton={false}
      />

      <Modal.Content>
        <p style={styles.description}>
          The app detected potential issues with the database. This can happen after an
          unexpected shutdown or crash. Choose how you'd like to proceed:
        </p>

        {corruption.errors.length > 0 && (
          <div style={styles.errors}>
            <strong>Details:</strong>
            <ul style={{ margin: 'var(--space-2) 0', paddingLeft: 'var(--space-4)' }}>
              {corruption.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {corruption.errors.length > 5 && (
                <li>...and {corruption.errors.length - 5} more</li>
              )}
            </ul>
          </div>
        )}

        {exportPath && (
          <div style={styles.success}>Data exported successfully to: {exportPath}</div>
        )}

        {error && <div style={styles.errorBanner}>Error: {error}</div>}
      </Modal.Content>

      <Modal.Footer align="start">
        <div style={styles.actionsStack}>
          <div style={styles.actionRow}>
            <span style={styles.actionText}>
              Export your data first (recommended before reset)
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAction('export')}
              disabled={isLoading}
            >
              {loadingAction === 'export' ? 'Exporting...' : 'Export Data'}
            </Button>
          </div>

          <div style={styles.actionRow}>
            <span style={styles.actionText}>Reset database and re-sync from Canvas</span>
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleAction('reset')}
              disabled={isLoading}
            >
              {loadingAction === 'reset' ? 'Resetting...' : 'Reset Database'}
            </Button>
          </div>

          {corruption.canContinue && (
            <div style={styles.actionRow}>
              <span style={styles.actionText}>
                Continue with the current database (not recommended)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction('continue')}
                disabled={isLoading}
              >
                {loadingAction === 'continue' ? 'Continuing...' : 'Continue Anyway'}
              </Button>
            </div>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  description: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
    marginTop: 0,
    lineHeight: 1.5,
  },

  errors: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
    maxHeight: '150px',
    overflow: 'auto',
  },

  success: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-success)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  errorBanner: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-critical-bg)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-critical)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  // The Modal.Footer's default flex row wraps; we want vertically-stacked
  // action rows here, so own the layout inside a single footer child.
  actionsStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    width: '100%',
  },

  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  actionText: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },
};

export default CorruptionDialog;
