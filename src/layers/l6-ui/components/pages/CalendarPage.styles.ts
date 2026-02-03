/**
 * Styles for CalendarPage component
 * Extracted for maintainability
 */

import type React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth:
      'min(var(--content-max-width), calc(100vw - var(--sidebar-width) - var(--space-12)))',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    flex: 1,
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  icsButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
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

  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  searchIcon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '200px',
    height: '36px',
    paddingLeft: '36px',
    paddingRight: '32px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    outline: 'none',
  },

  clearSearch: {
    position: 'absolute',
    right: '8px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    color: 'var(--text-muted)',
  },

  filterButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '8px',
    height: '8px',
    backgroundColor: 'var(--color-navy)',
    borderRadius: '50%',
  },

  filterPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  },

  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
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
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    border: '1px solid',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  clearFiltersBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-error)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    marginLeft: 'auto',
    alignSelf: 'flex-end',
  },

  calendarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  calendarNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  navButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  monthTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    minWidth: '180px',
    textAlign: 'center',
  },

  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    padding: '2px',
    border: '1px solid var(--border-default)',
  },

  viewToggleBtn: {
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  viewToggleBtnActive: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },

  todayButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    width: '100%',
  },

  dayHeader: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderBottom: '1px solid var(--border-light)',
    textTransform: 'uppercase',
  },

  calendarDay: {
    minHeight: '100px',
    padding: 'var(--space-2)',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    overflow: 'hidden',
    minWidth: 0,
    maxWidth: '100%',
  },

  dayNumber: {
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-1)',
    flexShrink: 0,
  },

  dayTasks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
    minWidth: 0,
    width: 0,
    flex: '1 1 auto',
  },

  taskPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    color: 'white',
    cursor: 'pointer',
    overflow: 'hidden',
    boxSizing: 'border-box',
    flexShrink: 0,
  },

  taskTime: {
    flexShrink: 0,
    fontSize: '10px',
    opacity: 0.85,
  },

  taskPillText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },

  moreTasksIndicator: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    padding: '2px 0',
  },

  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
  },

  emptyTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },

  clearFiltersLarge: {
    marginTop: 'var(--space-4)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  // Week view styles
  weekGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    width: '100%',
  },

  weekDayHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-1)',
    borderBottom: '1px solid var(--border-light)',
    borderRight: '1px solid var(--border-light)',
  },

  weekDayName: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },

  weekDayNumber: {
    fontSize: 'var(--text-lg)',
    marginTop: '2px',
  },

  weekDayColumn: {
    minHeight: '300px',
    padding: 'var(--space-2)',
    borderRight: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    overflow: 'auto',
  },

  weekTaskCard: {
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    borderLeft: '3px solid',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  weekTaskTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: 'var(--font-medium)',
  },

  weekTaskTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontWeight: 'var(--font-medium)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },

  weekTaskCourse: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  weekNoTasks: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-4)',
  },
};
