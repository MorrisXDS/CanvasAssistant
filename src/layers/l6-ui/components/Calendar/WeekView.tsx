/**
 * WeekView Component
 * Renders the week calendar grid view with hourly time slots
 */

import React from 'react';
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
} from './CalendarGridContext';

const MAX_VISIBLE_ALLDAY = 1;

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function WeekView() {
  const {
    currentDate,
    currentTime,
    containerRef,
    weekGridRef,
    hoveredEventId,
    courseMatches,
    getEffectiveEventColor,
    getEventsForDate,
    showPopup,
    hidePopupDelayed,
    handleEventHover,
    handleEventLeave,
    handleEventClick,
    getCurrentTimePosition,
    isTodayVisible,
    getTodayColumnIndex,
    renderPopup,
    renderDetailModal,
  } = useCalendarGrid();

  const days = getWeekDays(currentDate);

  return (
    <div ref={containerRef} style={styles.weekWrapper} onMouseLeave={hidePopupDelayed}>
      <div style={styles.weekContainer}>
        {/* Scrollable container with sticky header */}
        <div ref={weekGridRef} style={styles.weekGridContainer}>
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
                    backgroundColor: isToday(date)
                      ? 'var(--color-navy)'
                      : 'transparent',
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
                  isTodayVisible() && getTodayColumnIndex() === dayIndex;

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
                      const match =
                        pe.event.type === 'imported'
                          ? courseMatches.get(eventId)
                          : null;
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

                      // Tasks snap to floor hour
                      const top = isTask
                        ? startHour * WEEK_HOUR_HEIGHT
                        : startHour * WEEK_HOUR_HEIGHT + startOffset * WEEK_HOUR_HEIGHT;
                      const height = Math.max(WEEK_HOUR_HEIGHT - 2, 20);
                      const left = `${(pe.column / pe.totalColumns) * 100}%`;
                      const width = `${(1 / pe.totalColumns) * 100 - 1}%`;

                      return (
                        <div
                          key={eventId}
                          style={{
                            ...styles.weekPositionedEvent,
                            top,
                            height,
                            left,
                            width,
                            backgroundColor: effectiveColor,
                            transform: isHovered ? 'scale(1.02)' : 'none',
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
                          {isInProgress && (
                            <div style={styles.inProgressBadge}>NOW</div>
                          )}
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
                          {timeRange && (
                            <div style={styles.weekEventTime}>{timeRange}</div>
                          )}
                          {match && (
                            <div style={styles.weekEventCourse}>
                              → {match.course.code}
                            </div>
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

      {/* Popup */}
      {renderPopup()}

      {/* Detail Modal */}
      {renderDetailModal()}
    </div>
  );
}

export default WeekView;
