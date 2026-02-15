/**
 * EventFormModal Helpers
 * Pure utility functions extracted from EventFormModal.tsx
 */

import { DateTime } from 'luxon';
import { getEffectiveTimezone } from '../../../l5-presentation/settings';

/** Minimal course shape needed for title matching */
interface CourseForMatching {
  id: number;
  code: string;
  name: string;
  nickname: string | null;
}

/**
 * Strip HTML tags and convert to plain text
 * Also extracts text from links and handles common HTML entities
 */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return '';

  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Get text content (strips all tags)
  let text = temp.textContent || temp.innerText || '';

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate if too long (keep first 500 chars)
  if (text.length > 500) {
    text = text.substring(0, 500) + '...';
  }

  return text;
}

/**
 * Format an ISO date string for datetime-local input, using effective timezone
 */
export function formatDateForInput(
  dateStr: string | null | undefined,
  allDay: boolean
): string {
  if (!dateStr) return '';
  const tz = getEffectiveTimezone();
  const dt = DateTime.fromISO(dateStr).setZone(tz);
  if (!dt.isValid) return '';

  if (allDay) {
    return dt.toFormat('yyyy-MM-dd');
  }
  // Format for datetime-local input (YYYY-MM-DDTHH:mm)
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Get default start date (next 15-min interval) in effective timezone
 */
export function getDefaultStartDate(): string {
  const tz = getEffectiveTimezone();
  let dt = DateTime.now().setZone(tz);
  // Round up to next 15-minute interval
  const minutes = Math.ceil(dt.minute / 15) * 15;
  dt = dt.set({ minute: minutes % 60, second: 0, millisecond: 0 });
  if (minutes >= 60) {
    dt = dt.plus({ hours: 1 });
  }
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Get default end date (1 hour after start) in effective timezone
 */
export function getDefaultEndDate(startDate: string): string {
  if (!startDate) return '';
  const tz = getEffectiveTimezone();
  // Parse the datetime-local format in effective timezone
  const dt = DateTime.fromFormat(startDate, "yyyy-MM-dd'T'HH:mm", { zone: tz });
  if (!dt.isValid) return '';
  return dt.plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Convert datetime-local input value to UTC ISO string for storage
 * This interprets the input in the user's effective timezone
 */
export function inputToUTC(inputValue: string, allDay: boolean = false): string {
  if (!inputValue) return '';
  const tz = getEffectiveTimezone();

  let dt: DateTime;
  if (allDay) {
    // Date-only input: treat as start of day in effective timezone
    dt = DateTime.fromFormat(inputValue, 'yyyy-MM-dd', { zone: tz }).startOf('day');
  } else {
    // Datetime input: parse in effective timezone
    dt = DateTime.fromFormat(inputValue, "yyyy-MM-dd'T'HH:mm", { zone: tz });
  }

  if (!dt.isValid) return '';
  return dt.toUTC().toISO() || '';
}

/**
 * Try to match event title to a course using prioritized criteria (if-else chain)
 * Priority: full code > section type match > code without section > short code > nickname > name keywords
 */
export function matchTitleToCourse(
  title: string,
  courses: CourseForMatching[]
): number | undefined {
  if (!title || courses.length === 0) return undefined;
  const titleUpper = title.toUpperCase();

  // Extract section type from title (PRA, LEC, TUT)
  const titleSectionMatch = titleUpper.match(/\b(PRA|LEC|TUT)\d*/);
  const titleSectionType = titleSectionMatch ? titleSectionMatch[1] : null;

  // Pass 1: Try full course code with section (e.g., "ECE568H1 S LEC0102")
  for (const course of courses) {
    if (course.code) {
      const codeUpper = course.code.toUpperCase();
      if (titleUpper.includes(codeUpper)) {
        return course.id;
      }
    }
  }

  // Pass 2: If title has section type (PRA/LEC/TUT), prefer courses with same section type
  if (titleSectionType) {
    for (const course of courses) {
      if (course.code) {
        const codeUpper = course.code.toUpperCase();
        // Check if course code contains the same section type
        if (codeUpper.includes(titleSectionType)) {
          // Also verify the base course code matches
          const shortCodeMatch = codeUpper.match(/^([A-Z]{2,4}\d{2,4})/);
          if (shortCodeMatch && titleUpper.includes(shortCodeMatch[1])) {
            return course.id;
          }
        }
      }
    }
  }

  // Pass 3: Try code without section (e.g., "ECE568H1" from "ECE568H1 S")
  for (const course of courses) {
    if (course.code) {
      const codeUpper = course.code.toUpperCase();
      const codeWithoutSection = codeUpper.split(/\s+/)[0];
      if (codeWithoutSection !== codeUpper && titleUpper.includes(codeWithoutSection)) {
        return course.id;
      }
    }
  }

  // Pass 4: Try short code without term indicator (e.g., "ECE568" from "ECE568H1")
  for (const course of courses) {
    if (course.code) {
      const codeUpper = course.code.toUpperCase();
      const shortCodeMatch = codeUpper.match(/^([A-Z]{2,4}\d{2,4})/);
      if (shortCodeMatch && titleUpper.includes(shortCodeMatch[1])) {
        return course.id;
      }
    }
  }

  // Pass 5: Try nickname (user-set)
  for (const course of courses) {
    if (course.nickname) {
      const nicknameUpper = course.nickname.toUpperCase();
      if (nicknameUpper.length >= 3 && titleUpper.includes(nicknameUpper)) {
        return course.id;
      }
    }
  }

  // Pass 6: Try significant words from course name (least specific)
  const commonWords = new Set([
    'AND',
    'THE',
    'FOR',
    'WITH',
    'INTO',
    'FROM',
    'COURSE',
    'INTRODUCTION',
    'INTRO',
    'ADVANCED',
    'TOPICS',
    'SELECTED',
  ]);
  for (const course of courses) {
    if (course.name) {
      const nameWords = course.name
        .toUpperCase()
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !commonWords.has(w));

      for (const word of nameWords) {
        if (titleUpper.includes(word)) {
          return course.id;
        }
      }
    }
  }

  return undefined;
}
