/**
 * SyllabusSelector - Modal for selecting a syllabus file for a course
 *
 * Displays course files with download status in a searchable list,
 * allowing the user to designate which file is the syllabus.
 */

import React, { useState, useMemo } from 'react';
import { Search, X, CheckCircle, Download, Paperclip } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { Button } from '../primitives/Button';
import {
  FileResource,
  getFileIcon,
  categorizeFile,
  getCategoryColor,
} from '../Files/FileListItem';
import { formatFileSize } from '../../constants';

export interface SyllabusSelectorProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Course code for display */
  courseCode: string;
  /** Available files for this course */
  files: FileResource[];
  /** Currently selected syllabus resource ID (if any) */
  currentSyllabusId: number | null;
  /** Callback when a syllabus is selected */
  onSelect: (resourceId: number) => void;
}

/**
 * SyllabusSelector Modal Component
 */
export function SyllabusSelector({
  isOpen,
  onClose,
  courseCode,
  files,
  currentSyllabusId,
  onSelect,
}: SyllabusSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(currentSyllabusId);

  // Filter files by search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const query = searchQuery.toLowerCase();
    return files.filter(
      (file) =>
        file.title.toLowerCase().includes(query) ||
        (file.folderPath?.toLowerCase().includes(query) ?? false)
    );
  }, [files, searchQuery]);

  // Group files by folder
  const groupedFiles = useMemo(() => {
    const groups = new Map<string, FileResource[]>();

    for (const file of filteredFiles) {
      const folder = file.folderPath || 'course_files';
      const existing = groups.get(folder) ?? [];
      existing.push(file);
      groups.set(folder, existing);
    }

    // Sort groups by folder name
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredFiles]);

  // Handle selection
  const handleSelect = () => {
    if (selectedId !== null) {
      onSelect(selectedId);
    }
  };

  // Reset selection when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedId(currentSyllabusId);
      setSearchQuery('');
    }
  }, [isOpen, currentSyllabusId]);

  const selectedFile = files.find((f) => f.id === selectedId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <Modal.Header
        title={`Select Syllabus for ${courseCode}`}
        subtitle="Choose which file is the syllabus for this course"
        onClose={onClose}
      />
      <Modal.Content padded={false} maxHeight="50vh">
        {/* Search bar */}
        <div style={modalStyles.searchContainer}>
          <Search size={16} style={modalStyles.searchIcon} />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={modalStyles.searchInput}
            autoFocus
          />
          {searchQuery && (
            <button
              style={modalStyles.clearSearch}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* File list */}
        <div style={modalStyles.fileList}>
          {groupedFiles.length === 0 ? (
            <div style={modalStyles.emptyState}>
              {files.length === 0
                ? 'No files available for this course. Sync files first.'
                : 'No files match your search'}
            </div>
          ) : (
            groupedFiles.map(([folder, folderFiles]) => (
              <div key={folder} style={modalStyles.folderGroup}>
                <div style={modalStyles.folderHeader}>
                  <span>{folder || 'Files'}</span>
                  <span style={modalStyles.fileCount}>
                    {folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {folderFiles.map((file) => {
                  // Safety check for malformed file data
                  if (!file || !file.title) {
                    console.warn('Skipping malformed file:', file);
                    return null;
                  }
                  return (
                    <SyllabusFileItem
                      key={file.id}
                      file={file}
                      isSelected={selectedId === file.id}
                      isCurrent={currentSyllabusId === file.id}
                      isAttachment={file.id < 0}
                      onSelect={() => setSelectedId(file.id)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
      </Modal.Content>
      <Modal.Footer align="between">
        <div style={modalStyles.footerLeft}>
          {selectedFile ? (
            <span style={modalStyles.selectedLabel}>
              Selected: <strong>{selectedFile.title}</strong>
            </span>
          ) : (
            <span style={modalStyles.selectedLabel}>No file selected</span>
          )}
        </div>
        <div style={modalStyles.footerRight}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSelect} disabled={selectedId === null}>
            Select
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// ============================================================================
// File Item Subcomponent
// ============================================================================

interface SyllabusFileItemProps {
  file: FileResource;
  isSelected: boolean;
  isCurrent: boolean;
  isAttachment: boolean;
  onSelect: () => void;
}

function SyllabusFileItem({
  file,
  isSelected,
  isCurrent,
  isAttachment,
  onSelect,
}: SyllabusFileItemProps) {
  // Safe defaults for potentially missing data
  const title = file.title || 'Unknown file';
  const folderPath = file.folderPath ?? null;
  const category = categorizeFile(title, folderPath);
  const categoryColor = getCategoryColor(category);
  const isDownloaded = file.localPath !== null;

  // Safe icon rendering
  let fileIcon;
  try {
    fileIcon = getFileIcon(file, 16);
  } catch {
    fileIcon = null;
  }

  return (
    <div
      style={{
        ...modalStyles.fileItem,
        backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
        borderColor: isSelected ? 'var(--color-navy)' : 'transparent',
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="radio"
      aria-checked={isSelected}
    >
      {/* Radio indicator */}
      <div
        style={{
          ...modalStyles.radioIndicator,
          borderColor: isSelected ? 'var(--color-navy)' : 'var(--border-default)',
          backgroundColor: isSelected ? 'var(--color-navy)' : 'transparent',
        }}
      >
        {isSelected && <div style={modalStyles.radioInner} />}
      </div>

      {/* File icon */}
      <div style={modalStyles.fileIconWrapper}>{fileIcon}</div>

      {/* File info */}
      <div style={modalStyles.fileInfo}>
        <div style={modalStyles.fileName}>
          {title}
          {isCurrent && (
            <span style={modalStyles.currentBadge}>
              <CheckCircle size={12} /> Current
            </span>
          )}
          {isAttachment && (
            <span style={modalStyles.attachmentBadge} title="From announcement">
              <Paperclip size={10} /> Attachment
            </span>
          )}
        </div>
        <div style={modalStyles.fileMeta}>
          <span
            style={{
              ...modalStyles.categoryBadge,
              backgroundColor: categoryColor,
            }}
          >
            {category}
          </span>
          {file.sizeBytes && (
            <>
              <span style={modalStyles.separator}>•</span>
              <span>{formatFileSize(file.sizeBytes)}</span>
            </>
          )}
        </div>
      </div>

      {/* Download status */}
      <div style={modalStyles.downloadStatus}>
        {isDownloaded ? (
          <CheckCircle size={16} color="var(--color-success)" />
        ) : (
          <Download size={16} color="var(--text-tertiary)" />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const modalStyles: Record<string, React.CSSProperties> = {
  searchContainer: {
    position: 'relative',
    padding: '0 24px',
    marginBottom: '12px',
  },
  searchIcon: {
    position: 'absolute',
    left: '36px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-tertiary)',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '10px 36px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-default)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  clearSearch: {
    position: 'absolute',
    right: '36px',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '4px',
    border: 'none',
    background: 'none',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
  },
  fileList: {
    overflowY: 'auto',
  },
  emptyState: {
    padding: '40px 24px',
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: '14px',
  },
  folderGroup: {
    marginBottom: '8px',
  },
  folderHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 24px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    backgroundColor: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border-default)',
    borderBottom: '1px solid var(--border-default)',
  },
  fileCount: {
    fontWeight: '400',
    textTransform: 'none',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 24px',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    transition: 'background-color 150ms ease',
  },
  radioIndicator: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'white',
  },
  fileIconWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  currentBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--color-success)',
    backgroundColor: 'rgba(var(--color-success-rgb), 0.1)',
    borderRadius: 'var(--radius-sm)',
  },
  attachmentBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    fontSize: '10px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-default)',
  },
  fileMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  categoryBadge: {
    padding: '2px 6px',
    fontSize: '10px',
    fontWeight: '500',
    color: 'white',
    borderRadius: 'var(--radius-sm)',
  },
  separator: {
    color: 'var(--text-tertiary)',
  },
  downloadStatus: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    display: 'flex',
    gap: '8px',
  },
  selectedLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
};

export default SyllabusSelector;
