/**
 * Task Mappers - Transform Canvas assignment API responses to local task schema
 */

import { z } from 'zod';
import { taskTypeClassifier } from '../client/TaskTypeClassifier';
import { safeParse } from './courseMappers';
import type {
  CanvasAssignment,
  LocalTask,
  LocalCanvasTaskQueue,
} from './DataMapperTypes';

// Validation schemas for defensive parsing
const SafeNumber = z.number().catch(0);
const SafeString = z.string().catch('');
const SafeNullableString = z.string().nullable().catch(null);
const SafeNullableNumber = z.number().nullable().catch(null);
const SafeStringArray = z.array(z.string()).catch([]);

/**
 * Map Canvas assignment to local task record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapAssignment(
  canvas: CanvasAssignment,
  localCourseId: number
): LocalTask {
  const assignmentId = safeParse(SafeNumber, canvas.id, 'assignment.id');
  const assignmentName =
    safeParse(SafeString, canvas.name, 'assignment.name') || `Assignment_${assignmentId}`;
  const description = safeParse(
    SafeNullableString,
    canvas.description,
    'assignment.description'
  );
  const dueAt = safeParse(SafeNullableString, canvas.due_at, 'assignment.due_at');
  const unlockAt = safeParse(
    SafeNullableString,
    canvas.unlock_at,
    'assignment.unlock_at'
  );
  const lockAt = safeParse(SafeNullableString, canvas.lock_at, 'assignment.lock_at');
  const pointsPossible = safeParse(
    SafeNullableNumber,
    canvas.points_possible,
    'assignment.points_possible'
  );
  const submissionTypes = safeParse(
    SafeStringArray,
    canvas.submission_types,
    'assignment.submission_types'
  );

  // Determine submission status from Canvas workflow_state
  const submission = canvas.submission;
  const workflowState = submission?.workflow_state;
  const submittedAt = submission?.submitted_at;
  const score = submission?.score;

  let submissionStatus: 'pending' | 'submitted' | 'graded' = 'pending';
  if (workflowState === 'graded' || submission?.grade != null) {
    submissionStatus = 'graded';
  } else if (
    workflowState === 'submitted' ||
    workflowState === 'pending_review' ||
    submittedAt != null
  ) {
    submissionStatus = 'submitted';
  }

  // Calculate grade as percentage from score / points_possible
  let grade: number | null = null;
  if (score != null && pointsPossible != null && pointsPossible > 0) {
    grade = (score / pointsPossible) * 100;
  }

  // Extract late penalty fields from Canvas submission
  const enteredScore = submission?.entered_score ?? null;
  const pointsDeducted = submission?.points_deducted ?? null;
  const latePolicyStatus = submission?.late_policy_status ?? 'none';
  const secondsLate = submission?.seconds_late ?? 0;
  const isExcused = submission?.excused ?? false;
  const isMissing = submission?.missing ?? false;

  // Calculate entered_grade (pre-penalty percentage)
  let enteredGrade: number | null = null;
  if (enteredScore != null && pointsPossible != null && pointsPossible > 0) {
    enteredGrade = (enteredScore / pointsPossible) * 100;
  }

  // Classify task_type using tiered classification system
  const classification = taskTypeClassifier.classify({
    title: assignmentName,
    submissionTypes,
    description: description ?? undefined,
  });

  // Build field_sources with classification metadata
  const fieldSources = JSON.stringify({
    task_type: taskTypeClassifier.toFieldSource(classification),
  });

  // Detect if due time is known or only date
  let dueTimeKnown = 1;
  if (dueAt) {
    const dueDate = new Date(dueAt);
    const hours = dueDate.getUTCHours();
    const minutes = dueDate.getUTCMinutes();
    const seconds = dueDate.getUTCSeconds();
    if (hours === 0 && minutes === 0 && seconds === 0) {
      dueTimeKnown = 0;
    }
  }

  // Don't set unlock_at from Canvas if it spans multiple days
  let effectiveUnlockAt = unlockAt;
  if (unlockAt && dueAt) {
    const unlockDate = new Date(unlockAt);
    const dueDate = new Date(dueAt);
    const unlockDay = unlockDate.toISOString().split('T')[0];
    const dueDay = dueDate.toISOString().split('T')[0];
    if (unlockDay !== dueDay) {
      effectiveUnlockAt = null;
    }
  }

  return {
    external_id: String(assignmentId),
    source_type: 'canvas',
    course_id: localCourseId,
    title: assignmentName,
    description,
    due_at: dueAt,
    due_time_known: dueTimeKnown,
    unlock_at: effectiveUnlockAt,
    lock_at: lockAt,
    points_possible: pointsPossible,
    submission_types: submissionTypes.length > 0 ? submissionTypes.join(',') : null,
    weight: 0,
    grade,
    task_type: classification.type,
    task_subtype: classification.subtype,
    is_completed: submissionStatus !== 'pending' ? 1 : 0,
    submission_status: submissionStatus,
    completed_at:
      submittedAt || (submissionStatus !== 'pending' ? new Date().toISOString() : null),
    entered_grade: enteredGrade,
    points_deducted: pointsDeducted,
    late_policy_status: latePolicyStatus ?? 'none',
    seconds_late: secondsLate,
    is_excused: isExcused ? 1 : 0,
    is_missing: isMissing ? 1 : 0,
    assignment_group_id: null,
    field_sources: fieldSources,
  };
}

/**
 * Derive task_type from Canvas submission_types array
 *
 * @deprecated Use TaskTypeClassifier.classify() for full classification with tier/confidence
 */
export function _deriveTaskType(submissionTypes: string[], title?: string): string {
  if (title) {
    const result = taskTypeClassifier.classify({
      title,
      submissionTypes,
    });
    return result.type;
  }

  if (submissionTypes.includes('not_graded')) return 'info';
  if (submissionTypes.includes('online_quiz')) return 'quiz';
  if (submissionTypes.includes('discussion_topic')) return 'discussion';
  if (submissionTypes.includes('none')) return 'participation';
  if (submissionTypes.includes('external_tool')) return 'external';
  return 'assignment';
}

/**
 * Map Canvas assignment to a queue entry for staging
 */
export function mapAssignmentToQueueEntry(
  canvas: CanvasAssignment,
  localCourseId: number,
  matchedUserTaskId?: number | null,
  matchConfidence?: number | null
): LocalCanvasTaskQueue {
  const assignmentId = safeParse(SafeNumber, canvas.id, 'assignment.id');
  const assignmentName =
    safeParse(SafeString, canvas.name, 'assignment.name') || `Assignment_${assignmentId}`;
  const description = safeParse(
    SafeNullableString,
    canvas.description,
    'assignment.description'
  );
  const dueAt = safeParse(SafeNullableString, canvas.due_at, 'assignment.due_at');
  const pointsPossible = safeParse(
    SafeNullableNumber,
    canvas.points_possible,
    'assignment.points_possible'
  );
  const submissionTypes = safeParse(
    SafeStringArray,
    canvas.submission_types,
    'assignment.submission_types'
  );

  const classification = taskTypeClassifier.classify({
    title: assignmentName,
    submissionTypes,
    description: description ?? undefined,
  });

  return {
    external_id: String(assignmentId),
    canvas_data: JSON.stringify(canvas),
    course_id: localCourseId,
    title: assignmentName,
    description: description,
    due_at: dueAt,
    points_possible: pointsPossible,
    task_type: classification.type,
    status: 'pending',
    matched_user_task_id: matchedUserTaskId ?? null,
    match_confidence: matchConfidence ?? null,
  };
}
