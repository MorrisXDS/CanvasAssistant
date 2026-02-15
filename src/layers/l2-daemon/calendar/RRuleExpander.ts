/**
 * RRULE Expander Service
 * Expands recurring events using the rrule library
 *
 * Handles:
 * - RRULE parsing and expansion
 * - EXDATE exception handling
 * - Date range filtering
 * - Duration calculation for instances
 * - DST-aware timezone handling
 */

import { RRule, RRuleSet } from 'rrule';
import { DateTime } from 'luxon';

export interface CalendarEventRecord {
  id: number;
  externalId: string | null;
  sourceType: 'canvas' | 'user' | 'imported';
  courseId: number | null;
  importedCalendarId: number | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  uid: string | null;
  recurrenceRule: string | null;
  recurrenceExceptionDates: string | null;
  parentEventId: number | null;
  // Optional display properties (added during query)
  calendarName?: string | null;
  color?: string;
}

export interface ExpandedEvent extends CalendarEventRecord {
  isRecurrenceInstance: boolean;
  recurrenceDate?: string;
  originalEventId?: number;
}

/**
 * Expand recurring events within a date range
 */
export class RRuleExpander {
  /**
   * Expand a single recurring event into instances within a date range
   *
   * @param event - The calendar event to expand
   * @param rangeStart - Start of the date range
   * @param rangeEnd - End of the date range
   * @param timezone - IANA timezone for DST-aware expansion (e.g., "America/Toronto")
   */
  expand(
    event: CalendarEventRecord,
    rangeStart: Date,
    rangeEnd: Date,
    timezone?: string
  ): ExpandedEvent[] {
    // Non-recurring events are filtered by date range
    if (!event.recurrenceRule) {
      if (this.isInRange(event, rangeStart, rangeEnd)) {
        return [
          {
            ...event,
            isRecurrenceInstance: false,
          },
        ];
      }
      return [];
    }

    try {
      const eventStart = new Date(event.startAt);
      const eventEnd = event.endAt ? new Date(event.endAt) : eventStart;
      const durationMs = eventEnd.getTime() - eventStart.getTime();

      // Create RRuleSet for handling both RRULE and EXDATE
      const rruleSet = new RRuleSet();

      // Parse and add the RRULE
      const rrule = RRule.fromString(
        `DTSTART:${this.formatRRuleDate(eventStart)}\n${event.recurrenceRule}`
      );
      rruleSet.rrule(rrule);

      // Add exception dates
      if (event.recurrenceExceptionDates) {
        try {
          const exdates = JSON.parse(event.recurrenceExceptionDates);
          if (Array.isArray(exdates)) {
            exdates.forEach((exdate: string) => {
              rruleSet.exdate(new Date(exdate));
            });
          }
        } catch {
          // If it's not JSON, try parsing as comma-separated dates
          const exdates = event.recurrenceExceptionDates.split(',');
          exdates.forEach((exdate) => {
            const date = new Date(exdate.trim());
            if (!isNaN(date.getTime())) {
              rruleSet.exdate(date);
            }
          });
        }
      }

      // Get occurrences within the range (these are at fixed UTC times)
      const occurrences = rruleSet.between(rangeStart, rangeEnd, true);

      // If no timezone provided or invalid, return UTC-based occurrences
      if (!timezone || timezone === 'local') {
        return occurrences.map((occurrenceDate) => ({
          ...event,
          startAt: occurrenceDate.toISOString(),
          endAt: new Date(occurrenceDate.getTime() + durationMs).toISOString(),
          isRecurrenceInstance: true,
          recurrenceDate: occurrenceDate.toISOString(),
          originalEventId: event.id,
          parentEventId: event.id,
        }));
      }

      // DST-aware expansion: preserve local time across DST transitions
      // Get the original event's local time in the target timezone
      const originalDt = DateTime.fromISO(event.startAt).setZone(timezone);
      if (!originalDt.isValid) {
        // Fallback to UTC-based if timezone is invalid
        return occurrences.map((occurrenceDate) => ({
          ...event,
          startAt: occurrenceDate.toISOString(),
          endAt: new Date(occurrenceDate.getTime() + durationMs).toISOString(),
          isRecurrenceInstance: true,
          recurrenceDate: occurrenceDate.toISOString(),
          originalEventId: event.id,
          parentEventId: event.id,
        }));
      }

      const originalHour = originalDt.hour;
      const originalMinute = originalDt.minute;
      const originalSecond = originalDt.second;

      // Map occurrences with DST-aware time adjustment
      return occurrences.map((occurrenceDate) => {
        // Get the occurrence date in the target timezone
        const occDt = DateTime.fromJSDate(occurrenceDate).setZone(timezone);

        // Create a new DateTime with the same local time as the original event
        // This preserves the local time across DST transitions
        const adjustedDt = occDt.set({
          hour: originalHour,
          minute: originalMinute,
          second: originalSecond,
        });

        // Calculate end time with same adjustment
        const adjustedEndDt = adjustedDt.plus({ milliseconds: durationMs });

        return {
          ...event,
          startAt: adjustedDt.toUTC().toISO() || occurrenceDate.toISOString(),
          endAt:
            adjustedEndDt.toUTC().toISO() ||
            new Date(occurrenceDate.getTime() + durationMs).toISOString(),
          isRecurrenceInstance: true,
          recurrenceDate: adjustedDt.toUTC().toISO() || occurrenceDate.toISOString(),
          originalEventId: event.id,
          parentEventId: event.id,
        };
      });
    } catch {
      // If RRULE parsing fails, return the original event as non-recurring
      // This is expected for malformed RRULE strings from external sources
      return [
        {
          ...event,
          isRecurrenceInstance: false,
        },
      ];
    }
  }

