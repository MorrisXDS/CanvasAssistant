/**
 * CalendarGrid Component
 * Renders month, week, or day view calendar grid
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Task, Course, DisplayCalendarEvent } from '../../../l5-presentation/types';

// Popup state type
interface PopupState {
  events: CalendarEvent[];
  x: number;
  y: number;
  label: string;
}

// Detail modal state type
interface DetailState {
  event: CalendarEvent;
  courseMatch: CourseMatch | null;
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
    const task = event.task;
    const course = event.course;
    const dueDate = task.dueAt ? new Date(task.dueAt).toLocaleString() : 'No due date';
    const weight = task.weight > 0 ? `${task.weight}%` : 'Not weighted';
    return `${course.code}: ${task.title}\nDue: ${dueDate}\nWeight: ${weight}\nType: ${task.taskType}`;
  }
  const evt = event.event;
  const start = new Date(evt.startAt).toLocaleString();
  const end = evt.endAt ? new Date(evt.endAt).toLocaleString() : null;
  return `${evt.title}\nStart: ${start}${end ? `\nEnd: ${end}` : ''}${evt.location ? `\nLocation: ${evt.location}` : ''}`;
}

// Helper to get time display
function getEventTime(event: CalendarEvent): string | null {
  const date = getEventDate(event);
  if (!date) return null;
  if (event.type === 'imported' && event.event.allDay) return null;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Helper to format time as "xx:xx am/pm"
function formatTimeAmPm(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase();
}

// Helper to get time range string "xx:xx am/pm - xx:xx am/pm"
function getEventTimeRange(event: CalendarEvent): string | null {
  const startDate = getEventDate(event);
  if (!startDate) return null;
  if (event.type === 'imported' && event.event.allDay) return null;

  const startTime = formatTimeAmPm(startDate);

  if (event.type === 'imported' && event.event.endAt) {
    const endDate = new Date(event.event.endAt);
    const endTime = formatTimeAmPm(endDate);
    return `${startTime} - ${endTime}`;
  }

  // For tasks, just show the due time
  return startTime;
}

// Helper to get event description
function getEventDescription(event: CalendarEvent): string | null {
  if (event.type === 'task') {
    // Tasks don't have descriptions in the current model, but we can show task type
    return null;
  }
  return event.event.description || null;
}

// Helper to get event end date
function getEventEndDate(event: CalendarEvent): Date | null {
  if (event.type === 'imported' && event.event.endAt) {
    return new Date(event.event.endAt);
  }
  return null;
}

// Calculate event duration in hours
function getEventDurationHours(event: CalendarEvent): number {
  const start = getEventDate(event);
  const end = getEventEndDate(event);
  if (!start) return 1;
  if (!end) return 1;

  const durationMs = end.getTime() - start.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  return Math.max(1, Math.ceil(durationHours));
}

// Calculate event start offset within hour (0-1)
function getEventStartOffset(event: CalendarEvent): number {
  const start = getEventDate(event);
  if (!start) return 0;
  return start.getMinutes() / 60;
}

// Calculate event end offset within last hour (0-1)
function getEventEndOffset(event: CalendarEvent): number {
  const end = getEventEndDate(event);
  if (!end) return 1;
  const minutes = end.getMinutes();
  return minutes === 0 ? 1 : minutes / 60;
}

// Interface for positioned event
interface PositionedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
  startHour: number;
  durationHours: number;
  startOffset: number; // fraction within start hour
  endOffset: number; // fraction within end hour
}

// Check if two events overlap in time
function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = getEventDate(a);
  const bStart = getEventDate(b);
  if (!aStart || !bStart) return false;

  const aEnd = getEventEndDate(a) || new Date(aStart.getTime() + 60 * 60 * 1000); // 1 hour default
  const bEnd = getEventEndDate(b) || new Date(bStart.getTime() + 60 * 60 * 1000);

  return aStart < bEnd && bStart < aEnd;
}

// Group overlapping events and assign column positions
function positionEvents(events: CalendarEvent[]): PositionedEvent[] {
  // Filter to timed events only
  const timedEvents = events.filter(e => {
    const date = getEventDate(e);
    if (!date) return false;
    if (e.type === 'imported' && e.event.allDay) return false;
    if (date.getHours() === 0 && date.getMinutes() === 0) return false;
    return true;
  });

  if (timedEvents.length === 0) return [];

  // Sort by start time, then by duration (longer events first for better layout)
  const sorted = [...timedEvents].sort((a, b) => {
    const aStart = getEventDate(a)!.getTime();
    const bStart = getEventDate(b)!.getTime();
    if (aStart !== bStart) return aStart - bStart;
    return getEventDurationHours(b) - getEventDurationHours(a);
  });

  // Find all overlapping groups
  const groups: CalendarEvent[][] = [];
  const eventToGroup = new Map<string, number>();

  for (const event of sorted) {
    const eventId = getEventId(event);
    let foundGroup = -1;

    // Check if this event overlaps with any existing group
    for (let i = 0; i < groups.length; i++) {
      const overlapsWithGroup = groups[i].some(e => eventsOverlap(event, e));
      if (overlapsWithGroup) {
        if (foundGroup === -1) {
          foundGroup = i;
          groups[i].push(event);
          eventToGroup.set(eventId, i);
        } else {
          // Merge groups
          groups[foundGroup].push(...groups[i]);
          for (const e of groups[i]) {
            eventToGroup.set(getEventId(e), foundGroup);
          }
          groups[i] = [];
        }
      }
    }

    // Create new group if no overlap found
    if (foundGroup === -1) {
      groups.push([event]);
      eventToGroup.set(eventId, groups.length - 1);
    }
  }

  // Position events within each group
  const positioned: PositionedEvent[] = [];

  for (const group of groups) {
    if (group.length === 0) continue;

    // Sort group by start time
    const sortedGroup = [...group].sort((a, b) => {
      return getEventDate(a)!.getTime() - getEventDate(b)!.getTime();
    });

    // Assign columns using greedy algorithm
    const columns: CalendarEvent[][] = [];

    for (const event of sortedGroup) {
      let placed = false;
      const eventStart = getEventDate(event)!;
      const eventEnd = getEventEndDate(event) || new Date(eventStart.getTime() + 60 * 60 * 1000);

      // Try to place in existing column
      for (let col = 0; col < columns.length; col++) {
        const lastInCol = columns[col][columns[col].length - 1];
        const lastEnd = getEventEndDate(lastInCol) || new Date(getEventDate(lastInCol)!.getTime() + 60 * 60 * 1000);

        if (eventStart >= lastEnd) {
          columns[col].push(event);
          placed = true;
          break;
        }
      }

      // Create new column if not placed
      if (!placed) {
        columns.push([event]);
      }
    }

    const totalColumns = columns.length;

    // Create positioned events
    for (let col = 0; col < columns.length; col++) {
      for (const event of columns[col]) {
        const startDate = getEventDate(event)!;
        positioned.push({
          event,
          column: col,
          totalColumns,
          startHour: startDate.getHours(),
          durationHours: getEventDurationHours(event),
          startOffset: getEventStartOffset(event),
          endOffset: getEventEndOffset(event),
        });
      }
    }
  }

  return positioned;
}

// Course matching service - detects if imported event matches a course
export interface CourseMatch {
  course: { id: number; code: string; name: string; color: string | null };
  matchType: 'code' | 'name' | 'shortCode';
}

export interface CalendarGridProps {
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  courses?: { id: number; code: string; name: string; color: string | null }[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCourseClick?: (courseId: number) => void;
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

// Constants for layout
const HOUR_HEIGHT = 60; // Height of each hour row in day view
const WEEK_HOUR_HEIGHT = 48; // Height of each hour row in week view (larger for prominent cards)

// Helper to get unique event ID
function getEventId(event: CalendarEvent): string {
  return event.type === 'task' ? `task-${event.task.id}` : `imported-${event.event.id}`;
}

// Course matching service - checks if an imported event title matches a course
function matchEventToCourse(
  event: CalendarEvent,
  courses: { id: number; code: string; name: string; color: string | null }[]
): CourseMatch | null {
  if (event.type !== 'imported' || !courses || courses.length === 0) return null;

  const eventTitle = event.event.title.toLowerCase().trim();
  // Also check calendar name for matching
  const calendarName = event.event.calendarName?.toLowerCase().trim() || '';

  for (const course of courses) {
    const courseCode = course.code.toLowerCase().trim();
    const courseName = course.name.toLowerCase().trim();

    // Match full course code (e.g., "CSC148H1")
    if (eventTitle.includes(courseCode) || calendarName.includes(courseCode)) {
      return { course, matchType: 'code' };
    }

    // Match course name (e.g., "Introduction to Computer Science")
    if (courseName.length > 3 && (eventTitle.includes(courseName) || calendarName.includes(courseName))) {
      return { course, matchType: 'name' };
    }

    // Match short code (e.g., "CSC148" without the H1/Y1 suffix)
    const shortCode = courseCode.split(/[hy]\d/)[0];
    if (shortCode.length >= 3 && (eventTitle.includes(shortCode) || calendarName.includes(shortCode))) {
      return { course, matchType: 'shortCode' };
    }
  }

  return null;
}

// Get earliest event hour in the visible events
function getEarliestEventHour(events: CalendarEvent[]): number {
  let earliestHour = 23;

  for (const event of events) {
    const date = getEventDate(event);
    if (!date) continue;

    // Skip all-day events
    if (event.type === 'imported' && event.event.allDay) continue;
    if (date.getHours() === 0 && date.getMinutes() === 0) continue;

    const hour = date.getHours();
    if (hour < earliestHour) {
      earliestHour = hour;
    }
  }

  // Default to 8am if no timed events, but subtract 1 hour for padding
  return earliestHour === 23 ? 8 : Math.max(0, earliestHour - 1);
}

// Check if an event is currently in progress
function isEventInProgress(event: CalendarEvent, now: Date): boolean {
  const start = getEventDate(event);
  if (!start) return false;

  // Skip all-day events
  if (event.type === 'imported' && event.event.allDay) return false;
  if (start.getHours() === 0 && start.getMinutes() === 0) return false;

  const end = getEventEndDate(event) || new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour
  return now >= start && now < end;
}

export function CalendarGrid({
  view,
  currentDate,
  events,
  courses = [],
  onEventClick,
  onDateClick,
  onCourseClick,
}: CalendarGridProps) {
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<DetailState | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const weekGridRef = useRef<HTMLDivElement>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate current time position for the time indicator line
  const getCurrentTimePosition = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return hours + minutes / 60;
  };

  // Check if today is visible in the current view
  const isTodayVisible = () => {
    const today = new Date();
    if (view === 'day') {
      return isSameDay(currentDate, today);
    }
    if (view === 'week') {
      const weekDays = getWeekDays(currentDate);
      return weekDays.some(d => isSameDay(d, today));
    }
    return false;
  };

  // Get the column index for today in week view
  const getTodayColumnIndex = () => {
    const today = new Date();
    const weekDays = getWeekDays(currentDate);
    return weekDays.findIndex(d => isSameDay(d, today));
  };

  // Create course match cache for imported events
  const courseMatches = React.useMemo(() => {
    const matches = new Map<string, CourseMatch | null>();
    for (const event of events) {
      if (event.type === 'imported') {
        const eventId = getEventId(event);
        const match = matchEventToCourse(event, courses);
        matches.set(eventId, match);
      }
    }
    return matches;
  }, [events, courses]);

  // Get color for event, considering course matches
  const getEffectiveEventColor = (event: CalendarEvent): string => {
    if (event.type === 'task') {
      return event.course.color || '#007FA3';
    }
    const eventId = getEventId(event);
    const match = courseMatches.get(eventId);
    if (match?.course.color) {
      return match.course.color;
    }
    return event.event.color || '#6366F1';
  };

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
          return eventDate >= weekStart && eventDate <= new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000);
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
  }, [view, events, currentDate]);

  const getEventsForDate = (date: Date) => {
    return events.filter((e) => {
      const eventDate = getEventDate(e);
      if (!eventDate) return false;
      return isSameDay(eventDate, date);
    });
  };

  const showPopup = (
    e: React.MouseEvent,
    popupEvents: CalendarEvent[],
    label: string
  ) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // Calculate initial position (to the right of the element)
    let x = rect.right - containerRect.left + 8;
    let y = rect.top - containerRect.top;

    // Popup dimensions (approximate)
    const popupWidth = 280;
    const popupHeight = Math.min(300, popupEvents.length * 80 + 40);

    // Adjust x if popup would overflow right edge
    if (rect.right + popupWidth + 16 > window.innerWidth) {
      // Position to the left of the element instead
      x = rect.left - containerRect.left - popupWidth - 8;
    }

    // Adjust y if popup would overflow bottom edge
    if (rect.top + popupHeight > window.innerHeight - 20) {
      // Align popup bottom with element bottom
      y = rect.bottom - containerRect.top - popupHeight;
    }

    // Ensure popup doesn't go above container
    if (y < 0) {
      y = 8;
    }

    setPopup({
      events: popupEvents,
      x: Math.max(8, x),
      y,
      label,
    });
  };

  const hidePopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hidePopup = () => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
    }
    setPopup(null);
  };

  const hidePopupDelayed = () => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
    }
    hidePopupTimeoutRef.current = setTimeout(() => {
      setPopup(null);
      setHoveredEventId(null);
    }, 150); // Small delay to allow moving to popup
  };

  const cancelHidePopup = () => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
      hidePopupTimeoutRef.current = null;
    }
  };

  // Handler for single event hover - shows unified popup
  const handleEventHover = (
    e: React.MouseEvent,
    event: CalendarEvent
  ) => {
    cancelHidePopup();
    const eventId = getEventId(event);
    setHoveredEventId(eventId);

    const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
    const label = match
      ? `${match.course.code} Event`
      : event.type === 'task'
        ? event.course.code
        : event.event.calendarName || 'Event';

    showPopup(e, [event], label);
  };

  const handleEventLeave = () => {
    hidePopupDelayed();
  };

  // Show detail modal on click
  const handleEventClick = (event: CalendarEvent) => {
    hidePopup();
    const eventId = getEventId(event);
    const match = event.type === 'imported' ? (courseMatches.get(eventId) ?? null) : null;
    setDetailModal({ event, courseMatch: match });
  };

  const hideDetailModal = () => {
    setDetailModal(null);
  };

  // Render detail modal
  const renderDetailModal = () => {
    if (!detailModal) return null;

    const { event, courseMatch } = detailModal;
    const title = getEventTitle(event);
    const timeRange = getEventTimeRange(event);
    const description = getEventDescription(event);
    const effectiveColor = getEffectiveEventColor(event);
    const isTask = event.type === 'task';

    return (
      <div style={styles.modalOverlay} onClick={hideDetailModal}>
        <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div style={{ ...styles.modalHeader, backgroundColor: effectiveColor }}>
            <div style={styles.modalTitle}>{title}</div>
            <button style={styles.modalClose} onClick={hideDetailModal}>×</button>
          </div>
          <div style={styles.modalBody}>
            {/* Time range */}
            {timeRange && (
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Time</span>
                <span style={styles.modalValue}>{timeRange}</span>
              </div>
            )}

            {/* Course/Calendar info */}
            <div style={styles.modalRow}>
              <span style={styles.modalLabel}>{isTask ? 'Course' : 'Calendar'}</span>
              <span style={styles.modalValue}>
                {isTask ? event.course.name : event.event.calendarName || 'Imported'}
              </span>
            </div>

            {/* Task-specific info */}
            {isTask && (
              <>
                <div style={styles.modalRow}>
                  <span style={styles.modalLabel}>Type</span>
                  <span style={styles.modalValue}>{event.task.taskType}</span>
                </div>
                {event.task.weight > 0 && (
                  <div style={styles.modalRow}>
                    <span style={styles.modalLabel}>Weight</span>
                    <span style={styles.modalValue}>{event.task.weight}%</span>
                  </div>
                )}
              </>
            )}

            {/* Location for imported events */}
            {!isTask && event.event.location && (
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Location</span>
                <span style={styles.modalValue}>{event.event.location}</span>
              </div>
            )}

            {/* Description */}
            {description && (
              <div style={styles.modalDescription}>
                <div style={styles.modalLabel}>Description</div>
                <div style={styles.modalDescriptionText}>{description}</div>
              </div>
            )}

            {/* Course link if matched */}
            {courseMatch && (
              <button
                style={styles.modalCourseLink}
                onClick={() => {
                  hideDetailModal();
                  onCourseClick?.(courseMatch.course.id);
                }}
              >
                Go to {courseMatch.course.code} →
              </button>
            )}

            {/* Course link for tasks */}
            {isTask && (
              <button
                style={styles.modalCourseLink}
                onClick={() => {
                  hideDetailModal();
                  onCourseClick?.(event.course.id);
                }}
              >
                Go to {event.course.code} →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (view === 'month') {
    const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
    const weeksNeeded = Math.ceil(days.length / 7);
    const MAX_VISIBLE = 2;

    return (
      <div ref={containerRef} style={styles.monthWrapper} onMouseLeave={hidePopupDelayed}>
        <div style={{
          ...styles.monthGrid,
          gridTemplateRows: `auto repeat(${weeksNeeded}, 1fr)`,
        }}>
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
                  {visibleEvents.map((event, i) => {
                    const eventId = getEventId(event);
                    const isHovered = hoveredEventId === eventId;
                    const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
                    const effectiveColor = getEffectiveEventColor(event);
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
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event);
                        }}
                        onMouseEnter={(e) => handleEventHover(e, event)}
                        onMouseLeave={handleEventLeave}
                      >
                        <span style={styles.eventText}>
                          <strong>{getEventShortLabel(event)}</strong>{getEventShortLabel(event) ? ' ' : ''}{getEventTitle(event)}
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
        {popup && (
          <div
            style={{
              ...styles.popup,
              left: popup.x,
              top: popup.y,
            }}
            onMouseEnter={cancelHidePopup}
            onMouseLeave={hidePopupDelayed}
          >
            <div style={styles.popupHeader}>{popup.label}</div>
            <div style={styles.popupList}>
              {popup.events.map((event, i) => {
                const time = getEventTimeRange(event);
                const isTask = event.type === 'task';
                const eventId = getEventId(event);
                const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
                const effectiveColor = getEffectiveEventColor(event);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.popupItem,
                      borderLeft: `3px solid ${effectiveColor}`,
                    }}
                    onClick={() => handleEventClick(event)}
                  >
                    <div style={styles.popupItemTitle}>
                      <strong>{getEventFullLabel(event)}</strong> {getEventTitle(event)}
                    </div>
                    {time && (
                      <div style={styles.popupItemTime}>{time}</div>
                    )}
                    {isTask && event.task.weight > 0 && (
                      <div style={styles.popupItemMeta}>Weight: {event.task.weight}%</div>
                    )}
                    {!isTask && event.event.location && (
                      <div style={styles.popupItemMeta}>Location: {event.event.location}</div>
                    )}
                    {match && (
                      <div style={styles.popupItemCourseLink}>→ Go to {match.course.code}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {renderDetailModal()}
      </div>
    );
  }

  if (view === 'week') {
    const days = getWeekDays(currentDate);
    const MAX_VISIBLE_HOUR = 4; // Show up to 4 events side-by-side horizontally
    const MAX_VISIBLE_ALLDAY = 1;

    const formatHourLabel = (hour: number) =>
      hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;

    return (
      <div ref={containerRef} style={styles.weekWrapper} onMouseLeave={hidePopupDelayed}>
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
                  {visibleEvents.map((event, i) => {
                    const eventId = getEventId(event);
                    const isHovered = hoveredEventId === eventId;
                    const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
                    const effectiveColor = getEffectiveEventColor(event);
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
                        }}
                        onClick={() => handleEventClick(event)}
                        onMouseEnter={(e) => handleEventHover(e, event)}
                        onMouseLeave={handleEventLeave}
                      >
                        <span style={styles.eventText}>
                          <strong>{getEventShortLabel(event)}</strong>{getEventShortLabel(event) ? ' ' : ''}{getEventTitle(event)}
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

          {/* Time grid - scrollable with positioned events */}
          <div ref={weekGridRef} style={styles.weekGridContainer}>
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
                const showTimeIndicator = isTodayVisible() && getTodayColumnIndex() === dayIndex;

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
                      const isInProgress = isEventInProgress(pe.event, currentTime) && isSameDay(date, new Date());
                      const match = pe.event.type === 'imported' ? courseMatches.get(eventId) : null;
                      const effectiveColor = getEffectiveEventColor(pe.event);
                      const timeRange = getEventTimeRange(pe.event);

                      // Calculate position and size
                      const top = pe.startHour * WEEK_HOUR_HEIGHT + pe.startOffset * WEEK_HOUR_HEIGHT;
                      const height = pe.durationHours * WEEK_HOUR_HEIGHT - 2;
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
                          }}
                          onClick={() => handleEventClick(pe.event)}
                          onMouseEnter={(e) => handleEventHover(e, pe.event)}
                          onMouseLeave={handleEventLeave}
                        >
                          {isInProgress && <div style={styles.inProgressBadge}>NOW</div>}
                          <div style={styles.weekEventTitle}>
                            <strong>{getEventShortLabel(pe.event)}</strong>
                            {getEventShortLabel(pe.event) ? ' ' : ''}
                            {getEventTitle(pe.event)}
                          </div>
                          {timeRange && <div style={styles.weekEventTime}>{timeRange}</div>}
                          {match && <div style={styles.weekEventCourse}>→ {match.course.code}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
            onMouseEnter={cancelHidePopup}
            onMouseLeave={hidePopupDelayed}
          >
            <div style={styles.popupHeader}>{popup.label}</div>
            <div style={styles.popupList}>
              {popup.events.map((event, i) => {
                const time = getEventTimeRange(event);
                const isTask = event.type === 'task';
                const eventId = getEventId(event);
                const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
                const effectiveColor = getEffectiveEventColor(event);
                return (
                  <div
                    key={i}
                    style={{
                      ...styles.popupItem,
                      borderLeft: `3px solid ${effectiveColor}`,
                    }}
                    onClick={() => handleEventClick(event)}
                  >
                    <div style={styles.popupItemTitle}>
                      <strong>{getEventFullLabel(event)}</strong> {getEventTitle(event)}
                    </div>
                    {time && (
                      <div style={styles.popupItemTime}>{time}</div>
                    )}
                    {isTask && event.task.weight > 0 && (
                      <div style={styles.popupItemMeta}>Weight: {event.task.weight}%</div>
                    )}
                    {!isTask && event.event.location && (
                      <div style={styles.popupItemMeta}>Location: {event.event.location}</div>
                    )}
                    {match && (
                      <div style={styles.popupItemCourseLink}>→ Go to {match.course.code}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detail Modal */}
        {renderDetailModal()}
      </div>
    );
  }

  // Day view
  const dayEvents = getEventsForDate(currentDate);
  const positionedDayEvents = positionEvents(dayEvents);

  // All-day events for day view
  const allDayEvents = dayEvents.filter((e) => {
    const eventDate = getEventDate(e);
    if (!eventDate) return true;
    if (e.type === 'imported' && e.event.allDay) return true;
    return eventDate.getHours() === 0 && eventDate.getMinutes() === 0;
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
                    }}
                    onClick={() => handleEventClick(event)}
                    onMouseEnter={(e) => handleEventHover(e, event)}
                    onMouseLeave={handleEventLeave}
                  >
                    <div style={styles.dayEventTitle}>
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
                <div style={styles.dayTimeLabel}>
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
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
                const isInProgress = isEventInProgress(pe.event, currentTime) && isSameDay(currentDate, new Date());
                const match = pe.event.type === 'imported' ? courseMatches.get(eventId) : null;
                const effectiveColor = getEffectiveEventColor(pe.event);
                const timeRange = getEventTimeRange(pe.event);

                // Calculate position and size
                const top = pe.startHour * HOUR_HEIGHT + pe.startOffset * HOUR_HEIGHT;
                const height = pe.durationHours * HOUR_HEIGHT - 4;
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
                    }}
                    onClick={() => handleEventClick(pe.event)}
                    onMouseEnter={(e) => handleEventHover(e, pe.event)}
                    onMouseLeave={handleEventLeave}
                  >
                    {isInProgress && <div style={styles.inProgressBadge}>NOW</div>}
                    <div style={styles.dayEventTitle}>
                      <strong>{getEventShortLabel(pe.event)}</strong>
                      {getEventShortLabel(pe.event) ? ' ' : ''}
                      {getEventTitle(pe.event)}
                    </div>
                    {timeRange && <div style={styles.dayEventMeta}>{timeRange}</div>}
                    {match && <div style={styles.dayEventCourse}>→ {match.course.code}</div>}
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

const styles: Record<string, React.CSSProperties> = {
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
    paddingRight: '8px', // Compensate for scrollbar width in grid below
  },

  timeGutter: {
    borderRight: '1px solid var(--border-light)',
  },

  allDayRow: {
    display: 'grid',
    gridTemplateColumns: '60px repeat(7, 1fr)',
    backgroundColor: 'var(--bg-card)',
    borderBottom: '1px solid var(--border-default)',
    paddingRight: '8px', // Compensate for scrollbar width in grid below
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
    height: 'calc(100vh - 320px)',
    minHeight: '300px',
    overflowY: 'scroll', // Always show scrollbar for consistent alignment with header
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

export default CalendarGrid;
