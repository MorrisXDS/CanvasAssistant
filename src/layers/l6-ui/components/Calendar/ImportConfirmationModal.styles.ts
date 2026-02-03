/**
 * Styles for ImportConfirmationModal component
 * Extracted for maintainability
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    width: '100%',
    maxWidth: '560px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: 'var(--shadow-lg)',
  },

  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--border-default)',
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  title: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  closeButton: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-2)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  summary: {
    padding: 'var(--space-4) var(--space-6)',
    backgroundColor: 'var(--bg-app)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
    alignItems: 'center',
  },

  summaryItem: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  summaryLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  summaryValue: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  recurringBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    backgroundColor: 'var(--color-info-bg)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-full)',
  },

  warnings: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-6)',
    backgroundColor: 'var(--color-warning-bg)',
    borderBottom: '1px solid var(--color-warning)',
  },

  warningsList: {
    flex: 1,
  },

  warningItem: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-warning)',
  },

  formGroup: {
    padding: 'var(--space-4) var(--space-6)',
  },

  label: {
    display: 'block',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-base)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
  },

  colorPicker: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  colorOption: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'transform var(--transition-fast)',
  },

  eventsSection: {
    padding: '0 var(--space-6) var(--space-4)',
  },

  eventsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-2)',
  },

  expandToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: '500',
    color: 'var(--color-blue)',
    background: 'none',
    border: '1px solid var(--border-light)',
    cursor: 'pointer',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-full)',
    transition: 'background-color 150ms ease, border-color 150ms ease',
  },

  eventsList: {
    maxHeight: '200px',
    overflowY: 'auto',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    transition: 'max-height 200ms ease',
  },

  eventItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    borderBottom: '1px solid var(--border-light)',
    transition: 'background-color 150ms ease',
  },

  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },

  eventColor: {
    width: '4px',
    height: '100%',
    minHeight: '32px',
    borderRadius: '2px',
    flexShrink: 0,
  },

  eventContent: {
    flex: 1,
    minWidth: 0,
  },

  eventTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  eventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },

  recurringIcon: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-blue)',
  },

  locationMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  eventDetails: {
    marginTop: 'var(--space-3)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  detailRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  detailContent: {
    flex: 1,
  },

  detailSecondary: {
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
  },

  description: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-6)',
    borderTop: '1px solid var(--border-default)',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  confirmButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    backgroundColor: 'var(--color-blue)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
};
