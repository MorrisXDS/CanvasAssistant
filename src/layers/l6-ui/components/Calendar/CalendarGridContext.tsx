/**
 * CalendarGridContext - Shared state and handlers for calendar views
 *
 * FACADE: Types and helpers extracted to calendarTypes.ts and calendarHelpers.ts.
 * This file keeps the React context provider and re-exports for backward compatibility.
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Course } from '../../../l5-presentation/types';
import { styles } from './CalendarGridStyles';
import { getCourseColor, Z_INDEX } from '../../constants';
import { Modal } from '../primitives/Modal';

// Re-export types
export type {
  PopupState,
  DetailState,
  CalendarView,
  TaskCalendarEvent,
  ImportedCalendarEvent,
  CalendarEvent,
  CourseMatch,
  PositionedEvent,
} from './calendarTypes';

// Re-export helpers
export {
  isDeadlineTaskEvent,
  getEventDate,
  getEventTitle,
  getEventShortLabel,
  getEventFullLabel,
  formatTimeAmPm,
  getEventTimeRange,
  getEventDescription,
  isCompletedTask,
  getEventEndDate,
  getEventDurationHours,
  getEventStartOffset,
  getEventEndOffset,
  getEventId,
  isEventInProgress,
  positionEvents,
  getMonthDays,
  getWeekDays,
  isSameDay,
  isToday,
  matchEventToCourse,
  getEarliestEventHour,
  WEEKDAYS,
  HOURS,
  HOUR_HEIGHT,
  WEEK_HOUR_HEIGHT,
} from './calendarHelpers';

// Import types and helpers for use in provider
import type {
  PopupState,
  DetailState,
  CalendarView,
  CalendarEvent,
  CourseMatch,
} from './calendarTypes';

import {
  getEventId,
  getEventDate,
  getEventTitle,
  getEventFullLabel,
  getEventTimeRange,
  getEventDescription,
  isCompletedTask,
  isSameDay,
  getWeekDays,
  matchEventToCourse,
} from './calendarHelpers';

// =============================================================================
// CONTEXT TYPE
// =============================================================================

interface CalendarGridContextType {
  // Props
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  courses: Course[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCourseClick?: (courseId: number) => void;
  highlightedTaskId: number | null;
  /** Event id currently focused via keyboard (draws a blue outline) */
  focusedEventId: string | null;
  /** ISO date 'YYYY-MM-DD' of the focused day cell (Month/Week views) */
  focusedDate: string | null;

  // State
  popup: PopupState | null;
  setPopup: React.Dispatch<React.SetStateAction<PopupState | null>>;
  hoveredEventId: string | null;
  setHoveredEventId: React.Dispatch<React.SetStateAction<string | null>>;
  detailModal: DetailState | null;
  setDetailModal: React.Dispatch<React.SetStateAction<DetailState | null>>;
  currentTime: Date;

  // Refs
  containerRef: RefObject<HTMLDivElement>;
  weekGridRef: RefObject<HTMLDivElement>;
  dayGridRef: RefObject<HTMLDivElement>;

  // Computed
  courseMatches: Map<string, CourseMatch | null>;
  getEffectiveEventColor: (event: CalendarEvent) => string;
  getEventsForDate: (date: Date) => CalendarEvent[];

  // Handlers
  showPopup: (e: React.MouseEvent, events: CalendarEvent[], label: string) => void;
  hidePopup: () => void;
  hidePopupDelayed: () => void;
  cancelHidePopup: () => void;
  handleEventHover: (e: React.MouseEvent, event: CalendarEvent) => void;
  handleEventLeave: () => void;
  handleEventClick: (event: CalendarEvent) => void;

  // Time helpers
  getCurrentTimePosition: () => number;
  isTodayVisible: () => boolean;
  getTodayColumnIndex: () => number;

  // Render helpers
  renderDetailModal: () => React.ReactNode;
  renderPopup: () => React.ReactNode;
}

// =============================================================================
// CONTEXT
// =============================================================================

const CalendarGridContext = createContext<CalendarGridContextType | null>(null);

