/**
 * ScheduleCard - Displays today's timed calendar events and tasks with duration
 */

import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, MapPin } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Card, NotificationDot } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import { useTaskUpdates } from '../../hooks';
import { useFocusedItem } from '../../hooks/useFocusedItem';
import type { DisplayCalendarEvent, Task } from '../../../l5-presentation/types';
import { getCourseColor, CARD_TITLES } from '../../constants';

interface ScheduleCardProps {
  /** Maximum items to show. If not specified, shows all items. */
  maxItems?: number;
  /** Whether keyboard focus navigation is active for this list */
  isKeyboardActive?: boolean;
}

// Unified schedule item type
interface ScheduleItem {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  color: string;
  location?: string | null;
  type: 'event' | 'task';
  taskId?: number; // For deduplication
}

/**
 * Format time for display (e.g., "1:00 PM")
 */
function _formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Format time range (e.g., "1:00 PM - 3:00 PM")
 * Always shows AM/PM for both times to avoid confusion
 */
function formatTimeRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);

  const startHours = start.getHours();
  const startMins = start.getMinutes();
  const endHours = end.getHours();
  const endMins = end.getMinutes();

  const startAmpm = startHours >= 12 ? 'PM' : 'AM';
  const endAmpm = endHours >= 12 ? 'PM' : 'AM';

  const startDisplayHours = startHours % 12 || 12;
  const endDisplayHours = endHours % 12 || 12;

  const startTime = `${startDisplayHours}:${startMins.toString().padStart(2, '0')} ${startAmpm}`;
  const endTime = `${endDisplayHours}:${endMins.toString().padStart(2, '0')} ${endAmpm}`;

  return `${startTime} - ${endTime}`;
}

/**
 * Check if a date is today
 */
function _isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Check if an event overlaps with today (starts today, ends today, or spans today)
 */
function overlapsToday(startAt: string, endAt: string | null): boolean {
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    0,
    0,
    0
  );
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59
  );

  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : start;

  // Event overlaps today if: event starts before today ends AND event ends after today starts
  return start <= todayEnd && end >= todayStart;
}

/**
 * Check if event has a duration (has both start and end time, and is not all-day)
 */
