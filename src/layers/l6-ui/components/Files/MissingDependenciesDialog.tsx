/**
 * MissingDependenciesDialog - Shows missing files required for offline HTML viewing
 *
 * Displayed when user tries to open an HTML file that has embedded resources
 * (images, linked files) that haven't been downloaded yet.
 *
 * Options:
 * - Download All: Downloads missing files, regenerates HTML with local paths
 * - Open Anyway: Opens HTML with broken/online-only resources
 * - Cancel: Closes dialog without action
 */

import React, { useState } from 'react';
import { Download, AlertTriangle, FileWarning, ExternalLink, X } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { formatFileSize } from '../../constants';

export interface MissingDependency {
  sourceId: string;
  resourceId?: number;
  filename: string;
  sizeBytes: number;
  canvasUrl: string;
  mimeType?: string;
}

interface MissingDependenciesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called when user clicks "Download All" */
  onDownload: () => Promise<void>;
  /** Called when user clicks "Open Anyway" */
  onOpenAnyway: () => void;
  /** List of missing dependencies */
  missingDependencies: MissingDependency[];
  /** Total size of all missing files */
  totalSize: number;
  /** File name being opened */
  fileName: string;
  /** Whether download is in progress */
  isDownloading?: boolean;
  /** Download progress (0-100) */
  downloadProgress?: number;
}

export function MissingDependenciesDialog({
  isOpen,
  onClose,
  onDownload,
  onOpenAnyway,
  missingDependencies,
  totalSize,
  fileName,
  isDownloading = false,
  downloadProgress = 0,
}: MissingDependenciesDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);
    try {
      await onDownload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    return '📄';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      closeOnBackdropClick={!isDownloading}
    >
      <Modal.Header
        title="Missing Files for Offline Viewing"
        subtitle={fileName}
        icon={<FileWarning size={20} />}
        showCloseButton={!isDownloading}
      />

      <Modal.Content maxHeight="300px">
        <div style={styles.warningBox}>
          <AlertTriangle
            size={16}
            style={{ flexShrink: 0, color: 'var(--color-warning)' }}
          />
          <span>
            This HTML file references {missingDependencies.length} file
            {missingDependencies.length !== 1 ? 's' : ''} that haven't been downloaded.
            Images and links may not work offline.
          </span>
        </div>

        {isDownloading ? (
          <div style={styles.progressSection}>
            <div style={styles.progressLabel}>
              Downloading files... {Math.round(downloadProgress)}%
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${downloadProgress}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <>
            <div style={styles.summary}>
              <span style={styles.summaryLabel}>Files to download:</span>
              <span style={styles.summaryValue}>
                {missingDependencies.length} ({formatFileSize(totalSize)})
              </span>
            </div>

            <div style={styles.fileList}>
              {missingDependencies.slice(0, 10).map((dep) => (
                <div key={dep.sourceId} style={styles.fileItem}>
                  <span style={styles.fileIcon}>{getFileIcon(dep.mimeType)}</span>
                  <span style={styles.fileName} title={dep.filename}>
                    {dep.filename}
                  </span>
                  <span style={styles.fileSize}>{formatFileSize(dep.sizeBytes)}</span>
                </div>
              ))}
              {missingDependencies.length > 10 && (
                <div style={styles.moreFiles}>
                  +{missingDependencies.length - 10} more files...
                </div>
              )}
            </div>
          </>
        )}

        {error && (
          <div style={styles.errorBox}>
            <X size={14} />
            <span>{error}</span>
          </div>
        )}
      </Modal.Content>

      <Modal.Footer align="between">
        <button
          style={styles.secondaryButton}
          onClick={onOpenAnyway}
          disabled={isDownloading}
        >
          <ExternalLink size={14} />
          Open Anyway
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
  warningBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    backgroundColor: 'var(--color-warning-bg, rgba(234, 179, 8, 0.1))',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    lineHeight: 1.5,
    color: 'var(--text-primary)',
    marginBottom: '16px',
  },

  progressSection: {
    padding: '20px 0',
  },

  progressLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    textAlign: 'center',
  },

  progressBar: {
    height: '6px',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: '3px',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: 'var(--color-blue)',
    borderRadius: '3px',
    transition: 'width 200ms ease',
  },

  summary: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    marginBottom: '12px',
    borderBottom: '1px solid var(--border-default)',
  },

  summaryLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },

  summaryValue: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },

  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '180px',
    overflowY: 'auto',
  },

  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '13px',
  },

  fileIcon: {
    fontSize: '14px',
    flexShrink: 0,
  },

  fileName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--text-primary)',
  },

  fileSize: {
    flexShrink: 0,
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },

  moreFiles: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    padding: '4px 8px',
    fontStyle: 'italic',
  },

  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'var(--color-error-bg, rgba(239, 68, 68, 0.1))',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--color-error)',
    marginTop: '12px',
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

export default MissingDependenciesDialog;
