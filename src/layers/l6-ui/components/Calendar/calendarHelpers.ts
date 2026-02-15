/**
 * Calendar Helpers - Pure functions and constants for calendar views
 */

import type { Course } from '../../../l5-presentation/types';
import {
  getHourInEffectiveTimezone,
  getTimeInEffectiveTimezone,
} from '../../../l5-presentation/settings';
import type {
  CalendarEvent,
  ImportedCalendarEvent,
  CourseMatch,
  PositionedEvent,
} from './calendarTypes';

// Constants
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const HOUR_HEIGHT = 64;
export const WEEK_HOUR_HEIGHT = 48;

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
export function getEventDurationHours(event: CalendarEvent): number {
  if (event.type === 'task') {
    return 1;
  }

  const importedEvent = event;
  const end = importedEvent.event.endAt ? new Date(importedEvent.event.endAt) : null;
  if (!end) return 1;

  if (
    importedEvent.event.taskId &&
    new Date(importedEvent.event.startAt).getTime() < 86400000
  ) {
    return 1;
  }

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
export function matchEventToCourse(
  event: ImportedCalendarEvent,
  courses: Course[]
): CourseMatch | null {
  // PASS 0: Direct courseId match
  if (event.event.courseId) {
    const matchedCourse = courses.find((c) => c.id === event.event.courseId);
    if (matchedCourse) {
      return { course: matchedCourse, confidence: 'high' };
    }
  }

  const title = event.event.title.toLowerCase().trim();
  const calendarName = event.event.calendarName?.toLowerCase().trim() || '';
  const description = event.event.description?.toLowerCase().trim() || '';

  const eventSectionType = extractSectionType(title);

  const courseData = courses.map((course) => {
    const code = course.code.toLowerCase().trim();
    const name = course.name.toLowerCase().trim();
    const shortCode = code.split(/[hy]\d/)[0];
    const sectionType = extractSectionType(code);
    return { course, code, name, shortCode, sectionType };
  });

  // PASS 1: Match full course code in EVENT TITLE
  for (const { course, code } of courseData) {
    if (title.includes(code)) {
      return { course, confidence: 'high' };
    }
  }

  // PASS 2: Match short code + section type in EVENT TITLE
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

  // PASS 3: Match short code in EVENT TITLE
  for (const { course, shortCode } of courseData) {
    if (shortCode && shortCode.length >= 3 && title.includes(shortCode)) {
      return { course, confidence: 'high' };
    }
  }

  // PASS 4: Match full course code in CALENDAR NAME
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

  // PASS 6: Match short code in CALENDAR NAME
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

  // PASS 8: Match individual words from course name
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
export function getEarliestEventHour(events: CalendarEvent[]): number | null {
  let earliest: number | null = null;

  for (const event of events) {
    if (event.type === 'imported' && event.event.allDay) continue;

    let effectiveStartHour: number | null = null;

    if (event.type === 'task') {
      if (event.task.dueAt) {
        const dueHour = getHourInEffectiveTimezone(event.task.dueAt);
        const duration = getEventDurationHours(event);
        effectiveStartHour = Math.max(0, dueHour - duration);
      }
    } else {
      if (isDeadlineTaskEvent(event) && event.event.endAt) {
        const dueHour = getHourInEffectiveTimezone(event.event.endAt);
        const duration = getEventDurationHours(event);
        effectiveStartHour = Math.max(0, dueHour - duration);
      } else {
        effectiveStartHour = getHourInEffectiveTimezone(event.event.startAt);
      }
    }

    if (
      effectiveStartHour !== null &&
      (earliest === null || effectiveStartHour < earliest)
    ) {
      earliest = effectiveStartHour;
    }
  }

  return earliest;
}
