/**
 * CorruptionDialog Component
 * Dialog shown when database corruption is detected, offering recovery options
 */

import React, { useState } from 'react';
import { Button } from './Button';

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

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  };

  const dialogStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
  };

  const headerStyle: React.CSSProperties = {
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-default)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    color: 'var(--color-critical)',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  };

  const contentStyle: React.CSSProperties = {
    padding: 'var(--space-4)',
  };

  const descriptionStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
    lineHeight: 1.5,
  };

  const errorsStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
    maxHeight: '150px',
    overflow: 'auto',
  };

  const actionsStyle: React.CSSProperties = {
    padding: 'var(--space-4)',
    borderTop: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  };

  const actionRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  };

  const actionTextStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  };

  const successStyle: React.CSSProperties = {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-success)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  };

  const errorStyle: React.CSSProperties = {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-critical-bg)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-critical)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  };

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="corruption-title"
    >
      <div style={dialogStyle}>
        <div style={headerStyle}>
          <span style={iconStyle} aria-hidden="true">
            !
          </span>
          <h2 id="corruption-title" style={titleStyle}>
            Database Issue Detected
          </h2>
        </div>

        <div style={contentStyle}>
          <p style={descriptionStyle}>
            The app detected potential issues with the database. This can happen after an
            unexpected shutdown or crash. Choose how you'd like to proceed:
          </p>

          {corruption.errors.length > 0 && (
            <div style={errorsStyle}>
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
            <div style={successStyle}>Data exported successfully to: {exportPath}</div>
          )}

          {error && <div style={errorStyle}>Error: {error}</div>}
        </div>

        <div style={actionsStyle}>
          <div style={actionRowStyle}>
            <span style={actionTextStyle}>
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

          <div style={actionRowStyle}>
            <span style={actionTextStyle}>Reset database and re-sync from Canvas</span>
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
            <div style={actionRowStyle}>
              <span style={actionTextStyle}>
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
      </div>
    </div>
  );
}

export default CorruptionDialog;
