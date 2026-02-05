/**
 * WeekView Component
 * Renders the week calendar grid view with hourly time slots
 * Uses scroll animation + useDeferredValue (in parent) to eliminate flash when navigating
 */

import React, { useMemo, useRef } from 'react';
import { styles } from './CalendarGridStyles';
import {
  useCalendarGrid,
  getWeekDays,
  getEventId,
  getEventShortLabel,
  getEventTitle,
  getEventTimeRange,
  isCompletedTask,
  isEventInProgress,
  isToday,
  isSameDay,
  positionEvents,
  WEEKDAYS,
  HOURS,
  WEEK_HOUR_HEIGHT,
  type CalendarEvent,
} from './CalendarGridContext';
import {
  getHourInEffectiveTimezone,
  getMinuteOffsetInEffectiveTimezone,
} from '../../../l5-presentation/settings';

const MAX_VISIBLE_ALLDAY = 1;

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/**
 * Get the Sunday of a given week
 */
function getWeekSunday(date: Date): Date {
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

/**
 * Generate a stable key for a week based on its Sunday
 */
function getWeekKey(sunday: Date): string {
  return `week-${sunday.getFullYear()}-${sunday.getMonth()}-${sunday.getDate()}`;
}

/**
 * Single week panel component - renders one week's content
 */
interface WeekPanelProps {
  weekSunday: Date;
  events: CalendarEvent[];
  isCurrentWeek: boolean;
  scrollRef?: React.Ref<HTMLDivElement>;
}

function WeekPanel({ weekSunday, events, isCurrentWeek, scrollRef }: WeekPanelProps) {
  const {
    currentTime,
    hoveredEventId,
    highlightedTaskId,
    courseMatches,
    getEffectiveEventColor,
    showPopup,
    handleEventHover,
    handleEventLeave,
    handleEventClick,
    getCurrentTimePosition,
  } = useCalendarGrid();

  const days = getWeekDays(weekSunday);

  // Filter events for this specific week
  const weekEvents = useMemo(() => {
    const weekStart = days[0];
    const weekEnd = new Date(days[6].getTime() + 24 * 60 * 60 * 1000);
    return events.filter((e) => {
      if (e.type === 'task') {
        if (!e.task.dueAt) return false;
        const dueDate = new Date(e.task.dueAt);
        return dueDate >= weekStart && dueDate < weekEnd;
      }
      const startAt = new Date(e.event.startAt);
      return startAt >= weekStart && startAt < weekEnd;
    });
  }, [events, days]);

  // Get events for a specific date within this week
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return weekEvents.filter((e) => {
      if (e.type === 'task') {
        if (!e.task.dueAt) return false;
        return isSameDay(new Date(e.task.dueAt), date);
      }
      return isSameDay(new Date(e.event.startAt), date);
    });
  };

  // Check if today is in this week
  const today = new Date();
  const isTodayInThisWeek = days.some((d) => isSameDay(d, today));
  const todayColumnIndex = days.findIndex((d) => isSameDay(d, today));

  const panelRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={panelRef} style={styles.weekContainer}>
      {/* Scrollable container with sticky header */}
      <div ref={scrollRef} style={styles.weekGridContainer}>
        {/* Header row with dates - sticky */}
        <div style={styles.weekHeader}>
          <div style={styles.timeGutter} />
          {days.map((date, index) => (
            <div
              key={index}
              style={{
                ...styles.weekDayHeader,
                backgroundColor: isToday(date)
                  ? 'rgba(0, 127, 163, 0.08)'
                  : 'var(--bg-card)',
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

        {/* All-day row for tasks without specific time - sticky */}
        <div style={styles.allDayRow}>
          <div style={styles.allDayLabel}>All Day</div>
          {days.map((date, dayIndex) => {
            const allDayEvents = getEventsForDate(date).filter((e) => {
              if (e.type === 'imported' && e.event.allDay) return true;
              return false;
            });
            const visibleEvents = allDayEvents.slice(0, MAX_VISIBLE_ALLDAY);
            const hiddenEvents = allDayEvents.slice(MAX_VISIBLE_ALLDAY);
            const dateLabel = `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - All Day`;

            return (
              <div key={dayIndex} style={styles.allDayCell}>
                {visibleEvents.map((event, i) => {
                  const eventId = getEventId(event);
                  const isHovered = hoveredEventId === eventId;
                  const effectiveColor = getEffectiveEventColor(event);
                  const isCompleted = isCompletedTask(event);
                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.weekEventPill,
                        backgroundColor: effectiveColor,
                        transform: isHovered ? 'scale(1.02)' : 'none',
                        boxShadow: isHovered
                          ? '0 3px 8px rgba(0,0,0,0.2)'
                          : '0 1px 2px rgba(0,0,0,0.1)',
                        opacity: isCompleted ? 0.5 : 1,
                      }}
                      onClick={() => handleEventClick(event)}
                      onMouseEnter={(e) => handleEventHover(e, event)}
                      onMouseLeave={handleEventLeave}
                    >
                      <span
                        style={{
                          ...styles.eventText,
                          textDecoration: isCompleted ? 'line-through' : 'none',
                        }}
                      >
                        <strong>{getEventShortLabel(event)}</strong>
                        {getEventShortLabel(event) ? ' ' : ''}
                        {getEventTitle(event)}
                      </span>
                    </div>
                  );
                })}
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
                          backgroundColor: getEffectiveEventColor(event),
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

        {/* Wrapper for grid and events overlay */}
        <div style={styles.weekGridWrapper}>
          {/* Hour row backgrounds */}
          <div style={styles.weekGridBackground}>
            {HOURS.map((hour) => (
              <React.Fragment key={hour}>
                <div style={styles.timeLabel}>{formatHourLabel(hour)}</div>
                {days.map((_, dayIndex) => (
                  <div key={dayIndex} style={styles.hourCellBackground} />
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* Day columns with positioned events */}
          <div style={styles.weekEventsOverlay}>
            <div style={styles.timeGutterSpacer} />
            {days.map((date, dayIndex) => {
              const dayEvents = getEventsForDate(date);
              const positionedEvents = positionEvents(dayEvents);
              const showTimeIndicator =
                isTodayInThisWeek && todayColumnIndex === dayIndex && isCurrentWeek;

              return (
                <div key={dayIndex} style={styles.weekDayColumn}>
                  {/* Current time indicator line */}
                  {showTimeIndicator && (
                    <div
                      style={{
                        ...styles.currentTimeIndicator,
                        top: getCurrentTimePosition() * WEEK_HOUR_HEIGHT,
                      }}
                    >
                      <div style={styles.currentTimeDot} />
                      <div style={styles.currentTimeLine} />
                    </div>
                  )}
                  {positionedEvents.map((pe) => {
                    const eventId = getEventId(pe.event);
                    const isHovered = hoveredEventId === eventId;
                    const isInProgress =
                      isEventInProgress(pe.event, currentTime) &&
                      isSameDay(date, new Date());
                    const isHighlighted =
                      pe.event.type === 'task' && highlightedTaskId === pe.event.task.id;
                    const match =
                      pe.event.type === 'imported' ? courseMatches.get(eventId) : null;
                    const effectiveColor = getEffectiveEventColor(pe.event);
                    const timeRange = getEventTimeRange(pe.event);
                    const isCompleted = isCompletedTask(pe.event);
                    const isTask = pe.event.type === 'task';

                    // Calculate position and size using effective timezone
                    const startDateStr =
                      pe.event.type === 'task' && pe.event.task.dueAt
                        ? pe.event.task.dueAt
                        : pe.event.type === 'imported'
                          ? pe.event.event.startAt
                          : new Date(0).toISOString();
                    const startHour = getHourInEffectiveTimezone(startDateStr);
                    const startOffset = getMinuteOffsetInEffectiveTimezone(startDateStr);

                    // Calculate duration in hours for imported events
                    let durationHours = 1; // Default 1 hour
                    if (pe.event.type === 'imported' && pe.event.event.endAt) {
                      const startMs = new Date(pe.event.event.startAt).getTime();
                      const endMs = new Date(pe.event.event.endAt).getTime();
                      const durationMs = endMs - startMs;
                      durationHours = Math.max(durationMs / (1000 * 60 * 60), 0.5); // Min 30 min
                    }

                    // Tasks snap to floor hour
                    const top = isTask
                      ? startHour * WEEK_HOUR_HEIGHT
                      : startHour * WEEK_HOUR_HEIGHT + startOffset * WEEK_HOUR_HEIGHT;
                    const height = Math.max(durationHours * WEEK_HOUR_HEIGHT - 2, 20);
                    const leftPercent = (pe.column / pe.totalColumns) * 100;
                    const widthPercent = (1 / pe.totalColumns) * 100;
                    const left = `${leftPercent}%`;
                    const width = `${widthPercent}%`;

                    return (
                      <div
                        key={eventId}
                        data-task-id={
                          pe.event.type === 'task' ? pe.event.task.id : undefined
                        }
                        style={{
                          ...styles.weekPositionedEvent,
                          top,
                          height,
                          left,
                          width,
                          backgroundColor: effectiveColor,
                          transform: isHovered ? 'scale(1.02)' : 'none',
                          zIndex: isHovered ? 10 : isInProgress || isHighlighted ? 5 : 1,
                          boxShadow:
                            isInProgress || isHighlighted
                              ? `0 0 0 2px white, 0 0 12px ${effectiveColor}`
                              : isHovered
                                ? '0 4px 12px rgba(0,0,0,0.25)'
                                : '0 1px 3px rgba(0,0,0,0.12)',
                          opacity: isCompleted ? 0.5 : 1,
                          animation: isHighlighted
                            ? 'pulse 1.5s ease-in-out infinite'
                            : undefined,
                        }}
                        onClick={() => handleEventClick(pe.event)}
                        onMouseEnter={(e) => handleEventHover(e, pe.event)}
                        onMouseLeave={handleEventLeave}
                      >
                        {isInProgress && <div style={styles.inProgressBadge}>NOW</div>}
                        <div
                          style={{
                            ...styles.weekEventTitle,
                            textDecoration: isCompleted ? 'line-through' : 'none',
                          }}
                        >
                          <strong>{getEventShortLabel(pe.event)}</strong>
                          {getEventShortLabel(pe.event) ? ' ' : ''}
                          {getEventTitle(pe.event)}
                        </div>
                        {timeRange && <div style={styles.weekEventTime}>{timeRange}</div>}
                        {match && (
                          <div style={styles.weekEventCourse}>→ {match.course.code}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WeekView() {
  const {
    currentDate,
    events,
    containerRef,
    weekGridRef,
    hidePopupDelayed,
    renderPopup,
    renderDetailModal,
  } = useCalendarGrid();

  // Sync the weekGridRef to the current week's scrollable container
  // We need to update the ref when the current week changes
  const currentWeekScrollRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (weekGridRef && 'current' in weekGridRef) {
        (weekGridRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [weekGridRef]
  );

  // Calculate the current week's Sunday
  const currentWeekSunday = useMemo(() => getWeekSunday(currentDate), [currentDate]);

  return (
    <div ref={containerRef} style={styles.weekWrapper} onMouseLeave={hidePopupDelayed}>
      <WeekPanel
        key={getWeekKey(currentWeekSunday)}
        weekSunday={currentWeekSunday}
        events={events}
        isCurrentWeek={true}
        scrollRef={currentWeekScrollRef}
      />

      {/* Popup */}
      {renderPopup()}

      {/* Detail Modal */}
      {renderDetailModal()}
    </div>
  );
}

export default WeekView;
