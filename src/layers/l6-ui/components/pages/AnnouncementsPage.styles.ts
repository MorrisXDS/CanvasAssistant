/**
 * Styles for AnnouncementsPage component
 * Extracted for maintainability
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 'min(1000px, 100%)',
    margin: '0 auto',
    padding: '0',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    marginBottom: 'var(--space-4)',
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

  searchContainer: {
    position: 'relative',
    marginBottom: 'var(--space-4)',
  },

  searchIcon: {
    position: 'absolute',
    left: 'var(--space-3)',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '100%',
    padding: 'var(--space-3) var(--space-10)',
    fontSize: 'var(--text-base)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--text-primary)',
    outline: 'none',
  },

  searchClear: {
    position: 'absolute',
    right: 'var(--space-3)',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 'var(--space-1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  filtersPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    boxShadow: 'var(--shadow-card)',
  },

  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    minWidth: '50px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  filterChips: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexWrap: 'wrap',
  },

  filterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  filterChipActive: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
    color: 'white',
  },

  filterCount: {
    opacity: 0.7,
    fontSize: 'var(--text-xs)',
  },

  clearFiltersBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-error)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },

  announcementList: {
    display: 'flex',
    flexDirection: 'column',
  },

  announcementItem: {
    display: 'flex',
    alignItems: 'stretch',
    padding: 'var(--space-4) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    textDecoration: 'none',
    color: 'inherit',
  },

  colorBar: {
    width: '4px',
    borderRadius: '2px',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  announcementContent: {
    flex: 1,
    minWidth: 0,
  },

  announcementTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  courseCode: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  intentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
  },

  date: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  attachmentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    padding: '2px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
  },

  announcementTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  announcementPreview: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },

  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginLeft: 'var(--space-3)',
    flexShrink: 0,
  },

  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'all var(--transition-fast)',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-12)',
    gap: 'var(--space-3)',
  },

  emptyText: {
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  clearInlineBtn: {
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-navy)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
};
