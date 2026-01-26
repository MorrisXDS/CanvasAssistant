/**
 * MissingSyllabusWarning - Alert banner for courses without designated syllabus
 */

import React from 'react';
import { AlertTriangle, X, FileText } from 'lucide-react';

export interface MissingSyllabusWarningProps {
  /** Whether any syllabus file has been designated */
  hasSyllabusFile: boolean;
  /** Whether the course has a Canvas syllabus body */
  hasCanvasSyllabus: boolean;
  /** Callback when user clicks dismiss (session only) */
  onDismiss: () => void;
  /** Callback when user wants to set a syllabus */
  onSetSyllabus: () => void;
}

/**
 * Displays a warning banner when a course has no syllabus set.
 * Session-dismissible (not persisted).
 */
export function MissingSyllabusWarning({
  hasSyllabusFile,
  hasCanvasSyllabus,
  onDismiss,
  onSetSyllabus,
}: MissingSyllabusWarningProps) {
  // Don't show if either source has a syllabus
  if (hasSyllabusFile || hasCanvasSyllabus) {
    return null;
  }

  return (
    <div style={styles.container}>
      <div style={styles.iconContainer}>
        <AlertTriangle size={18} />
      </div>
      <div style={styles.content}>
        <div style={styles.title}>No Syllabus Set</div>
        <div style={styles.description}>
          Designate a syllabus file to track policy information and get automatic updates
          when it changes.
        </div>
      </div>
      <div style={styles.actions}>
        <button
          style={styles.setSyllabusButton}
          onClick={onSetSyllabus}
          title="Set syllabus file"
        >
          <FileText size={14} />
          <span>Set Syllabus</span>
        </button>
        <button
          style={styles.dismissButton}
          onClick={onDismiss}
          title="Dismiss for this session"
          aria-label="Dismiss warning"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-warning-bg)',
    border: '1px solid var(--color-warning-border)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },

  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-warning)',
    flexShrink: 0,
    marginTop: '2px',
  },

  content: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-warning-text)',
    marginBottom: '2px',
  },

  description: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-warning-text)',
    opacity: 0.9,
    lineHeight: 'var(--leading-relaxed)',
  },

  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },

  setSyllabusButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-warning-text)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-warning-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--color-warning-text)',
    opacity: 0.7,
    transition: 'opacity var(--transition-fast)',
  },
};

export default MissingSyllabusWarning;
