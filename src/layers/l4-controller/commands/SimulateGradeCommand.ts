/**
 * SimulateGradeCommand - Add a what-if grade simulation
 *
 * Allows users to see the effect of a hypothetical grade on their
 * priorities and course standing without persisting the change.
 *
 * Simulations stack (multiple tasks can be simulated) and
 * create a notification reminding the user to resolve them.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  SimulateGradeParams,
  SimulationResult,
} from '../types';

export class SimulateGradeCommand implements Command<
  SimulateGradeParams,
  SimulationResult
> {
  readonly name = 'SimulateGrade';

  validate(params: SimulateGradeParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Task not found or invalid' };
    }

    if (typeof params.grade !== 'number' || isNaN(params.grade)) {
      return { valid: false, error: 'Grade must be a number' };
    }

    if (params.grade < 0 || params.grade > 150) {
      return { valid: false, error: 'Grade must be between 0 and 150' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: SimulateGradeParams
  ): Promise<CommandResult<SimulationResult>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      // Verify task exists
      const task = context.db.executeReadOne<{ id: number; course_id: number }>(
        'SELECT id, course_id FROM tasks WHERE id = ?',
        [params.taskId]
      );

      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      // Add simulation (SimulationManager handles the state)
      const result = context.simulationContext.grades.get(params.taskId);

      // Create or update simulation entry
      context.simulationContext.grades.set(params.taskId, {
        taskId: params.taskId,
        courseId: task.course_id,
        originalGrade: result?.originalGrade ?? null,
        simulatedGrade: params.grade,
        timestamp: new Date(),
      });

      if (!context.simulationContext.isActive) {
        context.simulationContext.isActive = true;
        context.simulationContext.startedAt = new Date();
      }

      // Calculate impact (simplified - full version would use SimulationManager)
      const simulationResult = this.calculateImpact(context, task.course_id);

      return {
        success: true,
        data: simulationResult,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to simulate grade: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private calculateImpact(context: CommandContext, courseId: number): SimulationResult {
    const course = context.db.executeReadOne<{
      assessed_grade: number | null;
      target_grade: number;
    }>('SELECT assessed_grade, target_grade FROM courses WHERE id = ?', [courseId]);

    const tasks = context.db.executeRead<{
      id: number;
      grade: number | null;
      weight: number;
      priority_score: number;
    }>('SELECT id, grade, weight, priority_score FROM tasks WHERE course_id = ?', [
      courseId,
    ]);

    const originalAssessedGrade = course?.assessed_grade ?? 0;
    const targetGrade = course?.target_grade ?? 85;

    // Calculate simulated assessed grade
    let simulatedWeightedSum = 0;
    let simulatedTotalWeight = 0;
    const affectedTasks: SimulationResult['affectedTasks'] = [];

    for (const task of tasks) {
      const simulation = context.simulationContext.grades.get(task.id);
      const effectiveGrade = simulation?.simulatedGrade ?? task.grade;

      if (effectiveGrade !== null && task.weight > 0) {
        simulatedWeightedSum += effectiveGrade * task.weight;
        simulatedTotalWeight += task.weight;
      }

      if (simulation) {
        // Calculate simulated priority using PriorityEngine if available
        let simulatedPriority = task.priority_score;

        if (context.priorityEngine && simulation.simulatedGrade !== null) {
          const calculated = context.priorityEngine.getSimulatedTaskPriority(
            task.id,
            simulation.simulatedGrade
          );
          if (calculated !== null) {
            simulatedPriority = calculated;
          }
        }

        affectedTasks.push({
          id: task.id,
          originalPriority: task.priority_score,
          simulatedPriority,
        });
      }
    }

    const simulatedAssessedGrade =
      simulatedTotalWeight > 0 ? simulatedWeightedSum / simulatedTotalWeight : 0;

    return {
      affectedTasks,
      courseImpact: {
        courseId,
        originalAssessedGrade,
        simulatedAssessedGrade,
        originalTargetDelta: Math.max(0, targetGrade - originalAssessedGrade),
        simulatedTargetDelta: Math.max(0, targetGrade - simulatedAssessedGrade),
      },
    };
  }
}
