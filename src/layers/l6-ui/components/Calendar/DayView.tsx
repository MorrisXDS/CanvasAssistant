/**
 * DayView Component
 * Renders the single day calendar view with hourly time slots
 */

import React from 'react';
import { styles } from './CalendarGridStyles';
import {
  useCalendarGrid,
  getEventId,
  getEventShortLabel,
  getEventTitle,
  getEventTimeRange,
  isCompletedTask,
  isEventInProgress,
  isSameDay,
  positionEvents,
  HOURS,
  HOUR_HEIGHT,
} from './CalendarGridContext';

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function DayView() {
  const {
    currentDate,
    currentTime,
    dayGridRef,
    hoveredEventId,
    courseMatches,
    getEffectiveEventColor,
    getEventsForDate,
    handleEventHover,
    handleEventLeave,
    handleEventClick,
    getCurrentTimePosition,
    isTodayVisible,
    renderDetailModal,
  } = useCalendarGrid();

  const dayEvents = getEventsForDate(currentDate);
  const positionedDayEvents = positionEvents(dayEvents);

  // All-day events for day view
  const allDayEvents = dayEvents.filter((e) => {
    if (e.type === 'imported' && e.event.allDay) return true;
    return false;
  });

  return (
    <div style={styles.dayWrapper}>
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
            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        {/* All-day tasks */}
        {allDayEvents.length > 0 && (
          <div style={styles.dayAllDaySection}>
            <div style={styles.dayAllDayLabel}>All Day</div>
            <div style={styles.dayAllDayContent}>
              {allDayEvents.map((event, i) => {
                const eventId = getEventId(event);
                const isHovered = hoveredEventId === eventId;
                const effectiveColor = getEffectiveEventColor(event);
                const isCompleted = isCompletedTask(event);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.dayAllDayEvent,
                      backgroundColor: effectiveColor,
                      transform: isHovered ? 'scale(1.01)' : 'none',
                      boxShadow: isHovered
                        ? '0 4px 12px rgba(0,0,0,0.2)'
                        : '0 1px 3px rgba(0,0,0,0.12)',
                      opacity: isCompleted ? 0.5 : 1,
                    }}
                    onClick={() => handleEventClick(event)}
                    onMouseEnter={(e) => handleEventHover(e, event)}
                    onMouseLeave={handleEventLeave}
                  >
                    <div
                      style={{
                        ...styles.dayEventTitle,
                        textDecoration: isCompleted ? 'line-through' : 'none',
                      }}
                    >
                      <strong>{getEventShortLabel(event)}</strong>
                      {getEventShortLabel(event) ? ' ' : ''}
                      {getEventTitle(event)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Hourly grid with positioned events */}
        <div ref={dayGridRef} style={styles.dayGridContainer}>
          {/* Hour row backgrounds */}
          <div style={styles.dayGridBackground}>
            {HOURS.map((hour) => (
              <div key={hour} style={styles.dayHourRow}>
                <div style={styles.dayTimeLabel}>{formatHourLabel(hour)}</div>
                <div style={styles.dayHourCellBackground} />
              </div>
            ))}
          </div>

          {/* Positioned events overlay */}
          <div style={styles.dayEventsOverlay}>
            <div style={styles.dayTimeLabelSpacer} />
            <div style={styles.dayEventsColumn}>
              {/* Current time indicator line for day view */}
              {isTodayVisible() && (
                <div
                  style={{
                    ...styles.currentTimeIndicator,
                    top: getCurrentTimePosition() * HOUR_HEIGHT,
                  }}
                >
                  <div style={styles.currentTimeDot} />
                  <div style={styles.currentTimeLine} />
                </div>
              )}
              {positionedDayEvents.map((pe) => {
                const eventId = getEventId(pe.event);
                const isHovered = hoveredEventId === eventId;
                const isInProgress =
                  isEventInProgress(pe.event, currentTime) &&
                  isSameDay(currentDate, new Date());
                const match =
                  pe.event.type === 'imported' ? courseMatches.get(eventId) : null;
                const effectiveColor = getEffectiveEventColor(pe.event);
                const timeRange = getEventTimeRange(pe.event);
                const isCompleted = isCompletedTask(pe.event);
                const isTask = pe.event.type === 'task';

                // Calculate position and size
                const startDate = new Date(
                  pe.event.type === 'task' && pe.event.task.dueAt
                    ? pe.event.task.dueAt
                    : pe.event.type === 'imported'
                      ? pe.event.event.startAt
                      : 0
                );
                const startHour = startDate.getHours();
                const startOffset = startDate.getMinutes() / 60;

                // Calculate duration in hours for imported events
                let durationHours = 1; // Default 1 hour
                if (pe.event.type === 'imported' && pe.event.event.endAt) {
                  const endDate = new Date(pe.event.event.endAt);
                  const durationMs = endDate.getTime() - startDate.getTime();
                  durationHours = Math.max(durationMs / (1000 * 60 * 60), 0.5); // Min 30 min
                }

                // Tasks snap to floor hour
                const top = isTask
                  ? startHour * HOUR_HEIGHT
                  : startHour * HOUR_HEIGHT + startOffset * HOUR_HEIGHT;
                const height = Math.max(durationHours * HOUR_HEIGHT - 4, 20);
                const left = `${(pe.column / pe.totalColumns) * 100}%`;
                const width = `${(1 / pe.totalColumns) * 100 - 1}%`;

                return (
                  <div
                    key={eventId}
                    style={{
                      ...styles.dayPositionedEvent,
                      top,
                      height,
                      left,
                      width,
                      backgroundColor: effectiveColor,
                      transform: isHovered ? 'scale(1.01)' : 'none',
                      zIndex: isHovered ? 10 : isInProgress ? 5 : 1,
                      boxShadow: isInProgress
                        ? `0 0 0 2px white, 0 0 12px ${effectiveColor}`
                        : isHovered
                          ? '0 4px 12px rgba(0,0,0,0.25)'
                          : '0 1px 3px rgba(0,0,0,0.12)',
                      opacity: isCompleted ? 0.5 : 1,
                    }}
                    onClick={() => handleEventClick(pe.event)}
                    onMouseEnter={(e) => handleEventHover(e, pe.event)}
                    onMouseLeave={handleEventLeave}
                  >
                    {isInProgress && <div style={styles.inProgressBadge}>NOW</div>}
                    <div
                      style={{
                        ...styles.dayEventTitle,
                        textDecoration: isCompleted ? 'line-through' : 'none',
                      }}
                    >
                      <strong>{getEventShortLabel(pe.event)}</strong>
                      {getEventShortLabel(pe.event) ? ' ' : ''}
                      {getEventTitle(pe.event)}
                    </div>
                    {timeRange && <div style={styles.dayEventMeta}>{timeRange}</div>}
                    {match && (
                      <div style={styles.dayEventCourse}>→ {match.course.code}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {renderDetailModal()}
    </div>
  );
}

export default DayView;
