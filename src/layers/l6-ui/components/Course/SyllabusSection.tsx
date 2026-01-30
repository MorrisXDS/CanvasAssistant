/**
 * SyllabusSection - Thin settings row for syllabus management
 *
 * Displays the designated syllabus file (if any) with:
 * - File name and change status
 * - Icon-only action buttons: Mark Reviewed, Download, Change
 */

import React, { useState } from 'react';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  Edit2,
} from 'lucide-react';
import { SyllabusSelector } from './SyllabusSelector';
import { FileResource } from '../Files/FileListItem';

export interface CourseSyllabus {
  id: number;
  courseId: number;
  resourceId: number;
  resourceTitle: string;
  resourceUpdatedAt: string | null;
  lastReviewedAt: string;
  changeDetectedAt: string | null;
  markedAt: string;
}

export interface SyllabusSectionProps {
  /** Course ID */
  courseId: number;
  /** Course code for display */
  courseCode: string;
  /** Current syllabus data (null if none designated) */
  syllabus: CourseSyllabus | null;
  /** Available files for this course */
  availableFiles: FileResource[];
  /** Handler for setting/changing syllabus */
  onSetSyllabus: (resourceId: number) => void;
  /** Handler for marking syllabus as reviewed */
  onMarkReviewed: () => void;
  /** Handler for downloading syllabus */
  onDownload: () => void;
  /** Handler for opening the syllabus file */
  onOpen?: () => void;
  /** Whether a syllabus operation is in progress */
  isLoading?: boolean;
}

/**
 * SyllabusSection Component - Thin row for settings panel
 */
export function SyllabusSection({
  courseId,
  courseCode,
  syllabus,
  availableFiles,
  onSetSyllabus,
  onMarkReviewed,
  onDownload,
  onOpen,
  isLoading = false,
}: SyllabusSectionProps) {
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const hasChange = syllabus?.changeDetectedAt !== null;

  // Handle double-click to open the syllabus
  const handleDoubleClick = () => {
    if (onOpen && !isLoading) {
      onOpen();
    }
  };

  // No syllabus selected
  if (!syllabus) {
    return (
      <>
        <div style={styles.row}>
          <span style={styles.emptyText}>None selected</span>
          <button
            style={styles.selectButton}
            onClick={() => setIsSelectorOpen(true)}
            disabled={isLoading || availableFiles.length === 0}
          >
            Select
          </button>
        </div>

        <SyllabusSelector
          isOpen={isSelectorOpen}
          onClose={() => setIsSelectorOpen(false)}
          courseCode={courseCode}
          files={availableFiles}
          currentSyllabusId={null}
          onSelect={(resourceId) => {
            onSetSyllabus(resourceId);
            setIsSelectorOpen(false);
          }}
        />
      </>
    );
  }

  // Syllabus is selected
  return (
    <>
      <div style={styles.row}>
        <div
          style={styles.fileInfo}
          onDoubleClick={handleDoubleClick}
          title="Double-click to open"
        >
          <FileText size={16} color="var(--color-navy)" />
          <span style={styles.fileName}>{syllabus.resourceTitle}</span>
          {hasChange ? (
            <span style={styles.statusBadgeWarning} title="File was updated on Canvas">
              <AlertTriangle size={12} />
              Updated
            </span>
          ) : (
            <span style={styles.statusBadgeOk} title="No changes detected">
              <CheckCircle size={12} />
              Up to date
            </span>
          )}
        </div>

        <div style={styles.actions}>
          {hasChange && (
            <button
              style={styles.iconButton}
              onClick={onMarkReviewed}
              disabled={isLoading}
              title="Mark as reviewed"
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button
            style={styles.iconButton}
            onClick={onDownload}
            disabled={isLoading}
            title="Download syllabus"
          >
            <Download size={16} />
          </button>
          <button
            style={styles.iconButton}
            onClick={() => setIsSelectorOpen(true)}
            disabled={isLoading}
            title="Change syllabus"
          >
            <Edit2 size={16} />
          </button>
        </div>
      </div>

      <SyllabusSelector
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        courseCode={courseCode}
        files={availableFiles}
        currentSyllabusId={syllabus.resourceId}
        onSelect={(resourceId) => {
          onSetSyllabus(resourceId);
          setIsSelectorOpen(false);
        }}
      />
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    minHeight: '40px',
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
    cursor: 'pointer',
    padding: '4px',
    marginLeft: '-4px',
    borderRadius: 'var(--radius-sm)',
  },
  fileName: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  statusBadgeOk: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--color-success)',
    backgroundColor: 'rgba(var(--color-success-rgb), 0.1)',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  statusBadgeWarning: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--color-warning)',
    backgroundColor: 'rgba(var(--color-warning-rgb), 0.1)',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease',
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  selectButton: {
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--color-navy)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
};

export default SyllabusSection;
