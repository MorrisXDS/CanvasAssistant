/**
 * Calendar Page
 * Monthly calendar view with task deadlines and filtering
 */

import React, { useState, useMemo, useRef } from 'react';
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

// ============ ICS Utilities ============

/**
 * Generate ICS content from tasks
 */
function generateICS(tasks: Task[], courses: Map<number, Course>): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CanvasAssistant//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  tasks.forEach((task) => {
    if (!task.dueAt) return;

    const course = courses.get(task.courseId);
    const dueDate = new Date(task.dueAt);

    // Format date as ICS timestamp (YYYYMMDDTHHMMSSZ)
    const formatICSDate = (date: Date): string => {
      return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };

    // Escape special characters in ICS
    const escapeICS = (str: string): string => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
    };

    const uid = `task-${task.id}@canvasassistant`;
    const summary = escapeICS(task.title);
    const description = escapeICS(
      `Course: ${course?.name || 'Unknown'}\\n` +
      `Type: ${task.taskType || 'Assignment'}\\n` +
      `Weight: ${task.weight}%\\n` +
      (task.description ? `\\n${task.description}` : '')
    );
    const location = course ? escapeICS(course.name) : '';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
    lines.push(`DTSTART:${formatICSDate(dueDate)}`);
    lines.push(`DTEND:${formatICSDate(new Date(dueDate.getTime() + 60 * 60 * 1000))}`); // 1 hour duration
    lines.push(`SUMMARY:${summary}`);
    if (description) lines.push(`DESCRIPTION:${description}`);
    if (location) lines.push(`LOCATION:${location}`);
    if (task.priorityScore >= 70) {
      lines.push('PRIORITY:1'); // High priority
    } else if (task.priorityScore >= 40) {
      lines.push('PRIORITY:5'); // Medium priority
    } else {
      lines.push('PRIORITY:9'); // Low priority
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Parse ICS content into events
 */
interface ParsedEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart?: Date;
  dtend?: Date;
  location?: string;
}

function parseICS(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const lines = content.replace(/\r\n /g, '').split(/\r?\n/);

  let currentEvent: Partial<ParsedEvent> | null = null;

  const parseICSDate = (value: string): Date | undefined => {
    // Handle formats: YYYYMMDDTHHMMSSZ or YYYYMMDD
    const match = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
    if (!match) return undefined;

    const [, year, month, day, hour = '0', min = '0', sec = '0'] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  };

  const unescapeICS = (str: string): string => {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  };

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      if (currentEvent.uid && currentEvent.summary) {
        events.push(currentEvent as ParsedEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      let key = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1);

      // Handle parameters (e.g., DTSTART;VALUE=DATE:20240101)
      const semiIndex = key.indexOf(';');
      if (semiIndex !== -1) {
        key = key.substring(0, semiIndex);
      }

      switch (key) {
        case 'UID':
          currentEvent.uid = value;
          break;
        case 'SUMMARY':
          currentEvent.summary = unescapeICS(value);
          break;
        case 'DESCRIPTION':
          currentEvent.description = unescapeICS(value);
          break;
        case 'DTSTART':
          currentEvent.dtstart = parseICSDate(value);
          break;
        case 'DTEND':
          currentEvent.dtend = parseICSDate(value);
          break;
        case 'LOCATION':
          currentEvent.location = unescapeICS(value);
          break;
      }
    }
  }

  return events;
}

// View modes
type ViewMode = 'month' | 'week';
type DeadlineFilter = 'all' | 'overdue' | 'today' | 'this-week' | 'upcoming';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

// Days of week
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
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
  if (title.includes('exam') || title.includes('midterm') || title.includes('final')) return 'exam';
  if (title.includes('quiz')) return 'quiz';
  if (title.includes('lab')) return 'lab';
  if (title.includes('assignment') || title.includes('homework')) return 'assignment';
  if (title.includes('project')) return 'project';
  return 'other';
}

// Check if dates are same day
function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
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
    console.log('[CalendarPage] loadCalendarSettings - raw:', stored);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log('[CalendarPage] loadCalendarSettings - parsed:', parsed);
      if (parsed.defaultViewMode === 'month' || parsed.defaultViewMode === 'week') {
        return { defaultViewMode: parsed.defaultViewMode };
      }
    }
  } catch (e) {
    console.error('[CalendarPage] Failed to load calendar settings:', e);
  }
  console.log('[CalendarPage] loadCalendarSettings - using default: month');
  return { defaultViewMode: 'month' };
}

