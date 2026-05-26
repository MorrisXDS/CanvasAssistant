/**
 * TaskListModal — modal for displaying a full list of tasks (course detail).
 *
 * Migrated to the shared `<Modal>` primitive. Public API unchanged.
 *
 * Shape: sectioned — `Modal.Header` (title + close button) and
 * `Modal.Content` (scrollable list of `TaskItem`s). No footer; the list
 * IS the body. Dismiss is standard (Esc / backdrop click) handled by the
 * primitive.
 *
 * z-index: default 1000 — opened from CourseDetail and not stacked over
 * any other modal in current flows.
 */

import React from 'react';
import { TaskItem } from './TaskItem';
import type { Task } from '../../../../l5-presentation/types';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';
import { Modal } from '../../primitives/Modal';

export interface TaskListModalProps {
  isOpen: boolean;
  title: string;
  tasks: Task[];
  onClose: () => void;
  expandedTaskId: number | null;
  editingTaskId: number | null;
  highlightedTaskId: number | null;
  editTitle: string;
  editDescription: string;
  editNotes: string;
  editStartDate: string;
  editDueDate: string;
  editWeight: string;
  editGrade: string;
  editTaskType: string;
  editLocation: string;
  onToggleExpand: (taskId: number) => void;
  onToggleComplete: (task: Task) => void;
  onDuplicate: (taskId: number) => void;
  onStartEdit: (task: Task) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (taskId: number, taskTitle: string) => void;
  onEditTitleChange: (value: string) => void;
  onEditDescriptionChange: (value: string) => void;
  onEditNotesChange: (value: string) => void;
  onEditStartDateChange: (value: string) => void;
  onEditDueDateChange: (value: string) => void;
  onEditWeightChange: (value: string) => void;
  onEditGradeChange: (value: string) => void;
  onEditTaskTypeChange: (value: string) => void;
  onEditLocationChange: (value: string) => void;
  onTaskContextMenu?: (e: React.MouseEvent, task: Task) => void;
}

export function TaskListModal({
  isOpen,
  title,
  tasks,
  onClose,
  expandedTaskId,
  editingTaskId,
  highlightedTaskId,
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
  onDuplicate,
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
  onTaskContextMenu,
}: TaskListModalProps) {
  if (!isOpen) return null;

  return (
    <Modal isOpen onClose={onClose} size="xl">
      <Modal.Header title={title} onClose={onClose} />
      <Modal.Content padded={false} maxHeight="70vh">
        {tasks.length === 0 ? (
          <div style={styles.emptySection}>
            <span>No tasks</span>
          </div>
        ) : (
          <div style={styles.taskList}>
            {tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                isFirst={index === 0}
                isCompleted={task.isCompleted}
                isExpanded={expandedTaskId === task.id}
                isEditing={editingTaskId === task.id}
                isHighlighted={highlightedTaskId === task.id}
                editTitle={editTitle}
                editDescription={editDescription}
                editNotes={editNotes}
                editStartDate={editStartDate}
                editDueDate={editDueDate}
                editWeight={editWeight}
                editGrade={editGrade}
                onToggleExpand={() => onToggleExpand(task.id)}
                onToggleComplete={() => onToggleComplete(task)}
                onDuplicate={() => onDuplicate(task.id)}
                onStartEdit={() => onStartEdit(task)}
                onCancelEdit={onCancelEdit}
                onSaveEdit={onSaveEdit}
                onDelete={() => onDelete(task.id, task.title)}
                onEditTitleChange={onEditTitleChange}
                onEditDescriptionChange={onEditDescriptionChange}
                onEditNotesChange={onEditNotesChange}
                onEditStartDateChange={onEditStartDateChange}
                onEditDueDateChange={onEditDueDateChange}
                onEditWeightChange={onEditWeightChange}
                onEditGradeChange={onEditGradeChange}
                editTaskType={editTaskType}
                onEditTaskTypeChange={onEditTaskTypeChange}
                editLocation={editLocation}
                onEditLocationChange={onEditLocationChange}
                onContextMenu={
                  onTaskContextMenu ? (e) => onTaskContextMenu(e, task) : undefined
                }
              />
            ))}
          </div>
        )}
      </Modal.Content>
    </Modal>
  );
}

export default TaskListModal;
