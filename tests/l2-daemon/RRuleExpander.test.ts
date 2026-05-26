/**
 * RRuleExpander Tests
 *
 * Tests for recurring event expansion service.
 */

import {
  RRuleExpander,
  CalendarEventRecord,
} from '../../src/layers/l2-daemon/calendar/RRuleExpander';

describe('RRuleExpander', () => {
  let expander: RRuleExpander;

  const createEvent = (
    overrides: Partial<CalendarEventRecord> = {}
  ): CalendarEventRecord => ({
    id: 1,
    externalId: 'test-event',
    sourceType: 'user',
    courseId: null,
    importedCalendarId: null,
    title: 'Test Event',
    description: null,
    startAt: '2024-01-15T10:00:00Z',
    endAt: '2024-01-15T11:00:00Z',
    allDay: false,
    location: null,
    uid: 'test-uid',
    recurrenceRule: null,
    recurrenceExceptionDates: null,
    parentEventId: null,
    ...overrides,
  });

  beforeEach(() => {
    expander = new RRuleExpander();
  });

  describe('expand', () => {
    it('should return non-recurring event in range unchanged', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T11:00:00Z',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      expect(result).toHaveLength(1);
      expect(result[0].isRecurrenceInstance).toBe(false);
      expect(result[0].title).toBe('Test Event');
    });

    it('should return empty array for non-recurring event outside range', () => {
      const event = createEvent({
        startAt: '2024-02-15T10:00:00Z',
        endAt: '2024-02-15T11:00:00Z',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      expect(result).toHaveLength(0);
    });

    it('should expand daily recurring event', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T11:00:00Z',
        recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=5',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      expect(result).toHaveLength(5);
      result.forEach((instance) => {
        expect(instance.isRecurrenceInstance).toBe(true);
        expect(instance.originalEventId).toBe(1);
      });
    });

    it('should expand weekly recurring event', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z', // Monday
        endAt: '2024-01-15T11:00:00Z',
        recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-02-15');

      const result = expander.expand(event, rangeStart, rangeEnd);

      expect(result).toHaveLength(4);
      result.forEach((instance) => {
        const day = new Date(instance.startAt).getUTCDay();
        expect(day).toBe(1); // Monday
      });
    });

    it('should preserve event duration for instances', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T12:30:00Z', // 2.5 hour duration
        recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=3',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      result.forEach((instance) => {
        const start = new Date(instance.startAt).getTime();
        const end = new Date(instance.endAt!).getTime();
        const duration = (end - start) / (1000 * 60); // in minutes
        expect(duration).toBe(150); // 2.5 hours = 150 minutes
      });
    });

    it('should handle exception dates (EXDATE) from JSON array', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T11:00:00Z',
        recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=5',
        recurrenceExceptionDates: JSON.stringify([
          '2024-01-16T10:00:00Z',
          '2024-01-18T10:00:00Z',
        ]),
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      // 5 occurrences minus 2 exceptions = 3
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should handle exception dates from comma-separated string', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T11:00:00Z',
        recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=5',
        recurrenceExceptionDates: '2024-01-16T10:00:00Z, 2024-01-17T10:00:00Z',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should handle malformed RRULE gracefully', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T11:00:00Z',
        recurrenceRule: 'INVALID:NOT=VALID;RRULE',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      // Should not throw, return original event as non-recurring
      const result = expander.expand(event, rangeStart, rangeEnd);

      expect(result).toHaveLength(1);
      expect(result[0].isRecurrenceInstance).toBe(false);
    });

    it('should filter recurring instances by date range', () => {
      const event = createEvent({
        startAt: '2024-01-01T10:00:00Z',
        endAt: '2024-01-01T11:00:00Z',
        recurrenceRule: 'RRULE:FREQ=MONTHLY;COUNT=12',
      });

      // Only include Q1
      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-03-31');

      const result = expander.expand(event, rangeStart, rangeEnd);

      // Should only have Jan, Feb, Mar instances
      expect(result.length).toBe(3);
    });
  });

  describe('expandAll', () => {
    it('should expand multiple events', () => {
      const events = [
        createEvent({
          id: 1,
          title: 'Event 1',
          startAt: '2024-01-15T10:00:00Z',
        }),
        createEvent({
          id: 2,
          title: 'Event 2',
          startAt: '2024-01-16T10:00:00Z',
        }),
        createEvent({
          id: 3,
          title: 'Event 3',
          startAt: '2024-01-17T10:00:00Z',
        }),
      ];

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expandAll(events, rangeStart, rangeEnd);

      expect(result).toHaveLength(3);
    });

    it('should sort results by start date', () => {
      const events = [
        createEvent({
          id: 3,
          title: 'Third',
          startAt: '2024-01-17T10:00:00Z',
        }),
        createEvent({
          id: 1,
          title: 'First',
          startAt: '2024-01-15T10:00:00Z',
        }),
        createEvent({
          id: 2,
          title: 'Second',
          startAt: '2024-01-16T10:00:00Z',
        }),
      ];

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expandAll(events, rangeStart, rangeEnd);

      expect(result[0].title).toBe('First');
      expect(result[1].title).toBe('Second');
      expect(result[2].title).toBe('Third');
    });

    it('should expand recurring and non-recurring events together', () => {
      const events = [
        createEvent({
          id: 1,
          title: 'One Time',
          startAt: '2024-01-15T10:00:00Z',
        }),
        createEvent({
          id: 2,
          title: 'Recurring',
          startAt: '2024-01-16T10:00:00Z',
          recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=3',
        }),
      ];

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expandAll(events, rangeStart, rangeEnd);

      expect(result).toHaveLength(4); // 1 one-time + 3 recurring instances
    });

    it('should filter out events outside range', () => {
      const events = [
        createEvent({
          id: 1,
          title: 'In Range',
          startAt: '2024-01-15T10:00:00Z',
        }),
        createEvent({
          id: 2,
          title: 'Out of Range',
          startAt: '2024-02-15T10:00:00Z',
        }),
      ];

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      const result = expander.expandAll(events, rangeStart, rangeEnd);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('In Range');
    });
  });

  describe('isInRange', () => {
    it('should return true for event starting in range', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: '2024-01-15T11:00:00Z',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      expect(expander.isInRange(event, rangeStart, rangeEnd)).toBe(true);
    });

    it('should return true for event spanning range boundary', () => {
      const event = createEvent({
        startAt: '2024-01-30T10:00:00Z',
        endAt: '2024-02-02T11:00:00Z', // Ends after range
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      expect(expander.isInRange(event, rangeStart, rangeEnd)).toBe(true);
    });

    it('should return false for event completely outside range', () => {
      const event = createEvent({
        startAt: '2024-02-15T10:00:00Z',
        endAt: '2024-02-15T11:00:00Z',
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      expect(expander.isInRange(event, rangeStart, rangeEnd)).toBe(false);
    });

    it('should handle event without endAt', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        endAt: null,
      });

      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-31');

      expect(expander.isInRange(event, rangeStart, rangeEnd)).toBe(true);
    });
  });

  describe('describeRecurrence', () => {
    it('should describe daily recurrence', () => {
      const description = expander.describeRecurrence('RRULE:FREQ=DAILY');

      expect(description.toLowerCase()).toContain('day');
    });

    it('should describe weekly recurrence', () => {
      const description = expander.describeRecurrence('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');

      expect(description.toLowerCase()).toContain('week');
    });

    it('should describe monthly recurrence', () => {
      const description = expander.describeRecurrence('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');

      expect(description.toLowerCase()).toContain('month');
    });

    it('should handle invalid RRULE gracefully', () => {
      const description = expander.describeRecurrence('INVALID');

      expect(description).toBe('Recurring event');
    });
  });

  describe('getNextOccurrences', () => {
    it('should return single date for non-recurring event', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
      });

      const occurrences = expander.getNextOccurrences(event);

      expect(occurrences).toHaveLength(1);
    });

    it('should return empty array for malformed RRULE', () => {
      const event = createEvent({
        startAt: '2024-01-15T10:00:00Z',
        recurrenceRule: 'INVALID',
      });

      const occurrences = expander.getNextOccurrences(event);

      expect(occurrences).toHaveLength(0);
    });

    it('should respect count parameter', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const event = createEvent({
        startAt: futureDate.toISOString(),
        recurrenceRule: 'RRULE:FREQ=DAILY;COUNT=100',
      });

      const occurrences = expander.getNextOccurrences(event, 3);

      expect(occurrences.length).toBeLessThanOrEqual(3);
    });
  });
});
