/**
 * FileSyncConfig Component
 * Sync configuration panel for file settings
 */

import React from 'react';
import {
  FolderOpen,
  Trash2,
} from 'lucide-react';
import styles from './FilesPage.module.css';

export interface SyncPreferences {
  enabledCourses: Set<number>;
  autoDownload: boolean;
  syncAnnouncements: boolean;
  syncCanvasFiles: boolean;
}

export interface FileSyncConfigProps {
  filesDirectory: string;
  onOpenFilesDirectory: () => void;
  onClearFilesSync: () => void;
}

export function FileSyncConfig({
  filesDirectory,
  onOpenFilesDirectory,
  onClearFilesSync,
}: FileSyncConfigProps) {
  return (
    <div className={styles.syncConfigPanel}>
      {/* Header */}
      <div className={styles.syncConfigHeader}>
        <h3 className={styles.syncConfigTitle}>Sync Settings</h3>
        <p className={styles.syncConfigSubtitle}>
          Manage file sync location and data
        </p>
      </div>

      {/* Download Location */}
      <div className={styles.downloadLocationSection}>
        <div className={styles.filterLabel}>Download Location</div>
        <div className={styles.downloadLocationBox}>
          <FolderOpen size={18} color="var(--text-muted)" />
          <span className={styles.downloadLocationPath}>
            {filesDirectory || 'Loading...'}
          </span>
          <button
            className={styles.openFolderButton}
            onClick={onOpenFilesDirectory}
            title="Open in file explorer"
          >
            Open Folder
          </button>
        </div>
        <p className={styles.downloadLocationInfo}>
          Files are organized by course code in subfolders
        </p>
      </div>

      {/* Clear Sync Data */}
      <div className={styles.clearSyncSection}>
        <div className={styles.filterLabel}>Clear Sync Data</div>
        <p className={styles.clearSyncInfo}>
          Remove all synced file information from the database. Downloaded files will not be deleted.
          Use this to fix incorrect folder structures or re-sync from scratch.
        </p>
        <button
          className={styles.clearSyncButton}
          onClick={onClearFilesSync}
        >
          <Trash2 size={16} />
          Clear Synced Files Data
        </button>
      </div>
    </div>
  );
}

export default FileSyncConfig;
