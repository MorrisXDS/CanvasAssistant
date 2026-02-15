/**
 * SubmissionStatusService - Calculates effective submission status using OR logic
 *
 * The effective submission status is determined by combining Canvas status
 * with user-set status using OR logic:
 * - If either is 'graded', effective = 'graded'
 * - If either is 'submitted', effective = 'submitted'
 * - Otherwise, effective = 'pending'
 *
 * This allows users to mark tasks as submitted even when Canvas doesn't
 * reflect the submission (e.g., email submissions, in-person submissions).
 */

/**
 * Valid submission status values
 */
export type SubmissionStatus = 'pending' | 'submitted' | 'graded' | null;

/**
 * Get the effective submission status using OR logic.
 *
 * @param canvasStatus - Status from Canvas API
 * @param userStatus - User-set status override
 * @returns The effective status based on OR logic
 */
export function getEffectiveSubmissionStatus(
  canvasStatus: string | null,
  userStatus: string | null
): string {
  // 'graded' takes highest priority
  if (canvasStatus === 'graded' || userStatus === 'graded') {
    return 'graded';
  }

  // 'submitted' takes second priority
  if (canvasStatus === 'submitted' || userStatus === 'submitted') {
    return 'submitted';
  }

  // Default to Canvas status, or user status, or 'pending'
  return canvasStatus ?? userStatus ?? 'pending';
}

/**
 * Check if a task is effectively submitted (submitted or graded).
 */
export function isEffectivelySubmitted(
  canvasStatus: string | null,
  userStatus: string | null
): boolean {
  const effective = getEffectiveSubmissionStatus(canvasStatus, userStatus);
  return effective === 'submitted' || effective === 'graded';
}

/**
 * Check if a task is effectively graded.
 */
export function isEffectivelyGraded(
  canvasStatus: string | null,
  userStatus: string | null
): boolean {
  return getEffectiveSubmissionStatus(canvasStatus, userStatus) === 'graded';
}

/**
 * Get display label for submission status
 */
export function getSubmissionStatusLabel(status: string | null): string {
  switch (status) {
    case 'graded':
      return 'Graded';
    case 'submitted':
      return 'Submitted';
    case 'pending':
      return 'Pending';
    default:
      return 'Not Submitted';
  }
}

/**
 * Get badge variant for submission status
 */
export function getSubmissionStatusBadgeVariant(
  status: string | null
): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'graded':
      return 'success';
    case 'submitted':
      return 'warning';
    default:
      return 'default';
  }
}
