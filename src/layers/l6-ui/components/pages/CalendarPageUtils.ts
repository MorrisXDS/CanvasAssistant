/**
 * CalendarPage Utilities
 * Helper functions for calendar calculations and settings
 */

import type { Task } from '../../../l5-presentation/types';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import { createLogger } from '../../utils/rendererLogger';

const logger = createLogger('CalendarPageUtils');

// View modes
export type ViewMode = 'month' | 'week';
export type DeadlineFilter = 'all' | 'overdue' | 'today' | 'this-week' | 'upcoming';
export type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

// Days and months
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Get urgency from task based on due date
 */
export function getTaskPriority(task: Task): 'high' | 'medium' | 'low' {
  if (!task.dueAt) return 'low';
  const now = new Date();
  const due = new Date(task.dueAt);
  const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilDue < 72) return 'high'; // Due within 3 days
  if (hoursUntilDue < 168) return 'medium'; // Due within 7 days
  return 'low';
}

/**
 * Get task type from task
 */
export function getTaskType(task: Task): string {
  if (task.taskType) return task.taskType;
  const title = task.title.toLowerCase();
  if (title.includes('exam') || title.includes('midterm') || title.includes('final'))
    return 'exam';
  if (title.includes('quiz')) return 'quiz';
  if (title.includes('lab')) return 'lab';
  if (title.includes('assignment') || title.includes('homework')) return 'assignment';
  if (title.includes('project')) return 'project';
  return 'other';
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Get calendar days for a month (including padding from adjacent months)
 */
export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Add days from previous month to fill first week
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Add all days of current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add days from next month to complete last week
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

/**
 * Get start of week (Sunday)
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * Format week title (e.g., "Jan 5 - 11, 2025")
 */
export function formatWeekTitle(date: Date): string {
  const weekStart = getWeekStart(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const startMonth = MONTHS[weekStart.getMonth()].substring(0, 3);
  const endMonth = MONTHS[weekEnd.getMonth()].substring(0, 3);

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }
  return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
}

/**
 * Load calendar settings from SettingsModal
 */
export function loadCalendarSettings(): { defaultViewMode: ViewMode } {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CALENDAR);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.defaultViewMode === 'month' || parsed.defaultViewMode === 'week') {
        return { defaultViewMode: parsed.defaultViewMode };
      }
    }
  } catch (e) {
    logger.error('Failed to load calendar settings', e instanceof Error ? e : undefined);
  }
  return { defaultViewMode: 'month' };
}

/**
 * Load calendar view mode (user's last selection takes priority)
 */
export function loadCalendarViewMode(): ViewMode {
  try {
    // First check if user has a saved preference
    const stored = localStorage.getItem(STORAGE_KEYS.CALENDAR_VIEW_MODE);
    if (stored === 'month' || stored === 'week') {
      return stored;
    }
    // Otherwise use default from settings
    const settings = loadCalendarSettings();
    return settings.defaultViewMode;
  } catch (e) {
    logger.error('Failed to load calendar view mode', e instanceof Error ? e : undefined);
  }
  return 'month';
}

/**
 * Save calendar view mode to localStorage
 */
export function saveCalendarViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CALENDAR_VIEW_MODE, mode);
  } catch (e) {
    logger.error('Failed to save calendar view mode', e instanceof Error ? e : undefined);
  }
}
