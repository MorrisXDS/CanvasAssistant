/**
 * CalendarGrid Component
 * Renders month, week, or day view calendar grid
 *
 * This component serves as the entry point that wraps the view-specific
 * components with the shared CalendarGridProvider context.
 */

import React, { useEffect, useRef } from 'react';
import type { Course } from '../../../l5-presentation/types';
import {
  CalendarGridProvider,
  useCalendarGrid,
  getWeekDays,
  getEventDate,
  isSameDay,
  getEarliestEventHour,
  WEEK_HOUR_HEIGHT,
  HOUR_HEIGHT,
  type CalendarView,
  type CalendarEvent,
  type TaskCalendarEvent,
  type ImportedCalendarEvent,
  type CourseMatch,
} from './CalendarGridContext';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';

// Re-export types for backwards compatibility
export type {
  CalendarView,
  CalendarEvent,
  TaskCalendarEvent,
  ImportedCalendarEvent,
  CourseMatch,
};

export interface CalendarGridProps {
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  courses?: { id: number; code: string; name: string; color: string | null }[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCourseClick?: (courseId: number) => void;
}

/**
 * Inner component that handles scroll-to-earliest-event logic
 * Note: This component is keyed by date period, so it re-mounts on navigation
 */
function CalendarGridInner() {
  const { view, currentDate, events, weekGridRef, dayGridRef } = useCalendarGrid();

  // Track the last scroll target to avoid redundant scrolls
  const lastScrollTarget = useRef<number | null>(null);

  // Scroll to earliest event on mount and when events load
  useEffect(() => {
    // Skip month view - no time-based scrolling
    if (view === 'month') return;

    // Get visible events for current date range
    let visibleEvents: CalendarEvent[] = [];

    if (view === 'week') {
      const weekDays = getWeekDays(currentDate);
      const weekStart = weekDays[0];
      const weekEnd = weekDays[6];
      visibleEvents = events.filter((e) => {
        const eventDate = getEventDate(e);
        if (!eventDate) return false;
        return (
          eventDate >= weekStart &&
          eventDate <= new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000)
        );
      });
    } else if (view === 'day') {
      visibleEvents = events.filter((e) => {
        const eventDate = getEventDate(e);
        if (!eventDate) return false;
        return isSameDay(eventDate, currentDate);
      });
    }

    const earliestEventHour = getEarliestEventHour(visibleEvents);
    const hasEvents = earliestEventHour !== null;

    const gridRef = view === 'week' ? weekGridRef : dayGridRef;
    const hourHeight = view === 'week' ? WEEK_HOUR_HEIGHT : HOUR_HEIGHT;

    // Check if viewing current period (today is in the visible range)
    const now = new Date();
    const isCurrentPeriod =
      view === 'day'
        ? isSameDay(currentDate, now)
        : getWeekDays(currentDate).some((d) => isSameDay(d, now));

    // Calculate target hour
    let targetHour: number;
    if (isCurrentPeriod) {
      // Current week/day: scroll to current hour (show "now")
      targetHour = Math.max(0, now.getHours() - 1);
    } else if (hasEvents) {
      // Future/past with events: scroll to earliest event
      targetHour = earliestEventHour;
    } else {
      // Future/past without events: default to 8 AM
      targetHour = 8;
    }

    const scrollTarget = targetHour * hourHeight;

    // Skip if we've already scrolled to this exact position
    // (allows re-scroll when events load and target changes)
    if (lastScrollTarget.current === scrollTarget) return;

    // Function to apply scroll when ready
    const applyScroll = () => {
      if (!gridRef.current) return false;
      if (gridRef.current.scrollHeight <= gridRef.current.clientHeight) return false;

      gridRef.current.scrollTop = scrollTarget;
      lastScrollTarget.current = scrollTarget;
      return true;
    };

    // Try immediately
    if (applyScroll()) return;

    // Retry with animation frames and timeouts
    let attempts = 0;
    const maxAttempts = 10;

    const tryScroll = () => {
      attempts++;
      if (applyScroll()) return;
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryScroll);
      }
    };

    // Start trying after a small delay to let React render
    setTimeout(() => requestAnimationFrame(tryScroll), 0);
    // Also try after longer delays for slow renders
    setTimeout(() => applyScroll(), 100);
    setTimeout(() => applyScroll(), 250);
  }, [view, events, currentDate, weekGridRef, dayGridRef]);

  // Render the appropriate view
  if (view === 'month') {
    return <MonthView />;
  }

  if (view === 'week') {
    return <WeekView />;
  }

  return <DayView />;
}

/**
 * Main CalendarGrid component that wraps everything with the provider
 */
export function CalendarGrid({
  view,
  currentDate,
  events,
  courses = [],
  onEventClick,
  onDateClick,
  onCourseClick,
}: CalendarGridProps) {
  // Create a key that changes when the view period changes
  // This forces CalendarGridInner to re-mount and trigger fresh scroll
  const getWeekKey = (date: Date) => {
    const weekStart = getWeekDays(date)[0];
    return `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
  };

  const scrollKey =
    view === 'month'
      ? `month-${currentDate.getFullYear()}-${currentDate.getMonth()}`
      : view === 'week'
        ? `week-${getWeekKey(currentDate)}`
        : `day-${currentDate.toDateString()}`;

  return (
    <CalendarGridProvider
      view={view}
      currentDate={currentDate}
      events={events}
      courses={courses as Course[]}
      onEventClick={onEventClick}
      onDateClick={onDateClick}
      onCourseClick={onCourseClick}
    >
      <CalendarGridInner key={scrollKey} />
    </CalendarGridProvider>
  );
}

export default CalendarGrid;
