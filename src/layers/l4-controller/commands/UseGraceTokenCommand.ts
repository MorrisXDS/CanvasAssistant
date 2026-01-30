/**
 * UseGraceTokenCommand - Apply a grace token to a task
 *
 * Uses PolicyOrchestrator for full grace token workflow including:
 * - Availability checking
 * - Usage calculation
 * - Usage record persistence
 * - Token count updates
 */

import { Command, CommandContext, CommandResult } from '../types';
import { PolicyOrchestrator } from '../../l3-intelligence/orchestration';

export interface UseGraceTokenParams {
  courseId: number;
  taskId: number;
  tokensToUse: number;
  notes?: string;
}

export interface UseGraceTokenResult {
  tokensUsed: number;
  remainingTokens: number;
  newDeadline: Date | null;
  hoursExtended: number;
}

export class UseGraceTokenCommand implements Command<
  UseGraceTokenParams,
  UseGraceTokenResult
> {
  readonly name = 'UseGraceToken';

  validate(params: UseGraceTokenParams): { valid: boolean; error?: string } {
    if (!params.courseId || params.courseId <= 0) {
      return { valid: false, error: 'Course not found or invalid' };
    }

    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Task not found or invalid' };
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
      // Use PolicyOrchestrator for full workflow
      const orchestrator = new PolicyOrchestrator(context.db);
      const result = await orchestrator.useGraceToken(
        params.courseId,
        params.taskId,
        params.tokensToUse,
        params.notes
      );

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        data: {
          tokensUsed: result.tokensUsed,
          remainingTokens: result.remainingTokens,
          newDeadline: result.newDeadline,
          hoursExtended: result.hoursExtended,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to use grace token: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
