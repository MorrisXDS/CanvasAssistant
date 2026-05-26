/**
 * DateUtils.test.ts - Tests for timezone-aware date utilities
 */

import { DateTime, Settings } from 'luxon';
import {
  getDaysUntilDue,
  getHoursUntilDue,
  isToday,
  isTomorrow,
  formatDate,
  formatTime,
  formatDateTime,
  getCurrentTimezoneAbbr,
  getCurrentTimezoneOffset,
  isInDST,
  toStartOfDay,
  toEndOfDay,
  getMsUntil,
  parseISO,
  now,
} from '../../src/layers/l0-utilities/DateUtils';

describe('DateUtils', () => {
  describe('getDaysUntilDue', () => {
    it('should return null for null input', () => {
      expect(getDaysUntilDue(null)).toBeNull();
    });

    it('should return positive days for future date', () => {
      const futureDate = DateTime.local().plus({ days: 5 }).toISO();
      const result = getDaysUntilDue(futureDate);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(5, 0);
    });

    it('should return negative days for past date', () => {
      const pastDate = DateTime.local().minus({ days: 2 }).toISO();
      const result = getDaysUntilDue(pastDate);
      expect(result).toBeLessThan(0);
      expect(result).toBeCloseTo(-2, 0);
    });

    it('should return null for invalid date', () => {
      expect(getDaysUntilDue('not-a-date')).toBeNull();
    });

    it('should return 0 for today', () => {
      const today = DateTime.local().toISO();
      const result = getDaysUntilDue(today);
      expect(result).toBe(0);
    });
  });

  describe('getHoursUntilDue', () => {
    it('should return null for null input', () => {
      expect(getHoursUntilDue(null)).toBeNull();
    });

    it('should return positive hours for future date', () => {
      const futureDate = DateTime.local().plus({ hours: 5 }).toISO();
      const result = getHoursUntilDue(futureDate);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeCloseTo(5, 0);
    });

    it('should return negative hours for past date', () => {
      const pastDate = DateTime.local().minus({ hours: 3 }).toISO();
      const result = getHoursUntilDue(pastDate);
      expect(result).toBeLessThan(0);
      expect(result).toBeCloseTo(-3, 0);
    });

    it('should return null for invalid date', () => {
      expect(getHoursUntilDue('invalid-date')).toBeNull();
    });
  });

  describe('isToday', () => {
    it("should return true for today's date", () => {
      const today = DateTime.local().toISO();
      expect(isToday(today!)).toBe(true);
    });

    it('should return false for yesterday', () => {
      const yesterday = DateTime.local().minus({ days: 1 }).toISO();
      expect(isToday(yesterday!)).toBe(false);
    });

    it('should return false for tomorrow', () => {
      const tomorrow = DateTime.local().plus({ days: 1 }).toISO();
      expect(isToday(tomorrow!)).toBe(false);
    });
  });

  describe('isTomorrow', () => {
    it("should return true for tomorrow's date", () => {
      const tomorrow = DateTime.local().plus({ days: 1 }).toISO();
      expect(isTomorrow(tomorrow!)).toBe(true);
    });

    it('should return false for today', () => {
      const today = DateTime.local().toISO();
      expect(isTomorrow(today!)).toBe(false);
    });

    it('should return false for day after tomorrow', () => {
      const dayAfter = DateTime.local().plus({ days: 2 }).toISO();
      expect(isTomorrow(dayAfter!)).toBe(false);
    });
  });

  describe('formatDate', () => {
    it('should format date with default format', () => {
      const date = DateTime.local().toISO();
      const result = formatDate(date!);
      expect(result).toBeTruthy();
      expect(result).toContain(',');
      expect(result).not.toBe('Invalid date');
    });

    it('should format date with custom format', () => {
      const date = DateTime.local().toISO();
      const result = formatDate(date!, 'yyyy-MM-dd');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should return "Invalid date" for invalid input', () => {
      expect(formatDate('not-a-date')).toBe('Invalid date');
    });
  });

  describe('formatTime', () => {
    it('should format time correctly with AM/PM', () => {
      const date = DateTime.local().toISO();
      const result = formatTime(date!);
      expect(result).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
    });

    it('should return "Invalid time" for invalid input', () => {
      expect(formatTime('invalid')).toBe('Invalid time');
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time correctly', () => {
      const date = DateTime.local().toISO();
      const result = formatDateTime(date!);
      expect(result).toBeTruthy();
      expect(result).toContain(',');
      expect(result).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
      expect(result).not.toBe('Invalid date');
    });

    it('should return "Invalid date" for invalid input', () => {
      expect(formatDateTime('bad-date')).toBe('Invalid date');
    });
  });

  describe('toStartOfDay', () => {
    it('should set hour, minute, and second to 0', () => {
      const date = DateTime.local().set({ hour: 15, minute: 30, second: 45 }).toISO();
      const result = toStartOfDay(date!);
      expect(result.hour).toBe(0);
      expect(result.minute).toBe(0);
      expect(result.second).toBe(0);
    });
  });

  describe('toEndOfDay', () => {
    it('should set to end of day', () => {
      const date = DateTime.local().set({ hour: 10, minute: 15, second: 30 }).toISO();
      const result = toEndOfDay(date!);
      expect(result.hour).toBe(23);
      expect(result.minute).toBe(59);
      expect(result.second).toBe(59);
    });
  });

  describe('parseISO', () => {
    it('should handle ISO strings with timezone', () => {
      const isoDate = '2025-03-15T14:30:00-05:00';
      const result = parseISO(isoDate);
      expect(result.isValid).toBe(true);
      expect(result.year).toBe(2025);
      expect(result.month).toBe(3);
      expect(result.day).toBe(15);
    });

    it('should convert to local timezone', () => {
      const isoDate = DateTime.utc().toISO();
      const result = parseISO(isoDate!);
      expect(result.isValid).toBe(true);
      // toLocal() resolves to the actual timezone name (e.g., 'America/Toronto'), not 'local'
      expect(result.offset).toBe(DateTime.local().offset);
    });
  });

  describe('now', () => {
    it('should return a DateTime close to current time', () => {
      const before = DateTime.local().toMillis();
      const result = now();
      const after = DateTime.local().toMillis();

      const resultMs = result.toMillis();
      expect(resultMs).toBeGreaterThanOrEqual(before);
      expect(resultMs).toBeLessThanOrEqual(after);
    });

    it('should return a valid DateTime', () => {
      const result = now();
      expect(result.isValid).toBe(true);
    });
  });

  describe('getMsUntil', () => {
    it('should return positive milliseconds for future date', () => {
      const futureDate = DateTime.local().plus({ seconds: 10 }).toISO();
      const result = getMsUntil(futureDate!);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(10000);
    });

    it('should return negative milliseconds for past date', () => {
      const pastDate = DateTime.local().minus({ seconds: 5 }).toISO();
      const result = getMsUntil(pastDate!);
      expect(result).toBeLessThan(0);
      expect(result).toBeGreaterThanOrEqual(-5100);
    });
  });

  describe('getCurrentTimezoneAbbr', () => {
    it('should return a non-empty string', () => {
      const result = getCurrentTimezoneAbbr();
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getCurrentTimezoneOffset', () => {
    it('should return string matching offset format', () => {
      const result = getCurrentTimezoneOffset();
      expect(result).toMatch(/^[+-]\d{2}:\d{2}$/);
    });
  });

  describe('isInDST', () => {
    it('should return a boolean value', () => {
      const result = isInDST();
      expect(typeof result).toBe('boolean');
    });
  });
});
