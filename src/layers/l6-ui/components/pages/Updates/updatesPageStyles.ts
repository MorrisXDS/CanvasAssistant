/**
 * Inline styles for the UpdatesPage component
 *
 * Extracted from UpdatesPage.tsx for maintainability.
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  header: {
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  title: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
    marginTop: 'var(--space-1)',
  },

  columnsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },

  column: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0,
  },

  columnTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  columnCount: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  markAllButton: {
    marginLeft: 'auto',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  filterRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--border-subtle)',
    flexWrap: 'wrap',
    flexShrink: 0,
  },

  filterTab: {
    padding: '6px 12px',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: '9999px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    outline: 'none',
    fontWeight: 'var(--font-medium)',
    transition: 'all 0.15s ease',
  },

  filterTabActive: {
    backgroundColor: 'var(--color-primary-dark, #1e3a5f)',
    borderColor: 'var(--color-primary-dark, #1e3a5f)',
    color: 'white',
  },

  columnContent: {
    flex: 1,
    overflowY: 'scroll',
    overflowX: 'hidden',
    padding: 'var(--space-2)',
  },

  columnEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-tertiary)',
    fontSize: 'var(--text-sm)',
  },

  courseSection: {
    marginBottom: 'var(--space-3)',
  },

  courseSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  courseColor: {
    width: '3px',
    height: '16px',
    borderRadius: '2px',
  },

  courseLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  resourceCount: {
    marginLeft: 'auto',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    fontWeight: 'var(--font-normal)',
  },

  courseSeparator: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: 'var(--space-2) 0',
  },

  actionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    marginBottom: 'var(--space-1)',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  actionItemContent: {
    flex: 1,
    minWidth: 0,
  },

  actionItemTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  actionItemTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  actionItemSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  updatedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'var(--color-info, #0ea5e9)',
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },

  actionItemButtons: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexShrink: 0,
  },

  actionButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  acceptButton: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
  },

  rejectButton: {
    backgroundColor: 'var(--color-error)',
    color: 'white',
  },

  viewButton: {
    backgroundColor: 'var(--color-primary)',
    color: 'white',
  },

  infoItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    marginBottom: 'var(--space-1)',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)',
  },

  infoIcon: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
  },

  infoContent: {
    flex: 1,
    minWidth: 0,
  },

  infoTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  infoSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  infoMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },

  infoTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
  },

  markSeenButton: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 'var(--space-8)',
  },

  emptyIcon: {
    width: '80px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-bg, #dcfce7)',
    color: 'var(--color-success)',
    marginBottom: 'var(--space-4)',
  },

  emptyTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
    marginBottom: 'var(--space-2)',
  },

  emptySubtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
    marginBottom: 'var(--space-4)',
  },

  // Conflict item styles
  conflictItem: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(251, 191, 36, 0.4)',
    padding: 'var(--space-3)',
    marginBottom: 'var(--space-2)',
  },

  conflictHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-2)',
  },

  conflictTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  conflictField: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
  },

  conflictValues: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },

  conflictValueBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
  },

  conflictValueLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'center' as const,
  },

  conflictValueContent: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontWeight: 'var(--font-medium)',
    minHeight: '20px',
    textAlign: 'center' as const,
  },

  conflictButton: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: 'pointer',
    marginTop: 'var(--space-1)',
    width: '100%',
  },

  keepMineButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },

  useCanvasButton: {
    backgroundColor: '#6366f1',
    color: 'white',
  },

  conflictRemember: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  conflictOptions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-subtle)',
    marginTop: 'var(--space-2)',
  },

  expirationSelect: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  expirationLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  expirationDropdown: {
    padding: '4px 8px',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  },
};

// Add CSS for select option styling and filter tab focus in dark mode
const selectStyleId = 'updates-page-styles';
if (typeof document !== 'undefined' && !document.getElementById(selectStyleId)) {
  const style = document.createElement('style');
  style.id = selectStyleId;
  style.textContent = `
    .expiration-select {
      background-color: var(--bg-card);
      color: var(--text-primary);
    }
    .expiration-select option {
      background-color: var(--bg-card, #1f2937);
      color: var(--text-primary, #f3f4f6);
      padding: 8px;
    }
    .expiration-select option:hover,
    .expiration-select option:focus,
    .expiration-select option:checked {
      background-color: var(--bg-secondary, #374151);
    }
    .updates-filter-tab:focus,
    .updates-filter-tab:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}
