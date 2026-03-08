/**
 * TaskItem Component
 * Displays a single task row with expandable detail/edit panel
 */

import React from 'react';
import DOMPurify from 'dompurify';
import {
  Calendar,
  ChevronRight,
  ChevronDown,
  Edit3,
  Save,
  Trash2,
  MapPin,
} from 'lucide-react';
import { createLogger } from '../../../utils/rendererLogger';

const logger = createLogger('TaskItem');
import {
  RichTextEditor,
  TaskCheckIcon,
  NotificationDot,
  FieldNotificationDot,
  type UpdateType,
} from '../../shared';
import type { Task } from '../../../../l5-presentation/types';
import {
  STORAGE_KEYS,
  LINK_BEHAVIOR,
  type LinkBehavior,
} from '../../../../l5-presentation/settings';
import { TASK_TYPES, formatGrade, formatSmartDate } from '../../../constants';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';
import { useTaskFieldUpdates } from '../../../hooks';

// Get urgency color based on due date
function getUrgencyColor(dueAt: string | null): string {
  if (!dueAt) return 'var(--text-muted)';
  const now = new Date();
  const due = new Date(dueAt);
  const hoursUntil = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil < 0) return 'var(--color-error)';
  if (hoursUntil < 24) return 'var(--color-high)';
  if (hoursUntil < 72) return 'var(--color-medium)';
  return 'var(--text-secondary)';
}

// Map field keys to display labels
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  due_at: 'Due date',
  points_possible: 'Points',
  weight: 'Weight',
  grade: 'Grade',
  is_completed: 'Completed status',
  submission_status: 'Submission status',
  description: 'Description',
};

/**
 * Get the user's link behavior preference from localStorage
 */
function getLinkBehaviorPreference(): LinkBehavior {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CONTENT);
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.linkBehavior ?? LINK_BEHAVIOR.ALWAYS_EXTERNAL;
    }
  } catch {
    // Ignore parse errors
  }
  return LINK_BEHAVIOR.ALWAYS_EXTERNAL;
}

/**
 * Extract Canvas file ID from a URL if possible
 */
function extractCanvasFileId(url: string): string | null {
  const match = url.match(/\/files\/(\d+)/);
  return match ? match[1] : null;
}

