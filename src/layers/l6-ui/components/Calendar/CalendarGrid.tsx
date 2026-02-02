/**
 * CalendarGrid Component
 * Renders month, week, or day view calendar grid
 *
 * This component serves as the entry point that wraps the view-specific
 * components with the shared CalendarGridProvider context.
 */

import React, { useEffect, useRef } from 'react';
import type { Task, Course, DisplayCalendarEvent } from '../../../l5-presentation/types';
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

  // Track the last view/date/event-count combo to avoid re-scrolling on minor event updates
  const lastScrollKey = useRef<string>('');

  // Scroll to earliest event on mount and when view/date changes
  useEffect(() => {
    // Skip month view - no time-based scrolling
    if (view === 'month') return;

    // Create a key including event count to re-scroll when events load
    const scrollKey = `${view}-${currentDate.toDateString()}-${events.length}`;

    // Skip if we've already scrolled for this exact state
    if (lastScrollKey.current === scrollKey) return;

    const scrollToEarliestEvent = () => {
      const gridRef = view === 'week' ? weekGridRef : dayGridRef;
      const hourHeight = view === 'week' ? WEEK_HOUR_HEIGHT : HOUR_HEIGHT;

      // Wait for ref to be attached
      if (!gridRef.current) {
        requestAnimationFrame(scrollToEarliestEvent);
        return;
      }

      // Get visible date range based on view
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

      // Determine scroll target hour
      const earliestEventHour = getEarliestEventHour(visibleEvents);
      let targetHour: number;

      if (earliestEventHour !== null) {
        // Scroll to earliest event
        targetHour = earliestEventHour;
      } else {
        // No timed events - scroll to current hour (or 8 AM if viewing past/future)
        const now = new Date();
        const isCurrentPeriod =
          view === 'day'
            ? isSameDay(currentDate, now)
            : getWeekDays(currentDate).some((d) => isSameDay(d, now));
        targetHour = isCurrentPeriod ? Math.max(0, now.getHours() - 1) : 8;
      }

      const scrollTarget = targetHour * hourHeight;

      // Only scroll if actually scrollable
      if (gridRef.current.scrollHeight > gridRef.current.clientHeight) {
        gridRef.current.scrollTop = scrollTarget;
        lastScrollKey.current = scrollKey;
      } else {
        // Not scrollable yet, retry after a delay
        setTimeout(() => {
          if (gridRef.current && gridRef.current.scrollHeight > gridRef.current.clientHeight) {
            gridRef.current.scrollTop = scrollTarget;
            lastScrollKey.current = scrollKey;
          }
        }, 100);
      }
    };

    // Wait for layout to be ready before scrolling
    let frameCount = 0;
    const maxFrames = 5;

    const tryScroll = () => {
      frameCount++;
      const gridRef = view === 'week' ? weekGridRef : dayGridRef;

      // Check if element is ready for scrolling (has scrollable content)
      if (gridRef.current && gridRef.current.scrollHeight > gridRef.current.clientHeight) {
        scrollToEarliestEvent();
      } else if (frameCount < maxFrames) {
        requestAnimationFrame(tryScroll);
      } else {
        // Force attempt after max frames
        scrollToEarliestEvent();
      }
    };

    requestAnimationFrame(tryScroll);

    return () => {
      frameCount = maxFrames;
    };
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
