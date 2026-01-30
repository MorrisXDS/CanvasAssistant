/**
 * ScheduleCard - Displays today's timed calendar events with time range and location
 */

import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, MapPin } from 'lucide-react';
import { Card } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import type { DisplayCalendarEvent } from '../../../l5-presentation/types';

interface ScheduleCardProps {
  maxItems?: number;
}

/**
 * Format time for display (e.g., "1:00 PM")
 */
function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  const hours = date.getHours();
  const minutes = date.getMinutes();

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Format time range (e.g., "1:00 - 3:00 PM")
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

  const startTime = `${startDisplayHours}:${startMins.toString().padStart(2, '0')}`;
  const endTime = `${endDisplayHours}:${endMins.toString().padStart(2, '0')}`;

  // Only show AM/PM once if both are the same
  if (startAmpm === endAmpm) {
    return `${startTime} - ${endTime} ${endAmpm}`;
  }

  return `${startTime} ${startAmpm} - ${endTime} ${endAmpm}`;
}

/**
 * Check if a date is today
 */
function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Check if event has a duration (has both start and end time, and is not all-day)
 */
function hasDuration(event: DisplayCalendarEvent): boolean {
  if (event.allDay) return false;
  if (!event.startAt || !event.endAt) return false;

  const start = new Date(event.startAt);
  if (start.getHours() === 0 && start.getMinutes() === 0) {
    const end = new Date(event.endAt);
    if (end.getHours() === 0 || (end.getHours() === 23 && end.getMinutes() === 59)) {
      return false;
    }
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

export function ScheduleCard({ maxItems = 4 }: ScheduleCardProps) {
  const navigate = useNavigate();
  const calendarEvents = useStore((state) => state.calendarEvents);
  const fetchCalendarEventsForRange = useStore(
    (state) => state.fetchCalendarEventsForRange
  );
  // Fetch today's events on mount
  useEffect(() => {
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
  }, [fetchCalendarEventsForRange]);

  // Filter to today's timed events (including task deadline events, checked by end_at)
  const todaysEvents = useMemo(() => {
    const filtered = calendarEvents.filter((event) => {
      // For deadline task events (start_at is epoch), check if end_at is today
      // Use timestamp check (< 1 day from epoch) to handle timezone display issues
      const isDeadline = event.taskId && new Date(event.startAt).getTime() < 86400000;

      if (isDeadline) {
        // Deadline events: check end_at (due time) is today
        if (!event.endAt) return false;
        return isToday(event.endAt);
      } else {
        // Regular events: check start_at is today and has duration
        if (!event.startAt) return false;
        if (!isToday(event.startAt)) return false;
        return hasDuration(event);
      }
    });

    // Sort by: deadline events by end_at, duration events by start_at
    return filtered
      .sort((a, b) => {
        const aIsDeadline = a.taskId && new Date(a.startAt).getTime() < 86400000;
        const bIsDeadline = b.taskId && new Date(b.startAt).getTime() < 86400000;
        const aTime = aIsDeadline
          ? new Date(a.endAt!).getTime()
          : new Date(a.startAt).getTime();
        const bTime = bIsDeadline
          ? new Date(b.endAt!).getTime()
          : new Date(b.startAt).getTime();
        return aTime - bTime;
      })
      .slice(0, maxItems);
  }, [calendarEvents, maxItems]);

  const handleEventClick = () => {
    // Navigate to weekly calendar view
    navigate('/calendar?view=week');
  };

  return (
    <Card
      title="Today's Schedule"
      padding="md"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {todaysEvents.length === 0 ? (
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
          {todaysEvents.map((event, index) => {
            const timeRange = event.endAt
              ? formatTimeRange(event.startAt, event.endAt)
              : formatTime(event.startAt);
            const eventColor = getEventColor(event);

            // Check if this is a deadline task event (start_at is epoch)
            const isDeadlineEvent =
              event.taskId && new Date(event.startAt).getTime() < 86400000;
            const displayTime =
              isDeadlineEvent && event.endAt
                ? `Due ${formatTime(event.endAt)}`
                : timeRange;

            return (
              <div
                key={event.id}
                style={{
                  ...styles.item,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
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
                    backgroundColor: eventColor,
                  }}
                />

                {/* Title first, then time + location aligned */}
                <div style={styles.content}>
                  {/* Row 1: Event title */}
                  <span style={styles.eventTitle}>{event.title}</span>
                  {/* Row 2: Time + Location (locations align left-most) */}
                  <div style={styles.metaRow}>
                    <span
                      style={{
                        ...styles.timeRange,
                        // Only set min-width if this event has a location
                        ...(event.location ? { minWidth: '110px' } : {}),
                      }}
                    >
                      {displayTime}
                    </span>
                    {event.location && (
                      <span style={styles.location}>
                        <MapPin size={11} style={{ flexShrink: 0 }} />
                        {event.location}
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
