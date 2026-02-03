/**
 * CalendarGridContext - Shared state and handlers for calendar views
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Task, Course, DisplayCalendarEvent } from '../../../l5-presentation/types';
import { styles } from './CalendarGridStyles';
import { getCourseColor } from '../../constants';
import {
  getHourInEffectiveTimezone,
  getTimeInEffectiveTimezone,
} from '../../../l5-presentation/settings';

// =============================================================================
// TYPES
// =============================================================================

// Popup state type
export interface PopupState {
  events: CalendarEvent[];
  x: number;
  y: number;
  label: string;
}

// Detail modal state type
export interface DetailState {
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

export interface CourseMatch {
  course: Course;
  confidence: 'high' | 'medium' | 'low';
}

export interface PositionedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
  // Overlap group info for visual stacking
  overlapIndex: number;
  overlapCount: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Helper to check if an imported event is a deadline task event
export function isDeadlineTaskEvent(
  event: CalendarEvent
): event is ImportedCalendarEvent {
  if (event.type !== 'imported') return false;
  if (!event.event.taskId) return false;
  return new Date(event.event.startAt).getTime() < 86400000;
}

// Helper to get event date
export function getEventDate(event: CalendarEvent): Date | null {
  if (event.type === 'task') {
    return event.task.dueAt ? new Date(event.task.dueAt) : null;
  }
  if (isDeadlineTaskEvent(event) && event.event.endAt) {
    const dueTime = new Date(event.event.endAt);
    const dueMinutes = dueTime.getMinutes();
    if (dueMinutes === 0) {
      return new Date(dueTime.getTime() - 60 * 60 * 1000);
    }
    const floorHour = new Date(dueTime);
    floorHour.setMinutes(0, 0, 0);
    return floorHour;
  }
  return new Date(event.event.startAt);
}

// Helper to get event title
export function getEventTitle(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.task.title;
  }
  return event.event.title;
}

// Helper to get short label
export function getEventShortLabel(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.course.code.split(/[HY]\d|\s/)[0];
  }
  return '';
}

// Helper to get full label
export function getEventFullLabel(event: CalendarEvent): string {
  if (event.type === 'task') {
    return event.course.code;
  }
  return event.event.calendarName || 'Calendar';
}

// Format time as AM/PM using effective timezone
export function formatTimeAmPm(dateStr: string): string {
  const { hour, minute } = getTimeInEffectiveTimezone(dateStr);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHours = hour % 12 || 12;
  if (minute === 0) {
    return `${displayHours} ${ampm}`;
  }
  return `${displayHours}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

// Get event time range
export function getEventTimeRange(event: CalendarEvent): string | null {
  if (event.type === 'task') {
    const dueAt = event.task.dueAt;
    if (!dueAt) return null;
    return `Due ${formatTimeAmPm(dueAt)}`;
  }
  if (event.event.allDay) return null;
  if (!event.event.endAt) return formatTimeAmPm(event.event.startAt);
  return `${formatTimeAmPm(event.event.startAt)} - ${formatTimeAmPm(event.event.endAt)}`;
}

// Get event description
export function getEventDescription(event: CalendarEvent): string | null {
  if (event.type === 'task') {
    return event.task.description || null;
  }
  return event.event.description || null;
}

// Check if task is completed
export function isCompletedTask(event: CalendarEvent): boolean {
  if (event.type === 'task') {
    return event.task.isCompleted;
  }
  return false;
}

// Get event end date
export function getEventEndDate(event: CalendarEvent): Date | null {
  if (event.type === 'task') {
    return event.task.dueAt ? new Date(event.task.dueAt) : null;
  }
  return event.event.endAt ? new Date(event.event.endAt) : null;
}

// Get event duration in hours
// - Task events: default 1 hour (no duration field on tasks)
// - Deadline task events: 1 hour if no user-set start, otherwise calculate from start to due
// - Regular imported events: calculate from start to end
export function getEventDurationHours(event: CalendarEvent): number {
  if (event.type === 'task') {
    return 1; // Tasks show as 1-hour blocks (no duration field)
  }

  // Now event is ImportedCalendarEvent
  const importedEvent = event;
  const end = importedEvent.event.endAt ? new Date(importedEvent.event.endAt) : null;
  if (!end) return 1;

  // Check if it's a deadline task event (has task_id, start is epoch sentinel = no user-set start)
  if (importedEvent.event.taskId && new Date(importedEvent.event.startAt).getTime() < 86400000) {
    // No user-set start time → default 1 hour
    return 1;
  }

  // Regular imported event or event with user-set start time
  const start = new Date(importedEvent.event.startAt);
  const durationMs = end.getTime() - start.getTime();
  const hours = durationMs / (1000 * 60 * 60);
  return Math.max(0.5, Math.min(hours, 24));
}

// Get event start offset within the hour (0-1)
export function getEventStartOffset(event: CalendarEvent): number {
  const date = getEventDate(event);
  if (!date) return 0;
  return date.getMinutes() / 60;
}

// Get event end offset
export function getEventEndOffset(event: CalendarEvent): number {
  const end = getEventEndDate(event);
  if (!end) return 0;
  return end.getMinutes() / 60;
}

// Get unique event ID
export function getEventId(event: CalendarEvent): string {
  if (event.type === 'task') {
    return `task-${event.task.id}`;
  }
  return `imported-${event.event.id}`;
}

// Check if event is in progress
export function isEventInProgress(event: CalendarEvent, now: Date): boolean {
  const start = getEventDate(event);
  if (!start) return false;
  if (event.type === 'imported' && event.event.allDay) return false;
  const end = getEventEndDate(event) || new Date(start.getTime() + 60 * 60 * 1000);
  return now >= start && now < end;
}

// Check if two events overlap
function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = getEventDate(a);
  const bStart = getEventDate(b);
  if (!aStart || !bStart) return false;
  if (a.type === 'imported' && a.event.allDay) return false;
  if (b.type === 'imported' && b.event.allDay) return false;
  const aDuration = getEventDurationHours(a);
  const bDuration = getEventDurationHours(b);
  const aEnd = new Date(aStart.getTime() + aDuration * 60 * 60 * 1000);
  const bEnd = new Date(bStart.getTime() + bDuration * 60 * 60 * 1000);
  return aStart < bEnd && aEnd > bStart;
}

// Position events for overlap handling
export function positionEvents(events: CalendarEvent[]): PositionedEvent[] {
  const timedEvents = events.filter((e) => {
    if (e.type === 'imported' && e.event.allDay) return false;
    return getEventDate(e) !== null;
  });

  timedEvents.sort((a, b) => {
    const aDate = getEventDate(a)!;
    const bDate = getEventDate(b)!;
    if (aDate.getTime() !== bDate.getTime()) {
      return aDate.getTime() - bDate.getTime();
    }
    return getEventDurationHours(b) - getEventDurationHours(a);
  });

  const positioned: PositionedEvent[] = [];
  const columns: CalendarEvent[][] = [];

  for (const event of timedEvents) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const columnEvents = columns[col];
      const hasOverlap = columnEvents.some((e) => eventsOverlap(e, event));
      if (!hasOverlap) {
        columnEvents.push(event);
        positioned.push({
          event,
          column: col,
          totalColumns: 0,
          overlapIndex: 0,
          overlapCount: 1,
        });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([event]);
      positioned.push({
        event,
        column: columns.length - 1,
        totalColumns: 0,
        overlapIndex: 0,
        overlapCount: 1,
      });
    }
  }

  // Update totalColumns
  for (const pos of positioned) {
    const overlapping = positioned.filter((p) => eventsOverlap(pos.event, p.event));
    pos.totalColumns = Math.max(...overlapping.map((p) => p.column + 1));
    pos.overlapCount = overlapping.length;
    pos.overlapIndex = overlapping.findIndex(
      (p) => getEventId(p.event) === getEventId(pos.event)
    );
  }

  return positioned;
}

// Get month days
export function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

// Get week days
export function getWeekDays(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

// Check if same day
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Check if today
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

// Extract section type (LEC, PRA, TUT) from a string
function extractSectionType(text: string): string | null {
  const match = text.match(/\b(lec|pra|tut)\d*/i);
  return match ? match[1].toLowerCase() : null;
}