  /**
   * Expand multiple events within a date range
   */
  expandAll(
    events: CalendarEventRecord[],
    rangeStart: Date,
    rangeEnd: Date
  ): ExpandedEvent[] {
    const expanded: ExpandedEvent[] = [];

    for (const event of events) {
      const instances = this.expand(event, rangeStart, rangeEnd);
      expanded.push(...instances);
    }

    // Sort by start date
    return expanded.sort((a, b) => {
      const aStart = new Date(a.startAt).getTime();
      const bStart = new Date(b.startAt).getTime();
      return aStart - bStart;
    });
  }

  /**
   * Check if an event falls within a date range
   */
  isInRange(event: CalendarEventRecord, rangeStart: Date, rangeEnd: Date): boolean {
    const eventStart = new Date(event.startAt);
    const eventEnd = event.endAt ? new Date(event.endAt) : eventStart;

    // Event overlaps with range if:
    // - Event starts before range ends AND
    // - Event ends after range starts
    return eventStart < rangeEnd && eventEnd > rangeStart;
  }

  /**
   * Format a date for RRULE DTSTART
   */
  private formatRRuleDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  }

  /**
   * Get human-readable description of recurrence pattern
   */
  describeRecurrence(rruleStr: string): string {
    try {
      const rrule = RRule.fromString(rruleStr);
      return rrule.toText();
    } catch {
      return 'Recurring event';
    }
  }

  /**
   * Get the next N occurrences of a recurring event
   */
  getNextOccurrences(event: CalendarEventRecord, count: number = 5): Date[] {
    if (!event.recurrenceRule) {
      return [new Date(event.startAt)];
    }

    try {
      const eventStart = new Date(event.startAt);
      const rrule = RRule.fromString(
        `DTSTART:${this.formatRRuleDate(eventStart)}\n${event.recurrenceRule}`
      );

      // Get next N occurrences from now
      const now = new Date();
      const occurrences = rrule.after(now, true);

      if (!occurrences) return [];

      // Get all within a reasonable range and take first N
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 2);

      return rrule.between(now, farFuture, true).slice(0, count);
    } catch {
      return [];
    }
  }
}

export default RRuleExpander;
