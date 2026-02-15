/**
 * CloseBehaviorDialog - Dialog for choosing close button behavior
 * Shown on first close when no preference is set
 */

import React from 'react';
import { Minus, Power } from 'lucide-react';

interface CloseBehaviorDialogProps {
  isOpen: boolean;
  onChoice: (choice: 'minimize-to-tray' | 'quit') => void;
}

export function CloseBehaviorDialog({ isOpen, onChoice }: CloseBehaviorDialogProps) {
  // Only show on Windows — macOS hides to Dock, Linux always quits
  if (!isOpen || window.api?.platform !== 'win32') return null;

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} />

      {/* Dialog */}
      <div style={styles.dialog}>
        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.title}>Close Window</h3>
          <p style={styles.subtitle}>
            What would you like to do when you close the window?
          </p>
        </div>

        {/* Options */}
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

        {/* Footer */}
        <p style={styles.footer}>You can change this later in Settings &gt; General</p>
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
    zIndex: 10000,
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
    maxWidth: '420px',
    padding: '24px',
    zIndex: 10001,
  },

  header: {
    marginBottom: '20px',
    textAlign: 'center' as const,
  },

  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 8px 0',
  },

  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    margin: 0,
  },

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

  footer: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    margin: 0,
  },
};

export default CloseBehaviorDialog;
