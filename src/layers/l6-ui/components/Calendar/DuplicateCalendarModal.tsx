/**
 * DuplicateCalendarModal — shown when the user tries to import an ICS file
 * that already exists.
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: compact prompt — single padded block with icon + title + message
 * + a small "existing calendar" info card + three action buttons. We
 * deliberately do NOT use `Modal.Header` / `Modal.Footer` here because
 * those add borderBottom/borderTop dividers that look heavy on a compact
 * prompt (same trade-off as `ConfirmDialog`).
 *
 * Dismiss: standard — Esc / backdrop click cancel via the primitive's
 * default behavior (the parent supplies `onCancel`).
 *
 * z-index: default 1100 — this dialog is typically opened from the
 * calendar import flow (not nested above another modal), so the default
 * `Modal` z-index tier is fine.
 */

import React from 'react';
import { AlertTriangle, Calendar, RefreshCw, Eye } from 'lucide-react';
import { Modal } from '../primitives/Modal';
import { Z_INDEX } from '../../constants';

interface ExistingCalendarInfo {
  id: number;
  name: string;
  color: string;
  eventCount: number;
  importedAt: string;
}

interface DuplicateCalendarModalProps {
  isOpen: boolean;
  filename: string;
  existingCalendar: ExistingCalendarInfo | null;
  onViewCalendar: () => void;
  onReimport: () => void;
  onCancel: () => void;
}

export function DuplicateCalendarModal({
  isOpen,
  filename,
  existingCalendar,
  onViewCalendar,
  onReimport,
  onCancel,
}: DuplicateCalendarModalProps) {
  if (!isOpen || !existingCalendar) return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Modal isOpen onClose={onCancel} size="md" zIndex={Z_INDEX.modal}>
      {/* Single padded block — no Modal.Header/Footer (compact prompt). */}
      <div style={styles.body}>
        {/* Icon */}
        <div style={styles.iconWrapper} aria-hidden="true">
          <AlertTriangle size={24} />
        </div>

        {/* Content */}
        <div style={styles.content}>
          <h3 style={styles.title}>Calendar Already Imported</h3>
          <p style={styles.message}>
            "{filename}" has already been imported as "{existingCalendar.name}".
          </p>

          {/* Existing calendar info card */}
          <div style={styles.calendarCard}>
            <div style={styles.calendarHeader}>
              <div
                style={{
                  ...styles.colorDot,
                  backgroundColor: existingCalendar.color,
                }}
              />
              <Calendar size={16} color="var(--text-secondary)" />
              <span style={styles.calendarName}>{existingCalendar.name}</span>
            </div>
            <div style={styles.calendarMeta}>
              <span>{existingCalendar.eventCount} events</span>
              <span style={styles.dot}>·</span>
              <span>Imported {formatDate(existingCalendar.importedAt)}</span>
            </div>
          </div>

          <p style={styles.question}>What would you like to do?</p>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" style={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" style={styles.secondaryBtn} onClick={onReimport}>
            <RefreshCw size={14} />
            Re-import
          </button>
          <button type="button" style={styles.primaryBtn} onClick={onViewCalendar}>
            <Eye size={14} />
            View Calendar
          </button>
        </div>
      </div>
    </Modal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    padding: '24px',
  },

  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
  },

  content: {
    marginBottom: '24px',
  },

  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    margin: '0 0 8px 0',
  },

  message: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    margin: '0 0 16px 0',
    lineHeight: 1.5,
  },

  calendarCard: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
    marginBottom: '16px',
  },

  calendarHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  colorDot: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
    flexShrink: 0,
  },

  calendarName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  calendarMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginLeft: 'calc(12px + var(--space-2))',
  },

  dot: {
    color: 'var(--text-muted)',
  },

  question: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    margin: 0,
    fontWeight: '500',
  },

  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },

  cancelBtn: {
    height: '40px',
    padding: '0 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    transition: 'all 150ms ease',
  },

  secondaryBtn: {
    height: '40px',
    padding: '0 16px',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-blue)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--color-blue)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    transition: 'all 150ms ease',
  },

  primaryBtn: {
    height: '40px',
    padding: '0 16px',
    fontSize: '14px',
    fontWeight: '500',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'white',
    backgroundColor: 'var(--color-navy)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    transition: 'all 150ms ease',
  },
};

export default DuplicateCalendarModal;
