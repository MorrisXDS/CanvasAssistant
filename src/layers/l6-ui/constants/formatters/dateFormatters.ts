/**
 * Date Formatters - Time and date formatting utilities
 */

/**
 * Format a date string as relative time (e.g., "2h ago", "3d ago")
 */
export function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}

/**
 * Format a due date with days until due context
 */
export function formatDueDate(
  dueAt: string | null,
  daysUntilDue: number | null,
  options?: { includeTime?: boolean; shortOverdue?: boolean; dueTimeKnown?: boolean }
): string {
  if (!dueAt || daysUntilDue === null) return 'No due date';

  const shortOverdue = options?.shortOverdue ?? true;
  const dueTimeKnown = options?.dueTimeKnown ?? true;

  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return shortOverdue ? `${days}d overdue` : `${days} days overdue`;
  }
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;

  const date = new Date(dueAt);
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  if (date.getFullYear() !== new Date().getFullYear()) {
    formatOptions.year = 'numeric';
  }

  if (options?.includeTime && dueTimeKnown) {
    formatOptions.hour = 'numeric';
    formatOptions.minute = '2-digit';
  }

  return date.toLocaleDateString('en-US', formatOptions);
}

/**
 * Format days until due for display
 */
export function formatDaysUntilDue(days: number | null): string {
  if (days === null) return 'No due date';
  if (days < 0) {
    const abs = Math.abs(days);
    return abs === 1 ? '1 day overdue' : `${abs} days overdue`;
  }
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
}

/**
 * Format a date for calendar display (time only for same day, date otherwise)
 */
export function formatCalendarDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateDay = new Date(date);
  dateDay.setHours(0, 0, 0, 0);

  const isToday = dateDay.getTime() === today.getTime();

  if (isToday) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== today.getFullYear()) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}

/**
 * Format a date with smart relative day labels
 */
export function formatSmartDate(
  dateStr: string | null,
  options?: { includeTime?: boolean }
): string {
  if (!dateStr) return 'No date';

  const date = new Date(dateStr);
  const now = new Date();
  const includeTime = options?.includeTime ?? true;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateDay = new Date(date);
  dateDay.setHours(0, 0, 0, 0);

  const timeStr = includeTime
    ? date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  if (dateDay.getTime() === today.getTime()) {
    return includeTime ? `Today ${timeStr}` : 'Today';
  }

  if (dateDay.getTime() === tomorrow.getTime()) {
    return includeTime ? `Tomorrow ${timeStr}` : 'Tomorrow';
  }

  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  if (date.getFullYear() !== now.getFullYear()) {
    dateFormatOptions.year = 'numeric';
  }

  if (includeTime) {
    dateFormatOptions.hour = 'numeric';
    dateFormatOptions.minute = '2-digit';
  }

  return date.toLocaleDateString('en-US', dateFormatOptions);
}

/**
 * Format a date range with smart relative day labels
 */
export function formatSmartDateRange(
  startDateStr: string | null,
  endDateStr: string | null
): string {
  if (!startDateStr) return formatSmartDate(endDateStr);
  if (!endDateStr) return formatSmartDate(startDateStr);

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const startTimeStr = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const endTimeStr = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (startDay.getTime() === endDay.getTime()) {
    let dayLabel: string;
    if (startDay.getTime() === today.getTime()) {
      dayLabel = 'Today';
    } else if (startDay.getTime() === tomorrow.getTime()) {
      dayLabel = 'Tomorrow';
    } else {
      dayLabel = start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
    return `${dayLabel} ${startTimeStr} - ${endTimeStr}`;
  }

  return `${formatSmartDate(startDateStr)} - ${formatSmartDate(endDateStr)}`;
}

/**
 * Format a time for display (12-hour format)
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a date range for display
 */
export function formatDateRange(startDate: string, endDate?: string): string {
  const now = new Date();
  const start = new Date(startDate);
  const startOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (start.getFullYear() !== now.getFullYear()) {
    startOpts.year = 'numeric';
  }
  const startStr = start.toLocaleDateString('en-US', startOpts);

  if (!endDate) return startStr;

  const end = new Date(endDate);
  const endOpts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (end.getFullYear() !== now.getFullYear()) {
    endOpts.year = 'numeric';
  }
  const endStr = end.toLocaleDateString('en-US', endOpts);

  if (start.toDateString() === end.toDateString()) {
    return startStr;
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    const monthStr = start.toLocaleDateString('en-US', { month: 'short' });
    const yearSuffix =
      start.getFullYear() !== now.getFullYear() ? `, ${start.getFullYear()}` : '';
    return `${monthStr} ${start.getDate()}-${end.getDate()}${yearSuffix}`;
  }

  return `${startStr} - ${endStr}`;
}
