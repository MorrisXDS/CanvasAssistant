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
import { Card } from '../shared';
import type { Task, Course } from '../../../l5-presentation/types';
import { getCourseColor } from '../../constants';
import { generateICS, parseICS, type ParsedEvent } from './CalendarPage.ics';
import { styles } from './CalendarPage.styles';

// View modes
type ViewMode = 'month' | 'week';
type DeadlineFilter = 'all' | 'overdue' | 'today' | 'this-week' | 'upcoming';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

// Days of week
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Get priority from task
function getTaskPriority(task: Task): 'high' | 'medium' | 'low' {
  if (task.priorityScore >= 70) return 'high';
  if (task.priorityScore >= 40) return 'medium';
  return 'low';
}

// Get task type
function getTaskType(task: Task): string {
  if (task.taskType) return task.taskType;
  const title = task.title.toLowerCase();
  if (title.includes('exam') || title.includes('midterm') || title.includes('final'))
    return 'exam';
  if (title.includes('quiz')) return 'quiz';
  if (title.includes('lab')) return 'lab';
  if (title.includes('assignment') || title.includes('homework')) return 'assignment';
  if (title.includes('project')) return 'project';
  return 'other';
}

// Check if dates are same day
function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

// Get calendar days for a month
function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Add days from previous month to fill first week
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Add all days of current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add days from next month to complete last week
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

// Load calendar settings from SettingsModal
function loadCalendarSettings(): { defaultViewMode: ViewMode } {
  try {
    const stored = localStorage.getItem('calendarSettings');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.defaultViewMode === 'month' || parsed.defaultViewMode === 'week') {
        return { defaultViewMode: parsed.defaultViewMode };
      }
    }
  } catch (e) {
    console.error('[CalendarPage] Failed to load calendar settings:', e);
  }
  return { defaultViewMode: 'month' };
}

// Load/save calendar view mode (user's last selection takes priority)
function loadCalendarViewMode(): ViewMode {
  try {
    // First check if user has a saved preference
    const stored = localStorage.getItem('viewMode:calendar');
    if (stored === 'month' || stored === 'week') {
      return stored;
    }
    // Otherwise use default from settings
    const settings = loadCalendarSettings();
    return settings.defaultViewMode;
  } catch (e) {
    console.error('[CalendarPage] Failed to load calendar view mode:', e);
  }
  return 'month';
}

function saveCalendarViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem('viewMode:calendar', mode);
  } catch (e) {
    console.error('[CalendarPage] Failed to save calendar view mode:', e);
  }
}

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

  // Format week title (e.g., "Jan 5 - 11, 2025")
  const formatWeekTitle = (date: Date): string => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const startMonth = MONTHS[weekStart.getMonth()].substring(0, 3);
    const endMonth = MONTHS[weekEnd.getMonth()].substring(0, 3);

    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${startMonth} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
    }
    return `${startMonth} ${weekStart.getDate()} - ${endMonth} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  };

  // Get start of week (Sunday)
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
  };

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
      alert('No tasks with due dates to export.');
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
          alert(`Successfully imported ${events.length} event(s) from ${file.name}`);
        } else {
          alert('No events found in the ICS file.');
        }
      } catch (err) {
        console.error('Failed to parse ICS file:', err);
        alert('Failed to parse the ICS file. Please check the file format.');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be selected again
    event.target.value = '';
  };

  const hasActiveFilters =
    searchQuery ||
    selectedCourses.size > 0 ||
    typeFilter !== 'all' ||
    deadlineFilter !== 'all' ||
    priorityFilter !== 'all';
  const today = new Date();

  return (
    <div style={styles.page}>
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
        <div style={styles.filterPanel}>
          {/* Course Filter */}
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Courses</label>
            <div style={styles.filterChips}>
              {courses.map((course) => (
                <button
                  key={course.id}
                  style={{
                    ...styles.filterChip,
                    backgroundColor: selectedCourses.has(course.id)
                      ? getCourseColor(course.id, course.color)
                      : 'var(--bg-app)',
                    color: selectedCourses.has(course.id)
                      ? 'white'
                      : 'var(--text-secondary)',
                    borderColor: selectedCourses.has(course.id)
                      ? getCourseColor(course.id, course.color)
                      : 'var(--border-default)',
                  }}
                  onClick={() => toggleCourse(course.id)}
                >
                  {course.code.split(/[A-Z]\d(?:\s|$)/i)[0] || course.code.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Type Filter */}
          {availableTypes.length > 0 && (
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Type</label>
              <div style={styles.filterChips}>
                <button
                  style={{
                    ...styles.filterChip,
                    backgroundColor:
                      typeFilter === 'all' ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: typeFilter === 'all' ? 'white' : 'var(--text-secondary)',
                    borderColor:
                      typeFilter === 'all'
                        ? 'var(--color-navy)'
                        : 'var(--border-default)',
                  }}
                  onClick={() => setTypeFilter('all')}
                >
                  All
                </button>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    style={{
                      ...styles.filterChip,
                      backgroundColor:
                        typeFilter === type ? 'var(--color-navy)' : 'var(--bg-app)',
                      color: typeFilter === type ? 'white' : 'var(--text-secondary)',
                      borderColor:
                        typeFilter === type
                          ? 'var(--color-navy)'
                          : 'var(--border-default)',
                    }}
                    onClick={() => setTypeFilter(type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deadline Filter */}
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Deadline</label>
            <div style={styles.filterChips}>
              {(
                ['all', 'overdue', 'today', 'this-week', 'upcoming'] as DeadlineFilter[]
              ).map((filter) => (
                <button
                  key={filter}
                  style={{
                    ...styles.filterChip,
                    backgroundColor:
                      deadlineFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: deadlineFilter === filter ? 'white' : 'var(--text-secondary)',
                    borderColor:
                      deadlineFilter === filter
                        ? 'var(--color-navy)'
                        : 'var(--border-default)',
                  }}
                  onClick={() => setDeadlineFilter(filter)}
                >
                  {filter === 'all'
                    ? 'All'
                    : filter === 'this-week'
                      ? 'This Week'
                      : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Filter */}
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Priority</label>
            <div style={styles.filterChips}>
              {(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map((filter) => (
                <button
                  key={filter}
                  style={{
                    ...styles.filterChip,
                    backgroundColor:
                      priorityFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: priorityFilter === filter ? 'white' : 'var(--text-secondary)',
                    borderColor:
                      priorityFilter === filter
                        ? 'var(--color-navy)'
                        : 'var(--border-default)',
                  }}
                  onClick={() => setPriorityFilter(filter)}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {hasActiveFilters && (
            <button style={styles.clearFiltersBtn} onClick={clearFilters}>
              <X size={14} />
              Clear All
            </button>
          )}
        </div>
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
          <div style={styles.calendarGrid}>
            {/* Day headers */}
            {DAYS.map((day) => (
              <div key={day} style={styles.dayHeader}>
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {calendarDays.map((date, index) => {
              const isCurrentMonth = date.getMonth() === currentDate.getMonth();
              const isToday = isSameDay(date, today);
              const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
              const dayTasks = tasksByDate.get(dateKey) || [];

              return (
                <div
                  key={index}
                  style={{
                    ...styles.calendarDay,
                    backgroundColor: isToday ? 'var(--color-navy-light)' : 'transparent',
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                >
                  <div
                    style={{
                      ...styles.dayNumber,
                      color: isToday ? 'var(--color-navy)' : 'var(--text-primary)',
                      fontWeight: isToday ? 'var(--font-bold)' : 'var(--font-medium)',
                    }}
                  >
                    {date.getDate()}
                  </div>
                  <div style={styles.dayTasks}>
                    {dayTasks.slice(0, 3).map((task) => {
                      const course = courseMap.get(task.courseId);
                      const color = course
                        ? getCourseColor(course.id, course.color)
                        : 'var(--text-muted)';
                      const time = task.dueAt
                        ? new Date(task.dueAt).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '';
                      // Truncate title for display (short for calendar cells)
                      const maxLen = 12;
                      const displayTitle =
                        task.title.length > maxLen
                          ? task.title.substring(0, maxLen).trim() + '…'
                          : task.title;
                      return (
                        <div
                          key={task.id}
                          style={{
                            ...styles.taskPill,
                            backgroundColor: color,
                          }}
                          title={`${task.title}${time ? ` - ${time}` : ''}`}
                        >
                          {time && <span style={styles.taskTime}>{time}</span>}
                          <span style={styles.taskPillText}>{displayTitle}</span>
                        </div>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <div style={styles.moreTasksIndicator}>
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Week View */
          <div style={styles.weekGrid}>
            {/* Day headers with dates */}
            {weekDays.map((date, index) => {
              const isToday = isSameDay(date, today);
              return (
                <div
                  key={index}
                  style={{
                    ...styles.weekDayHeader,
                    backgroundColor: isToday ? 'var(--color-navy-light)' : 'transparent',
                  }}
                >
                  <span style={styles.weekDayName}>{DAYS[date.getDay()]}</span>
                  <span
                    style={{
                      ...styles.weekDayNumber,
                      color: isToday ? 'var(--color-navy)' : 'var(--text-primary)',
                      fontWeight: isToday ? 'var(--font-bold)' : 'var(--font-medium)',
                    }}
                  >
                    {date.getDate()}
                  </span>
                </div>
              );
            })}

            {/* Week day columns */}
            {weekDays.map((date, index) => {
              const isToday = isSameDay(date, today);
              const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
              const dayTasks = tasksByDate.get(dateKey) || [];

              return (
                <div
                  key={index}
                  style={{
                    ...styles.weekDayColumn,
                    backgroundColor: isToday ? 'var(--color-navy-light)' : 'transparent',
                  }}
                >
                  {dayTasks.map((task) => {
                    const course = courseMap.get(task.courseId);
                    const color = course
                      ? getCourseColor(course.id, course.color)
                      : 'var(--text-muted)';
                    const time = task.dueAt
                      ? new Date(task.dueAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '';
                    return (
                      <div
                        key={task.id}
                        style={{
                          ...styles.weekTaskCard,
                          borderLeftColor: color,
                        }}
                        title={task.title}
                      >
                        {time && <span style={styles.weekTaskTime}>{time}</span>}
                        <span style={styles.weekTaskTitle}>{task.title}</span>
                        {course && (
                          <span style={styles.weekTaskCourse}>
                            {course.code.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {dayTasks.length === 0 && (
                    <div style={styles.weekNoTasks}>No tasks</div>
                  )}
                </div>
              );
            })}
          </div>
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
