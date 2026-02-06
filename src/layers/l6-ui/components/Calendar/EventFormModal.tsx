/**
 * EventFormModal Component
 * Modal for creating and editing calendar events and coursework
 */

import React, { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import {
  X,
  Calendar,
  MapPin,
  AlignLeft,
  BookOpen,
  Clock,
  FileText,
  Percent,
  Palette,
  Bell,
  StickyNote,
  AlertTriangle,
} from 'lucide-react';
import type { DisplayCalendarEvent, Course } from '../../../l5-presentation/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { RichTextEditor } from '../shared/RichTextEditor';
import { getCleanCourseName, TASK_TYPES } from '../../constants';
import { getEffectiveTimezone } from '../../../l5-presentation/settings';
import {
  eventFormModalStyles as styles,
  COLOR_OPTIONS,
  REMINDER_OPTIONS,
} from './eventFormModalStyles';

/**
 * Strip HTML tags and convert to plain text
 * Also extracts text from links and handles common HTML entities
 */
function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return '';

  // Create a temporary element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Get text content (strips all tags)
  let text = temp.textContent || temp.innerText || '';

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate if too long (keep first 500 chars)
  if (text.length > 500) {
    text = text.substring(0, 500) + '...';
  }

  return text;
}

type EventType = 'event' | 'coursework';

