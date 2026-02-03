/**
 * DateUtils - Timezone-aware date utilities using Luxon
 *
 * Provides consistent date handling across DST transitions.
 * All functions work correctly with EST/EDT, PST/PDT, etc.
 */

import { DateTime, Settings } from 'luxon';

// Use system timezone by default
Settings.defaultZone = 'local';

/**
 * Calculate calendar days until a due date (timezone-aware)
 * Returns 0 for "due today", 1 for "due tomorrow", -1 for "1 day overdue"
 *
 * @param dueAt - ISO date string or null
 * @returns Number of calendar days until due, or null if no date
 */
export function getDaysUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;

  const now = DateTime.local().startOf('day');
  const due = DateTime.fromISO(dueAt).toLocal().startOf('day');

  if (!due.isValid) return null;

  return Math.round(due.diff(now, 'days').days);
}

/**
 * Calculate hours until a due date (timezone-aware)
 *
 * @param dueAt - ISO date string or null
 * @returns Number of hours until due (negative if overdue), or null if no date
 */
export function getHoursUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;

  const now = DateTime.local();
  const due = DateTime.fromISO(dueAt).toLocal();

  if (!due.isValid) return null;

  return due.diff(now, 'hours').hours;
}

/**
 * Check if a date is today (timezone-aware)
 *
 * @param dateStr - ISO date string
 * @returns true if the date is today in local timezone
 */
export function isToday(dateStr: string): boolean {
  const date = DateTime.fromISO(dateStr).toLocal();
  const today = DateTime.local();

  return date.hasSame(today, 'day');
}

/**
 * Check if a date is tomorrow (timezone-aware)
 *
 * @param dateStr - ISO date string
 * @returns true if the date is tomorrow in local timezone
 */
export function isTomorrow(dateStr: string): boolean {
  const date = DateTime.fromISO(dateStr).toLocal();
  const tomorrow = DateTime.local().plus({ days: 1 });

  return date.hasSame(tomorrow, 'day');
}

/**
 * Format a date for display (timezone-aware)
 *
 * @param dateStr - ISO date string
 * @param format - Luxon format string (default: 'LLL d, yyyy')
 * @returns Formatted date string
 */
export function formatDate(dateStr: string, format: string = 'LLL d, yyyy'): string {
  const dt = DateTime.fromISO(dateStr).toLocal();
  return dt.isValid ? dt.toFormat(format) : 'Invalid date';
}

/**
 * Format a time for display (timezone-aware)
 *
 * @param dateStr - ISO date string
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatTime(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr).toLocal();
  return dt.isValid ? dt.toFormat('h:mm a') : 'Invalid time';
}

/**
 * Format a date and time for display (timezone-aware)
 *
 * @param dateStr - ISO date string
 * @returns Formatted date and time string
 */
export function formatDateTime(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr).toLocal();
  return dt.isValid ? dt.toFormat('LLL d, yyyy h:mm a') : 'Invalid date';
}

/**
 * Get the current timezone abbreviation (e.g., "EST", "EDT", "PST")
 *
 * @returns Current timezone abbreviation
 */
export function getCurrentTimezoneAbbr(): string {
  return DateTime.local().toFormat('ZZZZ');
}

/**
 * Get the current timezone offset (e.g., "-05:00", "-04:00")
 *
 * @returns Current timezone offset string
 */
export function getCurrentTimezoneOffset(): string {
  return DateTime.local().toFormat('ZZ');
}

/**
 * Check if currently in Daylight Saving Time
 *
 * @returns true if currently in DST
 */
export function isInDST(): boolean {
  return DateTime.local().isInDST;
}

/**
 * Convert a date string to the start of day in local timezone
 * Useful for comparing calendar days
 *
 * @param dateStr - ISO date string
 * @returns DateTime at start of day in local timezone
 */
export function toStartOfDay(dateStr: string): DateTime {
  return DateTime.fromISO(dateStr).toLocal().startOf('day');
}

/**
 * Convert a date string to the end of day in local timezone
 * Useful for deadline calculations when time is unknown
 *
 * @param dateStr - ISO date string
 * @returns DateTime at end of day (23:59:59) in local timezone
 */
export function toEndOfDay(dateStr: string): DateTime {
  return DateTime.fromISO(dateStr).toLocal().endOf('day');
}

/**
 * Get milliseconds until a date (for setTimeout, etc.)
 *
 * @param dateStr - ISO date string
 * @returns Milliseconds until the date (negative if past)
 */
export function getMsUntil(dateStr: string): number {
  const dt = DateTime.fromISO(dateStr);
  return dt.toMillis() - DateTime.local().toMillis();
}

/**
 * Parse an ISO date string to DateTime
 *
 * @param dateStr - ISO date string
 * @returns Luxon DateTime in local timezone
 */
export function parseISO(dateStr: string): DateTime {
  return DateTime.fromISO(dateStr).toLocal();
}

/**
 * Get current DateTime
 *
 * @returns Current Luxon DateTime in local timezone
 */
export function now(): DateTime {
  return DateTime.local();
}
