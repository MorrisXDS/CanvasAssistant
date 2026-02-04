/**
 * MonthView Component
 * Renders the month calendar grid view
 */

import React, { useState, useEffect, useRef } from 'react';
import { styles } from './CalendarGridStyles';
import {
  useCalendarGrid,
  getMonthDays,
  getEventId,
  getEventShortLabel,
  getEventTitle,
  isCompletedTask,
  isToday,
  WEEKDAYS,
} from './CalendarGridContext';

const MAX_VISIBLE = 2;
const FADE_DURATION = 150; // ms

export function MonthView() {
  const {
    currentDate,
    onDateClick,
    containerRef,
    hoveredEventId,
    courseMatches,
    getEffectiveEventColor,
    getEventsForDate,
    showPopup,
    hidePopupDelayed,
    handleEventHover,
    handleEventLeave,
    handleEventClick,
    renderPopup,
    renderDetailModal,
  } = useCalendarGrid();

  // Track month changes for fade transition
  const [displayDate, setDisplayDate] = useState(currentDate);
  const [opacity, setOpacity] = useState(1);
  const isTransitioning = useRef(false);

  // Create month key for comparison
  const currentMonthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  const displayMonthKey = `${displayDate.getFullYear()}-${displayDate.getMonth()}`;

  // Handle month changes with fade transition
  useEffect(() => {
    if (currentMonthKey !== displayMonthKey && !isTransitioning.current) {
      isTransitioning.current = true;
      // Fade out
      setOpacity(0);
      // After fade out, update display date and fade in
      setTimeout(() => {
        setDisplayDate(currentDate);
        setOpacity(1);
        setTimeout(() => {
          isTransitioning.current = false;
        }, FADE_DURATION);
      }, FADE_DURATION);
    }
  }, [currentMonthKey, displayMonthKey, currentDate]);

  const days = getMonthDays(displayDate.getFullYear(), displayDate.getMonth());
  const _weeksNeeded = Math.ceil(days.length / 7);

  return (
    <div ref={containerRef} style={styles.monthWrapper} onMouseLeave={hidePopupDelayed}>
      <div
        style={{
          ...styles.monthGrid,
          gridTemplateRows: `auto repeat(6, 1fr)`, // Always 6 rows for consistent height across months
          opacity,
          transition: `opacity ${FADE_DURATION}ms ease-in-out`,
        }}
      >
        {/* Weekday headers */}
        {WEEKDAYS.map((day) => (
          <div key={day} style={styles.weekdayHeader}>
            {day}
          </div>
        ))}

        {/* Day cells */}
        {days.map((date, index) => {
          const dayEvents = getEventsForDate(date);
          const isCurrentMonth = date.getMonth() === displayDate.getMonth();
          const visibleEvents = dayEvents.slice(0, MAX_VISIBLE);
          const hiddenEvents = dayEvents.slice(MAX_VISIBLE);
          const dateLabel = date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });

          return (
            <div
              key={index}
              style={{
                ...styles.dayCell,
                opacity: isCurrentMonth ? 1 : 0.4,
                backgroundColor: isToday(date)
                  ? 'rgba(0, 127, 163, 0.08)'
                  : 'transparent',
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
                {visibleEvents.map((event, i) => {
                  const eventId = getEventId(event);
                  const isHovered = hoveredEventId === eventId;
                  const match =
                    event.type === 'imported' ? courseMatches.get(eventId) : null;
                  const effectiveColor = getEffectiveEventColor(event);
                  const isCompleted = isCompletedTask(event);
                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.eventPill,
                        backgroundColor: effectiveColor,
                        transform: isHovered ? 'scale(1.02)' : 'none',
                        boxShadow: isHovered
                          ? '0 3px 8px rgba(0,0,0,0.2)'
                          : '0 1px 2px rgba(0,0,0,0.1)',
                        cursor: match ? 'pointer' : 'pointer',
                        opacity: isCompleted ? 0.5 : 1,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
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
                    onMouseEnter={(e) => showPopup(e, dayEvents, dateLabel)}
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
            </div>
          );
        })}
      </div>

      {/* Popup */}
      {renderPopup()}

      {/* Detail Modal */}
      {renderDetailModal()}
    </div>
  );
}

export default MonthView;
