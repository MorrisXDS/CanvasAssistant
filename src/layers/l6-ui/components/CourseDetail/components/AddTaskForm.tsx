/**
 * AddTaskForm Component
 * Form for creating a new task within the pending section
 */

import React from 'react';
import { TASK_TYPES } from '../../../constants';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface AddTaskFormProps {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  weight: string;
  taskType: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onWeightChange: (value: string) => void;
  onTaskTypeChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}

export function AddTaskForm({
  title,
  description,
  startDate,
  dueDate,
  weight,
  taskType,
  onTitleChange,
  onDescriptionChange,
  onStartDateChange,
  onDueDateChange,
  onWeightChange,
  onTaskTypeChange,
  onCancel,
  onCreate,
}: AddTaskFormProps) {
  return (
    <div style={styles.addTaskForm}>
      <input
        type="text"
        placeholder="Task title *"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        style={styles.addTaskInput}
        autoFocus
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        style={styles.addTaskTextarea}
        rows={2}
      />
      {/* Row 1: Type + Start Date + Due Date */}
      <div style={styles.addTaskRow}>
        <div style={styles.addTaskDateGroup}>
          <label style={styles.addTaskDateLabel}>Type</label>
          <select
            value={taskType}
            onChange={(e) => onTaskTypeChange(e.target.value)}
            style={styles.addTaskSelectWithLabel}
          >
            <option value="">Select type...</option>
            {TASK_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div style={styles.addTaskDateGroup}>
          <label style={styles.addTaskDateLabel}>Start</label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            style={styles.addTaskDateInput}
          />
        </div>
        <div style={styles.addTaskDateGroup}>
          <label style={styles.addTaskDateLabel}>Due *</label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            style={styles.addTaskDateInput}
          />
        </div>
      </div>
      {/* Row 2: Weight */}
      <div style={styles.addTaskRow}>
        <input
          type="number"
          placeholder="Weight %"
          value={weight}
          onChange={(e) => onWeightChange(e.target.value)}
          style={styles.addTaskInputSmall}
          min="0"
          max="100"
        />
      </div>
      <div style={styles.addTaskActions}>
        <button style={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
        <button
          style={styles.saveButton}
          onClick={onCreate}
          disabled={!title.trim()}
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

export default AddTaskForm;
