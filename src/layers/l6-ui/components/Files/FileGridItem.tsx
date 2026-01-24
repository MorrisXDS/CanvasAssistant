/**
 * FileGridItem Component
 * Grid view file card with type-specific icons and hover actions
 */

import React from 'react';
import {
  Download,
  CheckCircle,
  Loader2,
  Square,
  CheckSquare,
  FolderOpen,
  ExternalLink,
} from 'lucide-react';
import styles from './FilesPage.module.css';
import {
  FileItem,
  FileResource,
  getFileName,
  isFileDownloaded,
  categorizeFile,
  extractModuleContext,
  getCategoryColor,
  getFileIcon,
  getFileIconType,
  getFileIconClass,
} from './FileListItem';

export interface FileGridItemProps {
  file: FileItem;
  isDownloading: boolean;
  isSelected: boolean;
  selectMode: boolean;
  onToggleSelect: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onShowInFolder?: () => void;
}

export function FileGridItem({
  file,
  isDownloading,
  isSelected,
  selectMode,
  onToggleSelect,
  onDownload,
  onOpen,
  onShowInFolder,
}: FileGridItemProps) {
  const isDownloaded = isFileDownloaded(file);

  // Get metadata
  const filename = getFileName(file);
  const folderPath = file.source === 'resource' ? (file as FileResource).folderPath : null;
  const category = categorizeFile(filename, folderPath);
  const moduleContext = extractModuleContext(folderPath, filename);
  const categoryColor = getCategoryColor(category);
  const iconType = getFileIconType(file);
  const iconClass = getFileIconClass(iconType);

  const handleClick = () => {
    if (selectMode) {
      onToggleSelect();
    } else if (isDownloaded) {
      onOpen();
    } else {
      onDownload();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleClick();
    }
    if (e.key === ' ' && selectMode) {
      e.preventDefault();
      onToggleSelect();
    }
  };

  return (
    <div
      className={`${styles.fileGridItem} ${isSelected ? styles.fileGridItemSelected : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="gridcell"
      tabIndex={0}
      aria-selected={isSelected}
      title={filename}
    >
      {/* Selection checkbox */}
      {selectMode && (
        <div className={styles.gridCheckbox}>
          {isSelected ? (
            <CheckSquare size={16} color="var(--color-navy)" />
          ) : (
            <Square size={16} color="var(--text-muted)" />
          )}
        </div>
      )}

      {/* File icon */}
      <div className={`${styles.fileGridIcon} ${iconClass}`}>
        {isDownloading ? (
          <Loader2 size={32} className={styles.spinner} color="var(--text-secondary)" />
        ) : (
          getFileIcon(file, 32)
        )}
      </div>

      {/* File name */}
      <div className={styles.fileGridName}>{filename}</div>

      {/* Metadata row */}
      <div className={styles.fileGridMeta}>
        <span
          className={styles.categoryBadgeSmall}
          style={{ backgroundColor: categoryColor }}
        >
          {category}
        </span>
        {moduleContext && (
          <span className={styles.gridModuleContext}>{moduleContext}</span>
        )}
        {isDownloaded && (
          <CheckCircle size={10} color="var(--color-success)" style={{ marginLeft: '4px' }} />
        )}
      </div>

      {/* Hover overlay with actions */}
      {!selectMode && (
        <div className={styles.gridOverlay}>
          {isDownloaded ? (
            <>
              <button
                className={styles.gridActionButton}
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
                title="Open file"
                aria-label="Open file"
              >
                <ExternalLink size={18} />
              </button>
              {onShowInFolder && (
                <button
                  className={styles.gridActionButton}
                  onClick={(e) => { e.stopPropagation(); onShowInFolder(); }}
                  title="Show in folder"
                  aria-label="Show in folder"
                >
                  <FolderOpen size={18} />
                </button>
              )}
            </>
          ) : (
            <button
              className={styles.gridActionButton}
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              title="Download"
              aria-label="Download file"
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 size={18} className={styles.spinner} />
              ) : (
                <Download size={18} />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default FileGridItem;
