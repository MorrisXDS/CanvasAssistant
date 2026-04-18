/**
 * ConfirmDialog - Modern confirmation dialog component
 */

import React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

type DialogType = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Additional content to render below the message */
  children?: React.ReactNode;
  /** Hide the cancel button */
  hideCancel?: boolean;
}

const typeConfig: Record<
  DialogType,
  { icon: React.ReactNode; color: string; bgColor: string }
> = {
  danger: {
    icon: <XCircle size={24} />,
    color: 'var(--color-error)',
    bgColor: 'var(--color-error-bg)',
  },
  warning: {
    icon: <AlertTriangle size={24} />,
    color: 'var(--color-warning)',
    bgColor: 'var(--color-warning-bg)',
  },
  info: {
    icon: <Info size={24} />,
    color: 'var(--color-info)',
    bgColor: 'var(--color-info-bg)',
  },
  success: {
    icon: <CheckCircle size={24} />,
    color: 'var(--color-success)',
    bgColor: 'var(--color-success-bg)',
  },
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  type = 'warning',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  children,
  hideCancel = false,
}: ConfirmDialogProps) {
  // Auto-focus the confirm button when the dialog opens so Enter activates
  // it natively and the dialog has clear keyboard ownership.
  const confirmBtnRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    // Defer to next tick to make sure the element is in the DOM and any
    // underlying autoFocus has settled.
    const id = requestAnimationFrame(() => {
      confirmBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  // Escape cancels. Capture phase + stopPropagation so a parent modal's
  // Escape handler doesn't also fire and close everything.
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const config = typeConfig[type];

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onCancel} />

      {/* Dialog */}
      <div style={styles.dialog}>
        {/* Icon */}
        <div
          style={{
            ...styles.iconWrapper,
            backgroundColor: config.bgColor,
            color: config.color,
          }}
        >
          {config.icon}
        </div>

        {/* Content */}
        <div style={styles.content}>
          <h3 style={styles.title}>{title}</h3>
          {message && <p style={styles.message}>{message}</p>}
          {children}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          {!hideCancel && (
            <button type="button" style={styles.cancelBtn} onClick={onCancel}>
              {cancelText}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            style={{
              ...styles.confirmBtn,
              backgroundColor:
                type === 'danger' ? 'var(--color-error)' : 'var(--color-navy)',
            }}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },

  dialog: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-xl)',
    boxShadow:
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    width: '100%',
    maxWidth: '400px',
    padding: '24px',
    zIndex: 1001,
    // Remove animation to prevent positioning flash on render
  },

  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },

  content: {
    marginBottom: '24px',
  },

  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 8px 0',
  },

  message: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },

  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },

  cancelBtn: {
    height: '40px',
    padding: '0 20px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    transition: 'all 150ms ease',
  },

  confirmBtn: {
    height: '40px',
    padding: '0 20px',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'white',
    transition: 'all 150ms ease',
  },
};

export default ConfirmDialog;
