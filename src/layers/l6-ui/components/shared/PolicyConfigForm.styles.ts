/**
 * Styles for PolicyConfigForm component
 * Extracted for maintainability
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  configSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
  },

  input: {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
  },

  inputInline: {
    flex: 1,
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderTopLeftRadius: 'var(--radius-md)',
    borderBottomLeftRadius: 'var(--radius-md)',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRight: 'none',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
  },

  inputWithSuffix: {
    display: 'flex',
    alignItems: 'stretch',
  },

  suffix: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: '14px',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderTopRightRadius: 'var(--radius-md)',
    borderBottomRightRadius: 'var(--radius-md)',
  },

  select: {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  hint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    margin: 0,
  },

  error: {
    fontSize: '12px',
    color: 'var(--color-error)',
    margin: 0,
  },

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    alignItems: 'start',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: '4px 0',
  },

  splitSelect: {
    display: 'flex',
    gap: '8px',
  },

  selectSmall: {
    width: '100px',
    flexShrink: 0,
    height: '36px',
    padding: '0 8px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  selectLarge: {
    flex: 1,
    minWidth: 0,
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  arrowDown: {
    display: 'flex',
    justifyContent: 'center',
    padding: '4px 0',
  },

  infoBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },

  maxPerTaskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  maxPerTaskInput: {
    width: '80px',
    height: '36px',
    padding: '0 12px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    boxSizing: 'border-box',
    textAlign: 'center',
  },

  maxPerTaskHint: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
};