// Match event to course
// Uses OR logic: matches if event has courseId set OR if name/title contains course code.
// IMPORTANT: Prioritize matching event TITLE first, then fall back to calendar name.
// Also considers section types (LEC, PRA, TUT) to distinguish between different sections of same course.
export function matchEventToCourse(
  event: ImportedCalendarEvent,
  courses: Course[]
): CourseMatch | null {
  // PASS 0: Direct courseId match (highest priority - user explicitly assigned course)
  if (event.event.courseId) {
    const matchedCourse = courses.find((c) => c.id === event.event.courseId);
    if (matchedCourse) {
      return { course: matchedCourse, confidence: 'high' };
    }
  }

  const title = event.event.title.toLowerCase().trim();
  const calendarName = event.event.calendarName?.toLowerCase().trim() || '';
  const description = event.event.description?.toLowerCase().trim() || '';

  // Extract section type from event title (e.g., "LEC" from "ECE342H1 LEC0102")
  const eventSectionType = extractSectionType(title);

  // Prepare course data for matching
  const courseData = courses.map((course) => {
    const code = course.code.toLowerCase().trim();
    const name = course.name.toLowerCase().trim();
    // Use lowercase regex since code is already lowercased (matches H1, Y1 suffixes)
    const shortCode = code.split(/[hy]\d/)[0];
    // Extract section type from course code (e.g., "LEC" from "ECE342H1 S LEC0101")
    const sectionType = extractSectionType(code);
    return { course, code, name, shortCode, sectionType };
  });

  // PASS 1: Match full course code in EVENT TITLE (highest priority)
  for (const { course, code } of courseData) {
    if (title.includes(code)) {
      return { course, confidence: 'high' };
    }
  }

  // PASS 2: Match short code + section type in EVENT TITLE
  // First, try to match courses with the SAME section type
  if (eventSectionType) {
    for (const { course, shortCode, sectionType } of courseData) {
      if (
        shortCode &&
        shortCode.length >= 3 &&
        title.includes(shortCode) &&
        sectionType === eventSectionType
      ) {
        return { course, confidence: 'high' };
      }
    }
  }

  // PASS 3: Match short code in EVENT TITLE (without section type constraint)
  for (const { course, shortCode } of courseData) {
    if (shortCode && shortCode.length >= 3 && title.includes(shortCode)) {
      return { course, confidence: 'high' };
    }
  }

  // PASS 4: Match full course code in CALENDAR NAME (fallback)
  for (const { course, code } of courseData) {
    if (calendarName.includes(code)) {
      return { course, confidence: 'high' };
    }
  }

  // PASS 5: Match short code + section type in CALENDAR NAME
  const calendarSectionType = extractSectionType(calendarName);
  if (calendarSectionType) {
    for (const { course, shortCode, sectionType } of courseData) {
      if (
        shortCode &&
        shortCode.length >= 3 &&
        calendarName.includes(shortCode) &&
        sectionType === calendarSectionType
      ) {
        return { course, confidence: 'high' };
      }
    }
  }

  // PASS 6: Match short code in CALENDAR NAME (without section type constraint)
  for (const { course, shortCode } of courseData) {
    if (shortCode && shortCode.length >= 3 && calendarName.includes(shortCode)) {
      return { course, confidence: 'high' };
    }
  }

  // PASS 7: Match course name in title or calendar name
  for (const { course, name } of courseData) {
    if (name.length > 3 && (title.includes(name) || calendarName.includes(name))) {
      return { course, confidence: 'medium' };
    }
  }

  // PASS 8: Match individual words from course name (lowest priority)
  for (const { course, name } of courseData) {
    const nameWords = name.split(/\s+/).filter((w) => w.length > 3);
    for (const word of nameWords) {
      if (title.includes(word) || description.includes(word)) {
        return { course, confidence: 'low' };
      }
    }
  }

  return null;
}

