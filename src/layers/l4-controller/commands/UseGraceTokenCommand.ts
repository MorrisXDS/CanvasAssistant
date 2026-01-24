/**
 * UseGraceTokenCommand - Apply a grace token to a task
 *
 * Uses domain services for business logic and repositories for data access.
 * This command is now a thin orchestration layer.
 */

import {
  Command,
  CommandContext,
  CommandResult,
} from '../types';
import { TaskRepository, PolicyRepository } from '../../l1-persistence/repositories';
import { GraceTokenService } from '../../l3-intelligence/domain';

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

  // Domain service for business logic
  private readonly graceTokenService = new GraceTokenService();

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
      // Create repositories
      const taskRepo = new TaskRepository(context.db);
      const policyRepo = new PolicyRepository(context.db);

      // Fetch data using repositories
      const policy = policyRepo.findGraceTokenPolicy(params.courseId);
      if (!policy) {
        return { success: false, error: 'No grace token policy found for this course' };
      }

      const task = taskRepo.findById(params.taskId);
      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      if (task.courseId !== params.courseId) {
        return { success: false, error: 'Task not found in this course' };
      }

      // Use domain service for business logic validation
      const checkResult = this.graceTokenService.checkAvailability(
        policy,
        task,
        params.tokensToUse
      );

      if (!checkResult.canUse) {
        return { success: false, error: checkResult.error };
      }

      // Calculate application result using domain service
      const applicationResult = this.graceTokenService.calculateApplication(
        policy.policyConfig,
        task,
        params.tokensToUse
      );

      if (!applicationResult.success) {
        return { success: false, error: applicationResult.error };
      }

      // Persist changes using repository
      policyRepo.updateConfig(policy.id, applicationResult.updatedConfig);

      // Touch the task to mark it as modified
      taskRepo.update(params.taskId, {});

      return {
        success: true,
        data: {
          tokensUsed: applicationResult.tokensUsed,
          remainingTokens: applicationResult.remainingTokens,
          newDeadline: applicationResult.newDeadline,
          hoursExtended: applicationResult.hoursExtended,
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
