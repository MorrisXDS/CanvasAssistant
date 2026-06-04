/**
 * Styles for UpdatesPage component
 * Extracted for maintainability
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 'min(900px, 100%)',
    margin: '0 auto',
    padding: '0',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    marginBottom: 'var(--space-6)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },

  headerContent: {},

  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  filterRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  filterTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterTabActive: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
    color: 'white',
  },

  filterCount: {
    opacity: 0.8,
  },

  actionsRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  actionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  },

  actionButtonPrimary: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
    color: 'white',
  },

  conflictsSection: {
    marginBottom: 'var(--space-6)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--color-warning-bg, #fef3c7)',
    border: '1px solid var(--color-warning, #f59e0b)',
    borderRadius: 'var(--radius-lg)',
  },

  conflictsSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-warning-foreground, #78350f)',
  },

  conflictsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  conflictCard: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
  },

  conflictHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 'var(--space-3)',
  },

  conflictTitle: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  conflictCourse: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  conflictValues: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },

  conflictValueBox: {
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
  },

  conflictValueLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 'var(--space-1)',
  },

  conflictValueContent: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
  },

  conflictActions: {
    display: 'flex',
    gap: 'var(--space-2)',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  conflictButton: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
  },

  conflictButtonPrimary: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
    color: 'white',
  },

  courseGroup: {
    marginBottom: 'var(--space-6)',
  },

  courseGroupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginBottom: 'var(--space-3)',
  },

  courseColor: {
    width: '4px',
    height: '24px',
    borderRadius: 'var(--radius-sm)',
  },

  courseName: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    flex: 1,
  },

  courseCount: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  markCourseReadButton: {
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    transition: 'all var(--transition-fast)',
  },

  categoryViewport: {
    maxHeight: '280px',
    overflowY: 'scroll',
    overflowX: 'hidden',
    border: 'none',
    borderRadius: '0',
    // Remove marginBottom - Card handles spacing
  },

  // Card wrapper for proper scroll containment
  categoryCard: {
    overflow: 'hidden',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)',
    marginBottom: 'var(--space-3)',
  },

  updateItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-subtle)',
    transition: 'background-color var(--transition-fast)',
  },

  updateItemLast: {
    borderBottom: 'none',
  },

  updateIcon: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  updateIconNew: {
    backgroundColor: 'var(--color-primary-bg, #dbeafe)',
    color: 'var(--color-navy)',
  },

  updateIconGrade: {
    backgroundColor: 'var(--color-success-bg, #dcfce7)',
    color: 'var(--color-success)',
  },

  updateIconFile: {
    backgroundColor: 'var(--color-info-bg, #e0f2fe)',
    color: 'var(--color-info)',
  },

  updateIconAnnouncement: {
    backgroundColor: 'var(--color-warning-bg, #fef3c7)',
    color: 'var(--color-warning)',
  },

  updateContent: {
    flex: 1,
    minWidth: 0,
  },

  updateTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  updateSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  updateMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginLeft: 'var(--space-3)',
    flexShrink: 0,
  },

  updateTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
  },

  markSeenButton: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-16)',
    textAlign: 'center',
  },

  emptyIcon: {
    width: '64px',
    height: '64px',
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
    marginBottom: 'var(--space-2)',
  },

  emptySubtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  syncButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'white',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
};
