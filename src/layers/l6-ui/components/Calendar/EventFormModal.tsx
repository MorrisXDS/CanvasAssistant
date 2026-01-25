/**
 * EventFormModal Component
 * Modal for creating and editing calendar events and coursework
 */

import React, { useState, useEffect } from 'react';
import { X, Calendar, MapPin, AlignLeft, BookOpen, Clock, FileText, Percent, Hash } from 'lucide-react';
import type { DisplayCalendarEvent, Course } from '../../../l5-presentation/types';
import { ConfirmDialog } from '../shared/ConfirmDialog';

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

  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize form when opening
  useEffect(() => {
    if (isOpen) {
      if (event) {
        // Edit mode: populate from event (only for calendar events, not coursework)
        setEventType('event');
        setTitle(event.title);
        setDescription(event.description || '');
        setStartAt(formatDateForInput(event.startAt, event.allDay));
        setEndAt(formatDateForInput(event.endAt, event.allDay));
        setAllDay(event.allDay);
        setLocation(event.location || '');
        setCourseId(event.courseId ?? undefined);
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
        if (!startAt) {
          setIsSaving(false);
          return;
        }

        const startDate = new Date(startAt);
        const endDate = endAt ? new Date(endAt) : undefined;

        await onSaveEvent({
          title: title.trim(),
          description: description.trim() || undefined,
          startAt: startDate.toISOString(),
          endAt: endDate?.toISOString(),
          allDay,
          location: location.trim() || undefined,
          courseId,
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

  const canSubmit = eventType === 'coursework'
    ? title.trim() && courseId
    : title.trim() && startAt;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            {isEditMode ? 'Edit Event' : eventType === 'coursework' ? 'New Coursework' : 'New Event'}
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
              {eventType === 'coursework' ? <FileText size={14} /> : <Calendar size={14} />}
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={eventType === 'coursework' ? 'Assignment title' : 'Event title'}
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
                Course {eventType === 'coursework' && <span style={styles.required}>*</span>}
              </label>
              <select
                value={courseId ?? ''}
                onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : undefined)}
                style={styles.select}
                required={eventType === 'coursework'}
              >
                <option value="">{eventType === 'coursework' ? 'Select a course' : 'No course'}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.name}
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
                    Start
                  </label>
                  <input
                    type={allDay ? 'date' : 'datetime-local'}
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    style={styles.input}
                    required
                  />
                </div>
                <div style={styles.dateField}>
                  <label style={styles.label}>
                    <Clock size={14} />
                    End
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
                    onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : undefined)}
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
                    Points Possible
                  </label>
                  <input
                    type="number"
                    value={pointsPossible ?? ''}
                    onChange={(e) => setPointsPossible(e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g., 100"
                    min={0}
                    step={1}
                    style={styles.input}
                  />
                </div>
              </div>
            </>
          )}

          {/* Description */}
          <div style={styles.field}>
            <label style={styles.label}>
              <AlignLeft size={14} />
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              style={styles.textarea}
              rows={3}
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
                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : eventType === 'coursework' ? 'Create Coursework' : 'Create Event'}
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
    maxWidth: '480px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  title: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
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
    padding: 'var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
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
    gap: 'var(--space-2)',
  },

  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },

  required: {
    color: 'var(--color-error)',
  },

  input: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-primary)',
    width: '100%',
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
    gap: 'var(--space-3)',
  },

  dateField: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 'var(--space-4)',
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
};

export default EventFormModal;
