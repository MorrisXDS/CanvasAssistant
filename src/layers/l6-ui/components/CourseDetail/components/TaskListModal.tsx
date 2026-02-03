/**
 * TaskListModal Component
 * Modal for displaying a full list of tasks
 */

import React from 'react';
import { X } from 'lucide-react';
import { TaskItem } from './TaskItem';
import type { Task, Policy } from '../../../../l5-presentation/types';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface TaskListModalProps {
  isOpen: boolean;
  title: string;
  tasks: Task[];
  policies: Policy[];
  onClose: () => void;
  expandedTaskId: number | null;
  editingTaskId: number | null;
  highlightedTaskId: number | null;
  editTitle: string;
  editDescription: string;
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
  policies,
  onClose,
  expandedTaskId,
  editingTaskId,
  highlightedTaskId,
  editTitle,
  editDescription,
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
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>{title}</h2>
          <button style={modalStyles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div style={modalStyles.content}>
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
                  policies={policies}
                  isFirst={index === 0}
                  isCompleted={task.isCompleted || task.grade !== null}
                  isExpanded={expandedTaskId === task.id}
                  isEditing={editingTaskId === task.id}
                  isHighlighted={highlightedTaskId === task.id}
                  editTitle={editTitle}
                  editDescription={editDescription}
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
        </div>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
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
  },
  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: '700px',
    maxHeight: '80vh',
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
  content: {
    flex: 1,
    overflowY: 'auto',
  },
};

export default TaskListModal;
