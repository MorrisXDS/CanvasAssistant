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
  getNextCalendarColor,
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
  formatSmartDate,
  formatSmartDateRange,
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
  // Field values (sync updates, conflicts, tooltips)
  formatFieldValue,
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

// Menu Labels
export { MENU_LABELS, type MenuLabels } from './menuLabels';

// Policy Labels
export { POLICY_LABELS, type PolicyLabels } from './policyLabels';

// Insight Labels
export { INSIGHT_LABELS, type InsightLabels } from './insightLabels';

// Card Titles
export { CARD_TITLES, type CardTitles } from './cardTitles';

// Settings Labels
export { SETTINGS_LABELS, type SettingsLabels } from './settingsLabels';

// Keyboard Shortcuts
export {
  KEYBOARD_SHORTCUTS,
  type ShortcutEntry,
  type ShortcutCategory,
} from './keyboardShortcuts';

// Z-Index scale
export { Z_INDEX, type ZIndexBand } from './zIndex';
