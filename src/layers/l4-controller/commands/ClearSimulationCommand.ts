/**
 * ClearSimulationCommand - Clear what-if grade simulations
 *
 * Removes all simulated grades and restores the view to actual data.
 * Can optionally clear just a single task's simulation.
 */

import { Command, CommandContext, CommandResult, ClearSimulationParams } from '../types';

export interface ClearSimulationResult {
  clearedCount: number;
  remainingCount: number;
}

export class ClearSimulationCommand implements Command<
  ClearSimulationParams,
  ClearSimulationResult
> {
  readonly name = 'ClearSimulation';

  validate(params: ClearSimulationParams): { valid: boolean; error?: string } {
    if (params.taskId !== undefined && params.taskId <= 0) {
      return { valid: false, error: 'Invalid task ID' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: ClearSimulationParams
  ): Promise<CommandResult<ClearSimulationResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const _previousCount = context.simulationContext.grades.size;

      if (params.taskId !== undefined) {
        // Clear single simulation
        const existed = context.simulationContext.grades.delete(params.taskId);

        if (!existed) {
          return {
            success: false,
            error: 'No simulation found for this task',
          };
        }

        // If no more simulations, deactivate
        if (context.simulationContext.grades.size === 0) {
          context.simulationContext.isActive = false;
          context.simulationContext.startedAt = null;
        }

        return {
          success: true,
          data: {
            clearedCount: 1,
            remainingCount: context.simulationContext.grades.size,
          },
        };
      } else {
        // Clear all simulations
        const clearedCount = context.simulationContext.grades.size;

        // Reset to fresh context
        context.simulationContext.grades.clear();
        context.simulationContext.isActive = false;
        context.simulationContext.startedAt = null;

        return {
          success: true,
          data: {
            clearedCount,
            remainingCount: 0,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to clear simulation: ${error}`,
      };
    }
  }
}
