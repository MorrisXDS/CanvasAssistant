/**
 * ICS Parser Service
 * Parses ICS (iCalendar) files into structured events
 *
 * Handles:
 * - VEVENT parsing with all standard properties
 * - RRULE recurrence rules
 * - EXDATE exception dates
 * - Timezone handling
 * - Line folding (continuation)
 */

import crypto from 'crypto';
import { DateTime } from 'luxon';

export interface ParsedICSEvent {
  uid: string;
  summary: string;
  description: string | null;
  dtstart: Date | null;
  dtend: Date | null;
  allDay: boolean;
  location: string | null;
  rrule: string | null;
  exdates: string[] | null;
  sequence: number;
}

export interface ICSParserResult {
  calendarName: string | null;
  timezone: string | null;
  version: string;
  events: ParsedICSEvent[];
  warnings: string[];
}

export interface ICSImportPreview {
  calendarName: string;
  filename: string;
  events: ParsedICSEvent[];
  hasRecurringEvents: boolean;
  dateRange: { start: Date; end: Date } | null;
  warnings: string[];
}

/**
 * Parse ICS content into structured calendar data
 */
export class ICSParser {
  private warnings: string[] = [];
  private calendarTimezone: string | null = null;

  /**
   * Parse ICS content string
   */
  parse(content: string): ICSParserResult {
    this.warnings = [];
    this.calendarTimezone = null;

    // Unfold lines (RFC 5545: lines can be folded with CRLF + whitespace)
    const unfolded = content.replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);

    let calendarName: string | null = null;
    let timezone: string | null = null;
    let version: string = '2.0'; // Default ICS version
    const events: ParsedICSEvent[] = [];

    let currentEvent: Partial<ParsedICSEvent> | null = null;
    let inEvent = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Calendar-level properties
      if (line.startsWith('X-WR-CALNAME:')) {
        calendarName = this.unescapeText(line.substring(13));
      } else if (line.startsWith('X-WR-TIMEZONE:')) {
        timezone = line.substring(14);
        this.calendarTimezone = timezone; // Store for use in parseDateTime
      } else if (line.startsWith('TZID:') && !timezone) {
        timezone = line.substring(5);
        this.calendarTimezone = timezone; // Store for use in parseDateTime
      } else if (line.startsWith('VERSION:')) {
        version = line.substring(8);
      }

