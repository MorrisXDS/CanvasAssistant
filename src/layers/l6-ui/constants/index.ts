/**
 * UI Constants Module
 *
 * Re-exports all UI constants including:
 * - Colors - Course and calendar color palettes with utilities
 * - Formatters - Date, time, grade, file size formatting functions
 * - UI Text - All user-facing strings
 */

// Colors
export {
  COURSE_COLORS,
  CALENDAR_COLORS,
  EXTENDED_COLORS,
  getCourseColor,
  getColorByIndex,
  isLightColor,
  getContrastTextColor,
  lightenColor,
  withAlpha,
  type CourseColor,
  type CalendarColor,
} from './colors';

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
  // Course names
  getCleanCourseName,
  formatCourseName,
} from './formatters';

// UI Text
export { UI_TEXT, type UITextKey } from './uiText';

// Task Types
export {
  TASK_TYPES,
  TASK_TYPE_VALUES,
  getTaskTypeLabel,
  type TaskTypeOption,
} from './taskTypes';
