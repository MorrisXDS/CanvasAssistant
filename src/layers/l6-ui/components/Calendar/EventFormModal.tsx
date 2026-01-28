/**
 * EventFormModal Component
 * Modal for creating and editing calendar events and coursework
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  MapPin,
  AlignLeft,
  BookOpen,
  Clock,
  FileText,
  Percent,
  Hash,
  Palette,
  Bell,
  StickyNote,
  AlertTriangle,
} from 'lucide-react';
import type { DisplayCalendarEvent, Course } from '../../../l5-presentation/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { getCleanCourseName } from '../../constants';

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

// Preset color options for event customization (first is custom picker)
const COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Green' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#84CC16', label: 'Lime' },
  { value: '#F97316', label: 'Orange' },
  { value: '#6366F1', label: 'Indigo' },
];

// Reminder options in minutes
const REMINDER_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

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
  }) => Promise<void>;
  onSaveCoursework: (data: {
    courseId: number;
    title: string;
    description?: string;
    dueAt?: string;
    weight?: number;
    pointsPossible?: number;
  }) => Promise<{ success: boolean; taskId?: number }>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

function formatDateForInput(dateStr: string | null | undefined, allDay: boolean): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (allDay) {
    return date.toISOString().slice(0, 10);
  }
  // Format for datetime-local input (YYYY-MM-DDTHH:mm)
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function getDefaultStartDate(): string {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function getDefaultEndDate(startDate: string): string {
  if (!startDate) return '';
  const start = new Date(startDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour later
  const offset = end.getTimezoneOffset();
  const localDate = new Date(end.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
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
  const [dueAt, setDueAt] = useState('');
  const [weight, setWeight] = useState<number | undefined>(undefined);
  const [pointsPossible, setPointsPossible] = useState<number | undefined>(undefined);

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

  // Initialize form when opening
  useEffect(() => {
    if (isOpen) {
      if (event) {
        // Edit mode: populate from event (only for calendar events, not coursework)
        setEventType('event');
        setTitle(event.title);
        // Strip HTML from description for plain text editing
        setDescription(stripHtmlToText(event.description));

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
        setCourseId(event.courseId ?? undefined);
        // Calendar-specific fields
        setEventColor(event.eventColor || '');
        setNotes(event.notes || '');
        setReminderMinutes(event.reminderMinutes ?? 0);
      } else {
        // Create mode: reset to defaults
        setEventType('event');
        setTitle('');
        setDescription('');
        const defaultStart = getDefaultStartDate();
        setStartAt(defaultStart);
        setEndAt(getDefaultEndDate(defaultStart));
        setDueAt(defaultStart);
        setAllDay(false);
        setLocation('');
        setCourseId(undefined);
        setWeight(undefined);
        setPointsPossible(undefined);
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

        const result = await onSaveCoursework({
          courseId,
          title: title.trim(),
          description: description.trim() || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          weight: weight !== undefined ? weight : undefined,
          pointsPossible: pointsPossible !== undefined ? pointsPossible : undefined,
        });

        if (result.success) {
          onClose();
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

        // If no start time (deadline event), use epoch as sentinel
        const startDate = startAt ? new Date(startAt) : new Date(0);
        const endDate = endAt ? new Date(endAt) : undefined;

        await onSaveEvent({
          title: title.trim(),
          description: description.trim() || undefined,
          startAt: startDate.toISOString(),
          endAt: endDate?.toISOString(),
          allDay,
          location: location.trim() || undefined,
          courseId,
          // Calendar-specific fields
          color: eventColor || undefined,
          notes: notes.trim() || undefined,
          reminderMinutes: reminderMinutes > 0 ? reminderMinutes : undefined,
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
                Event
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

              {/* Color Selection */}
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

              {/* Notes (calendar-specific, doesn't affect task) */}
              <div style={styles.field}>
                <label style={styles.label}>
                  <StickyNote size={14} />
                  Notes
                  {isTaskEvent && <span style={styles.noteHint}>(calendar only)</span>}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes"
                  style={styles.textareaSmall}
                />
              </div>
            </>
          )}

          {/* Coursework-specific fields */}
          {eventType === 'coursework' && (
            <>
              {/* Due Date */}
              <div style={styles.field}>
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

              {/* Weight and Points */}
              <div style={styles.dateRow}>
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
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <Hash size={14} />
                    Points
                  </label>
                  <input
                    type="number"
                    value={pointsPossible ?? ''}
                    onChange={(e) =>
                      setPointsPossible(
                        e.target.value ? Number(e.target.value) : undefined
                      )
                    }
                    placeholder="e.g., 100"
                    min={0}
                    step={1}
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
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              style={styles.textareaSmall}
            />
          </div>

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

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 'var(--space-4)',
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '85vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  title: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },

  form: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-3) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  typeSelector: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-1)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },

  typeButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  typeButtonActive: {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },

  required: {
    color: 'var(--color-error)',
  },

  input: {
    padding: 'var(--space-2) var(--space-2)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },

  select: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },

  textarea: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'inherit',
  },

  textareaSmall: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    width: '100%',
    boxSizing: 'border-box',
    resize: 'none',
    height: '60px',
    maxHeight: '60px',
    overflow: 'auto',
    fontFamily: 'inherit',
  },

  checkboxField: {
    display: 'flex',
    alignItems: 'center',
  },

  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  dateRow: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  dateField: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 'var(--space-3)',
    borderTop: '1px solid var(--border-light)',
    marginTop: 'auto',
  },

  footerRight: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginLeft: 'auto',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  secondaryButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  deleteTrigger: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  taskEventWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: '#FEF3C7',
    border: '1px solid #F59E0B',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: '#92400E',
  },

  colorGrid: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  colorOption: {
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all var(--transition-fast)',
  },

  colorPickerInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },

  noteHint: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontWeight: 'normal',
    marginLeft: 'var(--space-1)',
  },
};

export default EventFormModal;
