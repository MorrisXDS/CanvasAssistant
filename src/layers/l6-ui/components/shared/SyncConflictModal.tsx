/**
 * Sync Conflict Resolution Modal
 *
 * Displays conflicts between local and Canvas data,
 * allowing users to choose which value to keep.
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, Calendar, Clock } from 'lucide-react';

/**
 * User-friendly field name mappings
 */
const FIELD_LABELS: Record<string, Record<string, string>> = {
  task: {
    is_completed: 'Completion Status',
    title: 'Title',
    description: 'Description',
    due_at: 'Due Date',
    weight: 'Grade Weight (%)',
    grade: 'Your Grade',
    points_possible: 'Total Points',
    priority_score: 'Priority',
    submission_status: 'Submission Status',
    unlock_at: 'Available From',
    lock_at: 'Available Until',
  },
  course: {
    name: 'Course Name',
    code: 'Course Code',
    current_grade: 'Current Grade',
    target_grade: 'Target Grade',
    color: 'Color',
    nickname: 'Nickname',
    is_hidden: 'Visibility',
    syllabus_body: 'Syllabus',
  },
  notification: {
    title: 'Title',
    message: 'Message',
    dismissed_at: 'Dismissed',
    is_read: 'Read Status',
    published_at: 'Published Date',
  },
};

/**
 * User-friendly entity type mappings
 */
const ENTITY_LABELS: Record<string, string> = {
  task: 'ASSIGNMENT',
  course: 'COURSE',
  notification: 'ANNOUNCEMENT',
};

/**
 * Field-specific value formatters for human-readable display
 */
const VALUE_FORMATTERS: Record<string, Record<string, (val: unknown) => string>> = {
  task: {
    is_completed: (val) => (val ? 'Completed' : 'Not completed'),
    is_optional: (val) => (val ? 'Optional' : 'Required'),
  },
  course: {
    is_hidden: (val) => (val ? 'Hidden' : 'Visible'),
  },
  notification: {
    is_read: (val) => (val ? 'Read' : 'Unread'),
  },
};

/**
 * Get context-aware labels for local vs canvas values
 */
function getValueLabels(field: string): { local: string; canvas: string } {
  if (field === 'is_completed') {
    return { local: 'You marked', canvas: 'Canvas says' };
  }
  if (['title', 'description', 'weight', 'task_type'].includes(field)) {
    return { local: 'Your edit', canvas: 'From Canvas' };
  }
  return { local: 'Your value', canvas: 'Canvas value' };
}

/**
 * Get user-friendly label for a field
 */
