/**
 * ICS (iCalendar) utilities for CalendarPage
 * Handles export and import of calendar data in ICS format
 */

import type { Task, Course } from '../../../l5-presentation/types';

/**
 * Generate ICS content from tasks
 */
export function generateICS(tasks: Task[], courses: Map<number, Course>): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CanvasAssistant//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  tasks.forEach((task) => {
    if (!task.dueAt) return;

    const course = courses.get(task.courseId);
    const dueDate = new Date(task.dueAt);

    // Format date as ICS timestamp (YYYYMMDDTHHMMSSZ)
    const formatICSDate = (date: Date): string => {
      return date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    };

    // Escape special characters in ICS
    const escapeICS = (str: string): string => {
      return (
        str
          // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- ICS format escaping, not file paths
          .replace(/\\/g, '\\\\')
          .replace(/;/g, '\\;')
          .replace(/,/g, '\\,')
          .replace(/\n/g, '\\n')
      );
    };

    const uid = `task-${task.id}@canvasassistant`;
    const summary = escapeICS(task.title);
    const description = escapeICS(
      `Course: ${course?.name || 'Unknown'}\\n` +
        `Type: ${task.taskType || 'Assignment'}\\n` +
        `Weight: ${task.weight}%\\n` +
        (task.description ? `\\n${task.description}` : '')
    );
    const location = course ? escapeICS(course.name) : '';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
    lines.push(`DTSTART:${formatICSDate(dueDate)}`);
    lines.push(`DTEND:${formatICSDate(new Date(dueDate.getTime() + 60 * 60 * 1000))}`); // 1 hour duration
    lines.push(`SUMMARY:${summary}`);
    if (description) lines.push(`DESCRIPTION:${description}`);
    if (location) lines.push(`LOCATION:${location}`);
    if (task.priorityScore >= 70) {
      lines.push('PRIORITY:1'); // High priority
    } else if (task.priorityScore >= 40) {
      lines.push('PRIORITY:5'); // Medium priority
    } else {
      lines.push('PRIORITY:9'); // Low priority
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Parsed event from ICS file
 */
export interface ParsedEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart?: Date;
  dtend?: Date;
  location?: string;
}

/**
 * Parse ICS content into events
 */
export function parseICS(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.replace(/\r\n /g, '').split(/\r?\n/);

  let currentEvent: Partial<ParsedEvent> | null = null;

  const parseICSDate = (value: string): Date | undefined => {
    // Handle formats: YYYYMMDDTHHMMSSZ or YYYYMMDD
    const match = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (!match) return undefined;

    const [, year, month, day, hour = '0', min = '0', sec = '0'] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  };

  const unescapeICS = (str: string): string => {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  };

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.uid && currentEvent.summary) {
        events.push(currentEvent as ParsedEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      let key = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1);

      // Handle parameters (e.g., DTSTART;VALUE=DATE:20240101)
      const semiIndex = key.indexOf(';');
      if (semiIndex !== -1) {
        key = key.substring(0, semiIndex);
      }

      switch (key) {
        case 'UID':
          currentEvent.uid = value;
          break;
        case 'SUMMARY':
          currentEvent.summary = unescapeICS(value);
          break;
        case 'DESCRIPTION':
          currentEvent.description = unescapeICS(value);
          break;
        case 'DTSTART':
          currentEvent.dtstart = parseICSDate(value);
          break;
        case 'DTEND':
          currentEvent.dtend = parseICSDate(value);
          break;
        case 'LOCATION':
          currentEvent.location = unescapeICS(value);
          break;
      }
    }
  }

  return events;
}
