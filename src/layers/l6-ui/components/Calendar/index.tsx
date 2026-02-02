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
  } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  // View state
  const [view, setViewState] = useState<CalendarView>(() => loadCalendarViewMode());
  const setView = (newView: CalendarView) => {
    setViewState(newView);
    saveCalendarViewMode(newView);
  };
  const [currentDate, setCurrentDate] = useState(new Date());

  // Track the last processed location.key to avoid re-processing
  const lastProcessedKey = React.useRef<string | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<number> | null>(null);
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<ICSImportPreview | null>(null);
  const [pendingICSContent, setPendingICSContent] = useState<string>('');

  // Panel states
  const [showCalendarManager, setShowCalendarManager] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventFormModal, setShowEventFormModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<DisplayCalendarEvent | null>(null);

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
        if (state.taskId) {
          const task = tasks.find((t) => t.id === state.taskId);
          const course = task ? courses.find((c) => c.id === task.courseId) : null;
          if (task && course) {
            setSelectedEvent({ type: 'task', task, course });
          }
        }
        return;
      }
    }
    setCurrentDate(new Date());
  }, [location.key, location.state, tasks, courses]);

  // Fetch events when range changes
  useEffect(() => {
    fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
  }, [visibleRange, fetchCalendarEventsForRange]);

  // Build courses with colors
  const coursesWithColors = useMemo(
    () => courses.map((c) => ({ ...c, color: getCourseColor(c.id, c.color) })),
    [courses]
  );

  const courseMap = useMemo(
    () => new Map(coursesWithColors.map((c) => [c.id, c])),
    [coursesWithColors]
  );

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
        if (!task.dueAt) return false;
        if (selectedCourses !== null && !selectedCourses.has(task.courseId)) return false;

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
        if (course) acc.push({ type: 'task', task, course });
        return acc;
      }, []);
  }, [tasks, courseMap, selectedCourses, deadlineFilter, priorityFilter]);

  // Build imported events
  const importedEvents: ImportedCalendarEvent[] = useMemo(
    () =>
      calendarEvents
        .filter((e) => !e.taskId)
        .map((event) => ({ type: 'imported' as const, event })),
    [calendarEvents]
  );

  const events: CalendarEvent[] = useMemo(
    () => [...taskEvents, ...importedEvents],
    [taskEvents, importedEvents]
  );

  // Filter events to visible range
  const visibleEvents = useMemo(() => {
    return events.filter((e) => {
      if (e.type === 'task') {
        if (!e.task.dueAt) return false;
        const dueDate = new Date(e.task.dueAt);
        return dueDate >= visibleRange.start && dueDate <= visibleRange.end;
      }
      const startAt = new Date(e.event.startAt);
      const endAt = e.event.endAt ? new Date(e.event.endAt) : startAt;
      return startAt < visibleRange.end && endAt > visibleRange.start;
    });
  }, [events, visibleRange]);

  // Get visible courses
  const visibleCourses = useMemo(() => {
    const courseIds = new Set(
      visibleEvents
        .filter((e): e is TaskCalendarEvent => e.type === 'task')
        .map((e) => e.course.id)
    );
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

  // Navigation handlers
  const goToPrevious = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
      else if (view === 'week') newDate.setDate(newDate.getDate() - 7);
      else newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  };

  const goToNext = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
      else if (view === 'week') newDate.setDate(newDate.getDate() + 7);
      else newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  };

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
      await importICSFile(pendingICSContent, importPreview.filename, options);
      setShowImportModal(false);
      setImportPreview(null);
      setPendingICSContent('');
      await fetchImportedCalendars();
      fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
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
        console.error('Failed to parse ICS file:', error);
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
      console.error('Export failed:', error);
    }
  };

  // Event handlers
  const handleEventClick = (event: CalendarEvent) => setSelectedEvent(event);

  const handleToggleTaskComplete = async (task: Task) => {
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('MarkTaskComplete', {
        taskId: task.id,
        isComplete: !task.isCompleted,
      });
      setSelectedEvent(null);
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  };

  const handleDateClick = (date: Date) => {
    setCurrentDate(date);
    if (view === 'month') setView('day');
  };

  const handleOpenCreateEvent = () => {
    setEventToEdit(null);
    setShowEventFormModal(true);
  };

  const handleOpenEditEvent = (event: DisplayCalendarEvent) => {
    setEventToEdit(event);
    setShowEventFormModal(true);
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
  }) => {
    try {
      if (eventToEdit) {
        const success = await updateCalendarEvent(eventToEdit.id, data);
        if (!success) {
          console.error('Failed to update calendar event');
          alert('Failed to update event. Please try again.');
          return;
        }
      } else {
        const result = await createCalendarEvent(data);
        if (!result.success) {
          console.error('Failed to create calendar event');
          alert('Failed to create event. Please try again.');
          return;
        }
      }
      setShowEventFormModal(false);
      setEventToEdit(null);
      fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
    } catch (error) {
      console.error('Error saving event:', error);
      alert('An error occurred while saving the event.');
    }
  };

  const handleSaveCoursework = async (data: {
    courseId: number;
    title: string;
    description?: string;
    dueAt?: string;
    weight?: number;
    pointsPossible?: number;
    taskType?: string;
  }): Promise<{ success: boolean; taskId?: number }> => {
    try {
      const api = window.api;
      if (!api) return { success: false };
      const result = await api.dispatch('CreateTask', data);
      if (result.success) {
        setShowEventFormModal(false);
        setEventToEdit(null);
        // Refetch calendar events to include the newly created calendar event
        // (CreateTask also creates a linked calendar_events row for user tasks)
        fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
        return { success: true, taskId: result.data?.taskId };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to create coursework:', error);
      return { success: false };
    }
  };

  const handleDeleteEvent = async () => {
    if (eventToEdit) {
      await deleteCalendarEvent(eventToEdit.id);
      setShowEventFormModal(false);
      setEventToEdit(null);
      fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
    }
  };

  const handleEditFromDetail = () => {
    if (selectedEvent?.type === 'imported') {
      handleOpenEditEvent(selectedEvent.event);
    } else if (selectedEvent?.type === 'task') {
      const linkedEvent = calendarEvents.find((e) => e.taskId === selectedEvent.task.id);
      if (linkedEvent) handleOpenEditEvent(linkedEvent);
    }
  };

  const handleDeleteFromDetail = async () => {
    if (selectedEvent?.type === 'imported') {
      await deleteCalendarEvent(selectedEvent.event.id);
      setSelectedEvent(null);
      fetchCalendarEventsForRange(visibleRange.start, visibleRange.end);
    }
  };

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
        }}
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
            {hasActiveFilters && <span style={styles.filterBadge}>•</span>}
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
