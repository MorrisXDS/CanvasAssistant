/**
 * Calendar Page
 * Full calendar view with month/week/day toggle and filtering
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  X,
  CheckSquare,
  Square,
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
import { CalendarManagerPanel } from './CalendarManagerPanel';
import { TaskDetailModal } from './TaskDetailModal';
import { EventFormModal } from './EventFormModal';
import type {
  ICSImportPreview,
  Task,
  DisplayCalendarEvent,
} from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';

// ICS utilities
function formatICSDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function escapeICSText(text: string | null | undefined): string {
  if (!text) return '';
  // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- ICS format escaping, not file paths
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateICS(events: CalendarEvent[]): string {
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

interface ParsedICSEvent {
  uid: string;
  summary: string;
  dtstart: Date | null;
  dtend: Date | null;
  description: string;
}

function _parseICS(icsContent: string): ParsedICSEvent[] {
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

function parseICSDate(value: string): Date | null {
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

// Filter types
type DeadlineFilter = 'all' | 'overdue' | 'today' | 'this-week' | 'this-month';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

// Load calendar settings from SettingsModal
function loadCalendarSettings(): { defaultViewMode: CalendarView } {
  try {
    const stored = localStorage.getItem('calendarSettings');
    console.log('[Calendar] loadCalendarSettings - raw:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed.defaultViewMode === 'month' ||
        parsed.defaultViewMode === 'week' ||
        parsed.defaultViewMode === 'day'
      ) {
        return { defaultViewMode: parsed.defaultViewMode };
      }
    }
  } catch (e) {
    console.error('[Calendar] Failed to load calendar settings:', e);
  }
  return { defaultViewMode: 'month' };
}

// Load view mode - user's toggle preference takes priority over settings default
function loadCalendarViewMode(): CalendarView {
  try {
    const stored = localStorage.getItem('viewMode:calendar');
    console.log('[Calendar] loadCalendarViewMode - viewMode:calendar =', stored);
    if (stored === 'month' || stored === 'week' || stored === 'day') {
      console.log('[Calendar] Using saved preference:', stored);
      return stored;
    }
    const settings = loadCalendarSettings();
    console.log('[Calendar] Using settings default:', settings.defaultViewMode);
    return settings.defaultViewMode;
  } catch (e) {
    console.error('[Calendar] Failed to load view mode:', e);
  }
  return 'month';
}

function saveCalendarViewMode(mode: CalendarView): void {
  console.log('[Calendar] Saving view mode:', mode);
  try {
    localStorage.setItem('viewMode:calendar', mode);
  } catch (e) {
    console.error('[Calendar] Failed to save view mode:', e);
  }
}

export function CalendarPage() {
  const {
    tasks,
    courses,
    importedCalendars,
    calendarEvents,
    fetchImportedCalendars,
    fetchCalendarEventsForRange,
    importICSFile,
    deleteImportedCalendar,
    toggleCalendarVisibility,
    updateImportedCalendar,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    exportCalendarsBatch: _exportCalendarsBatch,
  } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setViewState] = useState<CalendarView>(() => {
    const loaded = loadCalendarViewMode();
    console.log('[Calendar] Initial view state:', loaded);
    return loaded;
  });
  const setView = (newView: CalendarView) => {
    console.log('[Calendar] setView:', newView);
    setViewState(newView);
    saveCalendarViewMode(newView);
  };
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<number> | null>(null); // null = all
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ICSImportPreview | null>(null);
  const [pendingICSContent, setPendingICSContent] = useState<string>('');

  // Show calendar manager panel
  const [showCalendarManager, setShowCalendarManager] = useState(false);

  // Task detail modal state
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Event form modal state (for create/edit)
  const [showEventFormModal, setShowEventFormModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<DisplayCalendarEvent | null>(null);

  // Fetch imported calendars on mount
  useEffect(() => {
    console.log('[Calendar] Fetching imported calendars...');
    fetchImportedCalendars();
  }, [fetchImportedCalendars]);

  // Sync view mode from localStorage when navigating to calendar (in case settings changed)
  useEffect(() => {
    const savedView = loadCalendarViewMode();
    console.log('[Calendar] Navigation detected, syncing view mode:', savedView);
    setViewState(savedView); // Use setViewState directly to avoid saving back to localStorage
    setCurrentDate(new Date());
  }, [location.key]);

  // Listen for file drops - both from Electron IPC and from window custom event
  useEffect(() => {
    // Handler for ICS content (from any source)
    const processICSContent = async (content: string, filename: string) => {
      try {
        const preview = await window.api.parseICSPreview(content, filename);
        if (preview) {
          setPendingICSContent(content);
          setImportPreview(preview);
          setShowImportModal(true);
        }
      } catch (error) {
        console.error('Failed to parse dropped ICS file:', error);
      }
    };

    // Electron IPC handler
    const handleFileDrop = async (data: {
      type: string;
      content: string;
      filename: string;
    }) => {
      if (data.type === 'ics') {
        await processICSContent(data.content, data.filename);
      }
    };

    // Window custom event handler (fallback for HTML5 drag-drop)
    const handleWindowDrop = async (e: Event) => {
      const customEvent = e as CustomEvent<{ content: string; filename: string }>;
      console.log('[Calendar] Received ics-file-dropped event');
      await processICSContent(customEvent.detail.content, customEvent.detail.filename);
    };

    const cleanup = window.api.onFileDropped(handleFileDrop);
    window.addEventListener('ics-file-dropped', handleWindowDrop);

    return () => {
      cleanup();
      window.removeEventListener('ics-file-dropped', handleWindowDrop);
    };
  }, []);

  // Drag-and-drop handlers - use counter to handle child element events
  const dragCounterRef = React.useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const icsFile = files.find(
      (f) => f.name.endsWith('.ics') || f.type === 'text/calendar'
    );

    if (!icsFile) {
      return;
    }

    try {
      const content = await icsFile.text();
      const preview = await window.api.parseICSPreview(content, icsFile.name);

      if (preview) {
        setPendingICSContent(content);
        setImportPreview(preview);
        setShowImportModal(true);
      }
    } catch (error) {
      console.error('Failed to parse ICS file:', error);
    }
  }, []);

  // Handle import confirmation
  const handleImportConfirm = useCallback(
    async (options: { name: string; color: string }) => {
      if (!pendingICSContent || !importPreview) return;

      await importICSFile(pendingICSContent, importPreview.filename, {
        name: options.name,
        color: options.color,
      });

      setShowImportModal(false);
      setImportPreview(null);
      setPendingICSContent('');

      // Refetch calendars and events after import
      await fetchImportedCalendars();
      // Calculate range based on current view
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      if (view === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
      } else if (view === 'week') {
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        // Fix: end must be based on start (not currentDate) to handle month boundaries correctly
        end.setTime(start.getTime() + 6 * 24 * 60 * 60 * 1000);
        end.setHours(23, 59, 59, 999);
      } else {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      }
      fetchCalendarEventsForRange(start, end);
    },
    [
      pendingICSContent,
      importPreview,
      importICSFile,
      fetchImportedCalendars,
      fetchCalendarEventsForRange,
      currentDate,
      view,
    ]
  );

  const handleImportCancel = useCallback(() => {
    setShowImportModal(false);
    setImportPreview(null);
    setPendingICSContent('');
  }, []);

  // Toggle course filter
  const toggleCourseFilter = (courseId: number) => {
    setSelectedCourses((prev) => {
      if (prev === null) {
        // All selected, now deselect this one
        const newSet = new Set(courses.map((c) => c.id));
        newSet.delete(courseId);
        return newSet;
      }
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      // If all courses are now selected, return null
      if (next.size === courses.length) {
        return null;
      }
      return next;
    });
  };

  const selectAllCourses = () => setSelectedCourses(null);
  const deselectAllCourses = () => setSelectedCourses(new Set());

  const isCourseSelected = (courseId: number) => {
    return selectedCourses === null || selectedCourses.has(courseId);
  };

  const clearFilters = () => {
    setSelectedCourses(null);
    setDeadlineFilter('all');
    setPriorityFilter('all');
  };

  const hasActiveFilters =
    selectedCourses !== null || deadlineFilter !== 'all' || priorityFilter !== 'all';

  // Build courses with generated colors
  const coursesWithColors = useMemo(() => {
    return courses.map((c) => ({ ...c, color: getCourseColor(c.id, c.color) }));
  }, [courses]);

  // Build course map with generated colors
  const courseMap = useMemo(() => {
    return new Map(coursesWithColors.map((c) => [c.id, c]));
  }, [coursesWithColors]);

  // Build task events with filtering
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
        // Must have due date
        if (!task.dueAt) return false;

        // Course filter
        if (selectedCourses !== null && !selectedCourses.has(task.courseId)) {
          return false;
        }

        // Deadline filter
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

        // Priority filter (based on priorityScore: high > 70, medium 40-70, low < 40)
        if (priorityFilter !== 'all') {
          const score = task.priorityScore || 0;
          switch (priorityFilter) {
            case 'high':
              if (score < 70) return false;
              break;
            case 'medium':
              if (score < 40 || score >= 70) return false;
              break;
            case 'low':
              if (score >= 40) return false;
              break;
          }
        }

        return true;
      })
      .reduce<TaskCalendarEvent[]>((acc, task) => {
        const course = courseMap.get(task.courseId);
        if (course) {
          acc.push({ type: 'task', task, course });
        }
        return acc;
      }, []);
  }, [tasks, courseMap, selectedCourses, deadlineFilter, priorityFilter]);

  // Build imported calendar events
  const importedEvents: ImportedCalendarEvent[] = useMemo(() => {
    return calendarEvents.map((event) => ({
      type: 'imported' as const,
      event,
    }));
  }, [calendarEvents]);

  // Combine all events
  const events: CalendarEvent[] = useMemo(() => {
    return [...taskEvents, ...importedEvents];
  }, [taskEvents, importedEvents]);

  // Get visible date range based on current view
  const visibleRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    } else if (view === 'week') {
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      // Fix: end must be based on start (not currentDate) to handle month boundaries correctly
      end.setTime(start.getTime() + 6 * 24 * 60 * 60 * 1000);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }, [currentDate, view]);

  // Fetch imported calendar events when visible range changes
  useEffect(() => {
    fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
  }, [visibleRange, fetchCalendarEventsForRange]);

  // Filter events to only those visible in current view
  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.type === 'task') {
        if (!e.task.dueAt) return false;
        const dueDate = new Date(e.task.dueAt);
        return dueDate >= visibleRange.start && dueDate <= visibleRange.end;
      } else {
        // Imported events - verify they fall within visible range
        const startAt = new Date(e.event.startAt);
        const endAt = e.event.endAt ? new Date(e.event.endAt) : startAt;
        return startAt < visibleRange.end && endAt > visibleRange.start;
      }
    });
  }, [events, visibleRange]);

  // Get unique courses from visible task events (with generated colors)
  const visibleCourses = useMemo(() => {
    const courseIds = new Set(
      visibleEvents
        .filter((e): e is TaskCalendarEvent => e.type === 'task')
        .map((e) => e.course.id)
    );
    // Also include courses matched from imported events
    for (const event of visibleEvents) {
      if (event.type === 'imported') {
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

  // Debug: Log state changes
  useEffect(() => {
    console.log('[Calendar] State:', {
      importedCalendars: importedCalendars.length,
      calendarEvents: calendarEvents.length,
      taskEvents: taskEvents.length,
      importedEvents: importedEvents.length,
      totalEvents: events.length,
      visibleEvents: visibleEvents.length,
      visibleRange: {
        start: visibleRange.start.toISOString(),
        end: visibleRange.end.toISOString(),
      },
    });
    if (calendarEvents.length > 0) {
      console.log('[Calendar] Calendar events sample:', calendarEvents.slice(0, 3));
    }
    if (importedEvents.length > 0) {
      console.log('[Calendar] Imported events sample:', importedEvents.slice(0, 3));
    }
  }, [
    importedCalendars,
    calendarEvents,
    taskEvents,
    importedEvents,
    events,
    visibleEvents,
    visibleRange,
  ]);

  // Navigation handlers
  const goToPrevious = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else if (view === 'week') {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setDate(newDate.getDate() - 1);
      }
      return newDate;
    });
  };

  const goToNext = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else if (view === 'week') {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Format header based on view
  const getHeaderTitle = () => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      const weekStart = new Date(currentDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      }
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleCloseEventModal = () => {
    setSelectedEvent(null);
  };

  const handleToggleTaskComplete = async (task: Task) => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('MarkTaskComplete', {
        taskId: task.id,
        isComplete: !task.isCompleted,
      });
      // Close modal after toggling
      setSelectedEvent(null);
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    if (view === 'month') {
      setView('day');
    }
  };

  // Open create event modal
  const handleOpenCreateEvent = () => {
    setEventToEdit(null);
    setShowEventFormModal(true);
  };

  // Open edit event modal
  const handleOpenEditEvent = (event: DisplayCalendarEvent) => {
    setEventToEdit(event);
    setShowEventFormModal(true);
    setSelectedEvent(null); // Close detail modal
  };

  // Save calendar event (create or update)
  const handleSaveEvent = async (data: {
    title: string;
    description?: string;
    startAt: string;
    endAt?: string;
    allDay: boolean;
    location?: string;
    courseId?: number;
    // Calendar-specific fields
    color?: string;
    notes?: string;
    reminderMinutes?: number;
  }) => {
    if (eventToEdit) {
      // Update existing event
      await updateCalendarEvent(eventToEdit.id, data);
    } else {
      // Create new event
      await createCalendarEvent(data);
    }
    setShowEventFormModal(false);
    setEventToEdit(null);
    // Refetch events to get updated list
    fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
  };

  // Save coursework (create new task via command dispatcher)
  const handleSaveCoursework = async (data: {
    courseId: number;
    title: string;
    description?: string;
    dueAt?: string;
    weight?: number;
    pointsPossible?: number;
  }): Promise<{ success: boolean; taskId?: number }> => {
    try {
      const api = window.api;
      if (!api) {
        return { success: false };
      }

      const result = await api.dispatch('CreateTask', data);
      if (result.success) {
        setShowEventFormModal(false);
        setEventToEdit(null);
        // Tasks will automatically update via db:commit event
        return { success: true, taskId: result.data?.taskId };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to create coursework:', error);
      return { success: false };
    }
  };

  // Delete event
  const handleDeleteEvent = async () => {
    if (eventToEdit) {
      await deleteCalendarEvent(eventToEdit.id);
      setShowEventFormModal(false);
      setEventToEdit(null);
      fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
    }
  };

  // Handle edit/delete from detail modal
  const handleEditFromDetail = () => {
    if (selectedEvent?.type === 'imported') {
      handleOpenEditEvent(selectedEvent.event);
    } else if (selectedEvent?.type === 'task') {
      // Find the linked calendar event for this task
      const taskId = selectedEvent.task.id;
      const linkedEvent = calendarEvents.find((e) => e.taskId === taskId);
      if (linkedEvent) {
        handleOpenEditEvent(linkedEvent);
      } else {
        // No calendar event yet - this shouldn't happen with auto-creation
        console.warn('No linked calendar event found for task:', taskId);
      }
    }
  };

  const handleDeleteFromDetail = async () => {
    if (selectedEvent?.type === 'imported') {
      await deleteCalendarEvent(selectedEvent.event.id);
      setSelectedEvent(null);
      fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
    }
  };

  // ICS Export
  const handleExportICS = async () => {
    const icsContent = generateICS(events);
    const defaultName = `canvas-calendar-${currentDate.toISOString().split('T')[0]}.ics`;

    try {
      const result = await window.api.saveFile({
        defaultName,
        content: icsContent,
        filters: [{ name: 'iCalendar', extensions: ['ics'] }],
      });

      if (result.success) {
        console.log('Calendar exported to:', result.data?.filePath);
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // ICS Import via file picker
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

        if (preview) {
          setPendingICSContent(content);
          setImportPreview(preview);
          setShowImportModal(true);
        }
      } catch (error) {
        console.error('Failed to parse ICS file:', error);
      }
    };
    input.click();
  };

  // Get visible imported calendars
  const _visibleImportedCalendars = useMemo(() => {
    return importedCalendars.filter((c) => c.isVisible);
  }, [importedCalendars]);

  return (
    <div
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

      {/* Import Confirmation Modal */}
      <ImportConfirmationModal
        isOpen={showImportModal}
        preview={importPreview}
        onConfirm={handleImportConfirm}
        onCancel={handleImportCancel}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={selectedEvent !== null}
        event={selectedEvent}
        onClose={handleCloseEventModal}
        onToggleComplete={handleToggleTaskComplete}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
      />

      {/* Event Form Modal (Create/Edit) */}
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
        }}
      />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Calendar</h1>
          <p style={styles.subtitle}>Your academic schedule at a glance</p>
        </div>

        <div style={styles.controls}>
          {/* Filter Toggle */}
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
            {hasActiveFilters && <span style={styles.filterBadge}>•</span>}
          </button>

          {/* Calendars Toggle */}
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

          {/* Add Event Button */}
          <button
            style={styles.addEventButton}
            onClick={handleOpenCreateEvent}
            title="Add Event"
          >
            <Plus size={16} />
            Add Event
          </button>

          {/* ICS Import/Export */}
          <div style={styles.icsButtons}>
            <button style={styles.icsButton} onClick={handleImportICS} title="Import ICS">
              <Download size={16} />
            </button>
            <button style={styles.icsButton} onClick={handleExportICS} title="Export ICS">
              <Upload size={16} />
            </button>
          </div>

          {/* Navigation */}
          <div style={styles.navigation}>
            <button style={styles.todayButton} onClick={goToToday}>
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

      {/* Date Title Row with View Toggle */}
      <div style={styles.dateTitleRow}>
        <div style={styles.dateTitle}>
          <CalendarIcon size={20} style={{ marginRight: 'var(--space-2)' }} />
          {getHeaderTitle()}
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
        <div style={styles.filterPanel}>
          {/* Course Filter */}
          <div style={styles.filterSection}>
            <div style={styles.filterSectionHeader}>
              <span style={styles.filterSectionTitle}>Courses</span>
              <div style={styles.filterActions}>
                <button style={styles.filterAction} onClick={selectAllCourses}>
                  All
                </button>
                <span style={styles.filterActionDivider}>|</span>
                <button style={styles.filterAction} onClick={deselectAllCourses}>
                  None
                </button>
              </div>
            </div>
            <div style={styles.courseFilterList}>
              {courses.map((course) => {
                const color = getCourseColor(course.id, course.color);
                const selected = isCourseSelected(course.id);
                return (
                  <button
                    key={course.id}
                    style={{
                      ...styles.courseFilterItem,
                      opacity: selected ? 1 : 0.5,
                      borderColor: selected ? color : 'transparent',
                    }}
                    onClick={() => toggleCourseFilter(course.id)}
                  >
                    {selected ? (
                      <CheckSquare size={14} color={color} />
                    ) : (
                      <Square size={14} color="var(--text-muted)" />
                    )}
                    <span
                      style={{
                        ...styles.courseFilterBadge,
                        backgroundColor: color,
                      }}
                    >
                      {course.code.split(/[HY]\d|\s/)[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deadline Filter */}
          <div style={styles.filterSection}>
            <span style={styles.filterSectionTitle}>Deadline</span>
            <div style={styles.filterChips}>
              {[
                { value: 'all', label: 'All' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'today', label: 'Today' },
                { value: 'this-week', label: 'This Week' },
                { value: 'this-month', label: 'This Month' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  style={{
                    ...styles.filterChip,
                    backgroundColor:
                      deadlineFilter === opt.value
                        ? 'var(--color-navy)'
                        : 'var(--bg-app)',
                    color:
                      deadlineFilter === opt.value ? 'white' : 'var(--text-secondary)',
                  }}
                  onClick={() => setDeadlineFilter(opt.value as DeadlineFilter)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div style={styles.filterSection}>
            <span style={styles.filterSectionTitle}>Priority</span>
            <div style={styles.filterChips}>
              {[
                { value: 'all', label: 'All' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  style={{
                    ...styles.filterChip,
                    backgroundColor:
                      priorityFilter === opt.value
                        ? 'var(--color-navy)'
                        : 'var(--bg-app)',
                    color:
                      priorityFilter === opt.value ? 'white' : 'var(--text-secondary)',
                  }}
                  onClick={() => setPriorityFilter(opt.value as PriorityFilter)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button style={styles.clearFilters} onClick={clearFilters}>
              <X size={14} />
              Clear all filters
            </button>
          )}
        </div>
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
      <CalendarGrid
        view={view}
        currentDate={currentDate}
        events={events}
        courses={coursesWithColors}
        onEventClick={handleEventClick}
        onDateClick={handleDateClick}
        onCourseClick={(courseId) => navigate(`/course/${courseId}`)}
      />

      {/* Course Legend */}
      {visibleCourses.length > 0 && (
        <div style={styles.courseLegend}>
          <span style={styles.legendTitle}>Courses:</span>
          <div style={styles.courseList}>
            {visibleCourses.map((course) => (
              <div key={course.id} style={styles.courseItem}>
                <span
                  style={{
                    ...styles.courseDot,
                    backgroundColor: course.color,
                  }}
                />
                <span style={styles.courseName}>{course.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },

  // Drag overlay
  dragOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    border: '3px dashed var(--color-blue)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    pointerEvents: 'none',
  },

  dragContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  dragText: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-blue)',
  },

  // Calendar manager wrapper
  calendarManagerWrapper: {
    marginBottom: 'var(--space-4)',
    maxWidth: '400px',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },

  title: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  viewButton: {
    padding: 'var(--space-2) var(--space-4)',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  navigation: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  todayButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  navButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },

  dateTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-4)',
    gap: 'var(--space-4)',
  },

  dateTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  courseLegend: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    marginTop: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    flexWrap: 'wrap',
  },

  legendTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  courseList: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  courseItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  courseDot: {
    width: '12px',
    height: '12px',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },

  courseName: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  // Filter styles
  filterButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    color: 'var(--color-success)',
    fontSize: 'var(--text-lg)',
    marginLeft: '-2px',
  },

  calendarBadge: {
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    padding: '1px 6px',
    borderRadius: 'var(--radius-full)',
    marginLeft: 'var(--space-1)',
  },

  addEventButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  icsButtons: {
    display: 'flex',
    gap: 'var(--space-1)',
  },

  icsButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-primary)',
    transition: 'all var(--transition-fast)',
  },

  filterPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    marginBottom: 'var(--space-4)',
  },

  filterSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  filterSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  filterSectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  filterActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },

  filterAction: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--color-navy)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },

  filterActionDivider: {
    color: 'var(--border-default)',
  },

  courseFilterList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },

  courseFilterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    border: '2px solid transparent',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  courseFilterBadge: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '3px',
  },

  filterChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
  },

  filterChip: {
    padding: 'var(--space-1) var(--space-3)',
    border: 'none',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
  },

  clearFilters: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    alignSelf: 'flex-start',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};

export default CalendarPage;