// Load/save calendar view mode (user's last selection takes priority)
function loadCalendarViewMode(): ViewMode {
  try {
    // First check if user has a saved preference
    const stored = localStorage.getItem('viewMode:calendar');
    console.log('[CalendarPage] loadCalendarViewMode - viewMode:calendar =', stored);
    if (stored === 'month' || stored === 'week') {
      console.log('[CalendarPage] loadCalendarViewMode - using saved preference:', stored);
      return stored;
    }
    // Otherwise use default from settings
    const settings = loadCalendarSettings();
    console.log('[CalendarPage] loadCalendarViewMode - using settings default:', settings.defaultViewMode);
    return settings.defaultViewMode;
  } catch (e) {
    console.error('[CalendarPage] Failed to load calendar view mode:', e);
  }
  console.log('[CalendarPage] loadCalendarViewMode - fallback to month');
  return 'month';
}

function saveCalendarViewMode(mode: ViewMode): void {
  console.log('[CalendarPage] saveCalendarViewMode - saving:', mode);
  try {
    localStorage.setItem('viewMode:calendar', mode);
    // Verify it was saved
    const verify = localStorage.getItem('viewMode:calendar');
    console.log('[CalendarPage] saveCalendarViewMode - verified:', verify);
  } catch (e) {
    console.error('[CalendarPage] Failed to save calendar view mode:', e);
  }
}

