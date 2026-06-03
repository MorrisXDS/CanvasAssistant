/**
 * Styles for TasksPage component
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

  taskList: {
    display: 'flex',
    flexDirection: 'column',
  },

  taskItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--space-4) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  checkbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    marginLeft: 'var(--space-3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'transform var(--transition-fast)',
  },

  priorityBar: {
    width: '4px',
    alignSelf: 'stretch',
    borderRadius: '2px',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  statusIcon: {
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  taskContent: {
    flex: 1,
    minWidth: 0,
  },

  taskTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  courseCode: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },

  taskTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  taskMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  taskWeight: {
    padding: '1px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
  },

  taskGrade: {
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-success)',
  },

  courseName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  addButton: {
    display: 'flex',
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
  },

  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  formInput: {
    padding: 'var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },

  formInputSmall: {
    width: '100px',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },

  formSelect: {
    flex: 1,
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
  },

  formRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },
};
