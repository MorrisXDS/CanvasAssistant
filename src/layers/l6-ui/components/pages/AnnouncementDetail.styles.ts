/**
 * Styles for AnnouncementDetail component
 * Extracted for maintainability
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    flex: 1,
  },

  page: {
    width: '100%',
    maxWidth: 'min(800px, calc(100vw - var(--sidebar-width) - var(--space-8)))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-8)',
    flex: 1,
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  },

  mainCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    padding: 'var(--space-6)',
  },

  sourceIcon: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-navy)',
    color: 'var(--text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  headerContent: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
    lineHeight: 'var(--leading-snug)',
  },

  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  courseCode: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },

  metaDot: {
    color: 'var(--text-muted)',
  },

  dateText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: '0 var(--space-6)',
  },

  content: {
    padding: 'var(--space-6)',
    fontSize: 'var(--text-base)',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-line', // Preserves newlines but collapses spaces
  },

  htmlContent: {
    padding: 'var(--space-6)',
    fontSize: 'var(--text-base)',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
  },

  attachmentsSection: {
    padding: 'var(--space-5) var(--space-6)',
    borderTop: '1px solid var(--border-light)',
  },

  attachmentsTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 'var(--space-3)',
  },

  attachmentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  attachmentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  },

  attachmentIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },

  attachmentInfo: {
    flex: 1,
    minWidth: 0,
  },

  attachmentName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  attachmentMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  attachmentActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },

  attachmentButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: 'var(--space-4) var(--space-6)',
    borderTop: '1px solid var(--border-light)',
  },

  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  notFound: {
    textAlign: 'center',
    padding: 'var(--space-12)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },

  notFoundTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  notFoundText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  backLinkNotFound: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--color-navy)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    textDecoration: 'none',
  },
};
