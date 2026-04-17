/**
 * UnifiedTaskList Component
 * Renders a single task list with filter chips instead of separate sections
 * Layout Option E: Compact, unified list with status filters
 */

import React, { useState, useMemo, useCallback } from 'react';
import { CheckCircle, Clock, Plus, FileText, ListFilter } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Card } from '../../shared';
import type { Task } from '../../../../l5-presentation/types';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';
import { TaskItem } from './TaskItem';
import { AddTaskForm } from './AddTaskForm';
import { useTaskUpdates } from '../../../hooks';
import { useFocusedItem } from '../../../hooks/useFocusedItem';
import { createLogger } from '../../../utils/rendererLogger';

const logger = createLogger('UnifiedTaskList');

type TaskFilter = 'all' | 'pending' | 'submitted' | 'graded' | 'info';

export interface UnifiedTaskListProps {
  // Tasks by category
  pendingTasks: Task[];
  submittedTasks: Task[];
  gradedTasks: Task[];
  infoTasks: Task[];

  // Add task form state
  showAddTask: boolean;
  setShowAddTask: (show: boolean) => void;
  newTaskTitle: string;
  newTaskDescription: string;
  newTaskStartDate: string;
  newTaskDueDate: string;
  newTaskWeight: string;
  newTaskType: string;
  setNewTaskTitle: (value: string) => void;
  setNewTaskDescription: (value: string) => void;
  setNewTaskStartDate: (value: string) => void;
  setNewTaskDueDate: (value: string) => void;
  setNewTaskWeight: (value: string) => void;
  setNewTaskType: (value: string) => void;
  handleCreateTask: () => void;

  // Task expansion/editing state
  expandedTaskId: number | null;
  setExpandedTaskId: (id: number | null) => void;
  editingTaskId: number | null;
  setEditingTaskId: (id: number | null) => void;
  highlightedTaskId: number | null;

  // Edit task form state
  editTaskTitle: string;
  editTaskDescription: string;
  editTaskNotes: string;
  editTaskStartDate: string;
  editTaskDueDate: string;
  editTaskWeight: string;
  editTaskGrade: string;
  editTaskType: string;
  editTaskLocation: string;
  setEditTaskTitle: (value: string) => void;
  setEditTaskDescription: (value: string) => void;
  setEditTaskNotes: (value: string) => void;
  setEditTaskStartDate: (value: string) => void;
  setEditTaskDueDate: (value: string) => void;
  setEditTaskWeight: (value: string) => void;
  setEditTaskGrade: (value: string) => void;
  setEditTaskType: (value: string) => void;
  setEditTaskLocation: (value: string) => void;

  // Task refs
  taskRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;

  // Handlers
  handleToggleComplete: (task: Task) => void;
  handleDuplicateTask: (taskId: number) => void;
  startEditingTask: (task: Task) => void;
  handleSaveTask: () => void;
  handleDeleteTask: (taskId: number, taskTitle: string) => void;
  handleTaskContextMenu: (e: React.MouseEvent, task: Task) => void;

  // File download handler
  onFileDownloadRequest: (file: { id: number; title: string }, href: string) => void;
}

const filterChipStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 12px',
  borderRadius: '16px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-primary)',
  color: 'var(--text-secondary)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap' as const,
};

const filterChipActiveStyles: React.CSSProperties = {
  ...filterChipStyles,
  background: 'var(--color-blue)',
  borderColor: 'var(--color-blue)',
  color: 'white',
};

const filterBarStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-color)',
  overflowX: 'auto',
  flexWrap: 'nowrap',
};

const TASK_LIST_MIN_HEIGHT = '300px';

const emptyStateStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  gap: '12px',
  color: 'var(--text-muted)',
  minHeight: TASK_LIST_MIN_HEIGHT,
};

const countBadgeStyles: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: '10px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-muted)',
};

const countBadgeActiveStyles: React.CSSProperties = {
  ...countBadgeStyles,
  background: 'rgba(255,255,255,0.2)',
  color: 'white',
};

