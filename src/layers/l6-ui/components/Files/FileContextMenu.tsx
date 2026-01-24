/**
 * FileContextMenu Component
 * Right-click context menu for file operations
 */

import React, { useEffect, useRef } from 'react';
import {
  ExternalLink,
  Download,
  FolderOpen,
  Copy,
  Globe,
  Trash2,
  Info,
  RefreshCw,
} from 'lucide-react';
import styles from './FilesPage.module.css';
import { FileItem, getFileName, isFileDownloaded, formatFileSize } from './FileListItem';

export interface FileContextMenuProps {
  file: FileItem;
  position: { x: number; y: number };
  onClose: () => void;
  onOpen: () => void;
  onDownload: () => void;
  onShowInFolder: () => void;
  onCopyPath: () => void;
  onOpenInCanvas: () => void;
  onDeleteLocal?: () => void;
  onShowProperties: () => void;
}

export function FileContextMenu({
  file,
  position,
  onClose,
  onOpen,
  onDownload,
  onShowInFolder,
  onCopyPath,
  onOpenInCanvas,
  onDeleteLocal,
  onShowProperties,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isDownloaded = isFileDownloaded(file);
  const isPage = file.source === 'page';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Add listeners with a small delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Adjust if menu would go off right edge
    if (position.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    // Adjust if menu would go off bottom edge
    if (position.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menuRef.current.style.left = `${adjustedX}px`;
    menuRef.current.style.top = `${adjustedY}px`;
  }, [position]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {/* Open */}
      {isDownloaded && !isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onOpen)}
          role="menuitem"
        >
          <ExternalLink size={14} />
          <span>Open</span>
        </button>
      )}

      {/* Open in Canvas (for pages) */}
      {isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onOpenInCanvas)}
          role="menuitem"
        >
          <Globe size={14} />
          <span>Open in Canvas</span>
        </button>
      )}

      {/* Download */}
      {!isDownloaded && !isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onDownload)}
          role="menuitem"
        >
          <Download size={14} />
          <span>Download</span>
        </button>
      )}

      {/* Re-download */}
      {isDownloaded && !isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onDownload)}
          role="menuitem"
        >
          <RefreshCw size={14} />
          <span>Re-download</span>
        </button>
      )}

      {/* Show in Folder */}
      {isDownloaded && !isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onShowInFolder)}
          role="menuitem"
        >
          <FolderOpen size={14} />
          <span>Show in Folder</span>
        </button>
      )}

      {/* Divider */}
      {!isPage && <div className={styles.contextMenuDivider} />}

      {/* Copy Path */}
      {isDownloaded && !isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onCopyPath)}
          role="menuitem"
        >
          <Copy size={14} />
          <span>Copy File Path</span>
        </button>
      )}

      {/* Open in Canvas */}
      {!isPage && (
        <button
          className={styles.contextMenuItem}
          onClick={() => handleAction(onOpenInCanvas)}
          role="menuitem"
        >
          <Globe size={14} />
          <span>Open in Canvas</span>
        </button>
      )}

      {/* Divider */}
      <div className={styles.contextMenuDivider} />

      {/* Delete Local Copy */}
      {isDownloaded && !isPage && onDeleteLocal && (
        <button
          className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
          onClick={() => handleAction(onDeleteLocal)}
          role="menuitem"
        >
          <Trash2 size={14} />
          <span>Delete Local Copy</span>
        </button>
      )}

      {/* Properties */}
      <button
        className={styles.contextMenuItem}
        onClick={() => handleAction(onShowProperties)}
        role="menuitem"
      >
        <Info size={14} />
        <span>Properties</span>
      </button>
    </div>
  );
}

/**
 * File Properties Dialog Content
 */
export interface FilePropertiesDialogProps {
  file: FileItem;
  courseName: string;
  onClose: () => void;
}

export function FilePropertiesContent({ file, courseName }: Omit<FilePropertiesDialogProps, 'onClose'>) {
  const filename = getFileName(file);
  const isDownloaded = isFileDownloaded(file);
  const fileSize = file.sizeBytes ? formatFileSize(file.sizeBytes) : 'Unknown';

  const getSourceLabel = () => {
    switch (file.source) {
      case 'attachment':
        return 'Announcement Attachment';
      case 'resource':
        return 'Canvas File';
      case 'page':
        return 'Canvas Page';
      default:
        return 'Unknown';
    }
  };

  const getLocalPath = () => {
    if (file.source === 'attachment' || file.source === 'resource') {
      return (file as { localPath?: string | null }).localPath || 'Not downloaded';
    }
    return 'N/A';
  };

  return (
    <div className={styles.propertiesContent}>
      <div className={styles.propertiesRow}>
        <span className={styles.propertiesLabel}>Name:</span>
        <span className={styles.propertiesValue}>{filename}</span>
      </div>
      <div className={styles.propertiesRow}>
        <span className={styles.propertiesLabel}>Course:</span>
        <span className={styles.propertiesValue}>{courseName}</span>
      </div>
      <div className={styles.propertiesRow}>
        <span className={styles.propertiesLabel}>Source:</span>
        <span className={styles.propertiesValue}>{getSourceLabel()}</span>
      </div>
      <div className={styles.propertiesRow}>
        <span className={styles.propertiesLabel}>Size:</span>
        <span className={styles.propertiesValue}>{fileSize}</span>
      </div>
      <div className={styles.propertiesRow}>
        <span className={styles.propertiesLabel}>Status:</span>
        <span className={styles.propertiesValue}>
          {isDownloaded ? 'Downloaded' : 'Not downloaded'}
        </span>
      </div>
      {file.source !== 'page' && (
        <div className={styles.propertiesRow}>
          <span className={styles.propertiesLabel}>Local Path:</span>
          <span className={`${styles.propertiesValue} ${styles.propertiesPath}`}>
            {getLocalPath()}
          </span>
        </div>
      )}
    </div>
  );
}

export default FileContextMenu;
