/**
 * Calendar Slice
 * Handles imported calendars, calendar events CRUD, and export.
 */

import type { DisplayCalendarEvent } from '../../types';
import { getEffectiveTimezone } from '../../settings';
import { getApi, logUserAction, type SliceCreator } from '../storeUtils';

export const createCalendarSlice: SliceCreator = (set, get) => ({
  /**
   * Fetch all imported calendars
   */
  fetchImportedCalendars: async () => {
    const api = getApi();
    if (!api) {
      console.warn('[Store] No API available for fetchImportedCalendars');
      return;
    }

    try {
      const calendars = await api.getImportedCalendars();
      set({ importedCalendars: calendars });
    } catch (error) {
      console.error('Failed to fetch imported calendars:', error);
    }
  },

  /**
   * Fetch calendar events for a date range
   */
  fetchCalendarEventsForRange: async (startDate: Date, endDate: Date) => {
    const api = getApi();
    if (!api) {
      console.warn('[Store] No API available for fetchCalendarEventsForRange');
      return;
    }

    try {
      // Get effective timezone for DST-aware recurrence expansion
      let timezone = getEffectiveTimezone();
      // If 'local', resolve to actual system timezone IANA string
      if (timezone === 'local') {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
      const events = await api.getCalendarEventsForRange({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        includeHidden: false,
        timezone, // Always pass timezone for DST-aware expansion
      });
      set({ calendarEvents: events });
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
    }
  },

  /**
   * Import an ICS file
   */
  importICSFile: async (
    content: string,
    filename: string,
    options?: { name?: string; color?: string }
  ) => {
    const api = getApi();
    if (!api) {
      console.warn('[Store] No API available for importICSFile');
      return { success: false };
    }

    try {
      const result = await api.importICS({
        content,
        filename,
        name: options?.name,
        color: options?.color,
      });

      if (result.success) {
        await get().fetchImportedCalendars();
      }

      // Return result including existingCalendar info for duplicate detection
      return {
        success: result.success,
        calendarId: result.data?.calendarId,
        eventCount: result.data?.eventCount,
        existingCalendar: result.existingCalendar,
      };
    } catch (error) {
      console.error('Failed to import ICS:', error);
      return { success: false };
    }
  },

  /**
   * Delete an imported calendar
   */
  deleteImportedCalendar: async (calendarId: number) => {
    const api = getApi();
    if (!api) return false;

    try {
      const calendar = get().importedCalendars.find((c) => c.id === calendarId);
      const result = await api.deleteImportedCalendar(calendarId);
      if (result.success) {
        logUserAction('Calendar deleted', { calendarId, name: calendar?.name });
        set((state) => ({
          importedCalendars: state.importedCalendars.filter((c) => c.id !== calendarId),
          calendarEvents: state.calendarEvents.filter(
            (e) => e.importedCalendarId !== calendarId
          ),
        }));
      }
      return result.success;
    } catch (error) {
      console.error('Failed to delete calendar:', error);
      return false;
    }
  },

  /**
   * Re-import an existing calendar (replace events with new content)
   */
  reimportCalendar: async (calendarId: number, content: string) => {
    const api = getApi();
    if (!api) return { success: false };

    try {
      const result = await api.reimportCalendar(calendarId, content);
      if (result.success) {
        // Refresh calendars and events
        await get().fetchImportedCalendars();
      }
      return result;
    } catch (error) {
      console.error('Failed to reimport calendar:', error);
      return { success: false };
    }
  },

  /**
   * Toggle calendar visibility
   */
  toggleCalendarVisibility: async (calendarId: number, isVisible: boolean) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.toggleCalendarVisibility(calendarId, isVisible);
      if (result.success) {
        set((state) => ({
          importedCalendars: state.importedCalendars.map((c) =>
            c.id === calendarId ? { ...c, isVisible } : c
          ),
        }));
      }
      return result.success;
    } catch (error) {
      console.error('Failed to toggle calendar visibility:', error);
      return false;
    }
  },

  /**
   * Update calendar metadata
   */
  updateImportedCalendar: async (
    calendarId: number,
    updates: { name?: string; color?: string }
  ) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.updateImportedCalendar(calendarId, updates);
      if (result.success) {
        set((state) => ({
          importedCalendars: state.importedCalendars.map((c) =>
            c.id === calendarId ? { ...c, ...updates } : c
          ),
        }));
      }
      return result.success;
    } catch (error) {
      console.error('Failed to update calendar:', error);
      return false;
    }
  },

  /**
   * Create a user calendar event
   */
  createCalendarEvent: async (data: {
    title: string;
    description?: string;
    startAt: string;
    endAt?: string;
    allDay: boolean;
    location?: string;
    courseId?: number;
    color?: string;
    notes?: string;
    reminderMinutes?: number;
  }) => {
    const api = getApi();
    if (!api) return { success: false };

    try {
      const result = await api.createCalendarEvent(data);
      if (result.success && result.data) {
        // Optimistic update - add the new event to the list
        const newEvent: DisplayCalendarEvent = {
          id: result.data.id,
          externalId: null,
          sourceType: 'user',
          courseId: data.courseId ?? null,
          importedCalendarId: null,
          taskId: null,
          title: data.title,
          description: data.description ?? null,
          startAt: data.startAt,
          endAt: data.endAt ?? null,
          allDay: data.allDay,
          location: data.location ?? null,
          uid: null,
          recurrenceRule: null,
          recurrenceExceptionDates: null,
          parentEventId: null,
          eventColor: data.color ?? null,
          notes: data.notes ?? null,
          reminderMinutes: data.reminderMinutes ?? null,
          isRecurrenceInstance: false,
          color: data.color ?? '#6366F1', // Use provided color or default user event color
        };
        set((state) => ({
          calendarEvents: [...state.calendarEvents, newEvent],
        }));
        return { success: true, id: result.data.id };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to create calendar event:', error);
      return { success: false };
    }
  },

  /**
   * Update a calendar event
   */
  updateCalendarEvent: async (
    id: number,
    data: {
      title?: string;
      description?: string;
      startAt?: string;
      endAt?: string;
      allDay?: boolean;
      location?: string;
      courseId?: number | null;
      color?: string;
      notes?: string;
      reminderMinutes?: number;
      taskType?: string;
      weight?: number;
    }
  ) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.updateCalendarEvent(id, data);
      if (result.success) {
        // Get the event to find linked taskId before updating
        const currentEvent = get().calendarEvents.find((e) => e.id === id);
        const linkedTaskId = currentEvent?.taskId;

        // Optimistic update for calendar events
        set((state) => ({
          calendarEvents: state.calendarEvents.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...(data.title !== undefined && { title: data.title }),
                  ...(data.description !== undefined && {
                    description: data.description,
                  }),
                  ...(data.startAt !== undefined && { startAt: data.startAt }),
                  ...(data.endAt !== undefined && { endAt: data.endAt }),
                  ...(data.allDay !== undefined && { allDay: data.allDay }),
                  ...(data.location !== undefined && { location: data.location }),
                  ...(data.courseId !== undefined && { courseId: data.courseId }),
                  ...(data.color !== undefined && {
                    eventColor: data.color,
                    color: data.color,
                  }),
                  ...(data.notes !== undefined && { notes: data.notes }),
                  ...(data.reminderMinutes !== undefined && {
                    reminderMinutes: data.reminderMinutes,
                  }),
                }
              : e
          ),
        }));

        // Bidirectional sync: also update linked task in store immediately
        if (linkedTaskId) {
          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === linkedTaskId
                ? {
                    ...t,
                    ...(data.title !== undefined && { title: data.title }),
                    ...(data.description !== undefined && {
                      description: data.description,
                    }),
                    ...(data.startAt !== undefined && { unlockAt: data.startAt }),
                    ...(data.endAt !== undefined && { dueAt: data.endAt }),
                    ...(data.location !== undefined && { location: data.location }),
                    // Only update courseId if it's a valid number (not null)
                    ...(data.courseId !== undefined &&
                      data.courseId !== null && { courseId: data.courseId }),
                    ...(data.taskType !== undefined && { taskType: data.taskType }),
                    ...(data.weight !== undefined && { weight: data.weight }),
                  }
                : t
            ),
          }));
        }
      }
      return result.success;
    } catch (error) {
      console.error('Failed to update calendar event:', error);
      return false;
    }
  },

  /**
   * Delete a calendar event
   */
  deleteCalendarEvent: async (id: number) => {
    const api = getApi();
    if (!api) return false;

    try {
      const result = await api.deleteCalendarEvent(id);
      if (result.success) {
        // Optimistic update - remove from list
        set((state) => ({
          calendarEvents: state.calendarEvents.filter((e) => e.id !== id),
        }));
      }
      return result.success;
    } catch (error) {
      console.error('Failed to delete calendar event:', error);
      return false;
    }
  },

  /**
   * Export calendars to ICS
   */
  exportCalendarsBatch: async (options: {
    mode: 'all' | 'selected';
    calendarIds?: number[];
    courseIds?: number[];
    includeUserEvents?: boolean;
    consolidate?: boolean;
    dateRange?: { start: string; end: string };
  }) => {
    const api = getApi();
    if (!api) return { success: false };

    try {
      const result = await api.exportCalendarsBatch(options);
      return {
        success: result.success,
        content: result.data?.content,
        eventCount: result.data?.eventCount,
      };
    } catch (error) {
      console.error('Failed to export calendars:', error);
      return { success: false };
    }
  },
});