function hasDuration(event: DisplayCalendarEvent): boolean {
  if (event.allDay) return false;
  if (!event.startAt || !event.endAt) return false;

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  // Exclude if end time is exactly midnight (00:00:00) - likely a placeholder
  if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0) {
    return false;
  }

  // Exclude all-day style events (start at midnight, end at midnight or 11:59 PM)
  if (start.getHours() === 0 && start.getMinutes() === 0) {
    if (end.getHours() === 0 || (end.getHours() === 23 && end.getMinutes() === 59)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a timestamp is epoch (sentinel for "not set")
 */
function isEpoch(isoDate: string | null): boolean {
  if (!isoDate) return true;
  return new Date(isoDate).getTime() < 86400000; // < 1 day from epoch
}

/**
 * Check if task has a real duration (both unlockAt and dueAt are real, valid times)
 */
function taskHasDuration(task: Task): boolean {
  // Must have both start and end
  if (!task.unlockAt || !task.dueAt) return false;

  // Check for epoch/placeholder times
  if (isEpoch(task.unlockAt)) return false;
  if (isEpoch(task.dueAt)) return false;

  // Check for midnight as a placeholder (00:00:00) - often means "date only, no time"
  const dueDate = new Date(task.dueAt);
  if (
    dueDate.getHours() === 0 &&
    dueDate.getMinutes() === 0 &&
    dueDate.getSeconds() === 0
  ) {
    // Midnight is likely a placeholder unless dueTimeKnown is explicitly true
    if (task.dueTimeKnown !== true) return false;
  }

  return true;
}

/**
 * Get event color with source type context
 */
function getEventColor(event: DisplayCalendarEvent): string {
  if (event.color) return event.color;

  switch (event.sourceType) {
    case 'canvas':
      return 'var(--color-blue)';
    case 'user':
      return '#6366F1';
    case 'imported':
      return '#10B981';
    default:
      return 'var(--color-gray-500)';
  }
}

export function ScheduleCard({ maxItems, isKeyboardActive = false }: ScheduleCardProps) {
  const navigate = useNavigate();
  const calendarEvents = useStore((state) => state.calendarEvents);
  const tasks = useStore((state) => state.tasks);
  const courses = useStore((state) => state.courses);
  const importedCalendars = useStore((state) => state.importedCalendars);
  const taskUpdates = useTaskUpdates();
  const fetchCalendarEventsForRange = useStore(
    (state) => state.fetchCalendarEventsForRange
  );
  const fetchImportedCalendars = useStore((state) => state.fetchImportedCalendars);

  // Build course color map
  const courseColorMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const course of courses) {
      map.set(course.id, getCourseColor(course.id, course.color));
    }
    return map;
  }, [courses]);

  // Build imported calendar color map
  const importedCalendarColorMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const cal of importedCalendars) {
      if (cal.color) {
        map.set(cal.id, cal.color);
      }
    }
    return map;
  }, [importedCalendars]);

  // Fetch today's events and imported calendars on mount
  useEffect(() => {
    // Fetch imported calendars first to ensure color map is available
    fetchImportedCalendars();

    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      0,
      0,
      0
    );
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59
    );
    fetchCalendarEventsForRange(startOfDay, endOfDay);
  }, [fetchCalendarEventsForRange, fetchImportedCalendars]);

  // Build unified schedule items from calendar events and tasks with duration
  const todaysSchedule = useMemo(() => {
    const items: ScheduleItem[] = [];
    const taskIdsFromEvents = new Set<number>();

    // Build task lookup for checking linked tasks
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // 1. Add calendar events with duration (not deadline events)
    for (const event of calendarEvents) {
      // Skip deadline task events (start_at is epoch) - they go in Important Works
      const isDeadline = event.taskId && isEpoch(event.startAt);
      if (isDeadline) continue;

      // Must have duration (both start and end, not all-day)
      if (!hasDuration(event)) continue;

      // If event is linked to a task, verify the task actually has a due date
      // (catches stale calendar events where due date was cleared)
      if (event.taskId) {
        const linkedTask = taskMap.get(event.taskId);
        if (linkedTask && !linkedTask.dueAt) continue;
      }

      // Check if event overlaps with today (starts today, ends today, or spans today)
      if (!event.startAt || !overlapsToday(event.startAt, event.endAt)) continue;

      // Track task IDs to avoid duplicates
      if (event.taskId) {
        taskIdsFromEvents.add(event.taskId);
      }

      // Resolve color: course color > imported calendar color > event color > fallback
      // Course color takes priority if event is linked to a course
      let eventColor = '';
      if (event.courseId) {
        eventColor = courseColorMap.get(event.courseId) || '';
      }
      if (!eventColor && event.importedCalendarId) {
        eventColor = importedCalendarColorMap.get(event.importedCalendarId) || '';
      }
      if (!eventColor && event.color) {
        eventColor = event.color;
      }
      if (!eventColor) {
        eventColor = getEventColor(event);
      }

      items.push({
        id: `event-${event.id}`,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt!,
        color: eventColor,
        location: event.location,
        type: 'event',
        taskId: event.taskId ?? undefined,
      });
    }

    // 2. Add tasks with duration (real unlockAt) that don't have linked calendar events
    for (const task of tasks) {
      // Skip if already added via calendar event
      if (taskIdsFromEvents.has(task.id)) continue;

      // Check if task has duration (real unlockAt, not epoch)
      if (!taskHasDuration(task)) continue;

      // Check if task overlaps with today
      if (!task.unlockAt || !overlapsToday(task.unlockAt, task.dueAt)) continue;

      const color = courseColorMap.get(task.courseId) || 'var(--color-gray-500)';

      items.push({
        id: `task-${task.id}`,
        title: task.title,
        startAt: task.unlockAt,
        endAt: task.dueAt!,
        color,
        location: null,
        type: 'task',
        taskId: task.id,
      });
    }

    // Sort by: start time first, then event name
    const sorted = items.sort((a, b) => {
      const aTime = new Date(a.startAt).getTime();
      const bTime = new Date(b.startAt).getTime();

      // Primary sort: by start time
      if (aTime !== bTime) return aTime - bTime;

      // Secondary sort: by title
      return a.title.localeCompare(b.title);
    });

    // Only limit if maxItems is specified
    return maxItems ? sorted.slice(0, maxItems) : sorted;
  }, [calendarEvents, tasks, courseColorMap, importedCalendarColorMap, maxItems]);

  const handleEventClick = () => {
    // Navigate to weekly calendar view
    navigate('/calendar?view=week');
  };

  // Focused item navigation (Up/Down + W/S)
  const { focusedIndex, focusedItem, getFocusProps } = useFocusedItem(todaysSchedule, {
    persistKey: 'dashboard-schedule',
    enabled: isKeyboardActive,
    verticalNav: true,
  });

  // Enter: open focused schedule item (goes to calendar)
  useHotkeys(
    'enter',
    (e) => {
      if (focusedItem) {
        e.preventDefault();
        handleEventClick();
      }
    },
    { enabled: isKeyboardActive }
  );

  return (
    <Card
      title={CARD_TITLES.dashboard.todaySchedule}
      padding="md"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {todaysSchedule.length === 0 ? (
        <div style={styles.emptyState}>
          <CalendarCheck
            size={28}
            color="var(--text-muted)"
            style={{ marginBottom: 'var(--space-2)' }}
          />
          <span style={styles.emptyText}>No events scheduled today</span>
        </div>
      ) : (
        <div style={styles.list}>
          {todaysSchedule.map((item, index) => {
            const timeRange = formatTimeRange(item.startAt, item.endAt);

            return (
              <div
                key={item.id}
                {...getFocusProps(index)}
                style={{
                  ...styles.item,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  ...(focusedIndex === index && isKeyboardActive
                    ? {
                        outline: '2px solid var(--color-navy)',
                        outlineOffset: '-2px',
                        borderRadius: 'var(--radius-md)',
                      }
                    : {}),
                }}
                onClick={handleEventClick}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleEventClick();
                  }
                }}
              >
                {/* Color indicator */}
                <div
                  style={{
                    ...styles.colorIndicator,
                    backgroundColor: item.color,
                  }}
                />

                {/* Title first, then time + location aligned */}
                <div style={styles.content}>
                  {/* Row 1: Event title with optional notification dot */}
                  <span
                    style={{
                      ...styles.eventTitle,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {item.title}
                    {item.taskId && taskUpdates.get(item.taskId) && (
                      <NotificationDot
                        updateType={taskUpdates.get(item.taskId)!.updateType}
                        size="sm"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                  </span>
                  {/* Row 2: Time + Location (locations align left-most) */}
                  <div style={styles.metaRow}>
                    <span
                      style={{
                        ...styles.timeRange,
                        // Only set min-width if this item has a location
                        ...(item.location ? { minWidth: '110px' } : {}),
                      }}
                    >
                      {timeRange}
                    </span>
                    {item.location && (
                      <span style={styles.location}>
                        <MapPin size={11} style={{ flexShrink: 0 }} />
                        {item.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    textAlign: 'center',
    flex: 1,
    minHeight: '150px',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: '0 -24px -24px -24px',
    flex: 1,
  },

  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) 24px',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  colorIndicator: {
    width: '4px',
    alignSelf: 'stretch',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },

  eventTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  timeRange: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  },

  location: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

export default ScheduleCard;