      // Event parsing
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        currentEvent = {
          uid: '',
          summary: '',
          description: null,
          dtstart: null,
          dtend: null,
          allDay: false,
          location: null,
          rrule: null,
          exdates: null,
          sequence: 0,
        };
      } else if (line === 'END:VEVENT' && currentEvent && inEvent) {
        // Validate and add event
        if (currentEvent.uid && currentEvent.dtstart) {
          events.push(currentEvent as ParsedICSEvent);
        } else {
          this.warnings.push(`Event at line ${i} missing required UID or DTSTART`);
        }
        currentEvent = null;
        inEvent = false;
      } else if (inEvent && currentEvent) {
        this.parseEventProperty(line, currentEvent);
      }
    }

    return {
      calendarName,
      timezone,
      version,
      events,
      warnings: this.warnings,
    };
  }

  /**
   * Parse a single event property line
   */
  private parseEventProperty(line: string, event: Partial<ParsedICSEvent>): void {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;

    const propertyPart = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);

    // Extract property name and parameters
    const semiIdx = propertyPart.indexOf(';');
    const propertyName =
      semiIdx === -1 ? propertyPart : propertyPart.substring(0, semiIdx);
    const params = semiIdx === -1 ? '' : propertyPart.substring(semiIdx + 1);

    switch (propertyName.toUpperCase()) {
      case 'UID':
        event.uid = value;
        break;

      case 'SUMMARY':
        event.summary = this.unescapeText(value);
        break;

      case 'DESCRIPTION':
        event.description = this.unescapeText(value);
        break;

      case 'LOCATION':
        event.location = this.unescapeText(value);
        break;

      case 'DTSTART': {
        const { date, allDay } = this.parseDateTime(value, params);
        event.dtstart = date;
        event.allDay = allDay;
        break;
      }

      case 'DTEND': {
        const { date } = this.parseDateTime(value, params);
        event.dtend = date;
        break;
      }

      case 'RRULE':
        event.rrule = value;
        break;

      case 'EXDATE': {
        const { date } = this.parseDateTime(value, params);
        if (date) {
          if (!event.exdates) event.exdates = [];
          event.exdates.push(date.toISOString());
        }
        break;
      }

      case 'SEQUENCE':
        event.sequence = parseInt(value, 10) || 0;
        break;
    }
  }

  /**
   * Parse ICS datetime value using luxon for proper timezone handling
   * Handles:
   * - DATE (all-day): 20240115
   * - DATETIME local: 20240115T120000
   * - DATETIME UTC: 20240115T120000Z
   * - DATETIME with TZID: TZID=America/Toronto:20240115T120000
   */
  private parseDateTime(
    value: string,
    params: string
  ): { date: Date | null; allDay: boolean } {
    const isAllDay = params.includes('VALUE=DATE') || value.length === 8;

    // Extract TZID if present
    const tzidMatch = params.match(/TZID=([^;:]+)/);
    const tzid = tzidMatch ? tzidMatch[1] : null;

    try {
      if (isAllDay) {
        // DATE format: YYYYMMDD - parse as local date
        const year = parseInt(value.substring(0, 4), 10);
        const month = parseInt(value.substring(4, 6), 10);
        const day = parseInt(value.substring(6, 8), 10);
        const dt = DateTime.local(year, month, day);
        return { date: dt.toJSDate(), allDay: true };
      }

      // DATETIME format: YYYYMMDDTHHMMSS[Z]
      const isUTC = value.endsWith('Z');
      const dateStr = value.replace('Z', '');

      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10);
      const day = parseInt(dateStr.substring(6, 8), 10);
      const hour = parseInt(dateStr.substring(9, 11), 10) || 0;
      const minute = parseInt(dateStr.substring(11, 13), 10) || 0;
      const second = parseInt(dateStr.substring(13, 15), 10) || 0;

      let dt: DateTime;

      if (isUTC) {
        // UTC time (ends with Z)
        dt = DateTime.utc(year, month, day, hour, minute, second);
      } else if (tzid) {
        // Has event-level timezone - parse in that timezone
        dt = DateTime.fromObject(
          { year, month, day, hour, minute, second },
          { zone: tzid }
        );
        if (!dt.isValid) {
          // Fall back to local if timezone is invalid
          this.warnings.push(`Unknown timezone "${tzid}", using local time`);
          dt = DateTime.local(year, month, day, hour, minute, second);
        }
      } else if (this.calendarTimezone) {
        // No event-level timezone, but calendar has a default timezone
        dt = DateTime.fromObject(
          { year, month, day, hour, minute, second },
          { zone: this.calendarTimezone }
        );
        if (!dt.isValid) {
          // Fall back to local if calendar timezone is invalid
          this.warnings.push(
            `Unknown calendar timezone "${this.calendarTimezone}", using local time`
          );
          dt = DateTime.local(year, month, day, hour, minute, second);
        }
      } else {
        // No timezone at all - treat as local time
        dt = DateTime.local(year, month, day, hour, minute, second);
      }

      return { date: dt.toJSDate(), allDay: false };
    } catch {
      this.warnings.push(`Failed to parse datetime: ${value}`);
      return { date: null, allDay: false };
    }
  }

  /**
   * Unescape ICS text values
   * RFC 5545 escape sequences: \n, \N, \\, \;, \,
   */
  private unescapeText(text: string): string {
    return text
      .replace(/\\n/gi, '\n')
      .replace(/\\\\/g, '\\')
      .replace(/\\;/g, ';')
      .replace(/\\,/g, ',');
  }

  /**
   * Create preview for import confirmation modal
   */
  createPreview(content: string, filename: string): ICSImportPreview {
    const result = this.parse(content);

    // Calculate date range
    let dateRange: { start: Date; end: Date } | null = null;
    const validDates = result.events
      .filter((e) => e.dtstart)
      .map((e) => e.dtstart!.getTime());

    if (validDates.length > 0) {
      dateRange = {
        start: new Date(Math.min(...validDates)),
        end: new Date(Math.max(...validDates)),
      };
    }

    return {
      calendarName: result.calendarName || filename.replace(/\.ics$/i, ''),
      filename,
      events: result.events,
      hasRecurringEvents: result.events.some((e) => e.rrule !== null),
      dateRange,
      warnings: result.warnings,
    };
  }

  /**
   * Generate a stable content hash for duplicate detection
   *
   * Includes core event data:
   * - VERSION, UID, SUMMARY, DTSTART, DTEND, RRULE, DESCRIPTION, LOCATION
   *
   * Excludes volatile ICS metadata:
   * - DTSTAMP, PRODID, SEQUENCE, LAST-MODIFIED
   */
  generateContentHash(events: ParsedICSEvent[], version: string): string {
    const eventStrings = events.map((event) => {
      return [
        event.uid || '',
        event.summary || '',
        event.dtstart?.toISOString() || '',
        event.dtend?.toISOString() || '',
        event.rrule || '',
        event.description || '',
        event.location || '',
      ].join('|');
    });

    // Sort by UID for consistent ordering (calendar apps may reorder events)
    eventStrings.sort();

    // Include VERSION in the hash
    const content = `VERSION:${version}\n${eventStrings.join('\n')}`;

    return crypto.createHash('md5').update(content).digest('hex');
  }
}

export default ICSParser;
