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
 */
function CalendarGridInner() {
  const { view, currentDate, events, weekGridRef, dayGridRef } = useCalendarGrid();

  // Track the last scroll target and period to avoid redundant scrolls
  const lastScrollTarget = useRef<number | null>(null);
  const lastPeriodKey = useRef<string | null>(null);

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
    if (hasEvents) {
      // Has events: scroll to earliest event
      targetHour = earliestEventHour;
    } else if (isCurrentPeriod) {
      // Current week/day without events: scroll to current hour
      targetHour = Math.max(0, now.getHours() - 1);
    } else {
      // Past/future without events: default to 8 AM
      targetHour = 8;
    }

    const scrollTarget = targetHour * hourHeight;

    // Create a period key to detect week/day changes
    const periodKey =
      view === 'week'
        ? `week-${getWeekDays(currentDate)[0].toDateString()}`
        : `day-${currentDate.toDateString()}`;

    // Skip if same period and same scroll target
    const periodChanged = lastPeriodKey.current !== periodKey;
    if (!periodChanged && lastScrollTarget.current === scrollTarget) return;

    // Update tracking refs
    lastPeriodKey.current = periodKey;

    // Function to apply scroll when ready
    const applyScroll = (forceAnimation = false) => {
      if (!gridRef.current) return false;
      if (gridRef.current.scrollHeight <= gridRef.current.clientHeight) return false;

      // Check if already at target position (must check when ref is available)
      const currentScrollTop = gridRef.current.scrollTop;
      const alreadyAtTarget = Math.abs(currentScrollTop - scrollTarget) < 1;

      if (forceAnimation && alreadyAtTarget && periodChanged) {
        // Force scroll from top to mask the content flash
        // Jump to top, then smoothly scroll to target
        gridRef.current.scrollTop = 0;
        requestAnimationFrame(() => {
          if (gridRef.current) {
            gridRef.current.style.scrollBehavior = 'smooth';
            gridRef.current.scrollTop = scrollTarget;
            // Reset scroll behavior after animation
            setTimeout(() => {
              if (gridRef.current) {
                gridRef.current.style.scrollBehavior = 'auto';
              }
            }, 300);
          }
        });
      } else {
        gridRef.current.scrollTop = scrollTarget;
      }
      lastScrollTarget.current = scrollTarget;
      return true;
    };

    // Try immediately with animation if needed
    if (applyScroll(true)) return;

    // Retry with animation frames and timeouts
    let attempts = 0;
    const maxAttempts = 10;

    const tryScroll = () => {
      attempts++;
      if (applyScroll(false)) return;
      if (attempts < maxAttempts) {
        requestAnimationFrame(tryScroll);
      }
    };

    // Start trying after a small delay to let React render
    setTimeout(() => requestAnimationFrame(tryScroll), 0);
    // Also try after longer delays for slow renders
    setTimeout(() => applyScroll(false), 100);
    setTimeout(() => applyScroll(false), 250);
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
      <CalendarGridInner />
    </CalendarGridProvider>
  );
}

export default CalendarGrid;
