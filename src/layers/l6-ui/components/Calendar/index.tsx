/**
 * Calendar Page
 * Full calendar view with month/week/day toggle and filtering
 */

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useDeferredValue,
  useRef,
} from 'react';
import { useKeymap } from '../../hooks/useKeymap';
import { useRegisterSubscope } from '../../contexts/KeyboardScopeContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { getEventId, positionEvents } from './calendarHelpers';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  Download,
  Upload,
  Plus,
} from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import {
  CalendarGrid,
  CalendarView,
  CalendarEvent,
  TaskCalendarEvent,
  ImportedCalendarEvent,
} from './CalendarGrid';
import { ImportConfirmationModal } from './ImportConfirmationModal';
import { DuplicateCalendarModal } from './DuplicateCalendarModal';
import { CalendarManagerPanel } from './CalendarManagerPanel';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { TaskDetailModal } from './TaskDetailModal';
import { EventFormModal } from './EventFormModal';
import {
  CalendarFilterPanel,
  DeadlineFilter,
  PriorityFilter,
} from './CalendarFilterPanel';
import { useCalendarDragDrop } from './useCalendarDragDrop';
import {
  loadCalendarViewMode,
  saveCalendarViewMode,
  getVisibleRange,
  getPrefetchRange,
  getHeaderTitle,
} from './calendarUtils';
import type {
  ICSImportPreview,
  Task,
  DisplayCalendarEvent,
} from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { generateICS } from './icsUtils';
import { calendarPageStyles as styles } from './calendarPageStyles';
import { createLogger } from '../../utils/rendererLogger';

const log = createLogger('Calendar');

