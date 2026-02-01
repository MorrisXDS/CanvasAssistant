/**
 * CalendarGrid Styles
 * CSS-in-JS styles for the CalendarGrid component
 */

import React from 'react';

export const styles: Record<string, React.CSSProperties> = {
  // Month view - adaptive sizing
  monthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    // gridTemplateRows set dynamically based on weeks needed
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    height: 'calc(100vh - 220px)', // Viewport - header/nav/controls
    minHeight: '400px',
  },

  weekdayHeader: {
    padding: 'var(--space-2)',
    textAlign: 'center',
    fontWeight: 'var(--font-semibold)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  dayCell: {
    minHeight: '80px',
    padding: 'var(--space-2)',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  dayNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    marginBottom: 'var(--space-1)',
  },

  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
    minWidth: 0,
  },

  eventPill: {
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'white',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
  },

  eventText: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  moreEvents: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    paddingLeft: '4px',
  },

  // Week view
  weekContainer: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

  weekHeader: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 20,
  },

  timeGutter: {
    borderRight: '1px solid var(--border-light)',
  },

  allDayRow: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
    position: 'sticky' as const,
    top: '62px', // Matches header height: 8px padding + 16px dayName + 28px dayNumber + 8px padding + 1px border + 1px buffer
    zIndex: 19,
  },

  allDayLabel: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    borderRight: '1px solid var(--border-light)',
    display: 'flex',
    alignItems: 'flex-start',
  },

  allDayCell: {
    padding: '2px',
    borderRight: '1px solid var(--border-light)',
    minHeight: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    overflow: 'hidden',
  },

  weekDayHeader: {
    padding: 'var(--space-2)',
    textAlign: 'center',
    borderRight: '1px solid var(--border-light)',
  },

  weekDayName: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
  },

  weekDayNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
  },

  weekEventPill: {
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'white',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    marginBottom: '2px',
    width: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
  },

  // Prominent week event card (for hourly grid)
  weekEventCard: {
    padding: '4px 6px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'white',
    cursor: 'pointer',
    flex: 1,
    minWidth: 0,
    height: '100%',
    boxSizing: 'border-box',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  weekEventTitle: {
    fontWeight: 600,
    fontSize: '10px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
    flexShrink: 0,
  },

  weekEventTime: {
    fontSize: '9px',
    opacity: 0.9,
    marginTop: '1px',
    lineHeight: 1.2,
    flexShrink: 0,
  },

  weekEventCourse: {
    fontSize: '9px',
    opacity: 0.9,
    marginTop: '2px',
    fontWeight: 500,
    lineHeight: 1.2,
    flexShrink: 0,
  },

  // Week grid with positioned events - scales with viewport
  weekGridContainer: {
    position: 'relative',
    height: 'calc(100vh - 220px)', // Taller since header/all-day are now inside
    minHeight: '400px',
    overflowY: 'auto',
  },

  // Wrapper for grid background and events overlay - enables correct absolute positioning
  weekGridWrapper: {
    position: 'relative',
  },

  weekGridBackground: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
  },

  timeLabel: {
    padding: '4px var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-muted)',
    textAlign: 'right',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
    height: '48px',
    boxSizing: 'border-box',
  },

  hourCellBackground: {
    height: '48px',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
  },

  weekEventsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    pointerEvents: 'none',
  },

  timeGutterSpacer: {
    pointerEvents: 'none',
  },

  weekDayColumn: {
    position: 'relative',
    pointerEvents: 'auto',
  },

  weekPositionedEvent: {
    position: 'absolute',
    padding: '4px 6px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'white',
    cursor: 'pointer',
    boxSizing: 'border-box',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    margin: '1px',
  },

  hourCell: {
    height: '48px',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    padding: '3px',
    backgroundColor: 'var(--bg-card)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'row',
    gap: '2px',
  },

  // Day view
  dayContainer: {
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

  dayHeader: {
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  dayHeaderDate: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  dayTaskCount: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  dayAllDaySection: {
    display: 'flex',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
  },

  dayAllDayLabel: {
    width: '60px',
    padding: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    borderRight: '1px solid var(--border-light)',
    flexShrink: 0,
  },

  dayAllDayContent: {
    flex: 1,
    padding: 'var(--space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  dayGrid: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '600px',
    overflowY: 'auto',
  },

  dayHourRow: {
    display: 'flex',
    borderBottom: '1px solid var(--border-light)',
    height: '60px',
  },

  dayTimeLabel: {
    width: '60px',
    padding: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'right',
    borderRight: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
    flexShrink: 0,
  },

  dayHourContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    gap: '2px',
    backgroundColor: 'var(--bg-card)',
    padding: '2px',
  },

  dayTaskList: {
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
  },

  emptyDay: {
    textAlign: 'center',
    padding: 'var(--space-6)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
  },

  dayEventCard: {
    flex: 1,
    minWidth: 0,
    padding: '6px 8px',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
  },

  dayEventTitle: {
    fontWeight: 600,
    fontSize: '11px',
    lineHeight: 1.3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  dayEventMeta: {
    fontSize: '10px',
    opacity: 0.9,
    marginTop: '2px',
    lineHeight: 1.2,
    flexShrink: 0,
  },

  dayEventCourse: {
    fontSize: '10px',
    opacity: 0.9,
    marginTop: '2px',
    fontWeight: 500,
    lineHeight: 1.2,
    flexShrink: 0,
  },

  // Day view wrapper
  dayWrapper: {
    position: 'relative',
  },

  dayAllDayEvent: {
    padding: '6px 8px',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
  },

  // Day grid with positioned events - scales with viewport
  dayGridContainer: {
    position: 'relative',
    height: 'calc(100vh - 300px)',
    minHeight: '300px',
    overflowY: 'auto',
  },

  dayGridBackground: {
    display: 'flex',
    flexDirection: 'column',
  },

  dayHourCellBackground: {
    flex: 1,
    backgroundColor: 'var(--bg-card)',
  },

  dayEventsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    pointerEvents: 'none',
  },

  dayTimeLabelSpacer: {
    width: '60px',
    flexShrink: 0,
    pointerEvents: 'none',
  },

  dayEventsColumn: {
    flex: 1,
    position: 'relative',
    pointerEvents: 'auto',
  },

  dayPositionedEvent: {
    position: 'absolute',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'white',
    cursor: 'pointer',
    boxSizing: 'border-box',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    overflow: 'hidden',
    margin: '1px 2px',
  },

  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    animation: 'fadeIn 150ms ease',
  },

  modalContent: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    minWidth: '320px',
    maxWidth: '480px',
    maxHeight: '80vh',
    overflow: 'hidden',
    animation: 'slideUp 200ms ease',
  },

  modalHeader: {
    padding: 'var(--space-4)',
    color: 'white',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
  },

  modalTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    lineHeight: 1.3,
    flex: 1,
  },

  modalClose: {
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background-color 150ms ease',
  },

  modalBody: {
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    maxHeight: '400px',
    overflowY: 'auto',
  },

  modalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  modalLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    fontWeight: 'var(--font-medium)',
  },

  modalValue: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    textAlign: 'right',
  },

  modalDescription: {
    borderTop: '1px solid var(--border-light)',
    paddingTop: 'var(--space-3)',
  },

  modalDescriptionText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    marginTop: 'var(--space-2)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },

  modalCourseLink: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'background-color 150ms ease',
    marginTop: 'var(--space-2)',
  },

  // Wrapper for popup positioning
  monthWrapper: {
    position: 'relative',
  },

  weekWrapper: {
    position: 'relative',
  },

  // Overflow dots
  overflowDots: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 4px',
    cursor: 'pointer',
    borderRadius: '3px',
    transition: 'background-color var(--transition-fast)',
  },

  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  dotMore: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    marginLeft: '2px',
  },

  // Popup
  popup: {
    position: 'absolute',
    zIndex: 100,
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    minWidth: '220px',
    maxWidth: '300px',
    maxHeight: '300px',
    overflow: 'auto',
    animation: 'fadeIn 150ms ease',
  },

  popupHeader: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-app)',
  },

  popupList: {
    display: 'flex',
    flexDirection: 'column',
  },

  popupItem: {
    padding: 'var(--space-2) var(--space-3)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-light)',
    transition: 'background-color var(--transition-fast)',
  },

  popupItemTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  popupItemTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  popupItemMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
    fontStyle: 'italic',
  },

  popupItemCourseLink: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-navy)',
    marginTop: '4px',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  // Current time indicator
  currentTimeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    zIndex: 20,
    pointerEvents: 'none',
  },

  currentTimeDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#EF4444',
    marginLeft: '-5px',
    flexShrink: 0,
    boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
  },

  currentTimeLine: {
    flex: 1,
    height: '2px',
    backgroundColor: '#EF4444',
    boxShadow: '0 0 4px rgba(239, 68, 68, 0.3)',
  },

  // In-progress badge
  inProgressBadge: {
    position: 'absolute',
    top: '2px',
    right: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    color: 'white',
    fontSize: '8px',
    fontWeight: 700,
    padding: '1px 4px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
};
