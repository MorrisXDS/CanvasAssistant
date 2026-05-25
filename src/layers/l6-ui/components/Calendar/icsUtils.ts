/**
 * ICS (iCalendar) Utilities
 * Functions for generating and parsing ICS calendar files
 */

import type { CalendarEvent } from './CalendarGrid';

/**
 * Format a Date object to ICS format (YYYYMMDDTHHMMSSZ)
 */
export function formatICSDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Escape text for ICS format
 */
export function escapeICSText(text: string | null | undefined): string {
  if (!text) return '';
  return (
    text
      // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- ICS format escaping, not file paths
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
  );
}

/**
 * Generate ICS content from calendar events
 */
export function generateICS(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Canvas Integration Dashboard//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach((event) => {
    // Only export task events (not imported calendar events)
    if (event.type !== 'task') return;
    if (!event.task.dueAt) return;
    const dueDate = new Date(event.task.dueAt);
    const uid = `${event.task.id}@canvas-dashboard`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
    lines.push(`DTSTART:${formatICSDate(dueDate)}`);
    lines.push(`DTEND:${formatICSDate(new Date(dueDate.getTime() + 60 * 60 * 1000))}`);
    lines.push(`SUMMARY:${escapeICSText(event.task.title)}`);
    lines.push(
      `DESCRIPTION:${escapeICSText(`Course: ${event.course.code || 'Unknown'}${event.task.description ? '\\n' + event.task.description : ''}`)}`
    );
    if (event.course.code) {
      lines.push(`CATEGORIES:${escapeICSText(event.course.code)}`);
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Parsed ICS event structure
 */
export interface ParsedICSEvent {
  uid: string;
  summary: string;
  dtstart: Date | null;
  dtend: Date | null;
  description: string;
}

/**
 * Parse an ICS date string to a Date object
 */
export function parseICSDate(value: string): Date | null {
  // Handle YYYYMMDDTHHMMSSZ or YYYYMMDD formats
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!match) return null;

  const [, year, month, day, hour = '00', min = '00', sec = '00'] = match;
  return new Date(
    Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    )
  );
}

/**
 * Parse ICS content to extract events
 */
export function parseICS(icsContent: string): ParsedICSEvent[] {
  const events: ParsedICSEvent[] = [];
  const lines = icsContent.replace(/\r\n /g, '').split(/\r?\n/);

  let currentEvent: Partial<ParsedICSEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {
        uid: '',
        summary: '',
        dtstart: null,
        dtend: null,
        description: '',
      };
    } else if (line === 'END:VEVENT' && currentEvent) {
      events.push(currentEvent as ParsedICSEvent);
      currentEvent = null;
    } else if (currentEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.substring(0, colonIdx).split(';')[0];
      const value = line.substring(colonIdx + 1);

      switch (key) {
        case 'UID':
          currentEvent.uid = value;
          break;
        case 'SUMMARY':
          currentEvent.summary = value
            .replace(/\\n/g, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';');
          break;
        case 'DTSTART':
          currentEvent.dtstart = parseICSDate(value);
          break;
        case 'DTEND':
          currentEvent.dtend = parseICSDate(value);
          break;
        case 'DESCRIPTION':
          currentEvent.description = value
            .replace(/\\n/g, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';');
          break;
      }
    }
  }

  return events;
}
