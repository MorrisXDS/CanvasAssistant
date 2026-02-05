/**
 * Task Types - Shared constant for all coursework types
 *
 * These are the 16 main task types used by TaskTypeClassifier.
 * Subtypes (like 'numbered', 'webwork', 'final') are stored in task_subtype
 * column but not shown in the UI selector.
 *
 * Order matches typical academic importance for display purposes.
 */

export interface TaskTypeOption {
  value: string;
  label: string;
  /** Optional description for tooltips */
  description?: string;
}

/**
 * All available task types for coursework (16 main types)
 *
 * Matches the types detected by TaskTypeClassifier:
 * - quiz, homework, lab, exam, discussion, tutorial
 * - participation, external, project, info, paper
 * - in_person, peer_review, media, reading, assignment
 */
export const TASK_TYPES: TaskTypeOption[] = [
  // High-stakes assessments
  { value: 'exam', label: 'Exam', description: 'Midterms, finals, term tests' },
  { value: 'quiz', label: 'Quiz', description: 'Quizzes, check-ins, assessments' },

  // Core coursework
  {
    value: 'homework',
    label: 'Homework',
    description: 'Problem sets, WebWork, exercises',
  },
  { value: 'assignment', label: 'Assignment', description: 'General assignments' },
  { value: 'lab', label: 'Lab', description: 'Lab work, practicals, Wireshark, MATLAB' },
  {
    value: 'project',
    label: 'Project',
    description: 'Projects, milestones, presentations',
  },
  { value: 'paper', label: 'Paper/Essay', description: 'Essays, reports, writing tasks' },

  // Class participation
  { value: 'tutorial', label: 'Tutorial', description: 'Tutorial sessions' },
  { value: 'discussion', label: 'Discussion', description: 'Forum posts, reflections' },
  {
    value: 'participation',
    label: 'Participation',
    description: 'Attendance, engagement',
  },

  // Special types
  { value: 'reading', label: 'Reading', description: 'Reading assignments' },
  { value: 'peer_review', label: 'Peer Review', description: 'Peer assessments' },
  { value: 'media', label: 'Media', description: 'Video/audio submissions, interviews' },
  { value: 'in_person', label: 'In-Person', description: 'TA-graded, in-class work' },

  // External/system
  {
    value: 'external',
    label: 'External Tool',
    description: 'LTI, Crowdmark, external links',
  },
  {
    value: 'info',
    label: 'Info (Not Graded)',
    description: 'Surveys, announcements, solutions',
  },
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
