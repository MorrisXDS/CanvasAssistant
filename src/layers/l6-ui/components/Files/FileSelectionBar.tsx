/**
 * FileSelectionBar Component
 * Selection mode controls bar with bulk actions
 */

import React, { useEffect, useState } from 'react';
import { CheckSquare, Download, Check, Loader2 } from 'lucide-react';
import styles from './FilesPage.module.css';

export interface DownloadProgress {
  total: number;
  completed: number;
  isComplete: boolean;
}

export interface FileSelectionBarProps {
  selectedCount: number;
  onSelectAllPending: () => void;
  onDeselectAll: () => void;
  onCancel: () => void;
  onDownloadSelected: () => void;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
}

export function FileSelectionBar({
  selectedCount,
  onSelectAllPending,
  onDeselectAll,
  onCancel,
  onDownloadSelected,
  isDownloading,
  downloadProgress,
}: FileSelectionBarProps) {
  const [showComplete, setShowComplete] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Handle completion animation
  useEffect(() => {
    if (downloadProgress?.isComplete && downloadProgress.completed > 0) {
      setCompletedCount(downloadProgress.completed);
      setShowComplete(true);
      const timer = setTimeout(() => {
        setShowComplete(false);
      }, 3000); // Show for 3 seconds
      return () => clearTimeout(timer);
    }
  }, [downloadProgress?.isComplete, downloadProgress?.completed]);

  // Calculate progress percentage
  const progressPercent = downloadProgress
    ? Math.round((downloadProgress.completed / downloadProgress.total) * 100)
    : 0;

  return (
    <>
      {/* Top selection bar */}
      <div className={styles.selectionBar}>
        <div className={styles.selectionInfo}>
          <CheckSquare size={16} />
          {selectedCount} selected
        </div>
        <div className={styles.selectionActions}>
          <button className={styles.selectionButton} onClick={onSelectAllPending}>
            Select all pending
          </button>
          <button className={styles.selectionButton} onClick={onDeselectAll}>
            Deselect all
          </button>
          <button className={styles.selectionButton} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {/* Floating Download FAB */}
      {(selectedCount > 0 || showComplete) && (
        <div className={styles.downloadFab}>
          {showComplete ? (
            <div className={`${styles.downloadFabButton} ${styles.downloadComplete}`}>
              <div className={styles.checkmarkCircle}>
                <Check size={20} className={styles.checkmarkIcon} />
              </div>
              <span>
                {completedCount} file{completedCount !== 1 ? 's' : ''} downloaded
              </span>
            </div>
          ) : isDownloading && downloadProgress ? (
            <div className={`${styles.downloadFabButton} ${styles.downloadProgress}`}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
              <div className={styles.downloadProgressContent}>
                <Loader2 size={20} className={styles.spinner} />
                <span>
                  Downloading {downloadProgress.completed}/{downloadProgress.total}
                </span>
              </div>
            </div>
          ) : (
            <button
              className={styles.downloadFabButton}
              onClick={onDownloadSelected}
              disabled={isDownloading}
            >
              <Download size={20} />
              <span>
                Download {selectedCount} file{selectedCount !== 1 ? 's' : ''}
              </span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default FileSelectionBar;
