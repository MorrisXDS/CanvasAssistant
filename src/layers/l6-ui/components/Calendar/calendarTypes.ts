/**
 * Calendar Types - Shared type definitions for calendar views
 */

import type { Task, Course, DisplayCalendarEvent } from '../../../l5-presentation/types';

// Popup state type
export interface PopupState {
  events: CalendarEvent[];
  x: number;
  y: number;
  label: string;
}

// Detail modal state type
export interface DetailState {
  event: CalendarEvent;
  courseMatch: CourseMatch | null;
}

export type CalendarView = 'month' | 'week' | 'day';

// Task-based event (from Canvas assignments)
export interface TaskCalendarEvent {
  type: 'task';
  task: Task;
  course: Course;
}

// Imported calendar event
export interface ImportedCalendarEvent {
  type: 'imported';
  event: DisplayCalendarEvent;
}

// Union type for all calendar events
export type CalendarEvent = TaskCalendarEvent | ImportedCalendarEvent;

export interface CourseMatch {
  course: Course;
  confidence: 'high' | 'medium' | 'low';
}

export interface PositionedEvent {
  event: CalendarEvent;
  column: number;
  totalColumns: number;
  overlapIndex: number;
  overlapCount: number;
}
