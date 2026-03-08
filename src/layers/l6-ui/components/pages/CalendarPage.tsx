/**
 * Calendar Page
 * Monthly calendar view with task deadlines and filtering
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Search,
  Download,
  Upload,
} from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { Card, ConfirmDialog } from '../shared';
import type { Task, Course } from '../../../l5-presentation/types';
import { generateICS, parseICS, type ParsedEvent } from './CalendarPage.ics';
import { createLogger } from '../../utils/rendererLogger';
import { styles } from './CalendarPage.styles';
import {
  type ViewMode,
  type DeadlineFilter,
  type PriorityFilter,
  MONTHS,
  getTaskPriority,
  getTaskType,
  isSameDay,
  getCalendarDays,
  getWeekStart,
  formatWeekTitle,
  loadCalendarViewMode,
  saveCalendarViewMode,
} from './CalendarPageUtils';

const logger = createLogger('CalendarPage');

import { CalendarFilterPanel } from './CalendarFilterPanel';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarWeekView } from './CalendarWeekView';

export function CalendarPage() {
  const { tasks, courses } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());

  const [viewModeState, setViewModeState] = useState<ViewMode>(() =>
    loadCalendarViewMode()
  );

  // Sync viewMode with localStorage on mount (in case component wasn't fully remounted)
  React.useEffect(() => {
    // Re-load the view mode from localStorage in case settings changed
    const currentSaved = loadCalendarViewMode();

    // Only update if different from current state
    if (currentSaved !== viewModeState) {
      setViewModeState(currentSaved);
    }
  }, []);

  // Handle URL query parameters for navigation from other pages
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const eventId = searchParams.get('event');
    const dateParam = searchParams.get('date');

    if (eventId) {
      // Find the task with this calendar event ID and navigate to its due date
      const eventIdNum = parseInt(eventId, 10);
      const task = tasks.find((t) => t.calendarEventId === eventIdNum);

      if (task && task.dueAt) {
        const dueDate = new Date(task.dueAt);
        setCurrentDate(dueDate);
      }

      // Clear the search params after handling
      setSearchParams({}, { replace: true });
    } else if (dateParam) {
      // Navigate to the specified date
      const targetDate = new Date(dateParam);

      if (!isNaN(targetDate.getTime())) {
        setCurrentDate(targetDate);
      }

      // Clear the search params after handling
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, tasks, setSearchParams]);

  // Wrap setViewMode to also save to localStorage
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    saveCalendarViewMode(mode);
  };
  const viewMode = viewModeState;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [_importedEvents, setImportedEvents] = useState<ParsedEvent[]>([]);

  // Alert dialog state (replaces native alert())
  const [alertDialog, setAlertDialog] = useState<{
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info' | 'success';
  } | null>(null);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Course map for quick lookup
  const courseMap = useMemo(() => {
    const map = new Map<number, Course>();
    courses.forEach((c) => map.set(c.id, c));
    return map;
  }, [courses]);

  // Get unique task types
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    tasks.forEach((t) => types.add(getTaskType(t)));
    return Array.from(types).sort();
  }, [tasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return tasks.filter((task) => {
      // Must have due date
      if (!task.dueAt) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (!task.title.toLowerCase().includes(query)) return false;
      }

      // Course filter
      if (selectedCourses.size > 0 && !selectedCourses.has(task.courseId)) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && getTaskType(task) !== typeFilter) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && getTaskPriority(task) !== priorityFilter) {
        return false;
      }

      // Deadline filter
      if (deadlineFilter !== 'all') {
        const dueDate = new Date(task.dueAt);
        switch (deadlineFilter) {
          case 'overdue':
            if (dueDate >= today || task.isCompleted) return false;
            break;
          case 'today':
            if (!isSameDay(dueDate, today)) return false;
            break;
          case 'this-week':
            if (dueDate < today || dueDate > weekEnd) return false;
            break;
          case 'upcoming':
            if (dueDate < today) return false;
            break;
        }
      }

      return true;
    });
  }, [tasks, searchQuery, selectedCourses, typeFilter, deadlineFilter, priorityFilter]);

  // Group tasks by date and sort by time
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    filteredTasks.forEach((task) => {
      if (task.dueAt) {
        const date = new Date(task.dueAt);
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
      }
    });
    // Sort each day's tasks by time
    map.forEach((tasks) => {
      tasks.sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
    });
    return map;
  }, [filteredTasks]);

  // Calendar days for current month
  const calendarDays = useMemo(() => {
    return getCalendarDays(currentDate.getFullYear(), currentDate.getMonth());
  }, [currentDate]);

  // Get week days
  const weekDays = useMemo(() => {
    const start = getWeekStart(currentDate);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Navigation
  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToPrevWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Toggle course selection
  const toggleCourse = (courseId: number) => {
    setSelectedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCourses(new Set());
    setTypeFilter('all');
    setDeadlineFilter('all');
    setPriorityFilter('all');
  };

  // Export calendar to ICS
  const handleExportICS = () => {
    const tasksWithDates = tasks.filter((t) => t.dueAt);
    if (tasksWithDates.length === 0) {
      setAlertDialog({
        title: 'No Data',
        message: 'No tasks with due dates to export.',
        type: 'info',
      });
      return;
    }

    const icsContent = generateICS(tasksWithDates, courseMap);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `canvas-calendar-${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import ICS file
  const handleImportICS = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      try {
        const events = parseICS(content);
        setImportedEvents(events);

        // Show summary
        if (events.length > 0) {
          setAlertDialog({
            title: 'Import Successful',
            message: `Successfully imported ${events.length} event(s) from ${file.name}`,
            type: 'success',
          });
        } else {
          setAlertDialog({
            title: 'No Events',
            message: 'No events found in the ICS file.',
            type: 'info',
          });
        }
      } catch (err) {
        logger.error('Failed to parse ICS file', err instanceof Error ? err : undefined);
        setAlertDialog({
          title: 'Import Failed',
          message: 'Failed to parse the ICS file. Please check the file format.',
          type: 'danger',
        });
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const hasActiveFilters =
    !!searchQuery ||
    selectedCourses.size > 0 ||
    typeFilter !== 'all' ||
    deadlineFilter !== 'all' ||
    priorityFilter !== 'all';
  const today = new Date();

  return (
    <div style={styles.page}>
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

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Calendar</h1>
          <p style={styles.subtitle}>
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} with
            deadlines
          </p>
        </div>

        <div style={styles.headerRight}>
          {/* Import/Export buttons */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,.ical,.ifb,.icalendar"
            style={{ display: 'none' }}
            onChange={handleImportICS}
          />
          <button
            style={styles.icsButton}
            onClick={() => fileInputRef.current?.click()}
            title="Import ICS"
          >
            <Download size={16} />
            <span>Import</span>
          </button>
          <button style={styles.icsButton} onClick={handleExportICS} title="Export ICS">
            <Upload size={16} />
            <span>Export</span>
          </button>

          {/* Search */}
          <div style={styles.searchWrapper}>
            <Search size={16} color="var(--text-muted)" style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
              data-search-input
            />
            {searchQuery && (
              <button style={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Toggle */}
          <button
            style={{
              ...styles.filterButton,
              backgroundColor: hasActiveFilters
                ? 'var(--color-navy-light)'
                : 'var(--bg-card)',
              borderColor: hasActiveFilters
                ? 'var(--color-navy)'
                : 'var(--border-default)',
              color: hasActiveFilters ? 'var(--color-navy)' : 'var(--text-secondary)',
            }}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            {hasActiveFilters && <span style={styles.filterBadge} />}
          </button>
        </div>
      </header>

      {/* Filter Panel */}
      {showFilters && (
        <CalendarFilterPanel
          courses={courses}
          availableTypes={availableTypes}
          selectedCourses={selectedCourses}
          typeFilter={typeFilter}
          deadlineFilter={deadlineFilter}
          priorityFilter={priorityFilter}
          hasActiveFilters={hasActiveFilters}
          onToggleCourse={toggleCourse}
          onTypeFilterChange={setTypeFilter}
          onDeadlineFilterChange={setDeadlineFilter}
          onPriorityFilterChange={setPriorityFilter}
          onClearFilters={clearFilters}
        />
      )}

      {/* Calendar Navigation */}
      <Card padding="none">
        <div style={styles.calendarHeader}>
          <div style={styles.calendarNav}>
            <button
              style={styles.navButton}
              onClick={viewMode === 'month' ? goToPrevMonth : goToPrevWeek}
            >
              <ChevronLeft size={20} />
            </button>
            <h2 style={styles.monthTitle}>
              {viewMode === 'month'
                ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                : formatWeekTitle(currentDate)}
            </h2>
            <button
              style={styles.navButton}
              onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div style={styles.headerActions}>
            {/* View Mode Toggle */}
            <div style={styles.viewToggle}>
              <button
                style={{
                  ...styles.viewToggleBtn,
                  ...(viewMode === 'month' ? styles.viewToggleBtnActive : {}),
                }}
                onClick={() => setViewMode('month')}
              >
                Month
              </button>
              <button
                style={{
                  ...styles.viewToggleBtn,
                  ...(viewMode === 'week' ? styles.viewToggleBtnActive : {}),
                }}
                onClick={() => setViewMode('week')}
              >
                Week
              </button>
            </div>
            <button style={styles.todayButton} onClick={goToToday}>
              Today
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        {viewMode === 'month' ? (
          <CalendarMonthView
            calendarDays={calendarDays}
            currentDate={currentDate}
            today={today}
            tasksByDate={tasksByDate}
            courseMap={courseMap}
          />
        ) : (
          <CalendarWeekView
            weekDays={weekDays}
            today={today}
            tasksByDate={tasksByDate}
            courseMap={courseMap}
          />
        )}
      </Card>

      {/* Empty state */}
      {filteredTasks.length === 0 && (
        <Card padding="lg">
          <div style={styles.emptyState}>
            <Calendar
              size={48}
              color="var(--text-muted)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 style={styles.emptyTitle}>No Tasks Found</h2>
            <p style={styles.emptyText}>
              {hasActiveFilters
                ? 'Try adjusting your filters.'
                : 'No tasks with due dates.'}
            </p>
            {hasActiveFilters && (
              <button style={styles.clearFiltersLarge} onClick={clearFilters}>
                Clear Filters
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export default CalendarPage;
