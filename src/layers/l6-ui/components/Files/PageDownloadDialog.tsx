/**
 * PageDownloadDialog - Prompts user to download a page for offline HTML viewing
 *
 * Displayed when user tries to open a Page module item with Local HTML Files
 * enabled but the page hasn't been downloaded yet.
 *
 * Options:
 * - Download: Downloads the page HTML and dependencies, then opens locally
 * - Open in Canvas: Opens the page in the browser instead
 * - Cancel: Closes dialog without action
 */

import React from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('PageDownloadDialog');

interface PageDownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user clicks "Download" */
  onDownload: () => Promise<void>;
  /** Called when user clicks "Open in Canvas" */
  onOpenInCanvas: () => void;
  /** Page title */
  pageTitle: string;
  /** Whether download is in progress */
  isDownloading?: boolean;
}

export function PageDownloadDialog({
  isOpen,
  onClose,
  onDownload,
  onOpenInCanvas,
  pageTitle,
  isDownloading = false,
}: PageDownloadDialogProps) {
  const handleDownload = async () => {
    try {
      await onDownload();
    } catch (err) {
      logger.error('Download failed', err instanceof Error ? err : undefined);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      closeOnBackdropClick={!isDownloading}
    >
      <Modal.Header
        title="Download Page for Offline Viewing"
        subtitle={pageTitle}
        icon={<FileText size={20} />}
        showCloseButton={!isDownloading}
      />

      <Modal.Content>
        <div style={styles.infoBox}>
          <span>
            You have <strong>Local HTML Files</strong> enabled. This page needs to be
            downloaded before it can be opened locally.
          </span>
        </div>

        {isDownloading && (
          <div style={styles.downloadingBox}>
            <div style={styles.spinner} />
            <span>Downloading page and dependencies...</span>
          </div>
        )}

        <div style={styles.description}>
          Downloading will fetch the page content and any embedded images or files for
          offline viewing.
        </div>
      </Modal.Content>

      <Modal.Footer align="between">
        <button
          style={styles.secondaryButton}
          onClick={onOpenInCanvas}
          disabled={isDownloading}
        >
          <ExternalLink size={14} />
          Open in Canvas
        </button>
        <div style={styles.buttonGroup}>
          <button style={styles.cancelButton} onClick={onClose} disabled={isDownloading}>
            Cancel
          </button>
          <button
            style={styles.primaryButton}
            onClick={handleDownload}
            disabled={isDownloading}
          >
            <Download size={14} />
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  infoBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    backgroundColor: 'var(--color-info-bg, rgba(59, 130, 246, 0.1))',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--text-primary)',
    marginBottom: '16px',
  },

  downloadingBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '16px',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '16px',
  },

  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid var(--border-default)',
    borderTopColor: 'var(--color-blue)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  description: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },

  buttonGroup: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'white',
    backgroundColor: 'var(--color-blue)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'opacity 150ms ease',
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  cancelButton: {
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'opacity 150ms ease',
  },
};

export default PageDownloadDialog;
