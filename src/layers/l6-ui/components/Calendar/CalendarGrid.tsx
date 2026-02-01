/**
 * CalendarGrid Component
 * Renders month, week, or day view calendar grid
 *
 * This component serves as the entry point that wraps the view-specific
 * components with the shared CalendarGridProvider context.
 */

import React, { useEffect } from 'react';
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
export type { CalendarView, CalendarEvent, TaskCalendarEvent, ImportedCalendarEvent, CourseMatch };

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

  // Scroll to earliest event on mount and when view/events change
  useEffect(() => {
    const scrollToEarliestEvent = () => {
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

      const earliestHour = getEarliestEventHour(visibleEvents);

      if (view === 'week' && weekGridRef.current) {
        const scrollTarget = earliestHour * WEEK_HOUR_HEIGHT;
        weekGridRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      } else if (view === 'day' && dayGridRef.current) {
        const scrollTarget = earliestHour * HOUR_HEIGHT;
        dayGridRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
    };

    // Longer delay to ensure DOM is fully rendered
    const timer = setTimeout(scrollToEarliestEvent, 150);
    return () => clearTimeout(timer);
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
