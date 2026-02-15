/**
 * Constants for the UpdatesPage component
 *
 * Icon mappings, label mappings, field labels, and expiration options.
 */

import {
  Bell,
  FileText,
  Megaphone,
  AlertTriangle,
  BarChart2,
  ScrollText,
} from 'lucide-react';

/** Icons for different update types */
export const UPDATE_ICONS: Record<string, typeof Bell> = {
  task: Bell,
  grade: BarChart2,
  file: FileText,
  page: ScrollText,
  announcement: Megaphone,
  conflict: AlertTriangle,
};

/** Labels for update types */
export const UPDATE_LABELS: Record<string, string> = {
  task: 'Task',
  grade: 'Grade',
  file: 'File',
  page: 'Page',
  announcement: 'Announcement',
  conflict: 'Conflict',
};

/** Field labels for display */
export const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  due_at: 'Due date',
  points_possible: 'Points',
  weight: 'Weight',
  grade: 'Grade',
  is_completed: 'Completed status',
  submission_status: 'Submission status',
  description: 'Description',
};

/** Expiration options for remember choice */
export const EXPIRATION_OPTIONS = [
  { value: 'week', label: '1 week', days: 7 },
  { value: 'month', label: '1 month', days: 30 },
  { value: 'semester', label: 'This semester', days: 120 },
  { value: 'forever', label: 'Forever', days: null },
] as const;
