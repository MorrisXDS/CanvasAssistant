/**
 * ConfirmDialog — confirmation dialog built on the shared `Modal` primitive.
 *
 * Public API is unchanged from the previous handwritten implementation; only
 * the structural chrome (backdrop / centered dialog / escape / body-scroll
 * lock / z-index stacking) is delegated to `<Modal>`. We deliberately do NOT
 * use `Modal.Header` / `Modal.Footer` here — those add `borderBottom` /
 * `borderTop` dividers between sections that look heavy on a compact
 * confirmation prompt. Instead the icon + title + message + buttons live in
 * a single padded block, matching the original tight ConfirmDialog look.
 *
 * Preserved behaviour:
 *   - Auto-focus the confirm button on open (so Enter activates it natively).
 *   - Custom Escape handler in the capture phase that calls `stopPropagation`,
 *     so when a ConfirmDialog is layered on top of another modal, hitting Esc
 *     dismisses only the ConfirmDialog and doesn't cascade-close the parent.
 *     We pass `closeOnEscape={false}` to the primitive so its own listener
 *     doesn't compete.
 *   - Type-specific icon + tint (`danger` / `warning` / `info` / `success`).
 *   - `danger` type uses `--color-error` for the confirm button; everything
 *     else uses `--color-navy` (matches the rest of the app's primary CTAs).
 */

import React from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { Modal } from '../primitives/Modal';

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
    // Defer to next tick so the Modal has mounted into the DOM.
    const id = requestAnimationFrame(() => {
      confirmBtnRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  // Escape cancels. Capture phase + stopPropagation so a parent modal's
  // Escape handler doesn't also fire and close everything underneath.
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
    <Modal
      isOpen
      onClose={onCancel}
      // sm caps at 320px which is too cramped for typical prompt messages.
      // Use a tighter custom maxWidth via className-less inline override
      // below by relying on the primitive's `sm` size and overriding via
      // wrapper styles. (Could also use size="md" at 480px — slightly wider
      // than the original 400px but acceptable.)
      size="md"
      // Our own Escape handler above owns this — keep the primitive's
      // listener disabled so we don't get duplicate cancellations and
      // can stack on top of other modals safely.
      closeOnEscape={false}
      // Use a high z-index so ConfirmDialog can layer above any other modal
      // (the primitive's default is 1000; this matches the previous custom
      // chrome's z-indexes of 1000/1001).
      zIndex={1100}
    >
      {/* Single padded block — no Modal.Header / Modal.Footer so we don't
          get the borderBottom/borderTop section dividers that look heavy on
          a compact prompt. */}
      <div style={styles.body}>
        {/* Icon */}
        <div
          style={{
            ...styles.iconWrapper,
            backgroundColor: config.bgColor,
            color: config.color,
          }}
          aria-hidden="true"
        >
          {config.icon}
        </div>

        {/* Title + message */}
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
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    padding: '24px',
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
    fontWeight: 600,
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
    fontWeight: 500,
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
    fontWeight: 500,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'white',
    transition: 'all 150ms ease',
  },
};

export default ConfirmDialog;
