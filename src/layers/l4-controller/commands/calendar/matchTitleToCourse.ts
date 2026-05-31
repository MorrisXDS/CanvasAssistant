/**
 * matchTitleToCourse — pure heuristic that maps an imported calendar event's
 * title to a local course id, or null when nothing matches.
 *
 * Extracted verbatim from calendarCrudHandlers (ADR-0007 migration) so it
 * can be unit-tested directly. Priority (first match wins):
 *   1. full course code (e.g. "ECE568H1 S LEC0102")
 *   2. same section type (PRA/LEC/TUT) + base code
 *   3. code without section
 *   4. short code without term indicator
 *   5. user-set nickname
 *   6. significant words from the course name
 */

export interface CalendarMatchCourse {
  id: number;
  code: string;
  name: string;
  nickname: string | null;
}

export function matchTitleToCourse(
  title: string,
  courses: CalendarMatchCourse[]
): number | null {
  if (!title || courses.length === 0) return null;
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

  return null;
}
