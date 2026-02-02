/**
 * Task Types - Shared constant for all coursework types
 */

export interface TaskTypeOption {
  value: string;
  label: string;
}

/**
 * All available task types for coursework
 */
export const TASK_TYPES: TaskTypeOption[] = [
  { value: 'assignment', label: 'Assignment' },
  { value: 'problem_set', label: 'Problem Set' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'homework', label: 'Homework' },
  { value: 'lab', label: 'Lab' },
  { value: 'essay', label: 'Essay' },
  { value: 'writing', label: 'Writing' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'participation', label: 'Participation' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'termtest', label: 'Term Test' },
  { value: 'final_exam', label: 'Final Exam' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'reading_response', label: 'Reading Response' },
  { value: 'discussion', label: 'Discussion' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'reading', label: 'Reading' },
  { value: 'external', label: 'External Tool' },
  { value: 'info', label: 'Info (Not Graded)' },
];

/**
 * Get display label for a task type value
 */
export function getTaskTypeLabel(value: string | null | undefined): string {
  if (!value) return '';
  const found = TASK_TYPES.find((t) => t.value === value);
  return found ? found.label : value;
}

/**
 * Task type values only (for filtering)
 */
export const TASK_TYPE_VALUES = TASK_TYPES.map((t) => t.value);
