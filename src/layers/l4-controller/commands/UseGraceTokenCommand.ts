/**
 * UseGraceTokenCommand - Apply a grace token to a task
 *
 * Decrements the available grace tokens for a course and extends
 * the effective deadline for the specified task.
 */

import {
  Command,
  CommandContext,
  CommandResult,
} from '../types';

export interface UseGraceTokenParams {
  courseId: number;
  taskId: number;
  tokensToUse: number;
}

export interface UseGraceTokenResult {
  tokensUsed: number;
  remainingTokens: number;
  newDeadline: Date;
  hoursExtended: number;
}

export class UseGraceTokenCommand
  implements Command<UseGraceTokenParams, UseGraceTokenResult>
{
  readonly name = 'UseGraceToken';

  validate(params: UseGraceTokenParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Invalid course ID' };
    }

    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Invalid task ID' };
    }

    if (!params.tokensToUse || params.tokensToUse <= 0) {
      return { valid: false, error: 'Must use at least one token' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: UseGraceTokenParams
  ): Promise<CommandResult<UseGraceTokenResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Get the grace token policy for this course
      const policy = context.db.executeReadOne<{
        id: number;
        policy_config: string;
      }>(
        `SELECT id, policy_config FROM course_policies
         WHERE course_id = ? AND policy_type = 'grace_tokens' AND is_active = 1`,
        [params.courseId]
      );

      if (!policy) {
        return { success: false, error: 'No grace token policy found for this course' };
      }

      const config = JSON.parse(policy.policy_config) as {
        total_tokens: number;
        tokens_used: number;
        hours_per_token: number;
        max_tokens_per_task: number;
        applies_to: string[];
        excludes: string[];
      };

      // Check available tokens
      const availableTokens = config.total_tokens - config.tokens_used;
      if (params.tokensToUse > availableTokens) {
        return {
          success: false,
          error: `Not enough tokens. Available: ${availableTokens}, requested: ${params.tokensToUse}`,
        };
      }

      // Check max per task
      if (params.tokensToUse > config.max_tokens_per_task) {
        return {
          success: false,
          error: `Cannot use more than ${config.max_tokens_per_task} tokens per task`,
        };
      }

      // Get task and verify it exists and belongs to the course
      const task = context.db.executeReadOne<{
        id: number;
        course_id: number;
        title: string;
        due_at: string | null;
      }>(
        'SELECT id, course_id, title, due_at FROM tasks WHERE id = ? AND course_id = ?',
        [params.taskId, params.courseId]
      );

      if (!task) {
        return { success: false, error: 'Task not found in this course' };
      }

      if (!task.due_at) {
        return { success: false, error: 'Task has no due date' };
      }

      // Check if task type is excluded
      if (config.excludes.some((pattern) => task.title.toLowerCase().includes(pattern.toLowerCase()))) {
        return { success: false, error: 'Grace tokens cannot be used for this task type' };
      }

      // Calculate new deadline
      const hoursExtended = params.tokensToUse * config.hours_per_token;
      const originalDeadline = new Date(task.due_at);
      const newDeadline = new Date(originalDeadline.getTime() + hoursExtended * 60 * 60 * 1000);

      // Update tokens used in policy
      config.tokens_used += params.tokensToUse;

      context.db.executeWrite(
        `UPDATE course_policies
         SET policy_config = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(config), policy.id],
        'course_policies'
      );

      // Store the extension on the task (using local_modified_at to track changes)
      // Note: Grace deadline extension is stored via policy, task due_at remains unchanged
      context.db.executeWrite(
        `UPDATE tasks
         SET local_modified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [params.taskId],
        'tasks'
      );

      return {
        success: true,
        data: {
          tokensUsed: params.tokensToUse,
          remainingTokens: availableTokens - params.tokensToUse,
          newDeadline,
          hoursExtended,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to use grace token: ${error}`,
      };
    }
  }
}
