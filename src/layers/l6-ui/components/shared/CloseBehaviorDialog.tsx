/**
 * CloseBehaviorDialog — first-close preference picker (Windows only).
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned modal with header (title + subtitle) and content body. We
 * deliberately do NOT use `Modal.Footer` here — the two big option buttons
 * ARE the action, so they live in the content area as a card-style picker
 * rather than a footer bar. A small hint paragraph below the options
 * tells the user where to change this later.
 *
 * No close button / Esc: this dialog is shown by the main process via
 * `prompt-close-behavior` and the user must pick one of the two options to
 * proceed — there is no implicit "cancel". We pass
 * `closeOnEscape={false}` + `closeOnBackdropClick={false}` and omit the
 * header's close button to enforce that.
 */

import React from 'react';
import { Minus, Power } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { Z_INDEX } from '../../constants';

interface CloseBehaviorDialogProps {
  isOpen: boolean;
  onChoice: (choice: 'minimize-to-tray' | 'quit') => void;
}

export function CloseBehaviorDialog({ isOpen, onChoice }: CloseBehaviorDialogProps) {
  // Only show on Windows — macOS hides to Dock, Linux always quits
  if (!isOpen || window.api?.platform !== 'win32') return null;

  return (
    <Modal
      isOpen
      // No onClose: user must pick an option. Disable backdrop + Esc dismissal
      // so the dialog truly blocks until a choice is made.
      closeOnEscape={false}
      closeOnBackdropClick={false}
      size="md"
      zIndex={Z_INDEX.modal}
    >
      <Modal.Header
        title="Close Window"
        subtitle="What would you like to do when you close the window?"
        showCloseButton={false}
      />

      <Modal.Content>
        <div style={styles.options}>
          <button
            style={styles.optionButton}
            onClick={() => onChoice('minimize-to-tray')}
          >
            <div style={styles.optionIcon}>
              <Minus size={24} />
            </div>
            <div style={styles.optionContent}>
              <span style={styles.optionTitle}>Minimize to Tray</span>
              <span style={styles.optionDesc}>
                Hide the window but keep the app running in the system tray
              </span>
            </div>
          </button>

          <button style={styles.optionButton} onClick={() => onChoice('quit')}>
            <div
              style={{
                ...styles.optionIcon,
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error)',
              }}
            >
              <Power size={24} />
            </div>
            <div style={styles.optionContent}>
              <span style={styles.optionTitle}>Quit Application</span>
              <span style={styles.optionDesc}>
                Close the window and exit the application completely
              </span>
            </div>
          </button>
        </div>

        <p style={styles.hint}>You can change this later in Settings &gt; General</p>
      </Modal.Content>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  options: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    marginBottom: '16px',
  },

  optionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'all 150ms ease',
    width: '100%',
  },

  optionIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  optionContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },

  optionTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },

  optionDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },

  hint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    margin: 0,
  },
};

export default CloseBehaviorDialog;
