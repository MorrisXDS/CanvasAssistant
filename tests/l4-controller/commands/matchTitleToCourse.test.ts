/**
 * matchTitleToCourse tests (ADR-0007 — calendarCrudHandlers migration).
 *
 * Pure heuristic; exercises each priority pass and the no-match path.
 */

import {
  matchTitleToCourse,
  type CalendarMatchCourse,
} from '../../../src/layers/l4-controller/commands/calendar/matchTitleToCourse';

const ece: CalendarMatchCourse = {
  id: 1,
  code: 'ECE568H1 S LEC0102',
  name: 'Computer Security',
  nickname: 'Sec',
};
const mat: CalendarMatchCourse = {
  id: 2,
  code: 'MAT201H1 F',
  name: 'Linear Algebra',
  nickname: null,
};

describe('matchTitleToCourse', () => {
  test('returns null for empty title or empty course list', () => {
    expect(matchTitleToCourse('', [ece])).toBeNull();
    expect(matchTitleToCourse('anything', [])).toBeNull();
  });

  test('Pass 1: matches full course code', () => {
    expect(matchTitleToCourse('ECE568H1 S LEC0102 - Lecture', [ece, mat])).toBe(1);
  });

  test('Pass 2: matches by section type + base code when full code differs', () => {
    const courses: CalendarMatchCourse[] = [
      { id: 5, code: 'ECE568H1 LEC0101', name: 'Security', nickname: null },
    ];
    // Title has LEC and the base code ECE568, but not the full "ECE568H1 LEC0101"
    expect(matchTitleToCourse('ECE568 LEC weekly', courses)).toBe(5);
  });

  test('Pass 3: matches code without section', () => {
    const courses: CalendarMatchCourse[] = [
      { id: 7, code: 'PHY110H1 S', name: 'Physics', nickname: null },
    ];
    expect(matchTitleToCourse('PHY110H1 midterm', courses)).toBe(7);
  });

  test('Pass 4: matches short code without term indicator', () => {
    const courses: CalendarMatchCourse[] = [
      { id: 9, code: 'CHM135H1', name: 'Chemistry', nickname: null },
    ];
    expect(matchTitleToCourse('CHM135 lab', courses)).toBe(9);
  });

  test('Pass 5: matches user nickname (>= 3 chars)', () => {
    const courses: CalendarMatchCourse[] = [
      { id: 11, code: 'XYZ999Q9', name: 'Obscure', nickname: 'Algo' },
    ];
    expect(matchTitleToCourse('Algo problem set', courses)).toBe(11);
  });

  test('Pass 6: matches a significant word from the course name', () => {
    const courses: CalendarMatchCourse[] = [
      { id: 13, code: 'QQQ111Z1', name: 'Thermodynamics Seminar', nickname: null },
    ];
    expect(matchTitleToCourse('Weekly Thermodynamics review', courses)).toBe(13);
  });

  test('ignores common filler words in name matching', () => {
    const courses: CalendarMatchCourse[] = [
      { id: 15, code: 'WWW222Y2', name: 'Introduction Course', nickname: null },
    ];
    // "INTRODUCTION" and "COURSE" are both filler → no match
    expect(matchTitleToCourse('Introduction to the course', courses)).toBeNull();
  });

  test('returns null when nothing matches', () => {
    expect(matchTitleToCourse('Dentist appointment', [ece, mat])).toBeNull();
  });
});