// Get earliest event hour
// Returns the hour where the earliest event visually starts so it appears at the top
// - Imported events: use their actual start time
// - Task/deadline events: use dueAt - duration (visual start of the block)
// Returns null if no timed events found
export function getEarliestEventHour(events: CalendarEvent[]): number | null {
  let earliest: number | null = null;

  for (const event of events) {
    // Skip all-day events (no specific hour)
    if (event.type === 'imported' && event.event.allDay) continue;

    let effectiveStartHour: number | null = null;

    if (event.type === 'task') {
      // Task events: visual start is (due time - duration)
      if (event.task.dueAt) {
        const dueHour = getHourInEffectiveTimezone(event.task.dueAt);
        const duration = getEventDurationHours(event);
        effectiveStartHour = Math.max(0, dueHour - duration);
      }
    } else {
      // Check if it's a deadline task event (linked to a task, starts at epoch)
      if (isDeadlineTaskEvent(event) && event.event.endAt) {
        // Deadline task event: visual start is (end/due time - duration)
        const dueHour = getHourInEffectiveTimezone(event.event.endAt);
        const duration = getEventDurationHours(event);
        effectiveStartHour = Math.max(0, dueHour - duration);
      } else {
        // Regular imported events: use actual start time
        effectiveStartHour = getHourInEffectiveTimezone(event.event.startAt);
      }
    }

    if (effectiveStartHour !== null && (earliest === null || effectiveStartHour < earliest)) {
      earliest = effectiveStartHour;
    }
  }

  return earliest;
}

