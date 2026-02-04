/**
 * SimulationManager - Manages what-if grade simulations
 *
 * Holds temporary simulation state that:
 * - Persists for the session (until app close)
 * - Creates a notification reminding user to resolve
 * - Allows stacking multiple grade simulations
 * - Can be cleared by user action
 */

import { EventEmitter } from 'events';
import {
  SimulationContext,
  SimulatedGrade,
  SimulationResult,
  createSimulationContext,
} from './types';
import { Database } from '../l1-persistence/Database';

export interface SimulationManagerOptions {
  db: Database;
}

/**
 * SimulationManager handles what-if grade scenarios
 *
 * Events:
 * - 'simulation-started': First simulation added
 * - 'simulation-updated': Simulation changed (grade added/modified)
 * - 'simulation-cleared': All simulations cleared
 * - 'simulation-grade-added': Individual grade simulation added
 * - 'simulation-grade-removed': Individual grade simulation removed
 */
export class SimulationManager extends EventEmitter {
  private context: SimulationContext;
  private db: Database;

  constructor(options: SimulationManagerOptions) {
    super();
    this.context = createSimulationContext();
    this.db = options.db;
  }

  /**
   * Add or update a simulated grade for a task
   */
  simulateGrade(taskId: number, grade: number): SimulationResult | null {
    // Fetch task data to get courseId and original grade
    const task = this.db.executeReadOne<{
      id: number;
      course_id: number;
      grade: number | null;
      priority_score: number;
    }>('SELECT id, course_id, grade, priority_score FROM tasks WHERE id = ?', [taskId]);

    if (!task) {
      return null;
    }

    const _wasActive = this.context.isActive;

    // Create simulation entry
    const simulation: SimulatedGrade = {
      taskId,
      courseId: task.course_id,
      originalGrade: task.grade,
      simulatedGrade: grade,
      timestamp: new Date(),
    };

    this.context.grades.set(taskId, simulation);

    // Activate simulation if not already
    if (!this.context.isActive) {
      this.context.isActive = true;
      this.context.startedAt = new Date();
      this.emit('simulation-started', { context: this.getContext() });
    }

    this.emit('simulation-grade-added', { simulation });
    this.emit('simulation-updated', { context: this.getContext() });

    // Calculate impact
    return this.calculateSimulationResult(task.course_id);
  }

  /**
   * Remove a specific grade simulation
   */
  removeSimulatedGrade(taskId: number): boolean {
    if (!this.context.grades.has(taskId)) {
      return false;
    }

    this.context.grades.delete(taskId);
    this.emit('simulation-grade-removed', { taskId });

    // If no more simulations, deactivate
    if (this.context.grades.size === 0) {
      this.clearAll();
    } else {
      this.emit('simulation-updated', { context: this.getContext() });
    }

    return true;
  }

  /**
   * Clear all simulations
   */
  clearAll(): void {
    this.context = createSimulationContext();
    this.emit('simulation-cleared', {});
  }

  /**
   * Get current simulation context (read-only view)
   */
  getContext(): Readonly<SimulationContext> {
    return {
      grades: new Map(this.context.grades),
      isActive: this.context.isActive,
      startedAt: this.context.startedAt,
    };
  }

  /**
   * Check if simulation is active
   */
  isActive(): boolean {
    return this.context.isActive;
  }

  /**
   * Get count of active simulations
   */
  getSimulationCount(): number {
    return this.context.grades.size;
  }

  /**
   * Get simulated grade for a task (if any)
   */
  getSimulatedGrade(taskId: number): number | null {
    const simulation = this.context.grades.get(taskId);
    return simulation?.simulatedGrade ?? null;
  }

  /**
   * Get effective grade for a task (simulated if exists, else actual)
   */
  getEffectiveGrade(taskId: number, actualGrade: number | null): number | null {
    const simulated = this.getSimulatedGrade(taskId);
    return simulated !== null ? simulated : actualGrade;
  }

  /**
   * Get all simulated grades for a course
   */
  getSimulatedGradesForCourse(courseId: number): SimulatedGrade[] {
    const result: SimulatedGrade[] = [];
    for (const simulation of this.context.grades.values()) {
      if (simulation.courseId === courseId) {
        result.push(simulation);
      }
    }
    return result;
  }

  /**
   * Get all active simulations
   */
  getAllSimulations(): SimulatedGrade[] {
    return Array.from(this.context.grades.values());
  }

  /**
   * Calculate the impact of current simulations on a course
   */
  calculateSimulationResult(courseId: number): SimulationResult {
    // Fetch course data
    const course = this.db.executeReadOne<{
      id: number;
      assessed_grade: number | null;
      target_grade: number;
    }>('SELECT id, assessed_grade, target_grade FROM courses WHERE id = ?', [courseId]);

    // Fetch all tasks for the course
    const tasks = this.db.executeRead<{
      id: number;
      grade: number | null;
      weight: number;
      priority_score: number;
      is_completed: boolean;
    }>(
      'SELECT id, grade, weight, priority_score, is_completed FROM tasks WHERE course_id = ?',
      [courseId]
    );

    const originalAssessedGrade = course?.assessed_grade ?? 0;
    const targetGrade = course?.target_grade ?? 85;

    // Calculate simulated assessed grade
    let simulatedWeightedSum = 0;
    let simulatedTotalWeight = 0;

    const affectedTasks: SimulationResult['affectedTasks'] = [];

    for (const task of tasks) {
      const effectiveGrade = this.getEffectiveGrade(task.id, task.grade);

      if (effectiveGrade !== null && task.weight > 0) {
        simulatedWeightedSum += effectiveGrade * task.weight;
        simulatedTotalWeight += task.weight;
      }

      // Track affected tasks (those with simulations)
      const simulation = this.context.grades.get(task.id);
      if (simulation) {
        affectedTasks.push({
          id: task.id,
          originalPriority: task.priority_score,
          simulatedPriority: task.priority_score, // Priority system removed
        });
      }
    }

    const simulatedAssessedGrade =
      simulatedTotalWeight > 0 ? simulatedWeightedSum / simulatedTotalWeight : 0;

    const originalTargetDelta = Math.max(0, targetGrade - originalAssessedGrade);
    const simulatedTargetDelta = Math.max(0, targetGrade - simulatedAssessedGrade);

    return {
      affectedTasks,
      courseImpact: {
        courseId,
        originalAssessedGrade,
        simulatedAssessedGrade,
        originalTargetDelta,
        simulatedTargetDelta,
      },
    };
  }
}
