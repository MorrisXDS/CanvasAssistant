/**
 * Tests for formatters module
 */

import {
  formatTimeAgo,
  formatDueDate,
  formatDaysUntilDue,
  getLetterGrade,
  formatGrade,
  formatGradeWithLetter,
  formatFileSize,
  truncateText,
  formatNumber,
  pluralize,
  getUrgencyLevel,
} from '../../../src/layers/l6-ui/constants/formatters';

describe('formatters', () => {
  describe('formatTimeAgo', () => {
    it('should return "Never" for null', () => {
      expect(formatTimeAgo(null)).toBe('Never');
    });

    it('should return "Just now" for very recent times', () => {
      const now = new Date();
      expect(formatTimeAgo(now.toISOString())).toBe('Just now');
    });

    it('should return minutes ago for recent times', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      expect(formatTimeAgo(thirtyMinsAgo.toISOString())).toBe('30m ago');
    });

    it('should return hours ago for times within 24 hours', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      expect(formatTimeAgo(fiveHoursAgo.toISOString())).toBe('5h ago');
    });

    it('should return days ago for times within a week', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatTimeAgo(threeDaysAgo.toISOString())).toBe('3d ago');
    });

    it('should return formatted date for times over a week', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const result = formatTimeAgo(twoWeeksAgo.toISOString());
      // Should be in format like "Jan 15"
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    });
  });

  describe('formatDueDate', () => {
    it('should return "No due date" for null', () => {
      expect(formatDueDate(null, null)).toBe('No due date');
    });

    it('should return "Due today" for 0 days', () => {
      expect(formatDueDate('2024-01-15T23:59:00Z', 0)).toBe('Due today');
    });

    it('should return "Due tomorrow" for 1 day', () => {
      expect(formatDueDate('2024-01-16T23:59:00Z', 1)).toBe('Due tomorrow');
    });

    it('should return days until due for 2-7 days', () => {
      expect(formatDueDate('2024-01-18T23:59:00Z', 3)).toBe('Due in 3 days');
    });

    it('should return short overdue format by default', () => {
      expect(formatDueDate('2024-01-12T23:59:00Z', -3)).toBe('3d overdue');
    });

    it('should return long overdue format when specified', () => {
      expect(formatDueDate('2024-01-12T23:59:00Z', -3, { shortOverdue: false })).toBe(
        '3 days overdue'
      );
    });
  });

  describe('formatDaysUntilDue', () => {
    it('should return "No due date" for null', () => {
      expect(formatDaysUntilDue(null)).toBe('No due date');
    });

    it('should return "Today" for 0', () => {
      expect(formatDaysUntilDue(0)).toBe('Today');
    });

    it('should return "Tomorrow" for 1', () => {
      expect(formatDaysUntilDue(1)).toBe('Tomorrow');
    });

    it('should return days for positive numbers', () => {
      expect(formatDaysUntilDue(5)).toBe('5 days');
    });

    it('should return overdue for negative numbers', () => {
      expect(formatDaysUntilDue(-2)).toBe('2 days overdue');
    });

    it('should handle singular overdue', () => {
      expect(formatDaysUntilDue(-1)).toBe('1 day overdue');
    });
  });

  describe('getLetterGrade', () => {
    it('should return A+ for 90+', () => {
      expect(getLetterGrade(90)).toBe('A+');
      expect(getLetterGrade(95)).toBe('A+');
      expect(getLetterGrade(100)).toBe('A+');
    });

    it('should return A for 85-89', () => {
      expect(getLetterGrade(85)).toBe('A');
      expect(getLetterGrade(89)).toBe('A');
    });

    it('should return A- for 80-84', () => {
      expect(getLetterGrade(80)).toBe('A-');
      expect(getLetterGrade(84)).toBe('A-');
    });

    it('should return B+ for 77-79', () => {
      expect(getLetterGrade(77)).toBe('B+');
    });

    it('should return B for 73-76', () => {
      expect(getLetterGrade(73)).toBe('B');
    });

    it('should return B- for 70-72', () => {
      expect(getLetterGrade(70)).toBe('B-');
    });

    it('should return F for below 50', () => {
      expect(getLetterGrade(49)).toBe('F');
      expect(getLetterGrade(0)).toBe('F');
    });
  });

  describe('formatGrade', () => {
    it('should return "-" for null', () => {
      expect(formatGrade(null)).toBe('-');
    });

    it('should format with 1 decimal by default', () => {
      expect(formatGrade(85.5)).toBe('85.5%');
    });

    it('should format with specified decimals', () => {
      expect(formatGrade(85.567, 2)).toBe('85.57%');
      expect(formatGrade(85.5, 0)).toBe('86%');
    });
  });

  describe('formatGradeWithLetter', () => {
    it('should return "-" for null', () => {
      expect(formatGradeWithLetter(null)).toBe('-');
    });

    it('should format grade with letter', () => {
      expect(formatGradeWithLetter(85)).toBe('85.0% (A)');
      expect(formatGradeWithLetter(92)).toBe('92.0% (A+)');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format KB', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format MB', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
    });

    it('should format GB', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    it('should truncate long text with ellipsis', () => {
      expect(truncateText('Hello World', 5)).toBe('Hello...');
    });

    it('should handle exact length', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with commas', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('1,000,000');
    });

    it('should handle small numbers', () => {
      expect(formatNumber(100)).toBe('100');
    });
  });

  describe('pluralize', () => {
    it('should return singular for count 1', () => {
      expect(pluralize(1, 'item')).toBe('1 item');
    });

    it('should return plural for count > 1', () => {
      expect(pluralize(3, 'item')).toBe('3 items');
    });

    it('should return plural for count 0', () => {
      expect(pluralize(0, 'item')).toBe('0 items');
    });

    it('should use custom plural', () => {
      expect(pluralize(2, 'person', 'people')).toBe('2 people');
    });
  });

  describe('getUrgencyLevel', () => {
    it('should return default for null', () => {
      expect(getUrgencyLevel(null)).toBe('default');
    });

    it('should return danger for overdue', () => {
      expect(getUrgencyLevel(-1)).toBe('danger');
    });

    it('should return danger for due today', () => {
      expect(getUrgencyLevel(0)).toBe('danger');
    });

    it('should return warning for due tomorrow', () => {
      expect(getUrgencyLevel(1)).toBe('warning');
    });

    it('should return warning for due within 3 days', () => {
      expect(getUrgencyLevel(3)).toBe('warning');
    });

    it('should return info for due in more than 3 days', () => {
      expect(getUrgencyLevel(5)).toBe('info');
    });
  });
});
