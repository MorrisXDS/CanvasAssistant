/**
 * Centralized Color Constants and Utilities
 *
 * This module provides a single source of truth for:
 * - Course color palette
 * - Calendar color palette
 * - Color assignment utilities
 *
 * Usage:
 * import { COURSE_COLORS, getCourseColor, CALENDAR_COLORS } from '@/layers/l6-ui/constants';
 */

/**
 * Course color palette - 10 distinct, accessible colors
 * Used for course badges, calendar events, and UI elements
 */
export const COURSE_COLORS = [
  '#007FA3', // Teal
  '#E53935', // Red
  '#43A047', // Green
  '#FB8C00', // Orange
  '#8E24AA', // Purple
  '#1E88E5', // Blue
  '#D81B60', // Pink
  '#00ACC1', // Cyan
  '#7CB342', // Lime
  '#6D4C41', // Brown
] as const;

/**
 * Calendar-specific color palette - 40 distinct colors
 * Used for imported calendars and custom calendar events
 * (Different from course colors for visual distinction)
 * First color is the default for new calendars
 *
 * Organized by hue families for reference, but the golden angle
 * algorithm distributes picks optimally across the palette.
 */
export const CALENDAR_COLORS = [
  // Blues (default starts here)
  '#66CCFF', // Sky Blue (default)
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#1E40AF', // Dark Blue
  '#0EA5E9', // Light Blue
  '#2563EB', // Royal Blue

  // Purples & Violets
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#7C3AED', // Deep Violet
  '#C084FC', // Lavender
  '#9333EA', // Vivid Purple

  // Pinks & Magentas
  '#EC4899', // Pink
  '#F472B6', // Light Pink
  '#DB2777', // Deep Pink
  '#E11D48', // Rose
  '#BE185D', // Magenta

  // Reds & Oranges
  '#EF4444', // Red
  '#F97316', // Orange
  '#DC2626', // Dark Red
  '#FB923C', // Light Orange
  '#EA580C', // Burnt Orange

  // Yellows & Ambers
  '#F59E0B', // Amber
  '#FBBF24', // Yellow
  '#EAB308', // Gold
  '#D97706', // Dark Amber
  '#FCD34D', // Pale Yellow

  // Greens
  '#10B981', // Emerald
  '#22C55E', // Green
  '#16A34A', // Forest Green
  '#84CC16', // Lime
  '#4ADE80', // Light Green

  // Teals & Cyans
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0D9488', // Dark Teal
  '#2DD4BF', // Aqua
  '#0891B2', // Deep Cyan

  // Neutrals & Specialty
  '#6B7280', // Gray
  '#78716C', // Warm Gray
  '#71717A', // Zinc
  '#64748B', // Slate
] as const;

/**
 * Extended color palette for when more colors are needed
 */
export const EXTENDED_COLORS = [
  ...COURSE_COLORS,
  '#5C6BC0', // Indigo
  '#26A69A', // Teal variant
  '#EF5350', // Red variant
  '#66BB6A', // Green variant
  '#FFA726', // Orange variant
  '#AB47BC', // Purple variant
] as const;

export type CourseColor = (typeof COURSE_COLORS)[number];
export type CalendarColor = (typeof CALENDAR_COLORS)[number];

/**
 * Get a consistent color for a course based on its ID
 * Uses the course's custom color if set, otherwise assigns from palette
 *
 * @param courseId - The course's unique identifier
 * @param existingColor - Optional custom color set by user
 * @returns A hex color string
 */
export function getCourseColor(courseId: number, existingColor?: string | null): string {
  if (existingColor) return existingColor;
  return COURSE_COLORS[courseId % COURSE_COLORS.length];
}

/**
 * Get a color by index from the course palette
 * Wraps around if index exceeds palette length
 *
 * @param index - The index to get color for
 * @returns A hex color string
 */
export function getColorByIndex(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

/**
 * Check if a color is light (for determining text contrast)
 *
 * @param hexColor - Hex color string (e.g., '#007FA3')
 * @returns true if the color is light, false if dark
 */
export function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Using relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/**
 * Get contrasting text color for a background
 *
 * @param backgroundColor - Hex color string
 * @returns 'white' or 'black' for optimal contrast
 */
export function getContrastTextColor(backgroundColor: string): 'white' | 'black' {
  return isLightColor(backgroundColor) ? 'black' : 'white';
}

/**
 * Lighten a hex color by a percentage
 *
 * @param hexColor - Hex color string
 * @param percent - Percentage to lighten (0-100)
 * @returns Lightened hex color string
 */
export function lightenColor(hexColor: string, percent: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const lighten = (value: number) =>
    Math.min(255, Math.round(value + (255 - value) * (percent / 100)));

  const rr = lighten(r).toString(16).padStart(2, '0');
  const gg = lighten(g).toString(16).padStart(2, '0');
  const bb = lighten(b).toString(16).padStart(2, '0');

  return `#${rr}${gg}${bb}`;
}

/**
 * Create a semi-transparent version of a color
 *
 * @param hexColor - Hex color string
 * @param alpha - Opacity value (0-1)
 * @returns RGBA color string
 */
export function withAlpha(hexColor: string, alpha: number): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Update-type dot colors — used by NotificationDot
 * Priority: conflict > grade_changed > updated > new
 */
export const UPDATE_TYPE_COLORS: Record<
  'new' | 'updated' | 'grade_changed' | 'conflict',
  string
> = {
  new: '#22C55E',
  updated: '#3B82F6',
  grade_changed: '#F97316',
  conflict: '#EF4444',
};

/** Fallback color for NotificationDot when no updateType or course color is available */
export const UPDATE_TYPE_FALLBACK_COLOR = '#666';

/**
 * Content-category colors — used by getCategoryColor() in FileListItem
 */
export const CONTENT_CATEGORY_COLORS: Record<string, string> = {
  'Lecture Slides': '#1976D2',
  'Lab Manual': '#7B1FA2',
  Assignment: '#E65100',
  Tutorial: '#00897B',
  Notes: '#558B2F',
  Reading: '#5D4037',
  Syllabus: '#C62828',
  Solution: '#00838F',
  Exam: '#AD1457',
  default: '#616161',
};

/** Default course color when a course has no assigned color (UpdatesPage fallback) */
export const DEFAULT_COURSE_COLOR = '#6B7280';

/**
 * Golden Angle color selection for imported calendars
 *
 * Uses the golden angle (≈137.508°) to distribute colors optimally.
 * This is the same algorithm used by D3.js, matplotlib, and other
 * visualization libraries to ensure maximum visual distinction
 * between consecutive items.
 *
 * The golden ratio (φ ≈ 1.618) has the property that each new item
 * lands in the largest remaining gap, creating optimal distribution.
 *
 * @param existingCount - Number of calendars already imported
 * @returns A color from CALENDAR_COLORS with optimal distribution
 */
export function getNextCalendarColor(existingCount: number): string {
  // Golden ratio conjugate (1/φ ≈ 0.618)
  const goldenRatioConjugate = 0.6180339887498949;

  // Multiply by golden ratio and take fractional part
  // This distributes indices optimally across the palette
  const fractional = (existingCount * goldenRatioConjugate) % 1;

  // Map to palette index
  const index = Math.floor(fractional * CALENDAR_COLORS.length);

  return CALENDAR_COLORS[index];
}