interface EventFormModalProps {
  isOpen: boolean;
  event?: DisplayCalendarEvent | null; // null = create mode, event = edit mode
  courses: Course[];
  onSaveEvent: (data: {
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
    // Task-specific fields (only for task-linked events)
    taskType?: string;
    weight?: number;
  }) => Promise<void>;
  onSaveCoursework: (data: {
    courseId: number;
    title: string;
    description?: string;
    unlockAt?: string;
    dueAt?: string;
    weight?: number;
    taskType?: string;
    location?: string;
  }) => Promise<{ success: boolean; taskId?: number }>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

/**
 * Format an ISO date string for datetime-local input, using effective timezone
 */
function formatDateForInput(dateStr: string | null | undefined, allDay: boolean): string {
  if (!dateStr) return '';
  const tz = getEffectiveTimezone();
  const dt = DateTime.fromISO(dateStr).setZone(tz);
  if (!dt.isValid) return '';

  if (allDay) {
    return dt.toFormat('yyyy-MM-dd');
  }
  // Format for datetime-local input (YYYY-MM-DDTHH:mm)
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Get default start date (next 15-min interval) in effective timezone
 */
function getDefaultStartDate(): string {
  const tz = getEffectiveTimezone();
  let dt = DateTime.now().setZone(tz);
  // Round up to next 15-minute interval
  const minutes = Math.ceil(dt.minute / 15) * 15;
  dt = dt.set({ minute: minutes % 60, second: 0, millisecond: 0 });
  if (minutes >= 60) {
    dt = dt.plus({ hours: 1 });
  }
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Get default end date (1 hour after start) in effective timezone
 */
function getDefaultEndDate(startDate: string): string {
  if (!startDate) return '';
  const tz = getEffectiveTimezone();
  // Parse the datetime-local format in effective timezone
  const dt = DateTime.fromFormat(startDate, "yyyy-MM-dd'T'HH:mm", { zone: tz });
  if (!dt.isValid) return '';
  return dt.plus({ hours: 1 }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Convert datetime-local input value to UTC ISO string for storage
 * This interprets the input in the user's effective timezone
 */
function inputToUTC(inputValue: string, allDay: boolean = false): string {
  if (!inputValue) return '';
  const tz = getEffectiveTimezone();

  let dt: DateTime;
  if (allDay) {
    // Date-only input: treat as start of day in effective timezone
    dt = DateTime.fromFormat(inputValue, 'yyyy-MM-dd', { zone: tz }).startOf('day');
  } else {
    // Datetime input: parse in effective timezone
    dt = DateTime.fromFormat(inputValue, "yyyy-MM-dd'T'HH:mm", { zone: tz });
  }

  if (!dt.isValid) return '';
  return dt.toUTC().toISO() || '';
}

export function EventFormModal({
  isOpen,
  event,
  courses,
  onSaveEvent,
  onSaveCoursework,
  onDelete,
  onClose,
}: EventFormModalProps) {
  const isEditMode = Boolean(event);

  // Event type selection (only for create mode)
  const [eventType, setEventType] = useState<EventType>('event');

  // Common fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState<number | undefined>(undefined);

  // Event-specific fields
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');

  // Coursework-specific fields
  const [courseworkStartAt, setCourseworkStartAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [weight, setWeight] = useState<number | undefined>(undefined);
  const [taskType, setTaskType] = useState<string>('');

  // Calendar-specific fields (for customizing how events appear)
  const [eventColor, setEventColor] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number>(0);

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Check if this is a task-generated event (has taskId)
  const isTaskEvent = Boolean(event?.taskId);

  // Check if this is a deadline task event (start_at is epoch - no user-set start time)
  // Use timestamp check (< 1 day from epoch) to handle timezone display issues
  const isDeadlineTaskEvent =
    isTaskEvent && event?.startAt
      ? new Date(event.startAt).getTime() < 86400000 // Less than 1 day from epoch (Jan 1-2, 1970)
      : false;

  // Try to match event title to a course using prioritized criteria (if-else chain)
  // Priority: full code > section type match > code without section > short code > nickname > name keywords
  const matchTitleToCourse = (title: string): number | undefined => {
    if (!title || courses.length === 0) return undefined;
    const titleUpper = title.toUpperCase();

    // Extract section type from title (PRA, LEC, TUT)
    const titleSectionMatch = titleUpper.match(/\b(PRA|LEC|TUT)\d*/);
    const titleSectionType = titleSectionMatch ? titleSectionMatch[1] : null;

    // Pass 1: Try full course code with section (e.g., "ECE568H1 S LEC0102")
    for (const course of courses) {
      if (course.code) {
        const codeUpper = course.code.toUpperCase();
        if (titleUpper.includes(codeUpper)) {
          return course.id;
        }
      }
    }

    // Pass 2: If title has section type (PRA/LEC/TUT), prefer courses with same section type
    if (titleSectionType) {
      for (const course of courses) {
        if (course.code) {
          const codeUpper = course.code.toUpperCase();
          // Check if course code contains the same section type
          if (codeUpper.includes(titleSectionType)) {
            // Also verify the base course code matches
            const shortCodeMatch = codeUpper.match(/^([A-Z]{2,4}\d{2,4})/);
            if (shortCodeMatch && titleUpper.includes(shortCodeMatch[1])) {
              return course.id;
            }
          }
        }
      }
    }

    // Pass 3: Try code without section (e.g., "ECE568H1" from "ECE568H1 S")
    for (const course of courses) {
      if (course.code) {
        const codeUpper = course.code.toUpperCase();
        const codeWithoutSection = codeUpper.split(/\s+/)[0];
        if (codeWithoutSection !== codeUpper && titleUpper.includes(codeWithoutSection)) {
          return course.id;
        }
      }
    }

    // Pass 4: Try short code without term indicator (e.g., "ECE568" from "ECE568H1")
    for (const course of courses) {
      if (course.code) {
        const codeUpper = course.code.toUpperCase();
        const shortCodeMatch = codeUpper.match(/^([A-Z]{2,4}\d{2,4})/);
        if (shortCodeMatch && titleUpper.includes(shortCodeMatch[1])) {
          return course.id;
        }
      }
    }

    // Pass 5: Try nickname (user-set)
    for (const course of courses) {
      if (course.nickname) {
        const nicknameUpper = course.nickname.toUpperCase();
        if (nicknameUpper.length >= 3 && titleUpper.includes(nicknameUpper)) {
          return course.id;
        }
      }
    }

    // Pass 6: Try significant words from course name (least specific)
    const commonWords = new Set([
      'AND',
      'THE',
      'FOR',
      'WITH',
      'INTO',
      'FROM',
      'COURSE',
      'INTRODUCTION',
      'INTRO',
      'ADVANCED',
      'TOPICS',
      'SELECTED',
    ]);
    for (const course of courses) {
      if (course.name) {
        const nameWords = course.name
          .toUpperCase()
          .split(/\s+/)
          .filter((w) => w.length >= 4 && !commonWords.has(w));

        for (const word of nameWords) {
          if (titleUpper.includes(word)) {
            return course.id;
          }
        }
      }
    }

    return undefined;
  };

  // Initialize form when opening
  useEffect(() => {
    if (isOpen) {
      if (event) {
        // Edit mode: determine if this is a task-linked event (coursework) or regular event
        const isCourseworkEvent = Boolean(event.taskId);
        setEventType(isCourseworkEvent ? 'coursework' : 'event');

        setTitle(event.title);
        // Strip HTML from description for plain text editing
        setDescription(stripHtmlToText(event.description));

        // If event has a courseId, use it. Otherwise, try to match by title.
        // This handles imported calendar events that match course codes but don't have courseId set.
        const detectedCourseId = event.courseId ?? matchTitleToCourse(event.title);
        setCourseId(detectedCourseId);

        if (isCourseworkEvent) {
          // Coursework edit mode: populate coursework fields
          // startAt is the unlock/start date (epoch = not set)
          // Check if startAt is epoch (not set) using timestamp check
          const startIsEpoch =
            event.startAt && new Date(event.startAt).getTime() < 86400000;
          setCourseworkStartAt(
            startIsEpoch ? '' : formatDateForInput(event.startAt, false)
          );
          // Use endAt as the due date for task events
          setDueAt(formatDateForInput(event.endAt, false));
          setTaskType(event.taskType || '');
          setWeight(event.taskWeight ?? undefined);
          setLocation(event.taskLocation || '');
          // Calendar-specific fields (still available for coursework)
          setEventColor(event.eventColor || '');
          setNotes(event.notes || '');
          setReminderMinutes(event.reminderMinutes ?? 0);
        } else {
          // Regular event edit mode
          // For deadline task events, don't show epoch - leave start empty
          // Use timestamp check (< 1 day from epoch) to handle timezone display issues
          const isDeadline = event.taskId && new Date(event.startAt).getTime() < 86400000;
          if (isDeadline) {
            setStartAt(''); // Empty - user can optionally set to make it a duration event
          } else {
            setStartAt(formatDateForInput(event.startAt, event.allDay));
          }
          setEndAt(formatDateForInput(event.endAt, event.allDay));
          setAllDay(event.allDay);
          setLocation(event.location || '');
          // Calendar-specific fields
          setEventColor(event.eventColor || '');
          setNotes(event.notes || '');
          setReminderMinutes(event.reminderMinutes ?? 0);
          setTaskType(event.taskType || '');
        }
      } else {
        // Create mode: reset to defaults
        setEventType('event');
        setTitle('');
        setDescription('');
        const defaultStart = getDefaultStartDate();
        setStartAt(defaultStart);
        setEndAt(getDefaultEndDate(defaultStart));
        setCourseworkStartAt(''); // Empty = epoch (not set)
        setDueAt(defaultStart);
        setAllDay(false);
        setLocation('');
        setCourseId(undefined);
        setWeight(undefined);
        setTaskType('');
        // Calendar-specific defaults
        setEventColor('');
        setNotes('');
        setReminderMinutes(0);
      }
      setShowDeleteConfirm(false);
    }
  }, [isOpen, event]);

  // Update end time when start time changes (for new events)
  useEffect(() => {
    if (!isEditMode && startAt && !allDay && eventType === 'event') {
      setEndAt(getDefaultEndDate(startAt));
    }
  }, [startAt, isEditMode, allDay, eventType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      if (eventType === 'coursework') {
        // Validate coursework fields
        if (!courseId) {
          alert('Please select a course for this coursework.');
          setIsSaving(false);
          return;
        }

        if (isEditMode) {
          // Editing existing coursework - use onSaveEvent which syncs to the linked task
          // Convert from effective timezone to UTC for storage
          const startAtUTC = courseworkStartAt
            ? inputToUTC(courseworkStartAt)
            : '1970-01-01T00:00:00.000Z'; // Epoch if not set
          const endAtUTC = dueAt ? inputToUTC(dueAt) : undefined;
          await onSaveEvent({
            title: title.trim(),
            description: description.trim() || undefined,
            startAt: startAtUTC,
            endAt: endAtUTC,
            allDay: false,
            location: location.trim() || undefined,
            courseId,
            // Calendar-specific fields
            color: eventColor || undefined,
            notes: notes.trim() || undefined,
            reminderMinutes: reminderMinutes > 0 ? reminderMinutes : undefined,
            // Task-specific fields (synced back to the task)
            taskType: taskType || undefined,
            weight: weight !== undefined ? weight : undefined,
          });
          onClose();
        } else {
          // Creating new coursework
          // Convert from effective timezone to UTC for storage
          // Empty start date = epoch time (not set)
          const unlockAt = courseworkStartAt
            ? inputToUTC(courseworkStartAt)
            : '1970-01-01T00:00:00.000Z';
          const result = await onSaveCoursework({
            courseId,
            title: title.trim(),
            description: description.trim() || undefined,
            unlockAt,
            dueAt: dueAt ? inputToUTC(dueAt) : undefined,
            weight: weight !== undefined ? weight : undefined,
            taskType: taskType || undefined,
            location: location.trim() || undefined,
          });

          if (result.success) {
            onClose();
          }
        }
      } else {
        // Event
        // For deadline task events, start is optional (empty = keep as deadline)
        // For regular events, start is required
        const isDeadline = isTaskEvent && !startAt;

        if (!isDeadline && !startAt) {
          setIsSaving(false);
          return;
        }

        // Convert from effective timezone to UTC for storage
        // If no start time (deadline event), use epoch as sentinel
        const startAtUTC = startAt
          ? inputToUTC(startAt, allDay)
          : '1970-01-01T00:00:00.000Z';
        const endAtUTC = endAt ? inputToUTC(endAt, allDay) : undefined;

        await onSaveEvent({
          title: title.trim(),
          description: description.trim() || undefined,
          startAt: startAtUTC,
          endAt: endAtUTC,
          allDay,
          location: location.trim() || undefined,
          courseId,
          // Calendar-specific fields
          color: eventColor || undefined,
          notes: notes.trim() || undefined,
          reminderMinutes: reminderMinutes > 0 ? reminderMinutes : undefined,
          // Task-specific fields (only synced for task-linked events)
          taskType: isTaskEvent ? taskType || undefined : undefined,
        });
        onClose();
      }
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsSaving(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error('Failed to delete event:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // For deadline task events, start time is optional
  const canSubmit =
    eventType === 'coursework'
      ? title.trim() && courseId
      : title.trim() && (startAt || isDeadlineTaskEvent);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            {isEditMode
              ? 'Edit Event'
              : eventType === 'coursework'
                ? 'New Coursework'
                : 'New Event'}
          </h2>
          <button style={styles.closeButton} onClick={onClose} disabled={isSaving}>
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Event Type Selection (only for create mode) */}
          {!isEditMode && (
            <div style={styles.typeSelector}>
              <button
                type="button"
                style={{
                  ...styles.typeButton,
                  ...(eventType === 'event' ? styles.typeButtonActive : {}),
                }}
                onClick={() => setEventType('event')}
              >
                <Calendar size={16} />
                Regular
              </button>
              <button
                type="button"
                style={{
                  ...styles.typeButton,
                  ...(eventType === 'coursework' ? styles.typeButtonActive : {}),
                }}
                onClick={() => setEventType('coursework')}
              >
                <FileText size={16} />
                Coursework
              </button>
            </div>
          )}

          {/* Title */}
          <div style={styles.field}>
            <label style={styles.label}>
              {eventType === 'coursework' ? (
                <FileText size={14} />
              ) : (
                <Calendar size={14} />
              )}
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                eventType === 'coursework' ? 'Assignment title' : 'Event title'
              }
              style={styles.input}
              required
              autoFocus
            />
          </div>

          {/* Course Selection - required for coursework, optional for event */}
          {courses.length > 0 && (
            <div style={styles.field}>
              <label style={styles.label}>
                <BookOpen size={14} />
                Course{' '}
                {eventType === 'coursework' && <span style={styles.required}>*</span>}
              </label>
              <select
                value={courseId ?? ''}
                onChange={(e) =>
                  setCourseId(e.target.value ? Number(e.target.value) : undefined)
                }
                style={styles.select}
                required={eventType === 'coursework'}
              >
                <option value="">
                  {eventType === 'coursework' ? 'Select a course' : 'No course'}
                </option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {getCleanCourseName(course.name)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Event-specific fields */}
          {eventType === 'event' && (
            <>
              {/* All Day Toggle */}
              <div style={styles.checkboxField}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                    style={styles.checkbox}
                  />
                  All day event
                </label>
              </div>

              {/* Date/Time Fields */}
              <div style={styles.dateRow}>
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <Clock size={14} />
                    {isDeadlineTaskEvent ? 'Start (optional)' : 'Start'}
                  </label>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    style={styles.input}
                    placeholder={
                      isDeadlineTaskEvent ? 'Set to create time block' : undefined
                    }
                    required={!isDeadlineTaskEvent}
                  />
                </div>
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <Clock size={14} />
                    {isDeadlineTaskEvent ? 'Due' : 'End'}
                  </label>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              {/* Location */}
              <div style={styles.field}>
                <label style={styles.label}>
                  <MapPin size={14} />
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  style={styles.input}
                />
              </div>

              {/* Task event warning - prominent alert */}
              {isTaskEvent && (
                <div style={styles.taskEventWarning}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    {isDeadlineTaskEvent
                      ? 'Deadline event. Set start time to create a scheduled time block.'
                      : 'Linked to task. Changing end time updates due date.'}
                  </span>
                </div>
              )}

              {/* Task Type - only for task-linked events in edit mode */}
              {isTaskEvent && (
                <div style={styles.field}>
                  <label style={styles.label}>
                    <FileText size={14} />
                    Type
                  </label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">Select type</option>
                    {TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Color Selection - only for events NOT associated with a course */}
              {/* Course-related events inherit their color from the course */}
              {!courseId && (
                <div style={styles.field}>
                  <label style={styles.label}>
                    <Palette size={14} />
                    Color
                  </label>
                  <div style={styles.colorGrid}>
                    {/* Color Picker - rainbow gradient */}
                    <label
                      style={{
                        ...styles.colorOption,
                        background:
                          'linear-gradient(135deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                        border:
                          !COLOR_OPTIONS.some((o) => o.value === eventColor) && eventColor
                            ? '2px solid var(--text-primary)'
                            : '2px solid var(--border-default)',
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      title="Pick custom color"
                    >
                      <input
                        type="color"
                        value={eventColor || '#3B82F6'}
                        onChange={(e) => setEventColor(e.target.value)}
                        style={styles.colorPickerInput}
                      />
                    </label>
                    {/* Preset colors */}
                    {COLOR_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        style={{
                          ...styles.colorOption,
                          backgroundColor: option.value,
                          border:
                            eventColor === option.value
                              ? '2px solid var(--text-primary)'
                              : '2px solid var(--border-default)',
                        }}
                        onClick={() => setEventColor(option.value)}
                        title={option.label}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Reminder */}
              <div style={styles.field}>
                <label style={styles.label}>
                  <Bell size={14} />
                  Reminder
                </label>
                <select
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(Number(e.target.value))}
                  style={styles.select}
                >
                  {REMINDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Coursework-specific fields */}
          {eventType === 'coursework' && (
            <>
              {/* Start Date and Due Date */}
              <div style={styles.dateRow}>
                <div style={styles.dateField}>
                  <label
                    style={styles.label}
                    title="When this coursework becomes available"
                  >
                    <Clock size={14} />
                    Start Date
                  </label>
                  <input
                    type="datetime-local"
                    value={courseworkStartAt}
                    onChange={(e) => setCourseworkStartAt(e.target.value)}
                    style={styles.input}
                    placeholder="Not set"
                  />
                </div>
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <Clock size={14} />
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              {/* Type and Weight - side by side */}
              <div style={styles.dateRow}>
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <FileText size={14} />
                    Type
                  </label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">Select type</option>
                    {TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <Percent size={14} />
                    Weight (%)
                  </label>
                  <input
                    type="number"
                    value={weight ?? ''}
                    onChange={(e) =>
                      setWeight(e.target.value ? Number(e.target.value) : undefined)
                    }
                    placeholder="0-100"
                    min={0}
                    max={100}
                    step={0.1}
                    style={styles.input}
                  />
                </div>
              </div>
            </>
          )}

          {/* Description - scrollable and compact */}
          <div style={styles.field}>
            <label style={styles.label}>
              <AlignLeft size={14} />
              Description
            </label>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Event description..."
              minHeight={80}
            />
          </div>

          {/* Notes (calendar-specific, doesn't affect task) */}
          <div style={styles.field}>
            <label style={styles.label}>
              <StickyNote size={14} />
              Notes
              {isTaskEvent && eventType === 'event' && (
                <span style={styles.noteHint}>(calendar only)</span>
              )}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes"
              style={styles.textareaSmall}
            />
          </div>

          {/* Location - only for coursework */}
          {eventType === 'coursework' && (
            <div style={styles.field}>
              <label style={styles.label}>
                <MapPin size={14} />
                Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Room, building, or online link"
                style={styles.input}
              />
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          <ConfirmDialog
            isOpen={showDeleteConfirm}
            title="Delete Event"
            message={`Are you sure you want to delete "${title}"? This action cannot be undone.`}
            type="danger"
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />

          {/* Footer Actions */}
          <div style={styles.footer}>
            {isEditMode && onDelete && (
              <button
                type="button"
                style={styles.deleteTrigger}
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSaving}
              >
                Delete Event
              </button>
            )}
            <div style={styles.footerRight}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  ...styles.primaryButton,
                  opacity: !canSubmit ? 0.5 : 1,
                  cursor: !canSubmit ? 'not-allowed' : 'pointer',
                }}
                disabled={isSaving || !canSubmit}
              >
                {isSaving
                  ? 'Saving...'
                  : isEditMode
                    ? 'Save Changes'
                    : eventType === 'coursework'
                      ? 'Create Coursework'
                      : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EventFormModal;