// Constants
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const HOUR_HEIGHT = 60;
export const WEEK_HOUR_HEIGHT = 48;

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface CalendarGridContextType {
  // Props
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  courses: Course[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCourseClick?: (courseId: number) => void;

  // State
  popup: PopupState | null;
  setPopup: React.Dispatch<React.SetStateAction<PopupState | null>>;
  hoveredEventId: string | null;
  setHoveredEventId: React.Dispatch<React.SetStateAction<string | null>>;
  detailModal: DetailState | null;
  setDetailModal: React.Dispatch<React.SetStateAction<DetailState | null>>;
  currentTime: Date;

  // Refs
  containerRef: RefObject<HTMLDivElement>;
  weekGridRef: RefObject<HTMLDivElement>;
  dayGridRef: RefObject<HTMLDivElement>;

  // Computed
  courseMatches: Map<string, CourseMatch | null>;
  getEffectiveEventColor: (event: CalendarEvent) => string;
  getEventsForDate: (date: Date) => CalendarEvent[];

  // Handlers
  showPopup: (e: React.MouseEvent, events: CalendarEvent[], label: string) => void;
  hidePopup: () => void;
  hidePopupDelayed: () => void;
  cancelHidePopup: () => void;
  handleEventHover: (e: React.MouseEvent, event: CalendarEvent) => void;
  handleEventLeave: () => void;
  handleEventClick: (event: CalendarEvent) => void;

  // Time helpers
  getCurrentTimePosition: () => number;
  isTodayVisible: () => boolean;
  getTodayColumnIndex: () => number;

  // Render helpers
  renderDetailModal: () => React.ReactNode;
  renderPopup: () => React.ReactNode;
}

// =============================================================================
// CONTEXT
// =============================================================================

const CalendarGridContext = createContext<CalendarGridContextType | null>(null);

export function useCalendarGrid(): CalendarGridContextType {
  const context = useContext(CalendarGridContext);
  if (!context) {
    throw new Error('useCalendarGrid must be used within CalendarGridProvider');
  }
  return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

interface CalendarGridProviderProps {
  children: ReactNode;
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  courses: Course[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCourseClick?: (courseId: number) => void;
}

export function CalendarGridProvider({
  children,
  view,
  currentDate,
  events,
  courses,
  onEventClick,
  onDateClick,
  onCourseClick,
}: CalendarGridProviderProps) {
  // State
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<DetailState | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const weekGridRef = useRef<HTMLDivElement>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);
  const hidePopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Course matches cache
  const courseMatches = useMemo(() => {
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

  // Get effective event color
  // Uses getCourseColor to ensure consistent colors between calendar and course cards
  const getEffectiveEventColor = useCallback(
    (event: CalendarEvent): string => {
      if (event.type === 'task') {
        // For task events, use the course's color (generated if null)
        return getCourseColor(event.course.id, event.course.color);
      }
      // For imported events, check if matched to a course
      const eventId = getEventId(event);
      const match = courseMatches.get(eventId);
      if (match) {
        // Use matched course's color (generated if null)
        return getCourseColor(match.course.id, match.course.color);
      }
      // No course match - use event's own color or default
      return event.event.color || '#6366F1';
    },
    [courseMatches]
  );

  // Get events for a specific date
  const getEventsForDate = useCallback(
    (date: Date) => {
      return events.filter((e) => {
        const eventDate = getEventDate(e);
        if (!eventDate) return false;
        return isSameDay(eventDate, date);
      });
    },
    [events]
  );

  // Popup handlers
  const showPopup = useCallback(
    (e: React.MouseEvent, popupEvents: CalendarEvent[], label: string) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      let x = rect.right - containerRect.left + 8;
      let y = rect.top - containerRect.top;

      const popupWidth = 280;
      const popupHeight = Math.min(300, popupEvents.length * 80 + 40);

      if (rect.right + popupWidth + 16 > window.innerWidth) {
        x = rect.left - containerRect.left - popupWidth - 8;
      }

      if (rect.top + popupHeight > window.innerHeight - 20) {
        y = rect.bottom - containerRect.top - popupHeight;
      }

      if (y < 0) {
        y = 8;
      }

      setPopup({
        events: popupEvents,
        x: Math.max(8, x),
        y,
        label,
      });
    },
    []
  );

  const hidePopup = useCallback(() => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
    }
    setPopup(null);
  }, []);

  const hidePopupDelayed = useCallback(() => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
    }
    hidePopupTimeoutRef.current = setTimeout(() => {
      setPopup(null);
      setHoveredEventId(null);
    }, 150);
  }, []);

  const cancelHidePopup = useCallback(() => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
      hidePopupTimeoutRef.current = null;
    }
  }, []);

  const handleEventHover = useCallback(
    (e: React.MouseEvent, event: CalendarEvent) => {
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
    },
    [cancelHidePopup, courseMatches, showPopup]
  );

  const handleEventLeave = useCallback(() => {
    hidePopupDelayed();
  }, [hidePopupDelayed]);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      hidePopup();
      if (onEventClick) {
        onEventClick(event);
      } else {
        const eventId = getEventId(event);
        const match =
          event.type === 'imported' ? (courseMatches.get(eventId) ?? null) : null;
        setDetailModal({ event, courseMatch: match });
      }
    },
    [hidePopup, onEventClick, courseMatches]
  );

  // Time helpers
  const getCurrentTimePosition = useCallback(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return hours + minutes / 60;
  }, [currentTime]);

  const isTodayVisible = useCallback(() => {
    const today = new Date();
    if (view === 'day') {
      return isSameDay(currentDate, today);
    }
    if (view === 'week') {
      const weekDays = getWeekDays(currentDate);
      return weekDays.some((d) => isSameDay(d, today));
    }
    return false;
  }, [view, currentDate]);

  const getTodayColumnIndex = useCallback(() => {
    const today = new Date();
    const weekDays = getWeekDays(currentDate);
    return weekDays.findIndex((d) => isSameDay(d, today));
  }, [currentDate]);

  // Render detail modal
  const renderDetailModal = useCallback(() => {
    if (!detailModal) return null;

    const { event, courseMatch } = detailModal;
    const title = getEventTitle(event);
    const timeRange = getEventTimeRange(event);
    const description = getEventDescription(event);
    const effectiveColor = getEffectiveEventColor(event);
    const isTask = event.type === 'task';
    const isCompleted = isCompletedTask(event);

    const hideDetailModal = () => setDetailModal(null);

    return (
      <div style={styles.modalOverlay} onClick={hideDetailModal}>
        <div
          style={{
            ...styles.modalContent,
            opacity: isCompleted ? 0.85 : 1,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ ...styles.modalHeader, backgroundColor: effectiveColor }}>
            <div
              style={{
                ...styles.modalTitle,
                textDecoration: isCompleted ? 'line-through' : 'none',
              }}
            >
              {title}
              {isCompleted && ' (Completed)'}
            </div>
            <button style={styles.modalClose} onClick={hideDetailModal}>
              ×
            </button>
          </div>
          <div style={styles.modalBody}>
            {timeRange && (
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Time</span>
                <span style={styles.modalValue}>{timeRange}</span>
              </div>
            )}

            <div style={styles.modalRow}>
              <span style={styles.modalLabel}>{isTask ? 'Course' : 'Calendar'}</span>
              <span style={styles.modalValue}>
                {isTask ? event.course.name : event.event.calendarName || 'Imported'}
              </span>
            </div>

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

            {!isTask && event.event.location && (
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Location</span>
                <span style={styles.modalValue}>{event.event.location}</span>
              </div>
            )}

            {description && (
              <div style={styles.modalDescription}>
                <div style={styles.modalLabel}>Description</div>
                <div style={styles.modalDescriptionText}>{description}</div>
              </div>
            )}

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
  }, [detailModal, getEffectiveEventColor, onCourseClick]);

  // Render popup
  const renderPopup = useCallback(() => {
    if (!popup) return null;

    return (
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
            const isCompleted = isCompletedTask(event);
            return (
              <div
                key={i}
                style={{
                  ...styles.popupItem,
                  borderLeft: `3px solid ${effectiveColor}`,
                  opacity: isCompleted ? 0.6 : 1,
                }}
                onClick={() => handleEventClick(event)}
              >
                <div
                  style={{
                    ...styles.popupItemTitle,
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}
                >
                  <strong>{getEventFullLabel(event)}</strong> {getEventTitle(event)}
                </div>
                {time && <div style={styles.popupItemTime}>{time}</div>}
                {isTask && (
                  <div style={styles.popupItemMeta}>
                    {event.task.taskType}
                    {event.task.weight > 0 && ` • ${event.task.weight}%`}
                  </div>
                )}
                {match && (
                  <div
                    style={styles.popupItemCourseLink}
                    onClick={(e) => {
                      e.stopPropagation();
                      hidePopup();
                      onCourseClick?.(match.course.id);
                    }}
                  >
                    → {match.course.code}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [
    popup,
    cancelHidePopup,
    hidePopupDelayed,
    courseMatches,
    getEffectiveEventColor,
    handleEventClick,
    hidePopup,
    onCourseClick,
  ]);

  const value: CalendarGridContextType = {
    view,
    currentDate,
    events,
    courses,
    onEventClick,
    onDateClick,
    onCourseClick,
    popup,
    setPopup,
    hoveredEventId,
    setHoveredEventId,
    detailModal,
    setDetailModal,
    currentTime,
    containerRef,
    weekGridRef,
    dayGridRef,
    courseMatches,
    getEffectiveEventColor,
    getEventsForDate,
    showPopup,
    hidePopup,
    hidePopupDelayed,
    cancelHidePopup,
    handleEventHover,
    handleEventLeave,
    handleEventClick,
    getCurrentTimePosition,
    isTodayVisible,
    getTodayColumnIndex,
    renderDetailModal,
    renderPopup,
  };

  return (
    <CalendarGridContext.Provider value={value}>{children}</CalendarGridContext.Provider>
  );
}
