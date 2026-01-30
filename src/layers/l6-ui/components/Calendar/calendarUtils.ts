/**
 * Calendar Utilities
 * Pure functions for calendar event processing and formatting
 */

import type { DisplayCalendarEvent } from '../../../l5-presentation/types';

/**
 * Check if a calendar event is a deadline event.
 * Deadline events have start_at set to epoch (near 0), meaning they only have an end time (deadline).
 * Duration events have a real start time.
 */
export function isDeadlineEvent(event: DisplayCalendarEvent): boolean {
  const startTime = new Date(event.startAt).getTime();
  // If start_at is within 1 day of epoch (Jan 1, 1970), it's a deadline event
  const oneDayMs = 24 * 60 * 60 * 1000;
  return startTime < oneDayMs;
}

/**
 * Format time for display (e.g., "2:00 PM")
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format duration display for a calendar event (e.g., "2:00 PM - 4:00 PM")
 */
export function formatDurationDisplay(event: DisplayCalendarEvent): string {
  const start = formatTime(event.startAt);
  if (event.endAt) {
    const end = formatTime(event.endAt);
    return `${start} - ${end}`;
  }
  return start;
}

/**
 * Get the display string for a task's calendar event.
 * - Duration event: returns time range (e.g., "2:00 PM - 4:00 PM")
 * - Deadline event: returns null (caller should use deadline formatting)
 * - No event: returns null
 */
export function getEventDurationDisplay(
  event: DisplayCalendarEvent | undefined
): string | null {
  if (!event) return null;
  if (isDeadlineEvent(event)) return null;
  return formatDurationDisplay(event);
}
