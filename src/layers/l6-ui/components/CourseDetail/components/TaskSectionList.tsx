/**
 * TaskSectionList Component
 * Renders the draggable task sections (Pending, Submitted, Graded, Not for Grade)
 */

import React from 'react';
import {
  CheckCircle,
  Clock,
  ChevronRight,
  Plus,
  GripVertical,
  FileText,
} from 'lucide-react';
import { Card } from '../../shared';
import type { Task } from '../../../../l5-presentation/types';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';
import { TaskItem } from './TaskItem';
import { AddTaskForm } from './AddTaskForm';

export interface TaskSectionListProps {
  // Section configuration
  taskSectionOrder: string[];
  pendingTasks: Task[];
  submittedTasks: Task[];
  gradedTasks: Task[];
  infoTasks: Task[];
  maxVisibleItems: number;

  // Drag state
  taskDragState: {
    draggingId: string | null;
    dragOverId: string | null;
  };
  taskDragHandlers: {
    onDragStart: (id: string) => (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDragOver: (id: string) => (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (id: string) => (e: React.DragEvent) => void;
  };

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

  // Task list modal
  setTaskListModal: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      title: string;
      tasks: Task[];
    }>
  >;

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

export function TaskSectionList({
  taskSectionOrder,
  pendingTasks,
  submittedTasks,
  gradedTasks,
  infoTasks,
  maxVisibleItems,
  taskDragState,
  taskDragHandlers,
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
  setTaskListModal,
  taskRefs,
  handleToggleComplete,
  handleDuplicateTask,
  startEditingTask,
  handleSaveTask,
  handleDeleteTask,
  handleTaskContextMenu,
  onFileDownloadRequest,
}: TaskSectionListProps) {
  return (
    <>
      {taskSectionOrder.map((sectionId) => {
        // Section configuration
        const sectionConfig = {
          pending: {
            title: 'Pending',
            tasks: pendingTasks,
            emptyIcon: <CheckCircle size={24} color="var(--color-success)" />,
            emptyText: 'No pending coursework',
            showAddButton: true,
            showViewAll: false,
            modalTitle: 'All Pending Tasks',
            getIsCompleted: (task: Task) => task.isCompleted,
          },
          submitted: {
            title: 'Submitted',
            tasks: submittedTasks,
            emptyIcon: <Clock size={24} color="var(--text-muted)" />,
            emptyText: 'No submitted coursework awaiting grades',
            showAddButton: false,
            showViewAll: true,
            modalTitle: 'All Submitted Tasks',
            getIsCompleted: (task: Task) => task.isCompleted,
          },
          graded: {
            title: 'Graded',
            tasks: gradedTasks,
            emptyIcon: <CheckCircle size={24} color="var(--text-muted)" />,
            emptyText: 'No graded coursework yet',
            showAddButton: false,
            showViewAll: true,
            modalTitle: 'All Graded Tasks',
            getIsCompleted: (task: Task) => task.isCompleted || task.grade !== null,
          },
          info: {
            title: 'Not for Grade',
            tasks: infoTasks,
            emptyIcon: <FileText size={24} color="var(--text-muted)" />,
            emptyText: 'No informational items',
            showAddButton: false,
            showViewAll: true,
            modalTitle: 'All Informational Items',
            getIsCompleted: () => true,
          },
        }[sectionId];

        if (!sectionConfig) return null;

        const {
          title,
          tasks: sectionTasks,
          emptyIcon,
          emptyText,
          showAddButton,
          showViewAll,
          modalTitle,
          getIsCompleted,
        } = sectionConfig;
        const isDragging = taskDragState.draggingId === sectionId;
        const isDragOver = taskDragState.dragOverId === sectionId;
        const isPending = sectionId === 'pending';
        const displayTasks = showViewAll
          ? sectionTasks.slice(0, maxVisibleItems)
          : sectionTasks;

        return (
          <div
            key={sectionId}
            draggable
            onDragStart={taskDragHandlers.onDragStart(sectionId)}
            onDragEnd={taskDragHandlers.onDragEnd}
            onDragOver={taskDragHandlers.onDragOver(sectionId)}
            onDragLeave={taskDragHandlers.onDragLeave}
            onDrop={taskDragHandlers.onDrop(sectionId)}
            style={{
              opacity: isDragging ? 0.5 : 1,
              borderTop: isDragOver
                ? '2px solid var(--color-blue)'
                : '2px solid transparent',
              transition: 'opacity 0.2s, border-color 0.2s',
            }}
          >
            <Card padding="none">
              <div style={styles.cardHeader}>
                <div style={styles.cardHeaderLeft}>
                  <GripVertical size={14} style={styles.sectionDragHandle} />
                  <h3 style={styles.cardTitle}>
                    {title} ({sectionTasks.length})
                  </h3>
                </div>
                {showAddButton && (
                  <button
                    style={styles.addTaskButton}
                    onClick={() => setShowAddTask(!showAddTask)}
                  >
                    <Plus size={16} />
                    Add Task
                  </button>
                )}
                {showViewAll && sectionTasks.length > maxVisibleItems && (
                  <button
                    style={styles.viewAllButton}
                    onClick={() =>
                      setTaskListModal({
                        isOpen: true,
                        title: modalTitle,
                        tasks: sectionTasks,
                      })
                    }
                  >
                    View all {sectionTasks.length}
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>

              {/* Add Task Form (only for pending section) */}
              {isPending && showAddTask && (
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

              {sectionTasks.length === 0 && !(isPending && showAddTask) ? (
                <div style={styles.emptySection}>
                  {emptyIcon}
                  <span>{emptyText}</span>
                </div>
              ) : (
                <div style={styles.taskList}>
                  {displayTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      isFirst={index === 0 && !(isPending && showAddTask)}
                      isCompleted={getIsCompleted(task)}
                      isExpanded={expandedTaskId === task.id}
                      isEditing={editingTaskId === task.id}
                      isHighlighted={highlightedTaskId === task.id}
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
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>
        );
      })}
    </>
  );
}

export default TaskSectionList;
