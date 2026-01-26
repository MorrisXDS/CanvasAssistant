/**
 * Formatters - Centralized formatting utilities for the UI layer
 *
 * Contains all reusable formatting functions for dates, times, grades,
 * file sizes, and other display-related transformations.
 */

// =============================================================================
// TIME & DATE FORMATTERS
// =============================================================================

/**
 * Format a date string as relative time (e.g., "2h ago", "3d ago")
 *
 * @param dateStr - ISO date string or null
 * @returns Formatted relative time string
 *
 * @example
 * formatTimeAgo('2024-01-15T10:30:00Z') // "2h ago"
 * formatTimeAgo(null) // "Never"
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

  // More than a week, show date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a due date with days until due context
 *
 * @param dueAt - ISO date string or null
 * @param daysUntilDue - Number of days until due (negative if overdue)
 * @param options - Formatting options
 * @returns Formatted due date string
 *
 * @example
 * formatDueDate('2024-01-15T23:59:00Z', 0) // "Due today"
 * formatDueDate('2024-01-15T23:59:00Z', -2) // "2d overdue"
 * formatDueDate('2024-01-15T23:59:00Z', 3) // "Due in 3 days"
 */
export function formatDueDate(
  dueAt: string | null,
  daysUntilDue: number | null,
  options?: { includeTime?: boolean; shortOverdue?: boolean; dueTimeKnown?: boolean }
): string {
  if (!dueAt || daysUntilDue === null) return 'No due date';

  const shortOverdue = options?.shortOverdue ?? true;
  // Hide time if explicitly set to false, default to true (show time if requested)
  const dueTimeKnown = options?.dueTimeKnown ?? true;

  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return shortOverdue ? `${days}d overdue` : `${days} days overdue`;
  }
  if (daysUntilDue === 0) return 'Due today';
  if (daysUntilDue === 1) return 'Due tomorrow';
  if (daysUntilDue <= 7) return `Due in ${daysUntilDue} days`;

  // More than a week, show date
  const date = new Date(dueAt);
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  // Only include time if requested AND time is known
  if (options?.includeTime && dueTimeKnown) {
    formatOptions.hour = 'numeric';
    formatOptions.minute = '2-digit';
  }

  return date.toLocaleDateString('en-US', formatOptions);
}

/**
 * Format days until due for display
 *
 * @param days - Number of days until due
 * @returns Formatted string
 *
 * @example
 * formatDaysUntilDue(0) // "Today"
 * formatDaysUntilDue(-1) // "1 day overdue"
 * formatDaysUntilDue(3) // "3 days"
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
 *
 * @param dateStr - ISO date string
 * @returns Formatted date or time string
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

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a time for display (12-hour format)
 *
 * @param dateStr - ISO date string
 * @returns Formatted time string
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
 *
 * @param startDate - Start date string
 * @param endDate - End date string (optional)
 * @returns Formatted date range
 */
