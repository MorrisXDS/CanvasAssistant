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
 * Format a date with smart relative day labels
 *
 * Shows "Today" or "Tomorrow" with time for dates within those windows,
 * otherwise shows the full date with time.
 *
 * @param dateStr - ISO date string
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * formatSmartDate('2024-01-15T23:59:00Z') // "Today 11:59 PM" (if today is Jan 15)
 * formatSmartDate('2024-01-16T14:00:00Z') // "Tomorrow 2:00 PM" (if today is Jan 15)
 * formatSmartDate('2024-01-18T10:00:00Z') // "Jan 18 10:00 AM"
 */
export function formatSmartDate(
  dateStr: string | null,
  options?: { includeTime?: boolean }
): string {
  if (!dateStr) return 'No date';

  const date = new Date(dateStr);
  const now = new Date();
  const includeTime = options?.includeTime ?? true;

  // Get start of today and tomorrow
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  // Get start of the date's day
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

  // Full date format
  const dateFormatOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };

  if (includeTime) {
    dateFormatOptions.hour = 'numeric';
    dateFormatOptions.minute = '2-digit';
  }

  return date.toLocaleDateString('en-US', dateFormatOptions);
}

/**
 * Format a date range with smart relative day labels
 *
 * For ranges where start and end are on the same day, shows single date.
 * Uses "Today"/"Tomorrow" labels when applicable.
 *
 * @param startDateStr - Start date ISO string
 * @param endDateStr - End date ISO string (optional)
 * @returns Formatted date range string
 *
 * @example
 * formatSmartDateRange('2024-01-15T09:00:00Z', '2024-01-15T17:00:00Z')
 * // "Today 9:00 AM - 5:00 PM" (if today is Jan 15)
 *
 * formatSmartDateRange('2024-01-15T09:00:00Z', '2024-01-16T17:00:00Z')
 * // "Today 9:00 AM - Tomorrow 5:00 PM" (if today is Jan 15)
 *
 * formatSmartDateRange('2024-01-18T09:00:00Z', '2024-01-19T17:00:00Z')
 * // "Jan 18 9:00 AM - Jan 19 5:00 PM"
 */
export function formatSmartDateRange(
  startDateStr: string | null,
  endDateStr: string | null
): string {
  if (!startDateStr) return formatSmartDate(endDateStr);
  if (!endDateStr) return formatSmartDate(startDateStr);

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  // Check if same day
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

  // Same day - show single date label with time range
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

  // Different days - show full range
  return `${formatSmartDate(startDateStr)} - ${formatSmartDate(endDateStr)}`;
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
 * Format a grade percentage for display with smart decimals
 *
 * Shows up to 2 decimal places, but drops trailing zeros in the hundredths place.
 * Always shows at least 1 decimal place for consistency.
 *
 * @param percentage - Grade percentage
 * @returns Formatted percentage string
 *
 * @example
 * formatGrade(85.55) // "85.55%"
 * formatGrade(85.50) // "85.5%"
 * formatGrade(85.00) // "85.0%"
 * formatGrade(100)   // "100.0%"
 */
export function formatGrade(percentage: number | null): string {
  if (percentage === null) return '-';

  // Round to 2 decimal places first
  const rounded = Math.round(percentage * 100) / 100;

  // Check if hundredths place is non-zero
  const hasHundredths = Math.round(rounded * 100) % 10 !== 0;

  return hasHundredths ? `${rounded.toFixed(2)}%` : `${rounded.toFixed(1)}%`;
}

/**
 * Format grade with letter grade
 *
 * @param percentage - Grade percentage
 * @returns Formatted grade with letter
 *
 * @example
 * formatGradeWithLetter(85) // "85.0% (A)"
 * formatGradeWithLetter(85.55) // "85.55% (A)"
 */
export function formatGradeWithLetter(percentage: number | null): string {
  if (percentage === null) return '-';
  return `${formatGrade(percentage)} (${getLetterGrade(percentage)})`;
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
// COURSE NAME FORMATTERS
// =============================================================================

/**
 * Extract the clean course name from the full Canvas name string
 *
 * Canvas stores names like "ECE311H1 S LEC0101 20261:Introduction to Control Systems"
 * This extracts just "Introduction to Control Systems"
 *
 * @param name - Full course name from Canvas
 * @returns Clean course name (part after colon, or original if no colon)
 *
 * @example
 * getCleanCourseName("ECE311H1 S LEC0101 20261:Introduction to Control Systems")
 * // "Introduction to Control Systems"
 *
 * getCleanCourseName("My Course") // "My Course"
 */
export function getCleanCourseName(name: string | null | undefined): string {
  if (!name) return '';

  // If name contains a colon, extract the part after it (the actual course name)
  const colonIndex = name.indexOf(':');
  if (colonIndex !== -1) {
    return name.substring(colonIndex + 1).trim();
  }

  return name;
}

/**
 * Format a full course display string (code + clean name)
 *
 * @param code - Course code (e.g., "ECE311H1 S LEC0101")
 * @param name - Full course name from Canvas
 * @returns Formatted string like "ECE311H1 - Introduction to Control Systems"
 *
 * @example
 * formatCourseName("ECE311H1 S LEC0101", "ECE311H1 S LEC0101 20261:Introduction to Control Systems")
 * // "ECE311H1 S LEC0101 - Introduction to Control Systems"
 */
export function formatCourseName(code: string, name: string | null | undefined): string {
  const cleanName = getCleanCourseName(name);
  if (!cleanName) return code;
  return `${code} - ${cleanName}`;
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