export interface TaskItemProps {
  task: Task;
  isFirst: boolean;
  isCompleted?: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isHighlighted?: boolean;
  editTitle: string;
  editDescription: string;
  editNotes: string;
  editStartDate: string;
  editDueDate: string;
  editWeight: string;
  editGrade: string;
  editTaskType: string;
  editLocation: string;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  onDuplicate: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditNotesChange: (value: string) => void;
  onEditStartDateChange: (value: string) => void;
  onEditDueDateChange: (value: string) => void;
  onEditWeightChange: (value: string) => void;
  onEditGradeChange: (value: string) => void;
  onEditTaskTypeChange: (value: string) => void;
  onEditLocationChange: (value: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  taskRef?: (el: HTMLDivElement | null) => void;
  onFileDownloadRequest?: (file: { id: number; title: string }, href: string) => void;
  /** Update type for this task (null = no updates) */
  updateType?: UpdateType | null;
  /** Callback to mark updates as seen */
  onMarkUpdatesSeen?: () => void;
}

export function TaskItem({
  task,
  isFirst,
  isCompleted,
  isExpanded,
  isEditing,
  isHighlighted,
  editTitle,
  editDescription,
  editNotes,
  editStartDate,
  editDueDate,
  editWeight,
  editGrade,
  editTaskType,
  editLocation,
  onToggleExpand,
  onToggleComplete,
  onDuplicate: _onDuplicate,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditTitleChange,
  onEditDescriptionChange,
  onEditNotesChange,
  onEditStartDateChange,
  onEditDueDateChange,
  onEditWeightChange,
  onEditGradeChange,
  onEditTaskTypeChange,
  onEditLocationChange,
  onContextMenu,
  taskRef,
  onFileDownloadRequest,
  updateType,
  onMarkUpdatesSeen,
}: TaskItemProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  // Get field-level updates for this task (returns null for 'new' tasks)
  const fieldUpdates = useTaskFieldUpdates(task.id);

  // Auto-dismiss: mark updates as seen when task is expanded
  React.useEffect(() => {
    if (isExpanded && updateType && onMarkUpdatesSeen) {
      onMarkUpdatesSeen();
    }
  }, [isExpanded, updateType, onMarkUpdatesSeen]);

  // Double-click outside to close edit mode
  React.useEffect(() => {
    if (!isExpanded || !isEditing) return;

    const handleDoubleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        onCancelEdit();
      }
    };

    // Delay adding the listener to avoid immediate trigger from the opening double-click
    const timeoutId = setTimeout(() => {
      document.addEventListener('dblclick', handleDoubleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('dblclick', handleDoubleClickOutside);
    };
  }, [isExpanded, isEditing, onCancelEdit]);

  // Determine if task is submitted (submitted or graded status)
  const isSubmitted =
    task.submissionStatus === 'submitted' || task.submissionStatus === 'graded';

  // Use isCompleted prop directly - parent already computes the correct value
  // This allows user to toggle completion even for submitted/graded tasks
  const showCheckmark = Boolean(isCompleted);

  // Handle double-click to toggle expand/collapse
  const handleDoubleClick = () => {
    onToggleExpand();
  };

  // Combine refs for both click-outside detection and external taskRef callback
  const setRefs = React.useCallback(
    (el: HTMLDivElement | null) => {
      wrapperRef.current = el;
      if (taskRef) taskRef(el);
    },
    [taskRef]
  );

  return (
    <div
      ref={setRefs}
      style={{
        ...styles.taskItemWrapper,
        borderTop: isFirst ? 'none' : '1px solid var(--border-light)',
        backgroundColor: isHighlighted ? 'var(--color-info-bg)' : undefined,
        transition: 'background-color 0.5s ease',
        borderRadius: isHighlighted ? 'var(--radius-md)' : undefined,
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Task Row */}
      <div
        style={{
          ...styles.taskItem,
          opacity: isCompleted ? 0.7 : 1,
          backgroundColor: isExpanded ? 'var(--bg-app)' : 'transparent',
          cursor: 'pointer',
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Submission status indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            minWidth: '24px',
            marginRight: 'var(--space-2)',
          }}
        >
          <TaskCheckIcon
            isCompleted={Boolean(showCheckmark)}
            isSubmitted={isSubmitted}
            onToggle={onToggleComplete}
            size={18}
          />
        </div>
        <div style={styles.taskInfo}>
          <div
            style={{
              ...styles.taskTitle,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span style={{ textDecoration: isCompleted ? 'line-through' : 'none' }}>
              {task.title}
            </span>
            {updateType && (
              <>
                <NotificationDot updateType={updateType} size="sm" />
                {fieldUpdates && fieldUpdates.size > 0 && (
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                    }}
                  >
                    {Array.from(fieldUpdates.keys())
                      .map((field) => FIELD_LABELS[field] || field)
                      .join(', ')}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={styles.taskMeta}>
            {task.dueAt && (
              <span
                style={{
                  color: isCompleted ? 'var(--text-muted)' : getUrgencyColor(task.dueAt),
                }}
              >
                <Calendar size={12} />
                {formatSmartDate(task.dueAt)}
                {task.fieldSources?.due_at === 'guessed' && (
                  <span style={styles.guessedBadge} title="Auto-assigned date">
                    (est.)
                  </span>
                )}
                {task.dueTimeKnown === false &&
                  task.fieldSources?.due_at !== 'guessed' && (
                    <span style={styles.unknownTimeBadge} title="Due time not specified">
                      (date only)
                    </span>
                  )}
              </span>
            )}
            {task.location && (
              <span style={styles.taskLocation} title="Location">
                <MapPin size={12} />
                {task.location}
              </span>
            )}
            {task.weight > 0 ? (
              <span style={styles.taskWeight} title="Weight towards final grade">
                Weight: {task.weight}%
              </span>
            ) : !isCompleted ? (
              <span
                style={styles.unsetWeightBadge}
                title="Weight not set - affects grade calculation"
              >
                No weight
              </span>
            ) : null}
            {task.grade !== null && (
              <span style={styles.taskScore} title="Score on this coursework">
                Score: {formatGrade(task.grade)}
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            ...styles.taskActions,
            opacity: isHovered || isExpanded ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          <button
            style={styles.taskActionBtn}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown size={16} color="var(--text-muted)" />
            ) : (
              <ChevronRight size={16} color="var(--text-muted)" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Detail Panel - read-only view */}
      {isExpanded && !isEditing && (
        <div style={styles.taskDetailPanel}>
          <div style={styles.taskDetailContent}>
            {task.description && (
              <div style={styles.taskDetailRow}>
                <span style={styles.taskDetailLabel}>Description</span>
                <div
                  className="announcement-content"
                  style={styles.taskDetailText}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(task.description, {
                      ADD_ATTR: ['target'],
                    }),
                  }}
                  onClick={async (e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'A') {
                      e.preventDefault();
                      const href = (target as HTMLAnchorElement).href;
                      if (!href) return;

                      const linkBehavior = getLinkBehaviorPreference();

                      if (linkBehavior === LINK_BEHAVIOR.PREFER_LOCAL) {
                        const fileId = extractCanvasFileId(href);

                        if (fileId && window.api) {
                          try {
                            const filesData = await window.api.getFiles();
                            const allFiles = [
                              ...filesData.resources,
                              ...filesData.attachments,
                            ];

                            const file = allFiles.find(
                              (f: { externalId: string }) => f.externalId === fileId
                            );

                            if (file) {
                              if (file.localPath) {
                                await window.api.openResource(file.id);
                                return;
                              } else if (onFileDownloadRequest) {
                                onFileDownloadRequest(
                                  { id: file.id, title: file.title },
                                  href
                                );
                                return;
                              }
                            }
                          } catch (err) {
                            logger.error('Error handling link', err instanceof Error ? err : undefined);
                          }
                        }
                      }

                      window.api?.openExternal(href);
                    }
                  }}
                />
              </div>
            )}
            <div style={styles.taskDetailGrid}>
              {task.taskType && (
                <div style={styles.taskDetailItem}>
                  <span style={styles.taskDetailLabel}>Type</span>
                  <span style={styles.taskDetailValue}>
                    {TASK_TYPES.find((t) => t.value === task.taskType)?.label ||
                      task.taskType}
                  </span>
                </div>
              )}
              {task.dueAt && (
                <div style={styles.taskDetailItem}>
                  <span
                    style={{
                      ...styles.taskDetailLabel,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Due Date
                    {fieldUpdates?.get('due_at') && (
                      <FieldNotificationDot
                        updateType={fieldUpdates.get('due_at')!.updateType}
                        fieldName="due_at"
                        oldValue={fieldUpdates.get('due_at')!.oldValue}
                        newValue={fieldUpdates.get('due_at')!.newValue}
                        size="sm"
                      />
                    )}
                  </span>
                  <span style={styles.taskDetailValue}>
                    {formatSmartDate(task.dueAt)}
                  </span>
                </div>
              )}
              {task.weight > 0 && (
                <div style={styles.taskDetailItem}>
                  <span
                    style={{
                      ...styles.taskDetailLabel,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Weight
                    {fieldUpdates?.get('weight') && (
                      <FieldNotificationDot
                        updateType={fieldUpdates.get('weight')!.updateType}
                        fieldName="weight"
                        oldValue={fieldUpdates.get('weight')!.oldValue}
                        newValue={fieldUpdates.get('weight')!.newValue}
                        size="sm"
                      />
                    )}
                  </span>
                  <span style={styles.taskDetailValue}>{task.weight}%</span>
                </div>
              )}
              {task.grade !== null && (
                <div style={styles.taskDetailItem}>
                  <span
                    style={{
                      ...styles.taskDetailLabel,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Score
                    {fieldUpdates?.get('grade') && (
                      <FieldNotificationDot
                        updateType={fieldUpdates.get('grade')!.updateType}
                        fieldName="grade"
                        oldValue={fieldUpdates.get('grade')!.oldValue}
                        newValue={fieldUpdates.get('grade')!.newValue}
                        size="sm"
                      />
                    )}
                  </span>
                  <span style={styles.taskDetailValue}>{task.grade}%</span>
                </div>
              )}
              {task.pointsPossible !== null && (
                <div style={styles.taskDetailItem}>
                  <span
                    style={{
                      ...styles.taskDetailLabel,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Points
                    {fieldUpdates?.get('points_possible') && (
                      <FieldNotificationDot
                        updateType={fieldUpdates.get('points_possible')!.updateType}
                        fieldName="points_possible"
                        oldValue={fieldUpdates.get('points_possible')!.oldValue}
                        newValue={fieldUpdates.get('points_possible')!.newValue}
                        size="sm"
                      />
                    )}
                  </span>
                  <span style={styles.taskDetailValue}>{task.pointsPossible}</span>
                </div>
              )}
            </div>
            <div style={styles.taskDetailActions}>
              <button style={styles.editButton} onClick={onStartEdit}>
                <Edit3 size={14} />
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Edit Panel - only shows when editing */}
      {isExpanded && isEditing && (
        <div style={styles.taskDetailPanel}>
          <div style={styles.taskEditForm}>
            <div style={styles.taskEditRow}>
              <label style={styles.taskEditLabel}>Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => onEditTitleChange(e.target.value)}
                style={styles.taskEditInput}
              />
            </div>
            {/* Description - Read-only for Canvas tasks, editable for user tasks */}
            {task.sourceType === 'canvas' ? (
              <>
                <div style={styles.taskEditRow}>
                  <label style={styles.taskEditLabel}>Description (from Canvas)</label>
                  <div
                    style={{
                      maxHeight: '120px',
                      overflowY: 'auto',
                      padding: 'var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      lineHeight: '1.5',
                    }}
                    dangerouslySetInnerHTML={{
                      __html:
                        task.description ||
                        '<span style="color: var(--text-muted); font-style: italic;">No description provided</span>',
                    }}
                  />
                </div>
                <div style={styles.taskEditRow}>
                  <label style={styles.taskEditLabel}>Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => onEditNotesChange(e.target.value)}
                    placeholder="Add your personal notes..."
                    style={{
                      padding: 'var(--space-3)',
                      fontSize: 'var(--text-sm)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      minHeight: '80px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      width: '100%',
                    }}
                  />
                </div>
              </>
            ) : (
              <div style={styles.taskEditRow}>
                <label style={styles.taskEditLabel}>Description</label>
                <RichTextEditor
                  value={editDescription}
                  onChange={onEditDescriptionChange}
                  placeholder="Enter task description..."
                  minHeight={100}
                />
              </div>
            )}
            <div style={styles.taskEditRow}>
              <label style={styles.taskEditLabel}>Type</label>
              <select
                value={editTaskType}
                onChange={(e) => onEditTaskTypeChange(e.target.value)}
                style={styles.taskEditSelect}
              >
                <option value="">Select type...</option>
                {TASK_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.taskEditRow}>
              <label style={styles.taskEditLabel}>Location</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => onEditLocationChange(e.target.value)}
                style={styles.taskEditInput}
                placeholder="Room, building, or online link"
              />
            </div>
            {/* Row 1: Start Date | Due Date */}
            <div style={styles.taskEditRowGroup}>
              <div style={styles.taskEditRowHalf}>
                <label
                  style={styles.taskEditLabel}
                  title="When this coursework becomes available"
                >
                  Start Date
                </label>
                <input
                  type="datetime-local"
                  value={editStartDate}
                  onChange={(e) => onEditStartDateChange(e.target.value)}
                  style={styles.taskEditInput}
                  placeholder="Not set"
                />
              </div>
              <div style={styles.taskEditRowHalf}>
                <label style={styles.taskEditLabel}>Due Date</label>
                <input
                  type="datetime-local"
                  value={editDueDate}
                  onChange={(e) => onEditDueDateChange(e.target.value)}
                  style={styles.taskEditInput}
                />
              </div>
            </div>
            {/* Row 2: Weight | Score */}
            <div style={styles.taskEditRowGroup}>
              <div style={styles.taskEditRowHalf}>
                <label
                  style={styles.taskEditLabel}
                  title="How much this counts towards your final grade"
                >
                  Weight (%)
                </label>
                <input
                  type="number"
                  value={editWeight}
                  onChange={(e) => onEditWeightChange(e.target.value)}
                  style={styles.taskEditInput}
                  min="0"
                  max="100"
                  placeholder="e.g. 10"
                />
              </div>
              <div style={styles.taskEditRowHalf}>
                <label
                  style={styles.taskEditLabel}
                  title="Your score on this coursework (0-100%)"
                >
                  Score (%)
                </label>
                <input
                  type="number"
                  value={editGrade}
                  onChange={(e) => onEditGradeChange(e.target.value)}
                  style={styles.taskEditInput}
                  min="0"
                  max="150"
                  placeholder="e.g. 85"
                />
              </div>
            </div>
            <div style={styles.taskEditActions}>
              <button style={styles.deleteButton} onClick={onDelete}>
                <Trash2 size={14} />
                Delete
              </button>
              <div style={styles.taskEditActionsRight}>
                <button style={styles.cancelButton} onClick={onCancelEdit}>
                  Cancel
                </button>
                <button style={styles.saveButton} onClick={onSaveEdit}>
                  <Save size={14} />
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskItem;
