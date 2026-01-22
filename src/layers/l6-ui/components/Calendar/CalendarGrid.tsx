/**
 * CalendarGrid Component
 * Renders month, week, or day view calendar grid
 */

import React, { useState, useRef } from 'react';
import type { Task, Course, DisplayCalendarEvent } from '../../../l5-presentation/types';

// Popup state type
interface PopupState {
  events: CalendarEvent[];
  x: number;
  y: number;
  label: string;
}

export type CalendarView = 'month' | 'week' | 'day';

// Task-based event (from Canvas assignments)
export interface TaskCalendarEvent {
  type: 'task';
  task: Task;
  course: Course;
}

// Imported calendar event
export interface ImportedCalendarEvent {
  type: 'imported';
  event: DisplayCalendarEvent;
}

// Union type for all calendar events
export type CalendarEvent = TaskCalendarEvent | ImportedCalendarEvent;

// Helper to get event date
function getEventDate(event: CalendarEvent): Date | null {
  if (event.type === 'task') {
    return event.task.dueAt ? new Date(event.task.dueAt) : null;
  }
  return new Date(event.event.startAt);
}

// Helper to get event title
function getEventTitle(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.task.title;
  }
  return event.event.title;
}

// Helper to get event color
function getEventColor(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.course.color || '#007FA3';
  }
  return event.event.color || '#6366F1';
}

// Helper to get short label (course code or abbreviated calendar name)
function getEventShortLabel(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.course.code.split(/[HY]\d|\s/)[0];
  }
  // For imported events, don't show calendar name - just show event title
  return '';
}

// Helper to get full label (course code or calendar name)
function getEventFullLabel(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.course.code;
  }
  // For imported events in popups, show calendar name
  return event.event.calendarName || 'Imported';
}

// Helper to get tooltip text
function getEventTooltip(event: CalendarEvent): string {
  if (event.type === 'task') {
    return `${event.course.code}: ${event.task.title}`;
  }
  return event.event.title;
}