function getFieldLabel(entity: string, field: string): string {
  return (
    FIELD_LABELS[entity]?.[field] ||
    field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Get user-friendly label for an entity type
 */
function getEntityLabel(entity: string): string {
  return ENTITY_LABELS[entity] || entity.toUpperCase();
}

export interface SyncConflictData {
  id: string;
  entity: 'course' | 'task' | 'notification';
  entityId: number;
  externalId: string;
  entityName: string;
  field: string;
  fieldLabel: string;
  localValue: unknown;
  canvasValue: unknown;
  timestamp: string;
  courseName?: string;
  courseId?: number;
}

export interface ConflictResolutionData {
  conflictId: string;
  useCanvasValue: boolean;
  rememberChoice: boolean;
  rememberForAll: boolean;
  expiresAt?: string | null; // ISO date when preference expires
}

interface SyncConflictModalProps {
  isOpen: boolean;
  conflicts: SyncConflictData[];
  onResolve: (resolution: ConflictResolutionData) => void;
  onResolveAll: (useCanvasValues: boolean) => void;
  onClose: () => void;
  /** Current term end date for default expiration */
  termEndDate?: string | null;
}

// Expiration preset options
type ExpirationPreset =
  | 'term-end'
  | '1-week'
  | '1-month'
  | '3-months'
  | 'never'
  | 'custom';

function getExpirationDate(
  preset: ExpirationPreset,
  termEndDate?: string | null,
  customDate?: string
): string | null {
  const now = new Date();
  switch (preset) {
    case 'term-end':
      return termEndDate || null;
    case '1-week':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    case '1-month':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    case '3-months':
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
    case 'never':
      return null;
    case 'custom':
      return customDate ? new Date(customDate).toISOString() : null;
    default:
      return null;
  }
}

export function SyncConflictModal({
  isOpen,
  conflicts,
  onResolve,
  onResolveAll,
  onClose,
  termEndDate,
}: SyncConflictModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [rememberForAll, setRememberForAll] = useState(false);
  const [expirationPreset, setExpirationPreset] = useState<ExpirationPreset>('3-months');
  const [customExpirationDate, setCustomExpirationDate] = useState('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Update default expiration when termEndDate becomes available
  useEffect(() => {
    if (termEndDate && expirationPreset === '3-months') {
      setExpirationPreset('term-end');
    }
  }, [termEndDate, expirationPreset]);

  // Reset expiration when rememberChoice changes
  useEffect(() => {
    if (!rememberChoice) {
      setExpirationPreset(termEndDate ? 'term-end' : '3-months');
      setShowCustomDatePicker(false);
    }
  }, [rememberChoice, termEndDate]);

  if (!isOpen || conflicts.length === 0) return null;

  const currentConflict = conflicts[currentIndex];
  const isLast = currentIndex === conflicts.length - 1;

  const formatValue = (entity: string, field: string, value: unknown): string => {
    // Check for field-specific formatter first
    const formatter = VALUE_FORMATTERS[entity]?.[field];
    if (formatter) return formatter(value);

    // Fallback formatting
    if (value === null || value === undefined) return '(not set)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') {
      if (value.length > 100) return value.substring(0, 100) + '...';
      return value || '(empty)';
    }
    return JSON.stringify(value);
  };

  const handleResolve = (useCanvasValue: boolean) => {
    const expiresAt = rememberChoice
      ? getExpirationDate(expirationPreset, termEndDate, customExpirationDate)
      : null;

    onResolve({
      conflictId: currentConflict.id,
      useCanvasValue,
      rememberChoice,
      rememberForAll,
      expiresAt,
    });

    // Move to next conflict or close
    if (isLast) {
      onClose();
    } else {
      setCurrentIndex(currentIndex + 1);
      setRememberChoice(false);
      setRememberForAll(false);
      setExpirationPreset(termEndDate ? 'term-end' : '3-months');
      setShowCustomDatePicker(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <AlertTriangle size={20} color="var(--color-warning)" />
            <h2 style={styles.title}>Sync Conflict</h2>
          </div>
          <button style={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Progress */}
        <div style={styles.progress}>
          <span style={styles.progressText}>
            Conflict {currentIndex + 1} of {conflicts.length}
          </span>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((currentIndex + 1) / conflicts.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Conflict Details */}
        <div style={styles.content}>
          <div style={styles.entityInfo}>
            <span style={styles.entityType}>
              {getEntityLabel(currentConflict.entity)}
            </span>
            {currentConflict.courseName && (
              <span style={styles.courseBadge}>{currentConflict.courseName}</span>
            )}
            <span style={styles.entityName}>{currentConflict.entityName}</span>
          </div>

          <div style={styles.fieldInfo}>
            <span style={styles.fieldLabel}>
              {getFieldLabel(currentConflict.entity, currentConflict.field)}
            </span>
          </div>

          {/* Values comparison */}
          {(() => {
            const labels = getValueLabels(currentConflict.field);
            return (
              <div style={styles.valuesContainer}>
                <div style={styles.valueBox}>
                  <div style={styles.valueHeader}>
                    <span style={styles.valueLabel}>{labels.local}</span>
                  </div>
                  <div style={styles.valueContent}>
                    {formatValue(
                      currentConflict.entity,
                      currentConflict.field,
                      currentConflict.localValue
                    )}
                  </div>
                  <button
                    style={{ ...styles.choiceButton, ...styles.localButton }}
                    onClick={() => handleResolve(false)}
                  >
                    Keep Mine
                  </button>
                </div>

                <div style={styles.valueDivider}>
                  <span style={styles.vsText}>vs</span>
                </div>

                <div style={styles.valueBox}>
                  <div style={styles.valueHeader}>
                    <span style={styles.valueLabel}>{labels.canvas}</span>
                  </div>
                  <div style={styles.valueContent}>
                    {formatValue(
                      currentConflict.entity,
                      currentConflict.field,
                      currentConflict.canvasValue
                    )}
                  </div>
                  <button
                    style={{ ...styles.choiceButton, ...styles.canvasButton }}
                    onClick={() => handleResolve(true)}
                  >
                    Use Canvas
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Remember options */}
          <div style={styles.rememberOptions}>
            <label style={styles.checkbox}>
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => {
                  setRememberChoice(e.target.checked);
                  if (!e.target.checked) setRememberForAll(false);
                }}
              />
              <span>
                Remember my choice for "
                {getFieldLabel(currentConflict.entity, currentConflict.field)}" in future
                syncs
              </span>
            </label>

            {rememberChoice && (
              <>
                <label style={{ ...styles.checkbox, marginLeft: 'var(--space-4)' }}>
                  <input
                    type="checkbox"
                    checked={rememberForAll}
                    onChange={(e) => setRememberForAll(e.target.checked)}
                  />
                  <span>
                    Apply to all{' '}
                    {currentConflict.entity === 'task'
                      ? 'assignments in this course'
                      : currentConflict.entity === 'notification'
                        ? 'announcements'
                        : 'courses'}
                  </span>
                </label>

                {/* Expiration selector */}
                <div style={styles.expirationSection}>
                  <div style={styles.expirationLabel}>
                    <Clock size={14} />
                    <span>Remember until:</span>
                  </div>
                  <select
                    value={expirationPreset}
                    onChange={(e) => {
                      const preset = e.target.value as ExpirationPreset;
                      setExpirationPreset(preset);
                      setShowCustomDatePicker(preset === 'custom');
                    }}
                    style={styles.expirationSelect}
                  >
                    {termEndDate && (
                      <option value="term-end">
                        End of term ({new Date(termEndDate).toLocaleDateString()})
                      </option>
                    )}
                    <option value="1-week">1 week</option>
                    <option value="1-month">1 month</option>
                    <option value="3-months">3 months</option>
                    <option value="never">Always</option>
                    <option value="custom">Custom date...</option>
                  </select>

                  {showCustomDatePicker && (
                    <div style={styles.customDatePicker}>
                      <Calendar size={14} color="var(--text-secondary)" />
                      <input
                        type="date"
                        value={customExpirationDate}
                        onChange={(e) => setCustomExpirationDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        style={styles.dateInput}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer with bulk actions - only show for multiple conflicts */}
        {conflicts.length > 1 && (
          <div style={styles.footer}>
            <button style={styles.bulkButton} onClick={() => onResolveAll(false)}>
              Keep All Mine ({conflicts.length})
            </button>
            <button style={styles.bulkButton} onClick={() => onResolveAll(true)}>
              Use All Canvas ({conflicts.length})
            </button>
          </div>
        )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-light)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
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
    cursor: 'pointer',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-md)',
  },
  progress: {
    padding: 'var(--space-3) var(--space-5)',
    backgroundColor: 'var(--bg-secondary)',
  },
  progressText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-2)',
    display: 'block',
  },
  progressBar: {
    height: '4px',
    backgroundColor: 'var(--border-light)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--color-blue)',
    transition: 'width 0.3s ease',
  },
  content: {
    padding: 'var(--space-5)',
    overflowY: 'auto',
    flex: 1,
  },
  entityInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-3)',
  },
  entityType: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-inverse)',
    backgroundColor: 'var(--color-navy)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase',
  },
  courseBadge: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-inverse)',
    backgroundColor: 'var(--color-blue)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  entityName: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },
  fieldInfo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  fieldLabel: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },
  valuesContainer: {
    display: 'flex',
    gap: 'var(--space-3)',
    alignItems: 'stretch',
    marginBottom: 'var(--space-4)',
  },
  valueBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)',
    border: '1px solid var(--border-light)',
  },
  valueHeader: {
    marginBottom: 'var(--space-2)',
  },
  valueLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },
  valueContent: {
    fontSize: 'var(--text-base)',
    color: 'var(--text-primary)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-sm)',
    minHeight: '40px',
    marginBottom: 'var(--space-3)',
    flex: 1,
    wordBreak: 'break-word',
  },
  valueDivider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 var(--space-2)',
  },
  vsText: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-muted)',
    textTransform: 'lowercase',
  },
  choiceButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
  localButton: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
    border: 'none',
  },
  canvasButton: {
    backgroundColor: 'transparent',
    color: 'var(--color-blue)',
    border: '1px solid var(--color-blue)',
  },
  rememberOptions: {
    borderTop: '1px solid var(--border-light)',
    paddingTop: 'var(--space-4)',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginBottom: 'var(--space-2)',
  },
  expirationSection: {
    marginLeft: 'var(--space-4)',
    marginTop: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  },
  expirationLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },
  expirationSelect: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    width: '100%',
  },
  customDatePicker: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-light)',
  },
  dateInput: {
    padding: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-secondary)',
  },
  bulkButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
  },
};

export default SyncConflictModal;
