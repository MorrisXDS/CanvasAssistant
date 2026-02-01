/**
 * Calendar Page Styles
 * Extracted from Calendar/index.tsx for maintainability
 */

import type React from 'react';

export const calendarPageStyles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },

  // Drag overlay
  dragOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    border: '3px dashed var(--color-blue)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    pointerEvents: 'none',
  },

  dragContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  dragText: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-blue)',
  },

  // Calendar manager wrapper
  calendarManagerWrapper: {
    marginBottom: 'var(--space-4)',
    maxWidth: '400px',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  viewButton: {
    padding: 'var(--space-2) var(--space-4)',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  navigation: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  todayButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  navButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },

  dateTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    gap: 'var(--space-4)',
  },

  dateTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  courseLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    flexWrap: 'wrap',
  },

  legendTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  courseList: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  courseItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  courseDot: {
    width: '12px',
    height: '12px',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  courseName: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  // Filter styles
  filterButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    color: 'var(--color-success)',
    fontSize: 'var(--text-lg)',
    marginLeft: '-2px',
  },

  calendarBadge: {
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
    marginLeft: 'var(--space-1)',
  },

  addEventButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  icsButtons: {
    display: 'flex',
    gap: 'var(--space-1)',
  },

  icsButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    transition: 'all var(--transition-fast)',
  },

  filterPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    marginBottom: 'var(--space-4)',
  },

  filterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  filterSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  filterSectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  filterActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },

  filterAction: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--color-navy)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  filterActionDivider: {
    color: 'var(--border-default)',
  },

  courseFilterList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },

  courseFilterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    border: '2px solid transparent',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  courseFilterBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
  },

  filterChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },

  filterChip: {
    padding: 'var(--space-1) var(--space-3)',
    border: 'none',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  clearFilters: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    alignSelf: 'flex-start',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};
