/**
 * TasksPage - Full page view for all tasks
 * Accessible from dashboard "View all" link
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, AlertTriangle, CheckCircle, Circle, Plus } from 'lucide-react';
import { Card, Badge, BadgeVariant, RichTextEditor } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import { formatDueDate, getBadgeUrgency, getCleanCourseName } from '../../constants';
import type { Task, Course } from '../../../l5-presentation/types';
import { TaskContextMenu } from '../Course/TaskContextMenu';
import { styles } from './TasksPage.styles';

type FilterType = 'all' | 'pending' | 'overdue' | 'completed';

interface TaskWithCourse {
  task: Task;
  course: Course;
  daysUntilDue: number | null;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
}

function getDaysUntilDue(dueAt: string | null): number | null {
  if (!dueAt) return null;
  const now = new Date();
  const due = new Date(dueAt);

  // Compare dates at midnight to get calendar days
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  const diffMs = dueDate.getTime() - nowDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function TasksPage() {
  const navigate = useNavigate();
  const { tasks, courses } = useStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [_showFilterDropdown, _setShowFilterDropdown] = useState(false);

  // Add Task state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskCourseId, setNewTaskCourseId] = useState<number | ''>('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskWeight, setNewTaskWeight] = useState('');
  const [newTaskType, setNewTaskType] = useState('');

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  // Process all tasks with course info
  const allTasks = useMemo(() => {
    const result: TaskWithCourse[] = [];

    for (const task of tasks) {
      const course = courseMap.get(task.courseId);
      if (!course) continue;

      const daysUntilDue = getDaysUntilDue(task.dueAt);
      result.push({
        task,
        course,
        daysUntilDue,
        urgencyLevel: getBadgeUrgency(daysUntilDue),
      });
    }

    return result;
  }, [tasks, courseMap]);

  // Filter tasks based on selection
  const filteredTasks = useMemo(() => {
    const now = new Date();
    let filtered = allTasks;

    switch (filter) {
      case 'pending':
        filtered = allTasks.filter(
          (t) => !t.task.isCompleted && (!t.task.dueAt || new Date(t.task.dueAt) >= now)
        );
        break;
      case 'overdue':
        filtered = allTasks.filter(
          (t) => !t.task.isCompleted && t.task.dueAt && new Date(t.task.dueAt) < now
        );
        break;
      case 'completed':
        filtered = allTasks.filter((t) => t.task.isCompleted);
        break;
    }

    // Sort: overdue first, then by due date
    return filtered.sort((a, b) => {
      // Completed tasks at the bottom
      if (a.task.isCompleted !== b.task.isCompleted) {
        return a.task.isCompleted ? 1 : -1;
      }
      // Then by due date
      if (!a.task.dueAt) return 1;
      if (!b.task.dueAt) return -1;
      return new Date(a.task.dueAt).getTime() - new Date(b.task.dueAt).getTime();
    });
  }, [allTasks, filter]);

  // Stats for filter tabs
  const stats = useMemo(() => {
    const now = new Date();
    return {
      all: allTasks.length,
      pending: allTasks.filter(
        (t) => !t.task.isCompleted && (!t.task.dueAt || new Date(t.task.dueAt) >= now)
      ).length,
      overdue: allTasks.filter(
        (t) => !t.task.isCompleted && t.task.dueAt && new Date(t.task.dueAt) < now
      ).length,
      completed: allTasks.filter((t) => t.task.isCompleted).length,
    };
  }, [allTasks]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    task: Task & { isOptional?: boolean };
    course: Course;
    position: { x: number; y: number };
  } | null>(null);

  const handleTaskDoubleClick = (task: Task, course: Course) => {
    navigate(`/course/${course.id}?highlightTask=${task.id}`);
  };

  const handleTaskContextMenu = (e: React.MouseEvent, task: Task, course: Course) => {
    e.preventDefault();
    setContextMenu({
      task: { ...task, isOptional: task.isOptional ?? false },
      course,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const markTaskComplete = useStore((state) => state.markTaskComplete);
  const handleToggleComplete = async (taskId?: number, currentlyCompleted?: boolean) => {
    // Use passed params or fall back to context menu
    const id = taskId ?? contextMenu?.task.id;
    const isCompleted = currentlyCompleted ?? contextMenu?.task.isCompleted;

    if (id === undefined || isCompleted === undefined) return;

    try {
      await markTaskComplete(id, !isCompleted);
    } catch (error) {
      console.error('Failed to toggle task complete:', error);
    }
  };

  const handleDuplicateTask = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('DuplicateTask', { taskId: contextMenu.task.id });
    } catch (error) {
      console.error('Failed to duplicate task:', error);
    }
  };

  const handleDeleteTask = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.dispatch) return;
    try {
      await api.dispatch('DeleteTask', { taskId: contextMenu.task.id, force: true });
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleOpenInCanvas = async () => {
    if (!contextMenu) return;
    const api = window.api;
    if (!api?.getTaskCanvasUrl || !api?.openExternal) return;

    try {
      const result = await api.getTaskCanvasUrl(contextMenu.task.id);
      if (result.success && result.data?.canvasUrl) {
        api.openExternal(result.data.canvasUrl);
      }
    } catch (error) {
      console.error('Failed to open task in Canvas:', error);
    }
  };

  // Create new task
  const handleCreateTask = async () => {
    const api = window.api;
    if (!api?.dispatch || !newTaskTitle.trim() || !newTaskCourseId) return;

    try {
      await api.dispatch('CreateTask', {
        courseId: newTaskCourseId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        dueAt: newTaskDueDate || undefined,
        weight: newTaskWeight ? parseFloat(newTaskWeight) : undefined,
        taskType: newTaskType || undefined,
      });
      // Reset form
      setNewTaskCourseId('');
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskWeight('');
      setNewTaskType('');
      setShowAddTask(false);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const filterOptions: { value: FilterType; label: string; count: number }[] = [
    { value: 'all', label: 'All Tasks', count: stats.all },
    { value: 'pending', label: 'Pending', count: stats.pending },
    { value: 'overdue', label: 'Overdue', count: stats.overdue },
    { value: 'completed', label: 'Completed', count: stats.completed },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate(-1)} style={styles.backButton}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div style={styles.headerContent}>
            <h1 style={styles.title}>All Tasks</h1>
            <p style={styles.subtitle}>{filteredTasks.length} tasks</p>
          </div>
        </div>
        <button style={styles.addButton} onClick={() => setShowAddTask(true)}>
          <Plus size={16} />
          Add Task
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterRow}>
        {filterOptions.map((option) => (
          <button
            key={option.value}
            style={{
              ...styles.filterTab,
              ...(filter === option.value ? styles.filterTabActive : {}),
            }}
            onClick={() => setFilter(option.value)}
          >
            {option.value === 'overdue' && <AlertTriangle size={14} />}
            {option.value === 'pending' && <Clock size={14} />}
            {option.value === 'completed' && <CheckCircle size={14} />}
            {option.label}
            <span style={styles.filterCount}>({option.count})</span>
          </button>
        ))}
      </div>

      {/* Task List */}
      <Card padding="none">
        {filteredTasks.length === 0 ? (
          <div style={styles.emptyState}>
            <span>No {filter === 'all' ? '' : filter} tasks</span>
          </div>
        ) : (
          <div style={styles.taskList}>
            {filteredTasks.map((item, index) => (
              <div
                key={item.task.id}
                style={{
                  ...styles.taskItem,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  opacity: item.task.isCompleted ? 0.7 : 1,
                  cursor: 'pointer',
                }}
                onDoubleClick={() => handleTaskDoubleClick(item.task, item.course)}
                onContextMenu={(e) => handleTaskContextMenu(e, item.task, item.course)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTaskDoubleClick(item.task, item.course);
                  }
                }}
              >
                {/* Priority indicator */}
                <div
                  style={{
                    ...styles.priorityBar,
                    backgroundColor: item.task.isCompleted
                      ? 'var(--color-success)'
                      : item.urgencyLevel === 'critical'
                        ? 'var(--color-critical)'
                        : item.urgencyLevel === 'high'
                          ? 'var(--color-high)'
                          : item.urgencyLevel === 'medium'
                            ? 'var(--color-medium)'
                            : 'var(--color-low)',
                  }}
                />

                {/* Submission status indicator */}
                <div style={styles.statusIcon}>
                  {(item.task.submissionStatus === 'submitted' ||
                    item.task.submissionStatus === 'graded') && (
                    <CheckCircle
                      size={18}
                      color="var(--color-success)"
                      style={{ animation: 'fadeIn 0.3s ease-out' }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={styles.taskContent}>
                  <div style={styles.taskTopRow}>
                    <span
                      style={{
                        ...styles.courseCode,
                        backgroundColor: item.course.color || 'var(--color-navy)',
                      }}
                    >
                      {item.course.code.split(/\s/)[0]}
                    </span>
                    {!item.task.isCompleted && item.task.dueAt && (
                      <Badge variant={item.urgencyLevel as BadgeVariant} size="sm">
                        {formatDueDate(item.task.dueAt, item.daysUntilDue)}
                      </Badge>
                    )}
                  </div>
                  <div
                    style={{
                      ...styles.taskTitle,
                      textDecoration: item.task.isCompleted ? 'line-through' : 'none',
                    }}
                  >
                    {item.task.title}
                  </div>
                  <div style={styles.taskMeta}>
                    {item.task.weight > 0 && (
                      <span style={styles.taskWeight}>{item.task.weight}% weight</span>
                    )}
                    {item.task.grade !== null && (
                      <span style={styles.taskGrade}>{item.task.grade.toFixed(1)}%</span>
                    )}
                    <span style={styles.courseName}>
                      {item.course.nickname || item.course.name}
                    </span>
                  </div>
                </div>

                {/* Checkbox - right side */}
                <button
                  style={styles.checkbox}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleComplete(item.task.id, item.task.isCompleted);
                  }}
                  aria-label={item.task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                >
                  {item.task.isCompleted ? (
                    <CheckCircle size={24} color="var(--color-success)" />
                  ) : (
                    <Circle size={24} color="var(--text-muted)" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Task Modal */}
      {showAddTask && (
        <div style={styles.modalOverlay} onClick={() => setShowAddTask(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>Add Task</h2>
            <div style={styles.modalForm}>
              <select
                value={newTaskCourseId}
                onChange={(e) =>
                  setNewTaskCourseId(e.target.value ? Number(e.target.value) : '')
                }
                style={styles.formSelect}
              >
                <option value="">Select course...</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} - {course.nickname || getCleanCourseName(course.name)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Task title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                style={styles.formInput}
                autoFocus
              />
              <RichTextEditor
                value={newTaskDescription}
                onChange={setNewTaskDescription}
                placeholder="Task description (optional)..."
                minHeight={80}
              />
              <div style={styles.formRow}>
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value)}
                  style={styles.formSelect}
                >
                  <option value="">Select type...</option>
                  <option value="assignment">Assignment</option>
                  <option value="quiz">Quiz</option>
                  <option value="discussion">Discussion</option>
                  <option value="exam">Exam</option>
                </select>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  style={styles.formInput}
                />
                <input
                  type="number"
                  placeholder="Weight %"
                  value={newTaskWeight}
                  onChange={(e) => setNewTaskWeight(e.target.value)}
                  style={styles.formInputSmall}
                  min="0"
                  max="100"
                />
              </div>
              <div style={styles.formActions}>
                <button style={styles.cancelButton} onClick={() => setShowAddTask(false)}>
                  Cancel
                </button>
                <button
                  style={styles.saveButton}
                  onClick={handleCreateTask}
                  disabled={!newTaskTitle.trim() || !newTaskCourseId}
                >
                  Create Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Context Menu */}
      {contextMenu && (
        <TaskContextMenu
          task={{
            id: contextMenu.task.id,
            title: contextMenu.task.title,
            isCompleted: contextMenu.task.isCompleted,
            isOptional: contextMenu.task.isOptional,
            calendarEventId: contextMenu.task.calendarEventId,
            dueAt: contextMenu.task.dueAt,
            sourceType: contextMenu.task.sourceType,
          }}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            navigate(`/course/${contextMenu.course.id}?editTask=${contextMenu.task.id}`);
            setContextMenu(null);
          }}
          onDuplicate={() => {
            handleDuplicateTask();
            setContextMenu(null);
          }}
          onToggleComplete={() => {
            handleToggleComplete();
            setContextMenu(null);
          }}
          onToggleOptional={async () => {
            const api = window.api;
            if (!api?.dispatch) return;
            try {
              await api.dispatch('UpdateTask', {
                taskId: contextMenu.task.id,
                updates: { isOptional: !contextMenu.task.isOptional },
              });
            } catch (error) {
              console.error('Failed to toggle optional:', error);
            }
            setContextMenu(null);
          }}
          onOpenInCanvas={() => {
            handleOpenInCanvas();
            setContextMenu(null);
          }}
          onViewInCalendar={() => {
            if (contextMenu.task.dueAt) {
              const dueDate = new Date(contextMenu.task.dueAt);
              navigate('/calendar', {
                state: {
                  targetDate: dueDate.toISOString(),
                  taskId: contextMenu.task.id,
                },
              });
            } else {
              navigate('/calendar');
            }
            setContextMenu(null);
          }}
          onDelete={() => {
            handleDeleteTask();
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

export default TasksPage;
