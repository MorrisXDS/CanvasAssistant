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
 * Calendar-specific color palette
 * Used for imported calendars and custom calendar events
 * (Different from course colors for visual distinction)
 */
export const CALENDAR_COLORS = [
  '#6366F1', // Indigo
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#EF4444', // Red
  '#14B8A6', // Teal
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
export function getCourseColor(
  courseId: number,
  existingColor?: string | null
): string {
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