export function CalendarPage() {
  const {
    tasks,
    courses,
    importedCalendars,
    calendarEvents,
    fetchImportedCalendars,
    fetchCalendarEventsForRange,
    fetchTasks,
    importICSFile,
    reimportCalendar,
    deleteImportedCalendar,
    toggleCalendarVisibility,
    updateImportedCalendar,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
  } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Defer calendar events to prevent flash when switching weeks
  // Old events stay visible until new ones are ready
  const deferredCalendarEvents = useDeferredValue(calendarEvents);

  // View state
  const [view, setViewState] = useState<CalendarView>(() => loadCalendarViewMode());
  const setView = (newView: CalendarView) => {
    setViewState(newView);
    saveCalendarViewMode(newView);
  };
  const [currentDate, setCurrentDate] = useState(() => {
    const saved = sessionStorage.getItem('calendar-current-date');
    if (saved) {
      const d = new Date(saved);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Track the last processed location.key to avoid re-processing
  const lastProcessedKey = React.useRef<string | null>(null);
  // useState initializer above already seeds currentDate from sessionStorage (or
  // today). Mark the ref as true so the navigation-state effect doesn't override.
  const hasInitializedDate = React.useRef(true);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<number> | null>(null);
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ICSImportPreview | null>(null);
  const [pendingICSContent, setPendingICSContent] = useState<string>('');

  // Duplicate calendar modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateFilename, setDuplicateFilename] = useState('');
  const [existingCalendarInfo, setExistingCalendarInfo] = useState<{
    id: number;
    name: string;
    color: string;
    eventCount: number;
    importedAt: string;
  } | null>(null);

  // Alert dialog state (replaces native alert())
  const [alertDialog, setAlertDialog] = useState<{
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info' | 'success';
  } | null>(null);

  // Panel states
  const [showCalendarManager, setShowCalendarManager] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventFormModal, setShowEventFormModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<DisplayCalendarEvent | null>(null);
  // When the edit modal is opened from the detail modal, we remember the
  // original event so pressing Escape / Close on the edit form returns to
  // the detail view instead of dismissing everything.
  const [eventToRestoreAfterEdit, setEventToRestoreAfterEdit] =
    useState<CalendarEvent | null>(null);

  // When Delete is pressed on a focused imported event, we stash it here and
  // render a ConfirmDialog; confirming calls deleteCalendarEvent.
  const [eventPendingDelete, setEventPendingDelete] = useState<CalendarEvent | null>(
    null
  );

  // Highlighted task for "View in Calendar" navigation
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);

  // Keyboard focus state
  // focusedDate = ISO date string 'YYYY-MM-DD' of the focused day cell (Month/Week)
  // focusedEventId = id of the sub-focused event within that day (or current day in Day view)
  const [focusedDate, setFocusedDate] = useState<string | null>(() => {
    return sessionStorage.getItem('calendar-focus-date') || null;
  });
  const [focusedEventId, setFocusedEventId] = useState<string | null>(() => {
    return sessionStorage.getItem('calendar-focus-event') || null;
  });
  useEffect(() => {
    if (focusedDate) sessionStorage.setItem('calendar-focus-date', focusedDate);
    else sessionStorage.removeItem('calendar-focus-date');
  }, [focusedDate]);
  useEffect(() => {
    if (focusedEventId) sessionStorage.setItem('calendar-focus-event', focusedEventId);
    else sessionStorage.removeItem('calendar-focus-event');
  }, [focusedEventId]);

  // Persist the "currently open detail modal" event so navigating away and back
  // (e.g. Go to Course 鈫?ESC) restores it. Skip the first run 鈥?on mount
  // selectedEvent is null (React state is per-instance), and clearing here
  // would wipe the sessionStorage entry left by the prior mount before the
  // restore effect gets a chance to read it.
  const persistSelectedInitialRef = useRef(true);
  useEffect(() => {
    if (persistSelectedInitialRef.current) {
      persistSelectedInitialRef.current = false;
      return;
    }
    if (selectedEvent) {
      const id = getEventId(selectedEvent);
      sessionStorage.setItem('calendar-selected-event', id);
      log.info(`[persist] saved selected event ${id}`);
    } else {
      sessionStorage.removeItem('calendar-selected-event');
      log.info('[persist] cleared selected event');
    }
  }, [selectedEvent]);

  // Log on mount so we can confirm Calendar actually re-mounts on return
  useEffect(() => {
    const saved = sessionStorage.getItem('calendar-selected-event');
    log.info(`[mount] CalendarPage mounted. saved selected=${saved ?? '(none)'}`);
    return () => {
      log.info('[unmount] CalendarPage unmounting');
    };
  }, []);

  // Persist the current view period so we return to the same month/week/day
  useEffect(() => {
    sessionStorage.setItem('calendar-current-date', currentDate.toISOString());
  }, [currentDate]);

  // (Restoration effect moved below focusableEvents definition 鈥?see later)
  const hasRestoredSelectedRef = useRef(false);

  // Keyboard mode for filter interaction
  type FilterSection =
    | 'filters-courses'
    | 'filters-deadline'
    | 'filters-priority'
    | 'filters-clear';
  const [filterSection, setFilterSection] = useState<FilterSection>('filters-courses');
  const filterSectionRef = useRef<FilterSection>('filters-courses');
  useEffect(() => {
    filterSectionRef.current = filterSection;
  }, [filterSection]);
  const [filterFocusIndex, setFilterFocusIndex] = useState(0);
  const filterFocusIndexRef = useRef(0);
  useEffect(() => {
    filterFocusIndexRef.current = filterFocusIndex;
  }, [filterFocusIndex]);

  // Drag-and-drop
  const handleImportReady = useCallback((content: string, preview: ICSImportPreview) => {
    setPendingICSContent(content);
    setImportPreview(preview);
    setShowImportModal(true);
  }, []);

  const { isDragging, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    useCalendarDragDrop({ onImportReady: handleImportReady });

  // Computed values
  const visibleRange = useMemo(
    () => getVisibleRange(currentDate, view),
    [currentDate, view]
  );

  // Prefetch range includes adjacent weeks for pre-rendering
  const prefetchRange = useMemo(
    () => getPrefetchRange(currentDate, view),
    [currentDate, view]
  );

  // Defer visible range for filtering to prevent flash when switching periods
  // This keeps showing old events until new ones are ready
  const deferredVisibleRange = useDeferredValue(visibleRange);

  const hasActiveFilters =
    selectedCourses !== null || deadlineFilter !== 'all' || priorityFilter !== 'all';

  // Fetch imported calendars on mount
  useEffect(() => {
    fetchImportedCalendars();
  }, [fetchImportedCalendars]);

  // Handle navigation and view mode sync
  useEffect(() => {
    if (lastProcessedKey.current === location.key) return;
    lastProcessedKey.current = location.key;

    setViewState(loadCalendarViewMode());

    const state = location.state as { taskId?: number; targetDate?: string } | null;
    if (state?.targetDate) {
      const targetDate = new Date(state.targetDate);
      if (!isNaN(targetDate.getTime())) {
        setCurrentDate(targetDate);
        hasInitializedDate.current = true;
        if (state.taskId) {
          // Open the task detail modal
          const task = tasks.find((t) => t.id === state.taskId);
          const course = task ? courses.find((c) => c.id === task.courseId) : null;
          if (task && course) {
            setSelectedEvent({ type: 'task', task, course });
          }
          // Highlight the task and scroll to it
          setHighlightedTaskId(state.taskId);
          // Scroll to the event after a short delay to allow render
          setTimeout(() => {
            const eventEl = document.querySelector(`[data-task-id="${state.taskId}"]`);
            if (eventEl) {
              eventEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 100);
          // Clear highlight after 3 seconds
          setTimeout(() => {
            setHighlightedTaskId(null);
          }, 3000);
        }
        // Clear the navigation state to prevent modal from reopening on refresh/view changes
        navigate(location.pathname, { replace: true, state: null });
        return;
      }
    }
    // Only reset to today on initial mount, not when clearing navigation state
    if (!hasInitializedDate.current) {
      setCurrentDate(new Date());
      hasInitializedDate.current = true;
    }
  }, [location.key, location.state, tasks, courses, navigate, location.pathname]);

  // Fetch events when range changes (uses prefetch range for pre-rendering)
  useEffect(() => {
    fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
  }, [prefetchRange, fetchCalendarEventsForRange]);

  // Build courses with colors
  const coursesWithColors = useMemo(
    () => courses.map((c) => ({ ...c, color: getCourseColor(c.id, c.color) })),
    [courses]
  );

  const courseMap = useMemo(
    () => new Map(coursesWithColors.map((c) => [c.id, c])),
    [coursesWithColors]
  );

  // Helper to check if a calendar event has a real start time (not epoch sentinel)
  // Epoch sentinel (< 1 day from 1970-01-01) means "deadline only, no start time"
  const hasRealStartTime = (startAt: string): boolean => {
    return new Date(startAt).getTime() >= 86400000; // >= 1 day from epoch
  };

  // Build set of task IDs that have calendar events with real start times
  // These tasks should NOT be rendered as task events (they'll be rendered as calendar events)
  const tasksWithRealStartEvents = useMemo(() => {
    const taskIds = new Set<number>();
    for (const event of deferredCalendarEvents) {
      if (event.taskId && hasRealStartTime(event.startAt)) {
        taskIds.add(event.taskId);
      }
    }
    return taskIds;
  }, [deferredCalendarEvents]);

  // Build task events with filtering
  // Excludes tasks that have linked calendar events with real start times
  const taskEvents: TaskCalendarEvent[] = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthEnd = new Date(todayStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    return tasks
      .filter((task) => {
        if (!task.dueAt) return false;
        if (selectedCourses !== null && !selectedCourses.has(task.courseId)) return false;

        // Skip tasks that have calendar events with real start times
        // (they will be rendered as imported events with proper time blocks)
        if (tasksWithRealStartEvents.has(task.id)) return false;

        const dueDate = new Date(task.dueAt);
        if (deadlineFilter !== 'all') {
          switch (deadlineFilter) {
            case 'overdue':
              if (dueDate >= todayStart) return false;
              break;
            case 'today':
              if (dueDate < todayStart || dueDate >= todayEnd) return false;
              break;
            case 'this-week':
              if (dueDate < todayStart || dueDate >= weekEnd) return false;
              break;
            case 'this-month':
              if (dueDate < todayStart || dueDate >= monthEnd) return false;
              break;
          }
        }

        if (priorityFilter !== 'all' && task.dueAt) {
          // Use due-date-based urgency instead of priority score
          const now = new Date();
          const due = new Date(task.dueAt);
          const hoursUntilDue = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
          switch (priorityFilter) {
            case 'high':
              // High urgency: overdue or due within 3 days
              if (hoursUntilDue > 72) return false;
              break;
            case 'medium':
              // Medium urgency: due within 3-7 days
              if (hoursUntilDue <= 72 || hoursUntilDue > 168) return false;
              break;
            case 'low':
              // Low urgency: due in more than 7 days
              if (hoursUntilDue <= 168) return false;
              break;
          }
        }
        return true;
      })
      .reduce<TaskCalendarEvent[]>((acc, task) => {
        const course = courseMap.get(task.courseId);
        if (course) acc.push({ type: 'task', task, course });
        return acc;
      }, []);
  }, [
    tasks,
    courseMap,
    selectedCourses,
    deadlineFilter,
    priorityFilter,
    tasksWithRealStartEvents,
  ]);

  // Build imported events
  // Include: non-task events AND task-linked events with real start times
  // Exclude: task-linked events with epoch start (deadline only - rendered as task events)
  // Also filter by selected courses (match event title/calendar to course codes)
  const importedEvents: ImportedCalendarEvent[] = useMemo(() => {
    return deferredCalendarEvents
      .filter((e) => !e.taskId || hasRealStartTime(e.startAt))
      .filter((event) => {
        // If no course filter active, show all
        if (selectedCourses === null) return true;
        // If all courses deselected, hide all
        if (selectedCourses.size === 0) return false;

        // Prefer the event's explicit courseId when present 鈥?this is exact
        // and avoids the ambiguity of two courses sharing a code prefix
        // (e.g. two "ECE342H1 S LEC0102" + "ECE342H1 S PRA0105" entries
        // both matching a shortCode "ece342" in title-based filtering).
        if (event.courseId !== null && event.courseId !== undefined) {
          return selectedCourses.has(event.courseId);
        }

        // Fallback for events without a courseId (e.g. free-form ICS imports):
        // match by event title/calendar-name text.
        const title = event.title.toLowerCase();
        const calendarName = event.calendarName?.toLowerCase() || '';

        for (const course of coursesWithColors) {
          if (!selectedCourses.has(course.id)) continue;

          const code = course.code.toLowerCase();
          const shortCode = code.split(/[hy]\d/)[0];

          if (
            title.includes(code) ||
            calendarName.includes(code) ||
            (shortCode.length >= 3 &&
              (title.includes(shortCode) || calendarName.includes(shortCode)))
          ) {
            return true;
          }
        }

        // Event doesn't match any selected course - hide it
        return false;
      })
      .map((event) => ({ type: 'imported' as const, event }));
  }, [deferredCalendarEvents, selectedCourses, coursesWithColors]);

  const events: CalendarEvent[] = useMemo(
    () => [...taskEvents, ...importedEvents],
    [taskEvents, importedEvents]
  );

  // Filter events to visible range (using deferred range to prevent flash)
  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.type === 'task') {
        if (!e.task.dueAt) return false;
        const dueDate = new Date(e.task.dueAt);
        return (
          dueDate >= deferredVisibleRange.start && dueDate <= deferredVisibleRange.end
        );
      }
      const startAt = new Date(e.event.startAt);
      const endAt = e.event.endAt ? new Date(e.event.endAt) : startAt;
      return startAt < deferredVisibleRange.end && endAt > deferredVisibleRange.start;
    });
  }, [events, deferredVisibleRange]);

  // Sorted flat list of focusable events for keyboard navigation
  const focusableEvents = useMemo(() => {
    return [...visibleEvents].sort((a, b) => {
      const da =
        a.type === 'task'
          ? new Date(a.task.dueAt!).getTime()
          : new Date(a.event.startAt).getTime();
      const db =
        b.type === 'task'
          ? new Date(b.task.dueAt!).getTime()
          : new Date(b.event.startAt).getTime();
      return da - db;
    });
  }, [visibleEvents]);

  const focusedEvent = useMemo(() => {
    if (!focusedEventId) return null;
    return focusableEvents.find((e) => getEventId(e) === focusedEventId) || null;
  }, [focusableEvents, focusedEventId]);

  // On mount, restore the detail modal if a saved selected event matches one
  // of the events currently loaded. Keeps retrying as focusableEvents populates
  // so async event loading doesn't cause us to miss the restore.
  useEffect(() => {
    if (hasRestoredSelectedRef.current) {
      log.info('[restore] already restored, skipping');
      return;
    }
    if (selectedEvent) {
      log.info('[restore] selectedEvent already set, skipping');
      return;
    }
    const savedId = sessionStorage.getItem('calendar-selected-event');
    if (!savedId) {
      log.info('[restore] no savedId in sessionStorage');
      return;
    }
    if (focusableEvents.length === 0) {
      log.info(`[restore] focusableEvents empty (savedId=${savedId}), waiting`);
      return;
    }
    const match = focusableEvents.find((ev) => getEventId(ev) === savedId);
    if (match) {
      log.info(`[restore] matched event ${savedId}, reopening modal`);
      setSelectedEvent(match);
      hasRestoredSelectedRef.current = true;
    } else {
      log.info(
        `[restore] savedId=${savedId} not in ${focusableEvents.length} focusableEvents`
      );
    }
    // Note: if match not found yet, don't set ref=true 鈥?events may still be loading
  }, [focusableEvents, selectedEvent]);

  // Helper: convert a Date 鈫?'YYYY-MM-DD' local date string
  const toISODate = useCallback((d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);
  // Helper: parse 'YYYY-MM-DD' 鈫?Date at local midnight
  const fromISODate = useCallback((iso: string): Date => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, []);
  // Get events on a specific date, sorted by start time
  const getEventsOnDate = useCallback(
    (dateISO: string): CalendarEvent[] => {
      const target = fromISODate(dateISO);
      return focusableEvents.filter((e) => {
        const d =
          e.type === 'task' && e.task.dueAt
            ? new Date(e.task.dueAt)
            : e.type === 'imported'
              ? new Date(e.event.startAt)
              : null;
        if (!d) return false;
        return (
          d.getFullYear() === target.getFullYear() &&
          d.getMonth() === target.getMonth() &&
          d.getDate() === target.getDate()
        );
      });
    },
    [focusableEvents, fromISODate]
  );

  // Get visible courses
  const visibleCourses = useMemo(() => {
    const courseIds = new Set(
      visibleEvents
        .filter((e): e is TaskCalendarEvent => e.type === 'task')
        .map((e) => e.course.id)
    );
    for (const event of visibleEvents) {
      if (event.type === 'imported') {
        // Prefer the event's explicit courseId 鈥?avoids false matches when
        // two courses share a code prefix.
        if (event.event.courseId !== null && event.event.courseId !== undefined) {
          courseIds.add(event.event.courseId);
          continue;
        }
        const eventTitle = event.event.title.toLowerCase();
        const calendarName = event.event.calendarName?.toLowerCase() || '';
        for (const course of coursesWithColors) {
          const code = course.code.toLowerCase();
          const shortCode = code.split(/[hy]\d/)[0];
          if (
            eventTitle.includes(code) ||
            calendarName.includes(code) ||
            (shortCode.length >= 3 &&
              (eventTitle.includes(shortCode) || calendarName.includes(shortCode)))
          ) {
            courseIds.add(course.id);
            break;
          }
        }
      }
    }
    return Array.from(courseMap.values()).filter((c) => courseIds.has(c.id));
  }, [visibleEvents, courseMap, coursesWithColors]);

  // Navigation handlers
  // Clicking the nav arrows changes currentDate; keep focusedDate in sync and
  // clear focusedEventId so subsequent keyboard nav doesn't reference a day or
  // event outside the now-visible range (which would cause A/D fallbacks to
  // misfire in Day view).
  const goToPrevious = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
      else if (view === 'week') newDate.setDate(newDate.getDate() - 7);
      else newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
    setFocusedEventId(null);
    if (view === 'day') setFocusedDate(null);
  };

  const goToNext = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
      else if (view === 'week') newDate.setDate(newDate.getDate() + 7);
      else newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
    setFocusedEventId(null);
    if (view === 'day') setFocusedDate(null);
  };

  const goToToday = () => setCurrentDate(new Date());

  const cycleView = useCallback(() => {
    const order: CalendarView[] = ['month', 'week', 'day'];
    const idx = order.indexOf(view);
    setView(order[(idx + 1) % order.length]);
  }, [view]);

  // Track modal open state for hotkey gating
  const isAnyModalOpenRef = useRef(false);

  // When the view mode changes, snap the focused date to the current period.
  // (We don't run this on every visibleRange change because shiftDay advances the
  // period itself when needed, and a naive snap-back would fight that.)
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    if (!focusedDate) return;
    const d = fromISODate(focusedDate);
    if (d < visibleRange.start || d > visibleRange.end) {
      setFocusedDate(toISODate(currentDate));
      setFocusedEventId(null);
    }
  }, [view, visibleRange, focusedDate, currentDate, fromISODate, toISODate]);

  // Scroll focused element into view when focus changes
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      // Prefer focused event; fall back to focused day cell
      if (focusedEventId) {
        const el = document.querySelector(
          `[data-calendar-event-id="${CSS.escape(focusedEventId)}"]`
        );
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          return;
        }
      }
      if (focusedDate) {
        const el = document.querySelector(
          `[data-calendar-date="${CSS.escape(focusedDate)}"]`
        );
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [focusedEventId, focusedDate]);

  // Filter handlers
  const toggleCourseFilter = (courseId: number) => {
    setSelectedCourses((prev) => {
      if (prev === null) {
        const newSet = new Set(courses.map((c) => c.id));
        newSet.delete(courseId);
        return newSet;
      }
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next.size === courses.length ? null : next;
    });
  };

  const clearFilters = () => {
    setSelectedCourses(null);
    setDeadlineFilter('all');
    setPriorityFilter('all');
  };

  // Import handlers
  const handleImportConfirm = useCallback(
    async (options: { name: string; color: string }) => {
      if (!pendingICSContent || !importPreview) return;
      const result = await importICSFile(
        pendingICSContent,
        importPreview.filename,
        options
      );

      // Check if this is a duplicate
      if (
        !result.success &&
        (result as { existingCalendar?: unknown }).existingCalendar
      ) {
        const existingCal = (result as { existingCalendar: typeof existingCalendarInfo })
          .existingCalendar;
        setShowImportModal(false);
        setDuplicateFilename(importPreview.filename);
        setExistingCalendarInfo(existingCal);
        setShowDuplicateModal(true);
        // Keep pendingICSContent for potential reimport
        return;
      }

      setShowImportModal(false);
      setImportPreview(null);
      setPendingICSContent('');
      await fetchImportedCalendars();
      fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
    },
    [
      pendingICSContent,
      importPreview,
      importICSFile,
      fetchImportedCalendars,
      fetchCalendarEventsForRange,
      visibleRange,
    ]
  );

  // Duplicate calendar modal handlers
  const handleDuplicateViewCalendar = useCallback(() => {
    setShowDuplicateModal(false);
    setExistingCalendarInfo(null);
    setDuplicateFilename('');
    setPendingICSContent('');
    setImportPreview(null);
    // Calendar is already visible in the list
  }, []);

  const handleDuplicateReimport = useCallback(async () => {
    if (!existingCalendarInfo || !pendingICSContent) return;
    await reimportCalendar(existingCalendarInfo.id, pendingICSContent);
    setShowDuplicateModal(false);
    setExistingCalendarInfo(null);
    setDuplicateFilename('');
    setPendingICSContent('');
    setImportPreview(null);
    await fetchImportedCalendars();
    fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
  }, [
    existingCalendarInfo,
    pendingICSContent,
    reimportCalendar,
    fetchImportedCalendars,
    fetchCalendarEventsForRange,
    visibleRange,
  ]);

  const handleDuplicateCancel = useCallback(() => {
    setShowDuplicateModal(false);
    setExistingCalendarInfo(null);
    setDuplicateFilename('');
    setPendingICSContent('');
    setImportPreview(null);
  }, []);

  const handleImportICS = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const content = await file.text();
        const preview = await window.api.parseICSPreview(content, file.name);
        if (preview) handleImportReady(content, preview);
      } catch (error) {
        log.error('Failed to parse ICS file', error instanceof Error ? error : undefined);
      }
    };
    input.click();
  };

  const handleExportICS = async () => {
    const icsContent = generateICS(events);
    const defaultName = `canvas-calendar-${currentDate.toISOString().split('T')[0]}.ics`;
    try {
      await window.api.saveFile({
        defaultName,
        content: icsContent,
        filters: [{ name: 'iCalendar', extensions: ['ics'] }],
      });
    } catch (error) {
      log.error('Export failed', error instanceof Error ? error : undefined);
    }
  };

  // Event handlers
  // Clicking an event should also sync the keyboard focus highlight so that
  // resuming keyboard navigation picks up from the clicked item (not wherever
  // the focus cursor was previously).
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setFocusedEventId(getEventId(event));
    const start =
      event.type === 'task' && event.task.dueAt
        ? new Date(event.task.dueAt)
        : event.type === 'imported'
          ? new Date(event.event.startAt)
          : null;
    if (start) setFocusedDate(toISODate(start));
  };

  const markTaskComplete = useStore((state) => state.markTaskComplete);
  const handleToggleTaskComplete = async (task: Task) => {
    try {
      await markTaskComplete(task.id, !task.isCompleted);
      setSelectedEvent(null);
    } catch (error) {
      log.error(
        'Failed to toggle task completion',
        error instanceof Error ? error : undefined
      );
    }
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    setFocusedDate(toISODate(date));
    setFocusedEventId(null);
    if (view === 'month') setView('day');
  };

  const handleOpenCreateEvent = () => {
    setEventToEdit(null);
    setShowEventFormModal(true);
  };

  const handleOpenEditEvent = (event: DisplayCalendarEvent) => {
    setEventToEdit(event);
    setShowEventFormModal(true);
    // Stash the detail-modal event so closing the edit form restores the detail view
    if (selectedEvent) setEventToRestoreAfterEdit(selectedEvent);
    setSelectedEvent(null);
  };

  const handleSaveEvent = async (data: {
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
    taskType?: string;
    weight?: number;
  }) => {
    try {
      if (eventToEdit) {
        const success = await updateCalendarEvent(eventToEdit.id, data);
        if (!success) {
          log.error('Failed to update calendar event');
          setAlertDialog({
            title: 'Error',
            message: 'Failed to update event. Please try again.',
            type: 'danger',
          });
          return;
        }
      } else {
        const result = await createCalendarEvent(data);
        if (!result.success) {
          log.error('Failed to create calendar event');
          setAlertDialog({
            title: 'Error',
            message: 'Failed to create event. Please try again.',
            type: 'danger',
          });
          return;
        }
      }
      setShowEventFormModal(false);
      setEventToEdit(null);
      setEventToRestoreAfterEdit(null);
      fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
    } catch (error) {
      log.error('Error saving event', error instanceof Error ? error : undefined);
      setAlertDialog({
        title: 'Error',
        message: 'An error occurred while saving the event.',
        type: 'danger',
      });
    }
  };

  const handleSaveCoursework = async (data: {
    courseId: number;
    title: string;
    description?: string;
    unlockAt?: string;
    startAt?: string;
    dueAt?: string;
    weight?: number;
    pointsPossible?: number;
    taskType?: string;
    location?: string;
  }): Promise<{ success: boolean; taskId?: number }> => {
    try {
      const api = window.api;
      if (!api) return { success: false };
      const result = await api.dispatch('CreateTask', data);
      if (result.success) {
        setShowEventFormModal(false);
        setEventToEdit(null);
        setEventToRestoreAfterEdit(null);
        // Refetch calendar events to include the newly created calendar event
        // (CreateTask also creates a linked calendar_events row for user tasks)
        fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
        return { success: true, taskId: result.data?.taskId };
      }
      return { success: false };
    } catch (error) {
      log.error(
        'Failed to create coursework',
        error instanceof Error ? error : undefined
      );
      return { success: false };
    }
  };

  const handleDeleteEvent = async () => {
    if (eventToEdit) {
      await deleteCalendarEvent(eventToEdit.id);
      setShowEventFormModal(false);
      setEventToEdit(null);
      setEventToRestoreAfterEdit(null);
      fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
    }
  };

  const handleEditFromDetail = () => {
    if (selectedEvent?.type === 'imported') {
      handleOpenEditEvent(selectedEvent.event);
    } else if (selectedEvent?.type === 'task') {
      // First try direct link via task.calendarEventId (for accepted/merged tasks)
      const directEvent = selectedEvent.task.calendarEventId
        ? calendarEvents.find((e) => e.id === selectedEvent.task.calendarEventId)
        : null;
      if (directEvent) {
        handleOpenEditEvent(directEvent);
        return;
      }
      // Fallback: find by taskId (for tasks linked by taskId in calendar event)
      const linkedEvent = calendarEvents.find((e) => e.taskId === selectedEvent.task.id);
      if (linkedEvent) handleOpenEditEvent(linkedEvent);
    }
  };

  const handleDeleteFromDetail = async () => {
    if (!selectedEvent) return;
    if (selectedEvent.type === 'imported') {
      await deleteCalendarEvent(selectedEvent.event.id);
    } else if (selectedEvent.type === 'task') {
      const api = window.api;
      if (!api?.dispatch) return;
      try {
        await api.dispatch('DeleteTask', {
          taskId: selectedEvent.task.id,
          force: true,
        });
        await fetchTasks();
      } catch (err) {
        log.error(
          'Failed to delete task from calendar',
          err instanceof Error ? err : undefined
        );
      }
    }
    setSelectedEvent(null);
    setFocusedEventId(null);
    fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
  };

  // Helper to open edit modal for any CalendarEvent (task or imported)
  const openEditForEvent = (event: CalendarEvent) => {
    if (event.type === 'imported') {
      handleOpenEditEvent(event.event);
    } else if (event.type === 'task') {
      const directEvent = event.task.calendarEventId
        ? calendarEvents.find((e) => e.id === event.task.calendarEventId)
        : null;
      if (directEvent) {
        handleOpenEditEvent(directEvent);
        return;
      }
      const linkedEvent = calendarEvents.find((e) => e.taskId === event.task.id);
      if (linkedEvent) handleOpenEditEvent(linkedEvent);
    }
  };

  // Update modal-open ref for hotkey gating
  useEffect(() => {
    isAnyModalOpenRef.current =
      !!selectedEvent ||
      showEventFormModal ||
      !!alertDialog ||
      showImportModal ||
      showDuplicateModal ||
      !!eventPendingDelete;
  });

  // Keyboard shortcuts (document-level so focus target doesn't matter)
  // ---------------------------------------------------------------------------
  // Keyboard 鈥?useKeymap routes keys between events and filter scopes.
  // Alt+Shift+D/P/C and Alt+1-9 fire in BOTH scopes so they live in a small
  // separate handler below.
  // ---------------------------------------------------------------------------

  // Helpers for filter-scope section / option navigation (use refs for freshness)
  const calPrevFilterSection = useCallback(() => {
    const sections: FilterSection[] = [
      'filters-courses',
      'filters-deadline',
      'filters-priority',
      ...(hasActiveFilters ? (['filters-clear'] as const) : []),
    ];
    const idx = sections.indexOf(filterSectionRef.current);
    const start = idx === -1 ? 0 : idx;
    setFilterSection(sections[(start - 1 + sections.length) % sections.length]);
    setFilterFocusIndex(0);
  }, [hasActiveFilters]);

  const calNextFilterSection = useCallback(() => {
    const sections: FilterSection[] = [
      'filters-courses',
      'filters-deadline',
      'filters-priority',
      ...(hasActiveFilters ? (['filters-clear'] as const) : []),
    ];
    const idx = sections.indexOf(filterSectionRef.current);
    const start = idx === -1 ? 0 : idx;
    setFilterSection(sections[(start + 1) % sections.length]);
    setFilterFocusIndex(0);
  }, [hasActiveFilters]);

  const calWalkFilterOption = useCallback(
    (dir: 1 | -1) => {
      const maxBySection: Record<FilterSection, number> = {
        'filters-courses': courses.length,
        'filters-deadline': 5,
        'filters-priority': 4,
        'filters-clear': 0,
      };
      const max = maxBySection[filterSectionRef.current];
      if (max <= 0) return;
      setFilterFocusIndex((prev) => {
        const next = prev + dir;
        return ((next % max) + max) % max;
      });
    },
    [courses.length]
  );

  const calToggleFilterOption = useCallback(() => {
    const sec = filterSectionRef.current;
    const idx = filterFocusIndexRef.current;
    if (sec === 'filters-courses' && courses[idx]) {
      toggleCourseFilter(courses[idx].id);
    } else if (sec === 'filters-deadline') {
      const opts: DeadlineFilter[] = [
        'all',
        'overdue',
        'today',
        'this-week',
        'this-month',
      ];
      setDeadlineFilter(opts[idx]);
    } else if (sec === 'filters-priority') {
      const opts: PriorityFilter[] = ['all', 'high', 'medium', 'low'];
      setPriorityFilter(opts[idx]);
    } else if (sec === 'filters-clear') {
      clearFilters();
      setFilterSection('filters-courses');
      setFilterFocusIndex(0);
    }
  }, [courses, toggleCourseFilter, clearFilters]);

  // Helpers for events-scope navigation (inline 鈥?closed over via keymapsRef)
  // pickEdgeEventOfDay and navigateWeekHorizontal were previously defined inside
  // the document handler; they're now component-level so useKeymap can reference them.
  const getEventStartAt = useCallback((ev: CalendarEvent): Date | null => {
    if (ev.type === 'task' && ev.task.dueAt) return new Date(ev.task.dueAt);
    if (ev.type === 'imported') return new Date(ev.event.startAt);
    return null;
  }, []);

  const pickEdgeEventOfDay = useCallback(
    (dayEvents: CalendarEvent[], direction: 1 | -1): CalendarEvent | null => {
      if (dayEvents.length === 0) return null;
      const positioned = positionEvents(dayEvents);
      if (positioned.length === 0) {
        return direction > 0 ? dayEvents[0] : dayEvents[dayEvents.length - 1];
      }
      const maxStart = Math.max(
        ...positioned.map((p) => {
          const d =
            p.event.type === 'task' && p.event.task.dueAt
              ? new Date(p.event.task.dueAt).getTime()
              : p.event.type === 'imported'
                ? new Date(p.event.event.startAt).getTime()
                : 0;
          return d;
        })
      );
      const latestRow = positioned.filter((p) => {
        const d =
          p.event.type === 'task' && p.event.task.dueAt
            ? new Date(p.event.task.dueAt).getTime()
            : p.event.type === 'imported'
              ? new Date(p.event.event.startAt).getTime()
              : 0;
        return d === maxStart;
      });
      latestRow.sort((a, b) => a.column - b.column);
      return direction > 0 ? latestRow[0].event : latestRow[latestRow.length - 1].event;
    },
    []
  );

  const navigateWeekHorizontal = useCallback(
    (
      direction: 1 | -1,
      focusedEvent: CalendarEvent | null,
      focusedDate: string | null
    ) => {
      if (!focusedEvent) {
        const dayISO = focusedDate ?? toISODate(currentDate);
        const dayEvents = getEventsOnDate(dayISO);
        const edge = pickEdgeEventOfDay(dayEvents, direction);
        if (edge) {
          setFocusedEventId(getEventId(edge));
          if (!focusedDate) setFocusedDate(dayISO);
          return;
        }
        if (view === 'week') shiftDay(direction);
        return;
      }
      const curStart = getEventStartAt(focusedEvent);
      if (!curStart) return;
      const curDayISO = toISODate(curStart);
      const sameHourGroup = getEventsOnDate(curDayISO).filter((ev) => {
        const s = getEventStartAt(ev);
        return s && s.getHours() === curStart.getHours();
      });
      const curIdx = sameHourGroup.findIndex(
        (ev) => getEventId(ev) === getEventId(focusedEvent)
      );
      const nextInGroup = sameHourGroup[curIdx + direction];
      if (nextInGroup) {
        setFocusedEventId(getEventId(nextInGroup));
        return;
      }
      const adjDayDate = new Date(curStart);
      adjDayDate.setDate(adjDayDate.getDate() + direction);
      const adjDayISO = toISODate(adjDayDate);
      const adjEvents = getEventsOnDate(adjDayISO);
      if (adjEvents.length > 0) {
        const closest = adjEvents.reduce((best, ev) => {
          const s = getEventStartAt(ev);
          const bestS = getEventStartAt(best);
          if (!s) return best;
          if (!bestS) return ev;
          const diff = Math.abs(
            s.getHours() * 60 +
              s.getMinutes() -
              (curStart.getHours() * 60 + curStart.getMinutes())
          );
          const bestDiff = Math.abs(
            bestS.getHours() * 60 +
              bestS.getMinutes() -
              (curStart.getHours() * 60 + curStart.getMinutes())
          );
          return diff < bestDiff ? ev : best;
        });
        setFocusedEventId(getEventId(closest));
        setFocusedDate(adjDayISO);
        return;
      }
      if (view === 'week') shiftDay(direction);
    },
    [currentDate, view, getEventsOnDate, pickEdgeEventOfDay, getEventStartAt, toISODate]
  );

  const shiftDay = useCallback(
    (deltaDays: number) => {
      const anchor = focusedDate ?? toISODate(currentDate);
      const d = fromISODate(anchor);
      d.setDate(d.getDate() + deltaDays);
      setFocusedDate(toISODate(d));
      setFocusedEventId(null);
      if (view === 'day') {
        setCurrentDate(d);
      } else if (view === 'month') {
        if (
          d.getFullYear() !== currentDate.getFullYear() ||
          d.getMonth() !== currentDate.getMonth()
        ) {
          setCurrentDate(d);
        }
      } else if (view === 'week') {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        if (d < weekStart || d > weekEnd) setCurrentDate(d);
      }
    },
    [focusedDate, currentDate, view, fromISODate, toISODate]
  );

  const cycleEventsInDay = useCallback(
    (delta: 1 | -1) => {
      const anchor = focusedDate ?? toISODate(currentDate);
      const events = getEventsOnDate(anchor);
      if (events.length === 0) return;
      if (!focusedDate) setFocusedDate(anchor);
      setFocusedEventId((prev) => {
        if (!prev) return getEventId(delta > 0 ? events[0] : events[events.length - 1]);
        const idx = events.findIndex((ev) => getEventId(ev) === prev);
        if (idx < 0) return getEventId(events[0]);
        return getEventId(events[(idx + delta + events.length) % events.length]);
      });
    },
    [focusedDate, currentDate, toISODate, getEventsOnDate]
  );

  const { scope: calScope, setScope: setCalScope } = useKeymap<'events' | 'filter'>(
    {
      events: {
        // Period navigation
        'mod+ArrowLeft': (e) => {
          e.preventDefault();
          const d = new Date(currentDate);
          d.setMonth(
            view === 'month'
              ? d.getMonth() - 1
              : view === 'week'
                ? d.getDate() - 7
                : d.getDate() - 1,
            view === 'month' ? d.getDate() : undefined
          );
          if (view === 'month') d.setMonth(d.getMonth() - 1);
          else if (view === 'week') d.setDate(d.getDate() - 7);
          else d.setDate(d.getDate() - 1);
          setCurrentDate(d);
          setFocusedDate(toISODate(d));
          setFocusedEventId(null);
        },
        'mod+ArrowRight': (e) => {
          e.preventDefault();
          const d = new Date(currentDate);
          if (view === 'month') d.setMonth(d.getMonth() + 1);
          else if (view === 'week') d.setDate(d.getDate() + 7);
          else d.setDate(d.getDate() + 1);
          setCurrentDate(d);
          setFocusedDate(toISODate(d));
          setFocusedEventId(null);
        },
        // Horizontal navigation
        'ArrowLeft,a': (e) => {
          e.preventDefault();
          if (view === 'day' || view === 'week') {
            navigateWeekHorizontal(-1, focusedEvent, focusedDate);
          } else {
            if (!focusedDate) setFocusedDate(toISODate(currentDate));
            else shiftDay(-1);
          }
        },
        'ArrowRight,d': (e) => {
          e.preventDefault();
          if (view === 'day' || view === 'week') {
            navigateWeekHorizontal(1, focusedEvent, focusedDate);
          } else {
            if (!focusedDate) setFocusedDate(toISODate(currentDate));
            else shiftDay(1);
          }
        },
        // Shift+D jumps to deadline filter when panel is open
        'shift+d': (e) => {
          if (showFilters) {
            e.preventDefault();
            setCalScope('filter');
            setFilterSection('filters-deadline');
            setFilterFocusIndex(0);
          }
        },
        // Day navigation Q/E
        q: (e) => {
          if (view === 'week' || view === 'day') {
            e.preventDefault();
            if (!focusedDate) setFocusedDate(toISODate(currentDate));
            else shiftDay(-1);
          }
        },
        e: (e) => {
          if (view === 'week' || view === 'day') {
            e.preventDefault();
            if (!focusedDate) setFocusedDate(toISODate(currentDate));
            else shiftDay(1);
          } else if (focusedEvent) {
            e.preventDefault();
            openEditForEvent(focusedEvent);
          }
        },
        // View cycle
        Tab: (e) => {
          e.preventDefault();
          const order: CalendarView[] = ['month', 'week', 'day'];
          const idx = order.indexOf(view);
          setView(
            order[
              e.shiftKey
                ? (idx - 1 + order.length) % order.length
                : (idx + 1) % order.length
            ]
          );
        },
        'shift+Tab': (e) => {
          e.preventDefault();
          const order: CalendarView[] = ['month', 'week', 'day'];
          const idx = order.indexOf(view);
          setView(order[(idx - 1 + order.length) % order.length]);
        },
        t: (e) => {
          e.preventDefault();
          goToToday();
          setFocusedDate(toISODate(new Date()));
          setFocusedEventId(null);
        },
        v: (e) => {
          e.preventDefault();
          cycleView();
        },
        // Filter panel
        f: (e) => {
          e.preventDefault();
          setShowFilters((prev) => {
            const next = !prev;
            if (next) setCalScope('filter');
            setFilterFocusIndex(0);
            return next;
          });
        },
        c: (e) => {
          if (showFilters) {
            e.preventDefault();
            setCalScope('filter');
            setFilterSection('filters-courses');
            setFilterFocusIndex(0);
          }
        },
        p: (e) => {
          if (showFilters) {
            e.preventDefault();
            setCalScope('filter');
            setFilterSection('filters-priority');
            setFilterFocusIndex(0);
          }
        },
        // Vertical navigation
        'ArrowUp,w': (e) => {
          e.preventDefault();
          if (view === 'month' && !e.shiftKey) {
            if (!focusedDate) setFocusedDate(toISODate(currentDate));
            else shiftDay(-7);
          } else cycleEventsInDay(-1);
        },
        'ArrowDown,s': (e) => {
          e.preventDefault();
          if (view === 'month' && !e.shiftKey) {
            if (!focusedDate) setFocusedDate(toISODate(currentDate));
            else shiftDay(7);
          } else cycleEventsInDay(1);
        },
        // Event actions
        Enter: (e) => {
          if (focusedEvent) {
            e.preventDefault();
            setSelectedEvent(focusedEvent);
          } else if (focusedDate) {
            e.preventDefault();
            const dayEvents = getEventsOnDate(focusedDate);
            if (dayEvents.length === 0) {
              const d = fromISODate(focusedDate);
              d.setHours(9, 0, 0, 0);
              setCurrentDate(d);
              setEventToEdit(null);
              setShowEventFormModal(true);
            } else if (dayEvents.length === 1) {
              setSelectedEvent(dayEvents[0]);
            } else {
              setFocusedEventId(getEventId(dayEvents[0]));
              setSelectedEvent(dayEvents[0]);
            }
          }
        },
        n: (e) => {
          e.preventDefault();
          if (focusedDate) {
            const d = fromISODate(focusedDate);
            if (focusedEvent) {
              const src =
                focusedEvent.type === 'task' && focusedEvent.task.dueAt
                  ? new Date(focusedEvent.task.dueAt)
                  : focusedEvent.type === 'imported'
                    ? new Date(focusedEvent.event.startAt)
                    : d;
              d.setHours(src.getHours(), src.getMinutes(), 0, 0);
            } else {
              d.setHours(9, 0, 0, 0);
            }
            setCurrentDate(d);
          }
          setEventToEdit(null);
          setShowEventFormModal(true);
        },
        x: (e) => {
          if (focusedEvent?.type === 'task') {
            e.preventDefault();
            handleToggleTaskComplete(focusedEvent.task);
          }
        },
        'Delete,Backspace': (e) => {
          if (focusedEvent) {
            e.preventDefault();
            setEventPendingDelete(focusedEvent);
          }
        },
        Escape: (e) => {
          if (focusedEventId) {
            e.preventDefault();
            setFocusedEventId(null);
          } else if (focusedDate) {
            e.preventDefault();
            setFocusedDate(null);
          }
        },
      },
      filter: {
        'mod+a': (e) => {
          e.preventDefault();
          setSelectedCourses(null);
        },
        'mod+n': (e) => {
          e.preventDefault();
          setSelectedCourses(new Set());
        },
        'Escape,f': (e) => {
          e.preventDefault();
          setShowFilters(false);
          setCalScope('events');
        },
        c: (e) => {
          e.preventDefault();
          setFilterSection('filters-courses');
          setFilterFocusIndex(0);
        },
        p: (e) => {
          e.preventDefault();
          setFilterSection('filters-priority');
          setFilterFocusIndex(0);
        },
        'shift+d': (e) => {
          e.preventDefault();
          setFilterSection('filters-deadline');
          setFilterFocusIndex(0);
        },
        'ArrowUp,w': (e) => {
          e.preventDefault();
          calPrevFilterSection();
        },
        'ArrowDown,s': (e) => {
          e.preventDefault();
          calNextFilterSection();
        },
        Tab: (e) => {
          e.preventDefault();
          calNextFilterSection();
        },
        'shift+Tab': (e) => {
          e.preventDefault();
          calPrevFilterSection();
        },
        'ArrowLeft,a': (e) => {
          e.preventDefault();
          calWalkFilterOption(-1);
        },
        'ArrowRight,d': (e) => {
          e.preventDefault();
          calWalkFilterOption(1);
        },
        'Space,Enter': (e) => {
          e.preventDefault();
          calToggleFilterOption();
        },
        // Swallow nav-adjacent keys to prevent leakage to event scope
        q: (e) => e.preventDefault(),
        e: (e) => e.preventDefault(),
        n: (e) => e.preventDefault(),
        x: (e) => e.preventDefault(),
        t: (e) => e.preventDefault(),
        v: (e) => e.preventDefault(),
      },
    },
    {
      initialScope: 'events',
      when: () => !isAnyModalOpenRef.current,
    }
  );

  // Broadcast active scope to help modal
  useRegisterSubscope(calScope, { events: 'events', filter: 'filter' });

  // Cross-scope shortcuts: Alt+Shift+D/P/C and Alt+1-9 fire in both scopes.
  // Kept as a separate small handler since useKeymap scopes them exclusively.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;
      if (isAnyModalOpenRef.current) return;

      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'd') {
          e.preventDefault();
          const order: DeadlineFilter[] = [
            'all',
            'overdue',
            'today',
            'this-week',
            'this-month',
          ];
          const idx = order.indexOf(deadlineFilter);
          setDeadlineFilter(order[(idx + 1) % order.length]);
          return;
        }
        if (key === 'p') {
          e.preventDefault();
          const order: PriorityFilter[] = ['all', 'high', 'medium', 'low'];
          const idx = order.indexOf(priorityFilter);
          setPriorityFilter(order[(idx + 1) % order.length]);
          return;
        }
        if (key === 'c') {
          e.preventDefault();
          clearFilters();
          return;
        }
      }

      // Alt+1..9 toggles course filter by index
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const digit = parseInt(e.key, 10);
        if (digit >= 1 && digit <= 9 && courses[digit - 1]) {
          e.preventDefault();
          toggleCourseFilter(courses[digit - 1].id);
          return;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deadlineFilter, priorityFilter, courses, clearFilters, toggleCourseFilter]);

  return (
    <div
      data-testid="calendar-page"
      style={styles.page}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div style={styles.dragOverlay}>
          <div style={styles.dragContent}>
            <Upload size={48} color="var(--color-blue)" />
            <p style={styles.dragText}>Drop ICS file to import</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <ImportConfirmationModal
        isOpen={showImportModal}
        preview={importPreview}
        onConfirm={handleImportConfirm}
        onCancel={() => {
          setShowImportModal(false);
          setImportPreview(null);
          setPendingICSContent('');
        }}
      />
      <DuplicateCalendarModal
        isOpen={showDuplicateModal}
        filename={duplicateFilename}
        existingCalendar={existingCalendarInfo}
        onViewCalendar={handleDuplicateViewCalendar}
        onReimport={handleDuplicateReimport}
        onCancel={handleDuplicateCancel}
      />
      <TaskDetailModal
        isOpen={selectedEvent !== null}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onToggleComplete={handleToggleTaskComplete}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
      />
      <EventFormModal
        isOpen={showEventFormModal}
        event={eventToEdit}
        courses={coursesWithColors}
        onSaveEvent={handleSaveEvent}
        onSaveCoursework={handleSaveCoursework}
        onDelete={eventToEdit ? handleDeleteEvent : undefined}
        onClose={() => {
          setShowEventFormModal(false);
          setEventToEdit(null);
          // If this edit was launched from the detail modal, restore it
          if (eventToRestoreAfterEdit) {
            setSelectedEvent(eventToRestoreAfterEdit);
            setEventToRestoreAfterEdit(null);
          }
        }}
      />

      {/* Alert Dialog (replaces native alert()) */}
      <ConfirmDialog
        isOpen={!!alertDialog}
        title={alertDialog?.title ?? ''}
        message={alertDialog?.message ?? ''}
        type={alertDialog?.type ?? 'info'}
        confirmText="OK"
        hideCancel
        onConfirm={() => setAlertDialog(null)}
        onCancel={() => setAlertDialog(null)}
      />

      {/* Delete Event Confirm (from Delete key on focused event) */}
      <ConfirmDialog
        isOpen={!!eventPendingDelete}
        title={eventPendingDelete?.type === 'task' ? 'Delete task?' : 'Delete event?'}
        message={
          eventPendingDelete?.type === 'imported'
            ? `"${eventPendingDelete.event.title}" will be removed from your calendar. This cannot be undone.`
            : eventPendingDelete?.type === 'task'
              ? `"${eventPendingDelete.task.title}" will be deleted from the course. This cannot be undone.`
              : ''
        }
        type="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={async () => {
          if (eventPendingDelete?.type === 'imported') {
            await deleteCalendarEvent(eventPendingDelete.event.id);
            fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
          } else if (eventPendingDelete?.type === 'task') {
            const api = window.api;
            if (api?.dispatch) {
              try {
                await api.dispatch('DeleteTask', {
                  taskId: eventPendingDelete.task.id,
                  force: true,
                });
                await fetchTasks();
                fetchCalendarEventsForRange(prefetchRange.start, prefetchRange.end);
              } catch (err) {
                log.error(
                  'Failed to delete task from calendar',
                  err instanceof Error ? err : undefined
                );
              }
            }
          }
          setFocusedEventId(null);
          setEventPendingDelete(null);
        }}
        onCancel={() => setEventPendingDelete(null)}
      />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Calendar</h1>
          <p style={styles.subtitle}>Your academic schedule at a glance</p>
        </div>
        <div style={styles.controls}>
          <button
            style={{
              ...styles.filterButton,
              backgroundColor: hasActiveFilters ? 'var(--color-navy)' : 'var(--bg-card)',
              color: hasActiveFilters ? 'white' : 'var(--text-primary)',
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filters
            {hasActiveFilters && (
              <span data-testid="calendar-filter-active" style={styles.filterBadge}>
                鈥?{' '}
              </span>
            )}
          </button>
          <button
            style={{
              ...styles.filterButton,
              backgroundColor: showCalendarManager
                ? 'var(--color-navy)'
                : 'var(--bg-card)',
              color: showCalendarManager ? 'white' : 'var(--text-primary)',
            }}
            onClick={() => setShowCalendarManager(!showCalendarManager)}
          >
            <CalendarIcon size={16} />
            Calendars
            {importedCalendars.length > 0 && (
              <span style={styles.calendarBadge}>{importedCalendars.length}</span>
            )}
          </button>
          <button
            style={styles.addEventButton}
            onClick={handleOpenCreateEvent}
            title="Add Event"
          >
            <Plus size={16} />
            Add Event
          </button>
          <div style={styles.icsButtons}>
            <button style={styles.icsButton} onClick={handleImportICS} title="Import ICS">
              <Download size={16} />
            </button>
            <button style={styles.icsButton} onClick={handleExportICS} title="Export ICS">
              <Upload size={16} />
            </button>
          </div>
          <div style={styles.navigation}>
            <button style={styles.todayButton} onClick={() => setCurrentDate(new Date())}>
              Today
            </button>
            <button style={styles.navButton} onClick={goToPrevious}>
              <ChevronLeft size={20} />
            </button>
            <button style={styles.navButton} onClick={goToNext}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Date Title Row */}
      <div style={styles.dateTitleRow}>
        <div style={styles.dateTitle}>
          <CalendarIcon size={20} style={{ marginRight: 'var(--space-2)' }} />
          {getHeaderTitle(currentDate, view)}
        </div>
        <div style={styles.viewToggle}>
          {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
            <button
              key={v}
              style={{
                ...styles.viewButton,
                backgroundColor: view === v ? 'var(--color-navy)' : 'transparent',
                color: view === v ? 'white' : 'var(--text-primary)',
              }}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <CalendarFilterPanel
          courses={courses}
          selectedCourses={selectedCourses}
          deadlineFilter={deadlineFilter}
          priorityFilter={priorityFilter}
          onCourseToggle={toggleCourseFilter}
          onSelectAllCourses={() => setSelectedCourses(null)}
          onDeselectAllCourses={() => setSelectedCourses(new Set())}
          onDeadlineFilterChange={setDeadlineFilter}
          onPriorityFilterChange={setPriorityFilter}
          onClearFilters={clearFilters}
          keyboardSection={
            calScope !== 'filter'
              ? null
              : filterSection === 'filters-courses'
                ? 'courses'
                : filterSection === 'filters-deadline'
                  ? 'deadline'
                  : filterSection === 'filters-priority'
                    ? 'priority'
                    : filterSection === 'filters-clear'
                      ? 'clear'
                      : null
          }
          keyboardIndex={filterFocusIndex}
        />
      )}

      {/* Calendar Manager Panel */}
      {showCalendarManager && (
        <div style={styles.calendarManagerWrapper}>
          <CalendarManagerPanel
            calendars={importedCalendars}
            onToggleVisibility={(id, visible) => toggleCalendarVisibility(id, visible)}
            onDelete={(id) => deleteImportedCalendar(id)}
            onEdit={(id, updates) => updateImportedCalendar(id, updates)}
          />
        </div>
      )}

      {/* Calendar Grid */}
      {/* Calendar Grid */}
      <CalendarGrid
        view={view}
        currentDate={currentDate}
        events={events}
        courses={coursesWithColors}
        onEventClick={handleEventClick}
        onDateClick={handleDateClick}
        onCourseClick={(courseId) => navigate(`/course/${courseId}`)}
        highlightedTaskId={highlightedTaskId}
        focusedEventId={focusedEventId}
        focusedDate={focusedDate}
      />

      {/* Course Legend */}
      {visibleCourses.length > 0 && (
        <div style={styles.courseLegend}>
          <span style={styles.legendTitle}>Courses:</span>
          <div style={styles.courseList}>
            {visibleCourses.map((course) => (
              <div key={course.id} style={styles.courseItem}>
                <span style={{ ...styles.courseDot, backgroundColor: course.color }} />
                <span style={styles.courseName}>{course.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