// Helper to get time display
function getEventTime(event: CalendarEvent): string | null {
  const date = getEventDate(event);
  if (!date) return null;
  if (event.type === 'imported' && event.event.allDay) return null;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export interface CalendarGridProps {
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
}

// Helper functions
function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Add days from previous month to fill first week
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Add all days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Add days from next month to fill last week
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function getWeekDays(date: Date): Date[] {
  const days: Date[] = [];
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());

  for (let i = 0; i < 7; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }

  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CalendarGrid({
  view,
  currentDate,
  events,
  onEventClick,
  onDateClick,
}: CalendarGridProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getEventsForDate = (date: Date) => {
    return events.filter((e) => {
      const eventDate = getEventDate(e);
      if (!eventDate) return false;
      return isSameDay(eventDate, date);
    });
  };

  const showPopup = (
    e: React.MouseEvent,
    events: CalendarEvent[],
    label: string
  ) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    setPopup({
      events,
      x: rect.right - containerRect.left + 8,
      y: rect.top - containerRect.top,
      label,
    });
  };

  const hidePopup = () => setPopup(null);

  if (view === 'month') {
    const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
    const MAX_VISIBLE = 2;

    return (
      <div ref={containerRef} style={styles.monthWrapper} onMouseLeave={hidePopup}>
        <div style={styles.monthGrid}>
          {/* Weekday headers */}
          {WEEKDAYS.map((day) => (
            <div key={day} style={styles.weekdayHeader}>
              {day}
            </div>
          ))}

          {/* Day cells */}
          {days.map((date, index) => {
            const dayEvents = getEventsForDate(date);
            const isCurrentMonth = date.getMonth() === currentDate.getMonth();
            const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
            const hiddenEvents = dayEvents.slice(MAX_VISIBLE);
            const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

            return (
              <div
                key={index}
                style={{
                  ...styles.dayCell,
                  opacity: isCurrentMonth ? 1 : 0.4,
                  backgroundColor: isToday(date) ? 'rgba(0, 127, 163, 0.08)' : 'transparent',
                }}
                onClick={() => onDateClick?.(date)}
              >
                <span
                  style={{
                    ...styles.dayNumber,
                    backgroundColor: isToday(date) ? 'var(--color-navy)' : 'transparent',
                    color: isToday(date) ? 'white' : 'var(--text-primary)',
                  }}
                >
                  {date.getDate()}
                </span>
                <div style={styles.eventList}>
                  {visibleEvents.map((event, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.eventPill,
                        backgroundColor: getEventColor(event),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      title={getEventTooltip(event)}
                    >
                      <span style={styles.eventText}>
                        <strong>{getEventShortLabel(event)}</strong> {getEventTitle(event)}
                      </span>
                    </div>
                  ))}
                  {hiddenEvents.length > 0 && (
                    <div
                      style={styles.overflowDots}
                      onMouseEnter={(e) => showPopup(e, dayEvents, dateLabel)}
                    >
                      {hiddenEvents.slice(0, 3).map((event, i) => (
                        <span
                          key={i}
                          style={{
                            ...styles.dot,
                            backgroundColor: getEventColor(event),
                          }}
                        />
                      ))}
                      {hiddenEvents.length > 3 && (
                        <span style={styles.dotMore}>+{hiddenEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Popup */}
        {popup && (
          <div
            style={{
              ...styles.popup,
              left: popup.x,
              top: popup.y,
            }}
            onMouseLeave={hidePopup}
          >
            <div style={styles.popupHeader}>{popup.label}</div>
            <div style={styles.popupList}>
              {popup.events.map((event, i) => {
                const time = getEventTime(event);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.popupItem,
                      borderLeft: `3px solid ${getEventColor(event)}`,
                    }}
                    onClick={() => onEventClick?.(event)}
                  >
                    <div style={styles.popupItemTitle}>
                      <strong>{getEventFullLabel(event)}</strong> {getEventTitle(event)}
                    </div>
                    {time && (
                      <div style={styles.popupItemTime}>{time}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'week') {
    const days = getWeekDays(currentDate);
    const MAX_VISIBLE_HOUR = 1;
    const MAX_VISIBLE_ALLDAY = 1;

    const formatHourLabel = (hour: number) =>
      hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;

    return (
      <div ref={containerRef} style={styles.weekWrapper} onMouseLeave={hidePopup}>
        <div style={styles.weekContainer}>
          {/* Header row with dates */}
          <div style={styles.weekHeader}>
            <div style={styles.timeGutter} />
            {days.map((date, index) => (
              <div
                key={index}
                style={{
                  ...styles.weekDayHeader,
                  backgroundColor: isToday(date) ? 'rgba(0, 127, 163, 0.08)' : 'transparent',
                }}
              >
                <span style={styles.weekDayName}>{WEEKDAYS[date.getDay()]}</span>
                <span
                  style={{
                    ...styles.weekDayNumber,
                    backgroundColor: isToday(date) ? 'var(--color-navy)' : 'transparent',
                    color: isToday(date) ? 'white' : 'var(--text-primary)',
                  }}
                >
                  {date.getDate()}
                </span>
              </div>
            ))}
          </div>

          {/* All-day row for tasks without specific time */}
          <div style={styles.allDayRow}>
            <div style={styles.allDayLabel}>All Day</div>
            {days.map((date, dayIndex) => {
              const allDayEvents = getEventsForDate(date).filter((e) => {
                const eventDate = getEventDate(e);
                if (!eventDate) return true;
                if (e.type === 'imported' && e.event.allDay) return true;
                return eventDate.getHours() === 0 && eventDate.getMinutes() === 0;
              });
              const visibleEvents = allDayEvents.slice(0, MAX_VISIBLE_ALLDAY);
              const hiddenEvents = allDayEvents.slice(MAX_VISIBLE_ALLDAY);
              const dateLabel = `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - All Day`;

              return (
                <div key={dayIndex} style={styles.allDayCell}>
                  {visibleEvents.map((event, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.weekEventPill,
                        backgroundColor: getEventColor(event),
                      }}
                      onClick={() => onEventClick?.(event)}
                      title={getEventTooltip(event)}
                    >
                      <span style={styles.eventText}>
                        <strong>{getEventShortLabel(event)}</strong> {getEventTitle(event)}
                      </span>
                    </div>
                  ))}
                  {hiddenEvents.length > 0 && (
                    <div
                      style={styles.overflowDots}
                      onMouseEnter={(e) => showPopup(e, allDayEvents, dateLabel)}
                    >
                      {hiddenEvents.slice(0, 3).map((event, i) => (
                        <span
                          key={i}
                          style={{
                            ...styles.dot,
                            backgroundColor: getEventColor(event),
                          }}
                        />
                      ))}
                      {hiddenEvents.length > 3 && (
                        <span style={styles.dotMore}>+{hiddenEvents.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div style={styles.weekGrid}>
            {HOURS.map((hour) => (
              <React.Fragment key={hour}>
                <div style={styles.timeLabel}>{formatHourLabel(hour)}</div>
                {days.map((date, dayIndex) => {
                  const hourEvents = getEventsForDate(date).filter((e) => {
                    const eventDate = getEventDate(e);
                    if (!eventDate) return false;
                    if (eventDate.getHours() === 0 && eventDate.getMinutes() === 0) return false;
                    return eventDate.getHours() === hour;
                  });
                  const visibleEvents = hourEvents.slice(0, MAX_VISIBLE_HOUR);
                  const hiddenEvents = hourEvents.slice(MAX_VISIBLE_HOUR);
                  const hourLabel = `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${formatHourLabel(hour)}`;

                  return (
                    <div key={dayIndex} style={styles.hourCell}>
                      {visibleEvents.map((event, i) => (
                        <div
                          key={i}
                          style={{
                            ...styles.weekEventPill,
                            backgroundColor: getEventColor(event),
                          }}
                          onClick={() => onEventClick?.(event)}
                          title={getEventTooltip(event)}
                        >
                          <span style={styles.eventText}>
                            <strong>{getEventShortLabel(event)}</strong> {getEventTitle(event)}
                          </span>
                        </div>
                      ))}
                      {hiddenEvents.length > 0 && (
                        <div
                          style={styles.overflowDots}
                          onMouseEnter={(e) => showPopup(e, hourEvents, hourLabel)}
                        >
                          {hiddenEvents.slice(0, 3).map((event, i) => (
                            <span
                              key={i}
                              style={{
                                ...styles.dot,
                                backgroundColor: getEventColor(event),
                              }}
                            />
                          ))}
                          {hiddenEvents.length > 3 && (
                            <span style={styles.dotMore}>+{hiddenEvents.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Popup */}
        {popup && (
          <div
            style={{
              ...styles.popup,
              left: popup.x,
              top: popup.y,
            }}
            onMouseLeave={hidePopup}
          >
            <div style={styles.popupHeader}>{popup.label}</div>
            <div style={styles.popupList}>
              {popup.events.map((event, i) => {
                const time = getEventTime(event);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.popupItem,
                      borderLeft: `3px solid ${getEventColor(event)}`,
                    }}
                    onClick={() => onEventClick?.(event)}
                  >
                    <div style={styles.popupItemTitle}>
                      <strong>{getEventFullLabel(event)}</strong> {getEventTitle(event)}
                    </div>
                    {time && (
                      <div style={styles.popupItemTime}>{time}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Day view
  const dayEvents = getEventsForDate(currentDate);

  return (
    <div style={styles.dayContainer}>
      <div style={styles.dayHeader}>
        <span style={styles.dayHeaderDate}>
          {currentDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        <span style={styles.dayTaskCount}>
          {dayEvents.length} {dayEvents.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      {/* All-day tasks */}
      {(() => {
        const allDayEvents = dayEvents.filter((e) => {
          const eventDate = getEventDate(e);
          if (!eventDate) return true;
          if (e.type === 'imported' && e.event.allDay) return true;
          return eventDate.getHours() === 0 && eventDate.getMinutes() === 0;
        });
        return allDayEvents.length > 0 ? (
          <div style={styles.dayAllDaySection}>
            <div style={styles.dayAllDayLabel}>All Day</div>
            <div style={styles.dayAllDayContent}>
              {allDayEvents.map((event, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.dayEventCard,
                    backgroundColor: getEventColor(event),
                  }}
                  onClick={() => onEventClick?.(event)}
                  title={getEventTooltip(event)}
                >
                  <div style={styles.dayEventTitle}>
                    <strong>{getEventShortLabel(event)}</strong> {getEventTitle(event)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {/* Hourly grid */}
      <div style={styles.dayGrid}>
        {HOURS.map((hour) => {
          const hourEvents = dayEvents.filter((e) => {
            const eventDate = getEventDate(e);
            if (!eventDate) return false;
            if (e.type === 'imported' && e.event.allDay) return false;
            if (eventDate.getHours() === 0 && eventDate.getMinutes() === 0) return false;
            return eventDate.getHours() === hour;
          });

          return (
            <div key={hour} style={styles.dayHourRow}>
              <div style={styles.dayTimeLabel}>
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              <div style={styles.dayHourContent}>
                {hourEvents.map((event, i) => {
                  const time = getEventTime(event);
                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.dayEventCard,
                        backgroundColor: getEventColor(event),
                      }}
                      onClick={() => onEventClick?.(event)}
                      title={getEventTooltip(event)}
                    >
                      <div style={styles.dayEventTitle}>
                        <strong>{getEventShortLabel(event)}</strong> {getEventTitle(event)}
                      </div>
                      {time && (
                        <div style={styles.dayEventMeta}>{time}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Month view
  monthGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },

  weekdayHeader: {
    padding: 'var(--space-2)',
    textAlign: 'center',
    fontWeight: 'var(--font-semibold)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
  },

  dayCell: {
    minHeight: '100px',
    padding: 'var(--space-1)',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    overflow: 'hidden',
  },

  dayNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
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
    padding: '2px 4px',
    borderRadius: '3px',
    fontSize: '11px',
    color: 'white',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    maxWidth: '100%',
    minWidth: 0,
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
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },

  weekHeader: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
  },

  timeGutter: {
    borderRight: '1px solid var(--border-light)',
  },

  allDayRow: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
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
    padding: '2px 4px',
    borderRadius: '3px',
    fontSize: '10px',
    color: 'white',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    marginBottom: '2px',
  },

  weekGrid: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
  },

  timeLabel: {
    padding: '2px var(--space-2)',
    fontSize: '10px',
    color: 'var(--text-muted)',
    textAlign: 'right',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-card)',
  },

  hourCell: {
    height: '24px',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    padding: '1px',
    backgroundColor: 'var(--bg-card)',
    overflow: 'hidden',
  },

  // Day view
  dayContainer: {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
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
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },

  dayEventTitle: {
    fontWeight: 'var(--font-medium)',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  dayEventMeta: {
    fontSize: '10px',
    opacity: 0.85,
    marginTop: '2px',
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
};

export default CalendarGrid;