export function CalendarPage() {
  const { tasks, courses } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());

  const [viewModeState, setViewModeState] = useState<ViewMode>(() => {
    console.log('[CalendarPage] useState initializer running...');
    const loaded = loadCalendarViewMode();
    console.log('[CalendarPage] Initial viewModeState:', loaded);
    return loaded;
  });

  // Sync viewMode with localStorage on mount (in case component wasn't fully remounted)
  React.useEffect(() => {
    console.log('[CalendarPage] useEffect running on mount');
    console.log('[CalendarPage] viewMode:calendar =', localStorage.getItem('viewMode:calendar'));
    console.log('[CalendarPage] calendarSettings =', localStorage.getItem('calendarSettings'));

    // Re-load the view mode from localStorage in case settings changed
    const currentSaved = loadCalendarViewMode();
    console.log('[CalendarPage] Loaded viewMode from storage:', currentSaved);
    console.log('[CalendarPage] Current viewModeState:', viewModeState);

    // Only update if different from current state
    if (currentSaved !== viewModeState) {
      console.log('[CalendarPage] Updating viewModeState:', viewModeState, '->', currentSaved);
      setViewModeState(currentSaved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap setViewMode to also save to localStorage
  const setViewMode = (mode: ViewMode) => {
    console.debug('[CalendarPage] setViewMode called with:', mode);
    setViewModeState(mode);
    saveCalendarViewMode(mode);
  };
  const viewMode = viewModeState;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedEvents, setImportedEvents] = useState<ParsedEvent[]>([]);

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
        console.log(`Imported ${events.length} events from ICS file`);

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

  const hasActiveFilters = searchQuery || selectedCourses.size > 0 || typeFilter !== 'all' || deadlineFilter !== 'all' || priorityFilter !== 'all';
  const today = new Date();

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Calendar</h1>
          <p style={styles.subtitle}>
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} with deadlines
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
          <button
            style={styles.icsButton}
            onClick={handleExportICS}
            title="Export ICS"
          >
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
              backgroundColor: hasActiveFilters ? 'var(--color-navy-light)' : 'var(--bg-card)',
              borderColor: hasActiveFilters ? 'var(--color-navy)' : 'var(--border-default)',
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
                    backgroundColor: selectedCourses.has(course.id) ? getCourseColor(course.id, course.color) : 'var(--bg-app)',
                    color: selectedCourses.has(course.id) ? 'white' : 'var(--text-secondary)',
                    borderColor: selectedCourses.has(course.id) ? getCourseColor(course.id, course.color) : 'var(--border-default)',
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
                    backgroundColor: typeFilter === 'all' ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: typeFilter === 'all' ? 'white' : 'var(--text-secondary)',
                    borderColor: typeFilter === 'all' ? 'var(--color-navy)' : 'var(--border-default)',
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
                      backgroundColor: typeFilter === type ? 'var(--color-navy)' : 'var(--bg-app)',
                      color: typeFilter === type ? 'white' : 'var(--text-secondary)',
                      borderColor: typeFilter === type ? 'var(--color-navy)' : 'var(--border-default)',
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
              {(['all', 'overdue', 'today', 'this-week', 'upcoming'] as DeadlineFilter[]).map((filter) => (
                <button
                  key={filter}
                  style={{
                    ...styles.filterChip,
                    backgroundColor: deadlineFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: deadlineFilter === filter ? 'white' : 'var(--text-secondary)',
                    borderColor: deadlineFilter === filter ? 'var(--color-navy)' : 'var(--border-default)',
                  }}
                  onClick={() => setDeadlineFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter === 'this-week' ? 'This Week' : filter.charAt(0).toUpperCase() + filter.slice(1)}
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
                    backgroundColor: priorityFilter === filter ? 'var(--color-navy)' : 'var(--bg-app)',
                    color: priorityFilter === filter ? 'white' : 'var(--text-secondary)',
                    borderColor: priorityFilter === filter ? 'var(--color-navy)' : 'var(--border-default)',
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
            <button style={styles.navButton} onClick={viewMode === 'month' ? goToPrevMonth : goToPrevWeek}>
              <ChevronLeft size={20} />
            </button>
            <h2 style={styles.monthTitle}>
              {viewMode === 'month'
                ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                : formatWeekTitle(currentDate)
              }
            </h2>
            <button style={styles.navButton} onClick={viewMode === 'month' ? goToNextMonth : goToNextWeek}>
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
                      const color = course ? getCourseColor(course.id, course.color) : 'var(--text-muted)';
                      const time = task.dueAt ? new Date(task.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
                      // Truncate title for display (short for calendar cells)
                      const maxLen = 12;
                      const displayTitle = task.title.length > maxLen ? task.title.substring(0, maxLen).trim() + '…' : task.title;
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
                    const color = course ? getCourseColor(course.id, course.color) : 'var(--text-muted)';
                    const time = task.dueAt ? new Date(task.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
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
                        {course && <span style={styles.weekTaskCourse}>{course.code.split(' ')[0]}</span>}
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
            <Calendar size={48} color="var(--text-muted)" style={{ marginBottom: 'var(--space-4)' }} />
            <h2 style={styles.emptyTitle}>No Tasks Found</h2>
            <p style={styles.emptyText}>
              {hasActiveFilters ? 'Try adjusting your filters.' : 'No tasks with due dates.'}
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 'min(var(--content-max-width), calc(100vw - var(--sidebar-width) - var(--space-12)))',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    flex: 1,
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--space-4)',
  },

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  icsButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
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

  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  searchIcon: {
    position: 'absolute',
    left: '12px',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '200px',
    height: '36px',
    paddingLeft: '36px',
    paddingRight: '32px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    outline: 'none',
  },

  clearSearch: {
    position: 'absolute',
    right: '8px',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    color: 'var(--text-muted)',
  },

  filterButton: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterBadge: {
    position: 'absolute',
    top: '6px',
    right: '6px',
    width: '8px',
    height: '8px',
    backgroundColor: 'var(--color-navy)',
    borderRadius: '50%',
  },

  filterPanel: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-card)',
  },

  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
  },

  filterChips: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexWrap: 'wrap',
  },

  filterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    border: '1px solid',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  clearFiltersBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    height: '28px',
    padding: '0 var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-error)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    marginLeft: 'auto',
    alignSelf: 'flex-end',
  },

  calendarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  calendarNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  navButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },

  monthTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    minWidth: '180px',
    textAlign: 'center',
  },

  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  viewToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    padding: '2px',
    border: '1px solid var(--border-default)',
  },

  viewToggleBtn: {
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  viewToggleBtnActive: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },

  todayButton: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    width: '100%',
  },

  dayHeader: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    borderBottom: '1px solid var(--border-light)',
    textTransform: 'uppercase',
  },

  calendarDay: {
    minHeight: '100px',
    padding: 'var(--space-2)',
    borderRight: '1px solid var(--border-light)',
    borderBottom: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    overflow: 'hidden',
    minWidth: 0,
    maxWidth: '100%',
  },

  dayNumber: {
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-1)',
    flexShrink: 0,
  },

  dayTasks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
    minWidth: 0,
    width: 0,
    flex: '1 1 auto',
  },

  taskPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    color: 'white',
    cursor: 'pointer',
    overflow: 'hidden',
    boxSizing: 'border-box',
    flexShrink: 0,
  },

  taskTime: {
    flexShrink: 0,
    fontSize: '10px',
    opacity: 0.85,
  },

  taskPillText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },

  moreTasksIndicator: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    padding: '2px 0',
  },

  emptyState: {
    textAlign: 'center',
    padding: 'var(--space-8)',
  },

  emptyTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
  },

  clearFiltersLarge: {
    marginTop: 'var(--space-4)',
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'white',
    backgroundColor: 'var(--color-navy)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },

  // Week view styles
  weekGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    width: '100%',
  },

  weekDayHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--space-2) var(--space-1)',
    borderBottom: '1px solid var(--border-light)',
    borderRight: '1px solid var(--border-light)',
  },

  weekDayName: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },

  weekDayNumber: {
    fontSize: 'var(--text-lg)',
    marginTop: '2px',
  },

  weekDayColumn: {
    minHeight: '300px',
    padding: 'var(--space-2)',
    borderRight: '1px solid var(--border-light)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    overflow: 'auto',
  },

  weekTaskCard: {
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    borderLeft: '3px solid',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  weekTaskTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: 'var(--font-medium)',
  },

  weekTaskTitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontWeight: 'var(--font-medium)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },

  weekTaskCourse: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  weekNoTasks: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-4)',
  },
};

export default CalendarPage;