export function UnifiedTaskList({
  pendingTasks,
  submittedTasks,
  gradedTasks,
  infoTasks,
  showAddTask,
  setShowAddTask,
  newTaskTitle,
  newTaskDescription,
  newTaskStartDate,
  newTaskDueDate,
  newTaskWeight,
  newTaskType,
  setNewTaskTitle,
  setNewTaskDescription,
  setNewTaskStartDate,
  setNewTaskDueDate,
  setNewTaskWeight,
  setNewTaskType,
  handleCreateTask,
  expandedTaskId,
  setExpandedTaskId,
  editingTaskId,
  setEditingTaskId,
  highlightedTaskId,
  editTaskTitle,
  editTaskDescription,
  editTaskNotes,
  editTaskStartDate,
  editTaskDueDate,
  editTaskWeight,
  editTaskGrade,
  editTaskType,
  editTaskLocation,
  setEditTaskTitle,
  setEditTaskDescription,
  setEditTaskNotes,
  setEditTaskStartDate,
  setEditTaskDueDate,
  setEditTaskWeight,
  setEditTaskGrade,
  setEditTaskType,
  setEditTaskLocation,
  taskRefs,
  handleToggleComplete,
  handleDuplicateTask,
  startEditingTask,
  handleSaveTask,
  handleDeleteTask,
  handleTaskContextMenu,
  onFileDownloadRequest,
}: UnifiedTaskListProps) {
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');

  // Notification dot hooks
  const taskUpdates = useTaskUpdates();

  // Create callback to mark task updates as seen
  const handleMarkUpdatesSeen = useCallback(
    (taskId: number) => {
      const update = taskUpdates.get(taskId);
      if (update && update.updateIds.length > 0) {
        window.api?.markSyncUpdatesSeen?.(update.updateIds).catch((err: Error) => {
          logger.error(
            'Failed to mark task updates as seen',
            err instanceof Error ? err : undefined
          );
        });
      }
    },
    [taskUpdates]
  );

  // Combine all tasks with their category for display
  const allTasks = useMemo(() => {
    return [
      ...pendingTasks.map((t) => ({ ...t, _category: 'pending' as const })),
      ...submittedTasks.map((t) => ({ ...t, _category: 'submitted' as const })),
      ...gradedTasks.map((t) => ({ ...t, _category: 'graded' as const })),
      ...infoTasks.map((t) => ({ ...t, _category: 'info' as const })),
    ];
  }, [pendingTasks, submittedTasks, gradedTasks, infoTasks]);

  // Filter tasks based on active filter
  const filteredTasks = useMemo(() => {
    if (activeFilter === 'all') {
      // Sort all tasks by due date
      return [...allTasks].sort((a, b) => {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
    }
    return allTasks.filter((t) => t._category === activeFilter);
  }, [allTasks, activeFilter]);

  // Focused item navigation (Left/Right + J/K)
  const { focusedIndex, focusedItem, getFocusProps } = useFocusedItem(filteredTasks, {
    persistKey: 'course-detail-tasks',
  });

  // X: toggle completion on focused task
  useHotkeys('x', () => {
    if (focusedItem) {
      handleToggleComplete(focusedItem);
    }
  });

  // E: edit focused task
  useHotkeys('e', () => {
    if (focusedItem) {
      startEditingTask(focusedItem);
    }
  });

  // Delete/Backspace: delete focused task
  useHotkeys('delete, backspace', (e) => {
    if (focusedItem) {
      e.preventDefault();
      handleDeleteTask(focusedItem.id, focusedItem.title);
    }
  });

  // Space: expand/collapse focused task
  useHotkeys('space', (e) => {
    if (focusedItem) {
      e.preventDefault();
      setExpandedTaskId(expandedTaskId === focusedItem.id ? null : focusedItem.id);
    }
  });

  // N: create new task
  useHotkeys('n', () => {
    setShowAddTask(true);
  });

  // Filter counts
  const counts = {
    all: allTasks.length,
    pending: pendingTasks.length,
    submitted: submittedTasks.length,
    graded: gradedTasks.length,
    info: infoTasks.length,
  };

  // Get completion status for a task - respect the actual isCompleted field
  const getIsCompleted = (task: Task & { _category: string }) => {
    // Info tasks are always shown as complete (they're informational only)
    if (task._category === 'info') return true;
    // For all other tasks, use the actual isCompleted field
    return task.isCompleted;
  };

  // Empty state config
  const emptyConfig = {
    all: {
      icon: <CheckCircle size={32} color="var(--color-success)" />,
      title: 'All caught up!',
      subtitle: 'No coursework for this course',
    },
    pending: {
      icon: <CheckCircle size={32} color="var(--color-success)" />,
      title: 'No pending tasks',
      subtitle: 'All coursework has been submitted or graded',
    },
    submitted: {
      icon: <Clock size={32} color="var(--text-muted)" />,
      title: 'No submitted tasks',
      subtitle: 'No coursework awaiting grades',
    },
    graded: {
      icon: <CheckCircle size={32} color="var(--text-muted)" />,
      title: 'No graded tasks',
      subtitle: 'No coursework has been graded yet',
    },
    info: {
      icon: <FileText size={32} color="var(--text-muted)" />,
      title: 'No non-graded items',
      subtitle: 'No ungraded coursework for this course',
    },
  };

  const currentEmpty = emptyConfig[activeFilter];

  return (
    <Card padding="none">
      {/* Header with title and add button */}
      <div style={styles.cardHeader}>
        <div style={styles.cardHeaderLeft}>
          <ListFilter size={16} style={{ color: 'var(--text-muted)' }} />
          <h3 style={styles.cardTitle}>Tasks</h3>
        </div>
        <button style={styles.addTaskButton} onClick={() => setShowAddTask(!showAddTask)}>
          <Plus size={16} />
          Add Task
        </button>
      </div>

      {/* Filter chips */}
      <div style={filterBarStyles}>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'submitted', label: 'Submitted' },
            { key: 'graded', label: 'Graded' },
            { key: 'info', label: 'Non Graded' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            style={activeFilter === key ? filterChipActiveStyles : filterChipStyles}
            onClick={() => setActiveFilter(key)}
          >
            {label}
            <span
              style={activeFilter === key ? countBadgeActiveStyles : countBadgeStyles}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Add Task Form */}
      {showAddTask && (
        <AddTaskForm
          title={newTaskTitle}
          description={newTaskDescription}
          startDate={newTaskStartDate}
          dueDate={newTaskDueDate}
          weight={newTaskWeight}
          taskType={newTaskType}
          onTitleChange={setNewTaskTitle}
          onDescriptionChange={setNewTaskDescription}
          onStartDateChange={setNewTaskStartDate}
          onDueDateChange={setNewTaskDueDate}
          onWeightChange={setNewTaskWeight}
          onTaskTypeChange={setNewTaskType}
          onCancel={() => setShowAddTask(false)}
          onCreate={handleCreateTask}
        />
      )}

      {/* Task list or empty state */}
      {filteredTasks.length === 0 && !showAddTask ? (
        <div style={emptyStateStyles}>
          {currentEmpty.icon}
          <div
            style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}
          >
            {currentEmpty.title}
          </div>
          <div style={{ fontSize: '13px' }}>{currentEmpty.subtitle}</div>
        </div>
      ) : (
        <div style={{ ...styles.taskList, minHeight: TASK_LIST_MIN_HEIGHT }}>
          {filteredTasks.map((task, index) => (
            <TaskItem
              key={task.id}
              task={task}
              isFirst={index === 0 && !showAddTask}
              isCompleted={getIsCompleted(task)}
              isExpanded={expandedTaskId === task.id}
              isEditing={editingTaskId === task.id}
              isHighlighted={highlightedTaskId === task.id}
              focusIndex={getFocusProps(index)['data-focus-index']}
              isKeyboardFocused={focusedIndex === index}
              editTitle={editTaskTitle}
              editDescription={editTaskDescription}
              editNotes={editTaskNotes}
              editStartDate={editTaskStartDate}
              editDueDate={editTaskDueDate}
              editWeight={editTaskWeight}
              editGrade={editTaskGrade}
              onToggleExpand={() =>
                setExpandedTaskId(expandedTaskId === task.id ? null : task.id)
              }
              onToggleComplete={() => handleToggleComplete(task)}
              onDuplicate={() => handleDuplicateTask(task.id)}
              onStartEdit={() => startEditingTask(task)}
              onCancelEdit={() => {
                setEditingTaskId(null);
                setExpandedTaskId(null);
              }}
              onSaveEdit={handleSaveTask}
              onDelete={() => handleDeleteTask(task.id, task.title)}
              onEditTitleChange={setEditTaskTitle}
              onEditDescriptionChange={setEditTaskDescription}
              onEditNotesChange={setEditTaskNotes}
              onEditStartDateChange={setEditTaskStartDate}
              onEditDueDateChange={setEditTaskDueDate}
              onEditWeightChange={setEditTaskWeight}
              onEditGradeChange={setEditTaskGrade}
              editTaskType={editTaskType}
              onEditTaskTypeChange={setEditTaskType}
              editLocation={editTaskLocation}
              onEditLocationChange={setEditTaskLocation}
              onContextMenu={(e) => handleTaskContextMenu(e, task)}
              taskRef={(el) => {
                if (el) taskRefs.current.set(task.id, el);
              }}
              onFileDownloadRequest={onFileDownloadRequest}
              updateType={taskUpdates.get(task.id)?.updateType}
              onMarkUpdatesSeen={() => handleMarkUpdatesSeen(task.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default UnifiedTaskList;
