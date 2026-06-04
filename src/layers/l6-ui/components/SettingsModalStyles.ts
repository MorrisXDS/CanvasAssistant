/**
 * SettingsModal Styles - CSS-in-JS styles for SettingsModal component
 *
 * Extracted from SettingsModal.tsx for maintainability.
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  fullPage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  pageHeader: {
    marginBottom: 'var(--space-4)',
    flexShrink: 0,
  },

  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  title: {
    margin: 0,
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  pageTitle: {
    margin: 0,
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
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

  searchContainer: {
    padding: 'var(--space-3) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--space-4) var(--space-5)',
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  sectionDesc: {
    margin: 0,
    marginBottom: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: 'var(--space-3) 0',
  },

  subsectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  modifiedBadge: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    backgroundColor: 'var(--color-blue-50)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-full)',
    fontWeight: 'var(--font-medium)',
  },

  // Form elements
  input: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
  },

  select: {
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '160px',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  fieldDesc: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-2)',
  },

  quietModeDesc: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-2)',
  },

  // Connection Card
  connectionCard: {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },

  connectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
  },

  connectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  connectionTitle: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  statusBadgeConnected: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },

  statusBadgeDisconnected: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-error-bg)',
    color: 'var(--color-error)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
  },

  urlSection: {
    marginBottom: 'var(--space-3)',
  },

  urlLabel: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-1)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  urlDisplay: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
  },

  urlText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  urlInput: {
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  },

  connectionError: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    marginBottom: 'var(--space-3)',
  },

  validationMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  connectionActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-subtle)',
  },

  tokenActions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  tokenButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  disconnectButton: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  connectButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  // Connection status (legacy)
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },

  statusLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  statusConnected: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-success)',
  },

  statusDisconnected: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
  },

  error: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
    marginBottom: 'var(--space-2)',
  },

  validationResult: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-2)',
  },

  // Buttons
  buttonRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
    marginTop: 'var(--space-2)',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  dangerButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-error)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  // Download location
  downloadLocationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
  },

  downloadLocationPath: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  changeLocationBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Course list
  courseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    maxHeight: '200px',
    overflowY: 'auto',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
  },

  courseRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
  },

  courseInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flex: 1,
    minWidth: 0,
  },

  courseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  courseText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  courseCode: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  courseName: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  visibilityBtn: {
    padding: 'var(--space-1)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-4)',
  },

  // No results
  noResults: {
    textAlign: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-secondary)',
  },

  clearSearchBtn: {
    marginTop: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-5)',
    borderTop: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  footerLeft: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  footerRight: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  footerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  dangerButtonSmall: {
    borderColor: 'var(--color-error)',
    color: 'var(--color-error)',
  },

  exportMessage: {
    padding: 'var(--space-2) var(--space-5)',
    fontSize: 'var(--text-sm)',
    borderTop: '1px solid var(--border-default)',
  },

  // Token modal — description paragraph (body content style; chrome now owned
  // by the <Modal> primitive)
  tokenModalDesc: {
    margin: '0 0 var(--space-4) 0',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },

  tokenSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  // Checkbox
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginTop: 'var(--space-3)',
  },

  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  // Data Management Section
  exportButtonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  exportActionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 'var(--space-1)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 100,
    minWidth: '160px',
    overflow: 'hidden',
  },

  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    textAlign: 'left',
    cursor: 'pointer',
  },

  dangerZoneBox: {
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-4)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },

  dangerZoneContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
  },

  dangerZoneDesc: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 'var(--space-1) 0 0 0',
  },

  dangerZoneButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-error)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  },
};
