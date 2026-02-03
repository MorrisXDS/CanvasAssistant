/**
 * useCourseDetailTaskState Hook
 * Manages task-related state and handlers for CourseDetail page
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '../../../l5-presentation/types';

export interface TaskListModalState {
  isOpen: boolean;
  title: string;
  tasks: Task[];
}

export interface TaskContextMenuState {
  task: Task;
  position: { x: number; y: number };
}

export interface ConfirmDialogConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText: string;
  onConfirm: () => void;
}

export interface UseCourseDetailTaskStateProps {
  courseId: number;
  courseArchivedAt: string | null;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogConfig>>;
  navigate: (path: string, options?: { state?: unknown }) => void;
}

export interface UseCourseDetailTaskStateReturn {
  // New task form state
  showAddTask: boolean;
  setShowAddTask: (show: boolean) => void;
  newTaskTitle: string;
  setNewTaskTitle: (title: string) => void;
  newTaskDescription: string;
  setNewTaskDescription: (desc: string) => void;
  newTaskStartDate: string;
  setNewTaskStartDate: (date: string) => void;
  newTaskDueDate: string;
  setNewTaskDueDate: (date: string) => void;
  newTaskWeight: string;
  setNewTaskWeight: (weight: string) => void;
  newTaskType: string;
  setNewTaskType: (type: string) => void;

  // Task expansion/editing state
  expandedTaskId: number | null;
  setExpandedTaskId: (id: number | null) => void;
  editingTaskId: number | null;
  setEditingTaskId: (id: number | null) => void;
  highlightedTaskId: number | null;
  setHighlightedTaskId: (id: number | null) => void;

  // Edit task form state
  editTaskTitle: string;
  setEditTaskTitle: (title: string) => void;
  editTaskDescription: string;
  setEditTaskDescription: (desc: string) => void;
  editTaskOriginalDescription: string;
  editTaskStartDate: string;
  setEditTaskStartDate: (date: string) => void;
  editTaskDueDate: string;
  setEditTaskDueDate: (date: string) => void;
  editTaskWeight: string;
  setEditTaskWeight: (weight: string) => void;
  editTaskGrade: string;
  setEditTaskGrade: (grade: string) => void;
  editTaskType: string;
  setEditTaskType: (type: string) => void;
  editTaskLocation: string;
  setEditTaskLocation: (location: string) => void;

  // Task list modal
  taskListModal: TaskListModalState;
  setTaskListModal: React.Dispatch<React.SetStateAction<TaskListModalState>>;

  // Task context menu
  taskContextMenu: TaskContextMenuState | null;
  setTaskContextMenu: (state: TaskContextMenuState | null) => void;

  // Archived course tasks
  archivedCourseTasks: Task[];
  setArchivedCourseTasks: (tasks: Task[]) => void;

  // Task refs for scrolling
  taskRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;

  // Handlers
  handleCreateTask: () => Promise<void>;
  handleDuplicateTask: (taskId: number) => Promise<void>;
  handleToggleComplete: (task: Task) => Promise<void>;
  startEditingTask: (task: Task) => void;
  handleSaveTask: () => Promise<void>;
  handleDeleteTask: (taskId: number, taskTitle: string) => void;
  handleTaskContextMenu: (e: React.MouseEvent, task: Task) => void;
  handleOpenTaskInCanvas: (task: Task) => Promise<void>;
  handleToggleOptional: (task: Task) => void;
  refreshArchivedCourseTasks: () => Promise<void>;
}

export function useCourseDetailTaskState({
  courseId,
  courseArchivedAt,
  setConfirmDialog,
  navigate,
}: UseCourseDetailTaskStateProps): UseCourseDetailTaskStateReturn {
  // New task form state
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskWeight, setNewTaskWeight] = useState('');
  const [newTaskType, setNewTaskType] = useState('');

  // Task expansion/editing state
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);

  // Edit task form state
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [editTaskOriginalDescription, setEditTaskOriginalDescription] = useState('');
  const [editTaskStartDate, setEditTaskStartDate] = useState('');
  const [editTaskDueDate, setEditTaskDueDate] = useState('');
  const [editTaskWeight, setEditTaskWeight] = useState('');
  const [editTaskGrade, setEditTaskGrade] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editTaskLocation, setEditTaskLocation] = useState('');

  // Task list modal
  const [taskListModal, setTaskListModal] = useState<TaskListModalState>({
    isOpen: false,
    title: '',
    tasks: [],
  });

  // Task context menu
  const [taskContextMenu, setTaskContextMenu] = useState<TaskContextMenuState | null>(null);

  // Archived course tasks
  const [archivedCourseTasks, setArchivedCourseTasks] = useState<Task[]>([]);

  // Task refs for scrolling
  const taskRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Refresh archived course tasks
  const refreshArchivedCourseTasks = useCallback(async () => {
    if (!courseArchivedAt) return;
    const api = window.api;
    if (!api?.getTasksForArchivedCourse) return;
    try {
      const tasks = await api.getTasksForArchivedCourse(courseId);
      setArchivedCourseTasks(tasks || []);
    } catch (error) {
      console.error('Failed to refresh archived course tasks:', error);
    }
  }, [courseId, courseArchivedAt]);

  // Create new task
  const handleCreateTask = useCallback(async () => {
    const api = window.api;
    if (!api?.dispatch || !newTaskTitle.trim()) return;

    try {
      const unlockAt = newTaskStartDate
        ? new Date(newTaskStartDate).toISOString()
        : undefined;
      const dueAt = newTaskDueDate
        ? new Date(newTaskDueDate).toISOString()
        : undefined;

      await api.dispatch('CreateTask', {
        courseId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        unlockAt,
        dueAt,
        weight: newTaskWeight ? parseFloat(newTaskWeight) : undefined,
        taskType: newTaskType || undefined,
      });

      // Reset form
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskStartDate('');
      setNewTaskDueDate('');
      setNewTaskWeight('');
      setNewTaskType('');
      setShowAddTask(false);

      await refreshArchivedCourseTasks();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  }, [
    courseId,
    newTaskTitle,
    newTaskDescription,
    newTaskStartDate,
    newTaskDueDate,
    newTaskWeight,
    newTaskType,
    refreshArchivedCourseTasks,
  ]);

  // Duplicate task
  const handleDuplicateTask = useCallback(async (taskId: number) => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('DuplicateTask', { taskId });
      await refreshArchivedCourseTasks();
    } catch (error) {
      console.error('Failed to duplicate task:', error);
    }
  }, [refreshArchivedCourseTasks]);

  // Toggle task completion
  const handleToggleComplete = useCallback(async (task: Task) => {
    const api = window.api;
    if (!api?.dispatch) return;

    try {
      await api.dispatch('MarkTaskComplete', {
        taskId: task.id,
        isComplete: !task.isCompleted,
      });
      await refreshArchivedCourseTasks();
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
    }
  }, [refreshArchivedCourseTasks]);

  // Start editing a task
  const startEditingTask = useCallback((task: Task) => {
    setEditTaskTitle(task.title);
    const originalDescription = task.description || '';
    setEditTaskDescription(originalDescription);
    setEditTaskOriginalDescription(originalDescription);

    const formatDateForInput = (isoString: string | null): string => {
      if (!isoString) return '';
      const date = new Date(isoString);
      if (date.getTime() === 0) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    setEditTaskStartDate(formatDateForInput(task.unlockAt));
    setEditTaskDueDate(formatDateForInput(task.dueAt));
    setEditTaskWeight(task.weight?.toString() || '');
    setEditTaskGrade(task.grade?.toString() || '');
    setEditTaskType(task.taskType || '');
    setEditTaskLocation(task.location || '');
    setEditingTaskId(task.id);
    setExpandedTaskId(task.id);
  }, []);

  // Save task edits
  const handleSaveTask = useCallback(async () => {
    const api = window.api;
    if (!api?.dispatch || !editingTaskId) return;

    try {
      const descriptionChanged = editTaskDescription !== editTaskOriginalDescription;
      const unlockAt = editTaskStartDate
        ? new Date(editTaskStartDate).toISOString()
        : '1970-01-01T00:00:00.000Z';

      await api.dispatch('UpdateTask', {
        taskId: editingTaskId,
        title: editTaskTitle.trim() || undefined,
        ...(descriptionChanged && { description: editTaskDescription || null }),
        unlockAt,
        dueAt: editTaskDueDate || null,
        weight: editTaskWeight ? parseFloat(editTaskWeight) : undefined,
        grade: editTaskGrade ? parseFloat(editTaskGrade) : null,
        taskType: editTaskType || null,
        location: editTaskLocation || null,
      });

      setEditingTaskId(null);
      await refreshArchivedCourseTasks();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  }, [
    editingTaskId,
    editTaskTitle,
    editTaskDescription,
    editTaskOriginalDescription,
    editTaskStartDate,
    editTaskDueDate,
    editTaskWeight,
    editTaskGrade,
    editTaskType,
    editTaskLocation,
    refreshArchivedCourseTasks,
  ]);

  // Delete task
  const handleDeleteTask = useCallback((taskId: number, taskTitle: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Task',
      message: `Are you sure you want to delete "${taskTitle}"? This action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        const api = window.api;
        if (!api?.dispatch) return;

        try {
          const result = await api.dispatch('DeleteTask', { taskId, force: true });
          if (result.success) {
            setExpandedTaskId(null);
            setEditingTaskId(null);
            await refreshArchivedCourseTasks();
          }
        } catch (error) {
          console.error('Failed to delete task:', error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [setConfirmDialog, refreshArchivedCourseTasks]);

  // Task context menu
  const handleTaskContextMenu = useCallback((e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    setTaskContextMenu({ task, position: { x: e.clientX, y: e.clientY } });
  }, []);

  // Open task in Canvas
  const handleOpenTaskInCanvas = useCallback(async (task: Task) => {
    const api = window.api;
    if (!api?.getTaskCanvasUrl || !api?.openExternal) return;

    try {
      const result = await api.getTaskCanvasUrl(task.id);
      if (result.success && result.data?.canvasUrl) {
        api.openExternal(result.data.canvasUrl);
      }
    } catch (error) {
      console.error('Failed to open task in Canvas:', error);
    }
  }, []);

  // Toggle optional status
  const handleToggleOptional = useCallback((task: Task) => {
    const isCurrentlyOptional = task.isOptional;
    const action = isCurrentlyOptional ? 'restore' : 'mark as optional';
    const description = isCurrentlyOptional
      ? `This will move "${task.title}" back to its original section based on submission status.`
      : `This will move "${task.title}" to the "Not for Grade" section. Canvas sync will no longer update its status.`;

    setConfirmDialog({
      isOpen: true,
      title: isCurrentlyOptional ? 'Restore Task' : 'Mark as Optional',
      message: description,
      type: 'info',
      confirmText: isCurrentlyOptional ? 'Restore' : 'Mark Optional',
      onConfirm: async () => {
        const api = window.api;
        if (!api?.dispatch) return;

        try {
          await api.dispatch('UpdateTask', {
            taskId: task.id,
            isOptional: !isCurrentlyOptional,
          });
        } catch (error) {
          console.error(`Failed to ${action} task:`, error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  }, [setConfirmDialog]);

  return {
    // New task form state
    showAddTask,
    setShowAddTask,
    newTaskTitle,
    setNewTaskTitle,
    newTaskDescription,
    setNewTaskDescription,
    newTaskStartDate,
    setNewTaskStartDate,
    newTaskDueDate,
    setNewTaskDueDate,
    newTaskWeight,
    setNewTaskWeight,
    newTaskType,
    setNewTaskType,

    // Task expansion/editing state
    expandedTaskId,
    setExpandedTaskId,
    editingTaskId,
    setEditingTaskId,
    highlightedTaskId,
    setHighlightedTaskId,

    // Edit task form state
    editTaskTitle,
    setEditTaskTitle,
    editTaskDescription,
    setEditTaskDescription,
    editTaskOriginalDescription,
    editTaskStartDate,
    setEditTaskStartDate,
    editTaskDueDate,
    setEditTaskDueDate,
    editTaskWeight,
    setEditTaskWeight,
    editTaskGrade,
    setEditTaskGrade,
    editTaskType,
    setEditTaskType,
    editTaskLocation,
    setEditTaskLocation,

    // Task list modal
    taskListModal,
    setTaskListModal,

    // Task context menu
    taskContextMenu,
    setTaskContextMenu,

    // Archived course tasks
    archivedCourseTasks,
    setArchivedCourseTasks,

    // Task refs
    taskRefs,

    // Handlers
    handleCreateTask,
    handleDuplicateTask,
    handleToggleComplete,
    startEditingTask,
    handleSaveTask,
    handleDeleteTask,
    handleTaskContextMenu,
    handleOpenTaskInCanvas,
    handleToggleOptional,
    refreshArchivedCourseTasks,
  };
}

export default useCourseDetailTaskState;
