/**
 * Formatters - Centralized formatting utilities for the UI layer
 *
 * FACADE: This file re-exports from submodules for backward compatibility.
 * New code should import directly from submodules when possible.
 */

// Date formatters
export {
  formatTimeAgo,
  formatDueDate,
  formatDaysUntilDue,
  formatCalendarDate,
  formatSmartDate,
  formatSmartDateRange,
  formatTime,
  formatDateRange,
} from './formatters/dateFormatters';

// Grade formatters
export {
  getLetterGrade,
  formatGrade,
  formatGradeWithLetter,
} from './formatters/gradeFormatters';

// Text formatters
export {
  formatFileSize,
  getCleanCourseName,
  formatCourseName,
  truncateText,
  formatNumber,
  pluralize,
} from './formatters/textFormatters';

// Field formatters & urgency
export {
  formatFieldValue,
  getUrgencyLevel,
  getBadgeUrgency,
  getUrgencyColor,
} from './formatters/fieldFormatters';
