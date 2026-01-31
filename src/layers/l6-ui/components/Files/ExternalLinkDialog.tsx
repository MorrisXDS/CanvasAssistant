/**
 * ExternalLinkDialog Component
 * Confirmation dialog before opening external URLs from module items
 */

import React, { useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { Modal } from '../primitives/Modal';

export interface ExternalLinkDialogProps {
  isOpen: boolean;
  url: string;
  title: string;
  onClose: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
}

export function ExternalLinkDialog({
  isOpen,
  url,
  title,
  onClose,
  onConfirm,
}: ExternalLinkDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = () => {
    onConfirm(dontShowAgain);
  };

  // Extract domain for display
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <Modal.Header
        title="Open External Link"
        icon={<AlertTriangle size={20} />}
        onClose={onClose}
      />
      <Modal.Content>
        <div style={styles.content}>
          <p style={styles.description}>
            You are about to open an external link that will take you outside of this application.
          </p>

          <div style={styles.linkInfo}>
            <div style={styles.linkTitle}>{title}</div>
            <div style={styles.linkUrl}>
              <ExternalLink size={14} style={{ flexShrink: 0 }} />
              <span style={styles.domain}>{domain}</span>
            </div>
          </div>

          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={styles.checkbox}
            />
            <span>Don't show this warning again</span>
          </label>
        </div>
      </Modal.Content>
      <Modal.Footer>
        <button onClick={onClose} style={styles.cancelButton}>
          Cancel
        </button>
        <button onClick={handleConfirm} style={styles.confirmButton}>
          <ExternalLink size={16} />
          Open Link
        </button>
      </Modal.Footer>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  description: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },

  linkInfo: {
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
  },

  linkTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    marginBottom: '4px',
    wordBreak: 'break-word',
  },

  linkUrl: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },

  domain: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  confirmButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'white',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
};

export default ExternalLinkDialog;
