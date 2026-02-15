/**
 * Sync Task Linker
 * Handles checking for user task matches and auto-linking/suggesting links
 * between user-created tasks and Canvas tasks.
 */

import { findMatchingCanvasTask, LINK_THRESHOLDS } from '../sync/TaskMatcher';
import type { OrchestratorContext } from './OrchestratorTypes';

/**
 * Check for user tasks that might match this Canvas task.
 * Auto-links high confidence matches, queues medium confidence for review.
 */
export function checkForUserTaskLinks(
  ctx: OrchestratorContext,
  canvasTaskId: number,
  canvasTitle: string,
  canvasDueAt: string | null,
  courseId: number
): void {
  // Get user tasks in same course that haven't been linked or graded yet
  const userTasks = ctx.db.executeRead<{
    id: number;
    title: string;
    external_id: string;
    due_at: string | null;
    weight: number | null;
    notes: string | null;
    user_expected_grade: number | null;
  }>(
    `SELECT id, title, external_id, due_at, weight, notes, user_expected_grade
     FROM tasks
     WHERE course_id = ?
       AND source_type = 'user'
       AND deleted_at IS NULL
       AND merged_into_task_id IS NULL
       AND (grade IS NULL OR grade = 0)`,
    [courseId]
  );

  if (userTasks.length === 0) return;

  const canvasTask = {
    id: canvasTaskId,
    title: canvasTitle,
    courseId,
    dueAt: canvasDueAt,
    sourceType: 'canvas' as const,
  };

  for (const userTaskRow of userTasks) {
    const userTask = {
      id: userTaskRow.id,
      title: userTaskRow.title,
      courseId,
      dueAt: userTaskRow.due_at,
      sourceType: 'user' as const,
    };

    const match = findMatchingCanvasTask(userTask, [canvasTask]);

    if (match.confidence >= LINK_THRESHOLDS.autoLink) {
      // High confidence: auto-link
      autoLinkTasks(ctx, userTaskRow, canvasTaskId, match.confidence);
      ctx.log?.info(
        `Auto-linked user task "${userTask.title}" to Canvas task "${canvasTitle}" (confidence: ${match.confidence.toFixed(2)})`
      );
    } else if (match.confidence >= LINK_THRESHOLDS.suggestLink) {
      // Medium confidence: queue for user review
      queueLinkSuggestion(ctx, userTaskRow.id, canvasTaskId, match.confidence);
      ctx.log?.info(
        `Queued link suggestion: "${userTask.title}" → "${canvasTitle}" (confidence: ${match.confidence.toFixed(2)})`
      );
    }
  }
}

/**
 * Auto-link a user task to a Canvas task.
 */
export function autoLinkTasks(
  ctx: OrchestratorContext,
  userTask: {
    id: number;
    external_id: string;
    weight: number | null;
    notes: string | null;
    user_expected_grade: number | null;
  },
  canvasTaskId: number,
  confidence: number
): void {
  const now = new Date().toISOString();

  // Update Canvas task to record the link and preserve user's custom fields
  ctx.db.executeWrite(
    `UPDATE tasks SET
      linked_from_user_task = ?,
      link_confidence = ?,
      link_method = 'auto',
      weight = COALESCE(?, weight),
      notes = COALESCE(?, notes),
      user_expected_grade = COALESCE(?, user_expected_grade)
    WHERE id = ?`,
    [
      userTask.external_id,
      confidence,
      userTask.weight,
      userTask.notes,
      userTask.user_expected_grade,
      canvasTaskId,
    ],
    'tasks'
  );

  // Soft-delete the user task and record merge target
  ctx.db.executeWrite(
    `UPDATE tasks SET deleted_at = ?, merged_into_task_id = ? WHERE id = ?`,
    [now, canvasTaskId, userTask.id],
    'tasks'
  );
}

/**
 * Queue a link suggestion for user review.
 */
export function queueLinkSuggestion(
  ctx: OrchestratorContext,
  userTaskId: number,
  canvasTaskId: number,
  confidence: number
): void {
  // Check if suggestion already exists
  const existing = ctx.db.executeReadOne<{ id: number }>(
    'SELECT id FROM link_suggestions WHERE user_task_id = ? AND canvas_task_id = ?',
    [userTaskId, canvasTaskId]
  );

  if (existing) {
    // Update confidence if higher
    ctx.db.executeWrite(
      'UPDATE link_suggestions SET confidence = MAX(confidence, ?) WHERE user_task_id = ? AND canvas_task_id = ?',
      [confidence, userTaskId, canvasTaskId],
      'link_suggestions'
    );
  } else {
    // Create new suggestion
    ctx.db.executeWrite(
      `INSERT INTO link_suggestions (user_task_id, canvas_task_id, confidence, status, created_at)
       VALUES (?, ?, ?, 'pending', datetime('now'))`,
      [userTaskId, canvasTaskId, confidence],
      'link_suggestions'
    );
  }
}
