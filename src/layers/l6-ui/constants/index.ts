/**
 * UI Constants Module
 *
 * Re-exports all UI constants including:
 * - Formatters - Date, time, grade, file size formatting functions
 * - UI Text - All user-facing strings
 */

// Formatters
export {
  // Time & Date
  formatTimeAgo,
  formatDueDate,
  formatDaysUntilDue,
  formatCalendarDate,
  formatTime,
  formatDateRange,
  // Grades
  getLetterGrade,
  formatGrade,
  formatGradeWithLetter,
  // File sizes
  formatFileSize,
  // Text
  truncateText,
  formatNumber,
  pluralize,
  // Urgency
  getUrgencyLevel,
  getUrgencyColor,
  getBadgeUrgency,
} from './formatters';

// UI Text
export { UI_TEXT, type UITextKey } from './uiText';
