/**
 * Calendar Utilities
 * Pure functions for calendar event processing, formatting, and settings persistence
 */

import type { DisplayCalendarEvent } from '../../../l5-presentation/types';
import type { CalendarView } from './CalendarGrid';

// ============ View Mode Persistence ============

/**
 * Load calendar settings from SettingsModal
 */
export function loadCalendarSettings(): { defaultViewMode: CalendarView } {
  try {
    const stored = localStorage.getItem('calendarSettings');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed.defaultViewMode === 'month' ||
        parsed.defaultViewMode === 'week' ||
        parsed.defaultViewMode === 'day'
      ) {
        return { defaultViewMode: parsed.defaultViewMode };
      }
    }
  } catch (e) {
    console.error('[Calendar] Failed to load calendar settings:', e);
  }
  return { defaultViewMode: 'month' };
}

/**
 * Load view mode - user's toggle preference takes priority over settings default
 */
export function loadCalendarViewMode(): CalendarView {
  try {
    const stored = localStorage.getItem('viewMode:calendar');
    if (stored === 'month' || stored === 'week' || stored === 'day') {
      return stored;
    }
    const settings = loadCalendarSettings();
    return settings.defaultViewMode;
  } catch (e) {
    console.error('[Calendar] Failed to load view mode:', e);
  }
  return 'month';
}

/**
 * Save view mode to localStorage
 */
export function saveCalendarViewMode(mode: CalendarView): void {
  try {
    localStorage.setItem('viewMode:calendar', mode);
  } catch (e) {
    console.error('[Calendar] Failed to save view mode:', e);
  }
}

// ============ Date Range Utilities ============

/**
 * Get the visible date range based on current view and date
 */
export function getVisibleRange(
  currentDate: Date,
  view: CalendarView
): { start: Date; end: Date } {
  const start = new Date(currentDate);
  const end = new Date(currentDate);

  if (view === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else if (view === 'week') {
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

/**
 * Format header title based on view
 */
export function getHeaderTitle(currentDate: Date, view: CalendarView): string {
  if (view === 'month') {
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else if (view === 'week') {
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
    }
    return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============ Event Utilities ============

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