export function formatDateRange(startDate: string, endDate?: string): string {
  const start = new Date(startDate);
  const startStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  if (!endDate) return startStr;

  const end = new Date(endDate);
  const endStr = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // Same day
  if (start.toDateString() === end.toDateString()) {
    return startStr;
  }

  // Same month
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}-${end.getDate()}`;
  }

  return `${startStr} - ${endStr}`;
}

// =============================================================================
// GRADE FORMATTERS
// =============================================================================

/**
 * Get letter grade from percentage (UofT grading scale)
 *
 * @param percentage - Grade percentage (0-100)
 * @returns Letter grade string
 *
 * @example
 * getLetterGrade(92) // "A+"
 * getLetterGrade(85) // "A"
 * getLetterGrade(73) // "B"
 */
export function getLetterGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 85) return 'A';
  if (percentage >= 80) return 'A-';
  if (percentage >= 77) return 'B+';
  if (percentage >= 73) return 'B';
  if (percentage >= 70) return 'B-';
  if (percentage >= 67) return 'C+';
  if (percentage >= 63) return 'C';
  if (percentage >= 60) return 'C-';
  if (percentage >= 57) return 'D+';
  if (percentage >= 53) return 'D';
  if (percentage >= 50) return 'D-';
  return 'F';
}

/**
 * Format a grade percentage for display
 *
 * @param percentage - Grade percentage
 * @param decimals - Number of decimal places (default 1)
 * @returns Formatted percentage string
 *
 * @example
 * formatGrade(85.5) // "85.5%"
 * formatGrade(85.5, 0) // "86%"
 */
export function formatGrade(percentage: number | null, decimals = 1): string {
  if (percentage === null) return '-';
  return `${percentage.toFixed(decimals)}%`;
}

/**
 * Format grade with letter grade
 *
 * @param percentage - Grade percentage
 * @returns Formatted grade with letter
 *
 * @example
 * formatGradeWithLetter(85) // "85% (A)"
 */
export function formatGradeWithLetter(percentage: number | null): string {
  if (percentage === null) return '-';
  return `${percentage.toFixed(1)}% (${getLetterGrade(percentage)})`;
}

// =============================================================================
// FILE SIZE FORMATTERS
// =============================================================================

/**
 * Format file size in bytes to human-readable string
 *
 * @param bytes - File size in bytes
 * @returns Formatted size string
 *
 * @example
 * formatFileSize(1024) // "1 KB"
 * formatFileSize(1048576) // "1 MB"
 * formatFileSize(1073741824) // "1 GB"
 * formatFileSize(null) // ""
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// =============================================================================
// TEXT FORMATTERS
// =============================================================================

/**
 * Truncate text to a maximum length with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 *
 * @example
 * truncateText("Hello World", 5) // "Hello..."
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Format a number with commas
 *
 * @param num - Number to format
 * @returns Formatted number string
 *
 * @example
 * formatNumber(1000) // "1,000"
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Pluralize a word based on count
 *
 * @param count - Count
 * @param singular - Singular form
 * @param plural - Plural form (optional, defaults to singular + 's')
 * @returns Pluralized string with count
 *
 * @example
 * pluralize(1, "item") // "1 item"
 * pluralize(3, "item") // "3 items"
 * pluralize(2, "task", "tasks") // "2 tasks"
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}

// =============================================================================
// URGENCY HELPERS
// =============================================================================

/**
 * Get urgency level from days until due (for CSS color mapping)
 *
 * @param daysUntilDue - Days until due (negative if overdue)
 * @returns Urgency level string
 */
export function getUrgencyLevel(
  daysUntilDue: number | null
): 'danger' | 'warning' | 'info' | 'default' {
  if (daysUntilDue === null) return 'default';
  if (daysUntilDue < 0) return 'danger'; // Overdue
  if (daysUntilDue === 0) return 'danger'; // Due today
  if (daysUntilDue === 1) return 'warning'; // Due tomorrow
  if (daysUntilDue <= 3) return 'warning'; // Due soon
  return 'info';
}

/**
 * Get badge urgency level from days until due (for Badge component)
 *
 * @param daysUntilDue - Days until due (negative if overdue)
 * @returns Badge-compatible urgency level
 */
export function getBadgeUrgency(
  daysUntilDue: number | null
): 'critical' | 'high' | 'medium' | 'low' {
  if (daysUntilDue === null) return 'low';
  if (daysUntilDue < 0) return 'critical';
  if (daysUntilDue <= 1) return 'critical';
  if (daysUntilDue <= 3) return 'high';
  if (daysUntilDue <= 7) return 'medium';
  return 'low';
}

/**
 * Get urgency color from days until due
 *
 * @param daysUntilDue - Days until due
 * @returns CSS color value
 */
export function getUrgencyColor(daysUntilDue: number | null): string {
  const level = getUrgencyLevel(daysUntilDue);
  switch (level) {
    case 'danger':
      return 'var(--color-danger)';
    case 'warning':
      return 'var(--color-warning)';
    case 'info':
      return 'var(--color-info)';
    default:
      return 'var(--color-text-secondary)';
  }
}