export function useCalendarGrid(): CalendarGridContextType {
  const context = useContext(CalendarGridContext);
  if (!context) {
    throw new Error('useCalendarGrid must be used within CalendarGridProvider');
  }
  return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

interface CalendarGridProviderProps {
  children: ReactNode;
  view: CalendarView;
  currentDate: Date;
  events: CalendarEvent[];
  courses: Course[];
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCourseClick?: (courseId: number) => void;
  highlightedTaskId?: number | null;
  focusedEventId?: string | null;
  focusedDate?: string | null;
}

export function CalendarGridProvider({
  children,
  view,
  currentDate,
  events,
  courses,
  onEventClick,
  onDateClick,
  onCourseClick,
  highlightedTaskId = null,
  focusedEventId = null,
  focusedDate = null,
}: CalendarGridProviderProps) {
  // State
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<DetailState | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const weekGridRef = useRef<HTMLDivElement>(null);
  const dayGridRef = useRef<HTMLDivElement>(null);
  const hidePopupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Course matches cache
  const courseMatches = useMemo(() => {
    const matches = new Map<string, CourseMatch | null>();
    for (const event of events) {
      if (event.type === 'imported') {
        const eventId = getEventId(event);
        const match = matchEventToCourse(event, courses);
        matches.set(eventId, match);
      }
    }
    return matches;
  }, [events, courses]);

  // Get effective event color
  const getEffectiveEventColor = useCallback(
    (event: CalendarEvent): string => {
      if (event.type === 'task') {
        return getCourseColor(event.course.id, event.course.color);
      }
      const eventId = getEventId(event);
      const match = courseMatches.get(eventId);
      if (match) {
        return getCourseColor(match.course.id, match.course.color);
      }
      return event.event.color || '#6366F1';
    },
    [courseMatches]
  );

  // Get events for a specific date
  const getEventsForDate = useCallback(
    (date: Date) => {
      return events.filter((e) => {
        const eventDate = getEventDate(e);
        if (!eventDate) return false;
        return isSameDay(eventDate, date);
      });
    },
    [events]
  );

  // Popup handlers
  const showPopup = useCallback(
    (e: React.MouseEvent, popupEvents: CalendarEvent[], label: string) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      let x = rect.right - containerRect.left + 8;
      let y = rect.top - containerRect.top;

      const popupWidth = 280;
      const popupHeight = Math.min(300, popupEvents.length * 80 + 40);

      if (rect.right + popupWidth + 16 > window.innerWidth) {
        x = rect.left - containerRect.left - popupWidth - 8;
      }

      if (rect.top + popupHeight > window.innerHeight - 20) {
        y = rect.bottom - containerRect.top - popupHeight;
      }

      if (y < 0) {
        y = 8;
      }

      setPopup({
        events: popupEvents,
        x: Math.max(8, x),
        y,
        label,
      });
    },
    []
  );

  const hidePopup = useCallback(() => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
    }
    setPopup(null);
  }, []);

  const hidePopupDelayed = useCallback(() => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
    }
    hidePopupTimeoutRef.current = setTimeout(() => {
      setPopup(null);
      setHoveredEventId(null);
    }, 150);
  }, []);

  const cancelHidePopup = useCallback(() => {
    if (hidePopupTimeoutRef.current) {
      clearTimeout(hidePopupTimeoutRef.current);
      hidePopupTimeoutRef.current = null;
    }
  }, []);

  const handleEventHover = useCallback(
    (e: React.MouseEvent, event: CalendarEvent) => {
      cancelHidePopup();
      const eventId = getEventId(event);
      setHoveredEventId(eventId);

      const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
      const label = match
        ? `${match.course.code} Event`
        : event.type === 'task'
          ? event.course.code
          : event.event.calendarName || 'Event';

      showPopup(e, [event], label);
    },
    [cancelHidePopup, courseMatches, showPopup]
  );

  const handleEventLeave = useCallback(() => {
    hidePopupDelayed();
  }, [hidePopupDelayed]);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      hidePopup();
      if (onEventClick) {
        onEventClick(event);
      } else {
        const eventId = getEventId(event);
        const match =
          event.type === 'imported' ? (courseMatches.get(eventId) ?? null) : null;
        setDetailModal({ event, courseMatch: match });
      }
    },
    [hidePopup, onEventClick, courseMatches]
  );

  // Time helpers
  const getCurrentTimePosition = useCallback(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return hours + minutes / 60;
  }, [currentTime]);

  const isTodayVisible = useCallback(() => {
    const today = new Date();
    if (view === 'day') {
      return isSameDay(currentDate, today);
    }
    if (view === 'week') {
      const weekDays = getWeekDays(currentDate);
      return weekDays.some((d) => isSameDay(d, today));
    }
    return false;
  }, [view, currentDate]);

  const getTodayColumnIndex = useCallback(() => {
    const today = new Date();
    const weekDays = getWeekDays(currentDate);
    return weekDays.findIndex((d) => isSameDay(d, today));
  }, [currentDate]);

  // Render detail modal
  const renderDetailModal = useCallback(() => {
    if (!detailModal) return null;

    const { event, courseMatch } = detailModal;
    const title = getEventTitle(event);
    const timeRange = getEventTimeRange(event);
    const description = getEventDescription(event);
    const effectiveColor = getEffectiveEventColor(event);
    const isTask = event.type === 'task';
    const isCompleted = isCompletedTask(event);

    const hideDetailModal = () => setDetailModal(null);

    return (
      <Modal isOpen onClose={hideDetailModal} size="md" zIndex={Z_INDEX.modal}>
        {/* Custom colored header (mirrors TaskDetailModal — NOT Modal.Header,
            because the event-color background + white text is structural chrome). */}
        <div style={{ ...styles.detailHeader, backgroundColor: effectiveColor }}>
          <div
            style={{
              ...styles.detailTitle,
              textDecoration: isCompleted ? 'line-through' : 'none',
            }}
          >
            {title}
            {isCompleted && ' (Completed)'}
          </div>
          <button
            style={styles.detailClose}
            onClick={hideDetailModal}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <Modal.Content maxHeight="60vh">
          {timeRange && (
            <div style={styles.modalRow}>
              <span style={styles.modalLabel}>Time</span>
              <span style={styles.modalValue}>{timeRange}</span>
            </div>
          )}

          <div style={styles.modalRow}>
            <span style={styles.modalLabel}>{isTask ? 'Course' : 'Calendar'}</span>
            <span style={styles.modalValue}>
              {isTask ? event.course.name : event.event.calendarName || 'Imported'}
            </span>
          </div>

          {isTask && (
            <>
              <div style={styles.modalRow}>
                <span style={styles.modalLabel}>Type</span>
                <span style={styles.modalValue}>{event.task.taskType}</span>
              </div>
              {event.task.weight > 0 && (
                <div style={styles.modalRow}>
                  <span style={styles.modalLabel}>Weight</span>
                  <span style={styles.modalValue}>{event.task.weight}%</span>
                </div>
              )}
            </>
          )}

          {!isTask && event.event.location && (
            <div style={styles.modalRow}>
              <span style={styles.modalLabel}>Location</span>
              <span style={styles.modalValue}>{event.event.location}</span>
            </div>
          )}

          {description && (
            <div style={styles.modalDescription}>
              <div style={styles.modalLabel}>Description</div>
              <div style={styles.modalDescriptionText}>{description}</div>
            </div>
          )}

          {courseMatch && (
            <button
              style={styles.modalCourseLink}
              onClick={() => {
                hideDetailModal();
                onCourseClick?.(courseMatch.course.id);
              }}
            >
              Go to {courseMatch.course.code} →
            </button>
          )}

          {isTask && (
            <button
              style={styles.modalCourseLink}
              onClick={() => {
                hideDetailModal();
                onCourseClick?.(event.course.id);
              }}
            >
              Go to {event.course.code} →
            </button>
          )}
        </Modal.Content>
      </Modal>
    );
  }, [detailModal, getEffectiveEventColor, onCourseClick]);

  // Render popup
  const renderPopup = useCallback(() => {
    if (!popup) return null;

    return (
      <div
        style={{
          ...styles.popup,
          left: popup.x,
          top: popup.y,
        }}
        onMouseEnter={cancelHidePopup}
        onMouseLeave={hidePopupDelayed}
      >
        <div style={styles.popupHeader}>{popup.label}</div>
        <div style={styles.popupList}>
          {popup.events.map((event, i) => {
            const time = getEventTimeRange(event);
            const isTask = event.type === 'task';
            const eventId = getEventId(event);
            const match = event.type === 'imported' ? courseMatches.get(eventId) : null;
            const effectiveColor = getEffectiveEventColor(event);
            const isCompleted = isCompletedTask(event);
            return (
              <div
                key={i}
                style={{
                  ...styles.popupItem,
                  borderLeft: `3px solid ${effectiveColor}`,
                  opacity: isCompleted ? 0.6 : 1,
                }}
                onClick={() => handleEventClick(event)}
              >
                <div
                  style={{
                    ...styles.popupItemTitle,
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}
                >
                  <strong>{getEventFullLabel(event)}</strong> {getEventTitle(event)}
                </div>
                {time && <div style={styles.popupItemTime}>{time}</div>}
                {isTask && (
                  <div style={styles.popupItemMeta}>
                    {event.task.taskType}
                    {event.task.weight > 0 && ` • ${event.task.weight}%`}
                  </div>
                )}
                {match && (
                  <div
                    style={styles.popupItemCourseLink}
                    onClick={(e) => {
                      e.stopPropagation();
                      hidePopup();
                      onCourseClick?.(match.course.id);
                    }}
                  >
                    → {match.course.code}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [
    popup,
    cancelHidePopup,
    hidePopupDelayed,
    courseMatches,
    getEffectiveEventColor,
    handleEventClick,
    hidePopup,
    onCourseClick,
  ]);

  const value: CalendarGridContextType = {
    view,
    currentDate,
    events,
    courses,
    onEventClick,
    onDateClick,
    onCourseClick,
    highlightedTaskId,
    focusedEventId,
    focusedDate,
    popup,
    setPopup,
    hoveredEventId,
    setHoveredEventId,
    detailModal,
    setDetailModal,
    currentTime,
    containerRef,
    weekGridRef,
    dayGridRef,
    courseMatches,
    getEffectiveEventColor,
    getEventsForDate,
    showPopup,
    hidePopup,
    hidePopupDelayed,
    cancelHidePopup,
    handleEventHover,
    handleEventLeave,
    handleEventClick,
    getCurrentTimePosition,
    isTodayVisible,
    getTodayColumnIndex,
    renderDetailModal,
    renderPopup,
  };

  return (
    <CalendarGridContext.Provider value={value}>{children}</CalendarGridContext.Provider>
  );
}
