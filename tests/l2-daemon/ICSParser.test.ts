/**
 * ICSParser Tests
 *
 * Tests for the ICS (iCalendar) parser service.
 */

import { ICSParser } from '../../src/layers/l2-daemon/ICSParser';

describe('ICSParser', () => {
  let parser: ICSParser;

  beforeEach(() => {
    parser = new ICSParser();
  });

  describe('parse', () => {
    it('should parse a simple event', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-event-1
SUMMARY:Test Event
DTSTART:20240115T100000Z
DTEND:20240115T110000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].uid).toBe('test-event-1');
      expect(result.events[0].summary).toBe('Test Event');
      expect(result.events[0].dtstart).toBeInstanceOf(Date);
      expect(result.events[0].dtend).toBeInstanceOf(Date);
      expect(result.events[0].allDay).toBe(false);
    });

    it('should parse all-day events', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:all-day-1
SUMMARY:All Day Event
DTSTART;VALUE=DATE:20240115
DTEND;VALUE=DATE:20240116
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].allDay).toBe(true);
      expect(result.events[0].dtstart?.getFullYear()).toBe(2024);
      expect(result.events[0].dtstart?.getMonth()).toBe(0); // January
      expect(result.events[0].dtstart?.getDate()).toBe(15);
    });

    it('should parse calendar name and timezone', () => {
      const ics = `BEGIN:VCALENDAR
X-WR-CALNAME:My Calendar
X-WR-TIMEZONE:America/Toronto
BEGIN:VEVENT
UID:test-1
SUMMARY:Event
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.calendarName).toBe('My Calendar');
      expect(result.timezone).toBe('America/Toronto');
    });

    it('should parse event description and location', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Meeting
DESCRIPTION:This is the meeting description
LOCATION:Room 101
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events[0].description).toBe('This is the meeting description');
      expect(result.events[0].location).toBe('Room 101');
    });

    it('should parse recurrence rules', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:recurring-1
SUMMARY:Weekly Meeting
DTSTART:20240115T100000Z
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events[0].rrule).toBe('FREQ=WEEKLY;BYDAY=MO;COUNT=10');
    });

    it('should parse exception dates (EXDATE)', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:recurring-1
SUMMARY:Weekly Meeting
DTSTART:20240115T100000Z
RRULE:FREQ=WEEKLY
EXDATE:20240122T100000Z
EXDATE:20240129T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events[0].exdates).toHaveLength(2);
    });

    it('should parse sequence number', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Event
DTSTART:20240115T100000Z
SEQUENCE:3
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events[0].sequence).toBe(3);
    });

    it('should handle line folding', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:This is a very long summary that has been
 folded across multiple lines
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      // Line folding removes the CRLF + space, joining lines directly
      // The space before "folded" comes from the folding continuation, not the content
      expect(result.events[0].summary).toBe(
        'This is a very long summary that has beenfolded across multiple lines'
      );
    });

    it('should unescape text values', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Event with\\, comma and\\; semicolon
DESCRIPTION:Line 1\\nLine 2\\nLine 3
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events[0].summary).toBe('Event with, comma and; semicolon');
      expect(result.events[0].description).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should parse multiple events', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-1
SUMMARY:First Event
DTSTART:20240115T100000Z
END:VEVENT
BEGIN:VEVENT
UID:event-2
SUMMARY:Second Event
DTSTART:20240116T100000Z
END:VEVENT
BEGIN:VEVENT
UID:event-3
SUMMARY:Third Event
DTSTART:20240117T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events).toHaveLength(3);
      expect(result.events[0].uid).toBe('event-1');
      expect(result.events[1].uid).toBe('event-2');
      expect(result.events[2].uid).toBe('event-3');
    });

    it('should warn and skip events missing UID', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Missing UID Event
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn and skip events missing DTSTART', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Missing DTSTART Event
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.events).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should parse UTC datetime correctly', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:UTC Event
DTSTART:20240115T120000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);
      const dtstart = result.events[0].dtstart!;

      expect(dtstart.getUTCFullYear()).toBe(2024);
      expect(dtstart.getUTCMonth()).toBe(0);
      expect(dtstart.getUTCDate()).toBe(15);
      expect(dtstart.getUTCHours()).toBe(12);
      expect(dtstart.getUTCMinutes()).toBe(0);
    });

    it('should handle TZID parameter', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Timezone Event
DTSTART;TZID=America/Toronto:20240115T120000
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      // The parser treats TZID as local time
      expect(result.events[0].dtstart).toBeInstanceOf(Date);
      expect(result.events[0].allDay).toBe(false);
    });

    it('should handle empty content', () => {
      const result = parser.parse('');

      expect(result.events).toHaveLength(0);
      expect(result.calendarName).toBeNull();
      expect(result.timezone).toBeNull();
    });

    it('should handle CRLF line endings', () => {
      const ics =
        'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test-1\r\nSUMMARY:CRLF Event\r\nDTSTART:20240115T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';

      const result = parser.parse(ics);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].summary).toBe('CRLF Event');
    });

    it('should extract TZID from VTIMEZONE if X-WR-TIMEZONE missing', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VTIMEZONE
TZID:Europe/London
END:VTIMEZONE
BEGIN:VEVENT
UID:test-1
SUMMARY:Event
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const result = parser.parse(ics);

      expect(result.timezone).toBe('Europe/London');
    });
  });

  describe('createPreview', () => {
    it('should create preview with calendar name from ICS', () => {
      const ics = `BEGIN:VCALENDAR
X-WR-CALNAME:My Schedule
BEGIN:VEVENT
UID:test-1
SUMMARY:Event
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const preview = parser.createPreview(ics, 'schedule.ics');

      expect(preview.calendarName).toBe('My Schedule');
      expect(preview.filename).toBe('schedule.ics');
    });

    it('should use filename as calendar name if not in ICS', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Event
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const preview = parser.createPreview(ics, 'my-calendar.ics');

      expect(preview.calendarName).toBe('my-calendar');
    });

    it('should detect recurring events', () => {
      const icsWithRecurring = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:Weekly
DTSTART:20240115T100000Z
RRULE:FREQ=WEEKLY
END:VEVENT
END:VCALENDAR`;

      const icsWithoutRecurring = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
SUMMARY:One Time
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const previewWith = parser.createPreview(icsWithRecurring, 'test.ics');
      const previewWithout = parser.createPreview(icsWithoutRecurring, 'test.ics');

      expect(previewWith.hasRecurringEvents).toBe(true);
      expect(previewWithout.hasRecurringEvents).toBe(false);
    });

    it('should calculate date range', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-1
SUMMARY:First
DTSTART:20240115T100000Z
END:VEVENT
BEGIN:VEVENT
UID:event-2
SUMMARY:Middle
DTSTART:20240120T100000Z
END:VEVENT
BEGIN:VEVENT
UID:event-3
SUMMARY:Last
DTSTART:20240125T100000Z
END:VEVENT
END:VCALENDAR`;

      const preview = parser.createPreview(ics, 'test.ics');

      expect(preview.dateRange).not.toBeNull();
      expect(preview.dateRange!.start.getUTCDate()).toBe(15);
      expect(preview.dateRange!.end.getUTCDate()).toBe(25);
    });

    it('should return null dateRange for empty events', () => {
      const ics = `BEGIN:VCALENDAR
END:VCALENDAR`;

      const preview = parser.createPreview(ics, 'empty.ics');

      expect(preview.dateRange).toBeNull();
    });

    it('should include warnings in preview', () => {
      const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Missing UID
DTSTART:20240115T100000Z
END:VEVENT
END:VCALENDAR`;

      const preview = parser.createPreview(ics, 'test.ics');

      expect(preview.warnings.length).toBeGreaterThan(0);
    });
  });
});
