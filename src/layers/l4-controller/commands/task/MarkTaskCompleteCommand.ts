/**
 * MarkTaskCompleteCommand - Mark a task as complete/incomplete
 *
 * Uses repositories for data access and domain services for grade calculation.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  MarkTaskCompleteParams,
} from '../../types';
import { TaskRepository, CourseRepository } from '../../../l1-persistence';
import { GradeCalculationService } from '../../../l3-intelligence/domain';

export class MarkTaskCompleteCommand implements Command<
  MarkTaskCompleteParams,
  { previousState: boolean; completedAt: Date | null }
> {
  readonly name = 'MarkTaskComplete';

  private readonly gradeService = new GradeCalculationService();

  validate(params: MarkTaskCompleteParams): { valid: boolean; error?: string } {
    if (!params.taskId || params.taskId <= 0) {
      return { valid: false, error: 'Task not found or invalid' };
    }

    if (typeof params.isComplete !== 'boolean') {
      return { valid: false, error: 'Invalid completion status' };
    }

    return { valid: true };
  }

  async execute(
    context: CommandContext,
    params: MarkTaskCompleteParams
  ): Promise<CommandResult<{ previousState: boolean; completedAt: Date | null }>> {
    const validation = this.validate(params);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const taskRepo = new TaskRepository(context.db);
      const courseRepo = new CourseRepository(context.db);

      // Get current task
      const task = taskRepo.findById(params.taskId);
      if (!task) {
        return { success: false, error: 'Task not found' };
      }

      const previousState = task.isCompleted;
      const completedAt = params.isComplete ? new Date() : null;

      // Update task completion status
      taskRepo.setCompleted(params.taskId, params.isComplete);

      // Mark the field as locally modified for sync conflict detection
      taskRepo.markFieldModified(params.taskId, 'is_completed');

      // Recalculate course assessed grade if completion changed
      if (previousState !== params.isComplete) {
        this.recalculateCourseGrade(taskRepo, courseRepo, task.courseId);
      }

      return {
        success: true,
        data: { previousState, completedAt },
      };
    } catch (error) {
      // Fix #22: Proper error coercion to avoid [object Object]
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to mark task complete: ${errorMessage}`,
      };
    }
  }

  private recalculateCourseGrade(
    taskRepo: TaskRepository,
    courseRepo: CourseRepository,
    courseId: number
  ): void {
    // Get grade data from repository
    const gradeData = taskRepo.getGradeData(courseId);

    // Use domain service for calculation
    const assessedGrade = this.gradeService.calculateAssessedGrade(gradeData);

    // Update course with new assessed grade
    courseRepo.updateAssessedGrade(courseId, assessedGrade);
  }
}
