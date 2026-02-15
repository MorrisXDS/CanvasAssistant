/**
 * GradeCalculationService - Pure business logic for grade calculations
 *
 * This service contains no database access or side effects.
 * It operates on pure data structures and returns calculated results.
 */

import type { Task } from '../../../../shared/ipc-contract';

export interface GradeData {
  weightedSum: number;
  totalWeight: number;
}

export interface GradeCalculationResult {
  assessedGrade: number | null;
  totalWeight: number;
  completedWeight: number;
  remainingWeight: number;
}

export interface WhatIfScenario {
  taskId: number;
  simulatedGrade: number;
}

export interface WhatIfResult {
  originalGrade: number | null;
  simulatedGrade: number;
  gradeChange: number;
  scenarios: WhatIfScenario[];
}

export interface GradeProjection {
  currentGrade: number | null;
  projectedGrade: number;
  neededAverage: number | null;
  isAchievable: boolean;
}

/**
 * Pure service for grade calculations with no side effects.
 */
export class GradeCalculationService {
  /**
   * Calculate assessed grade from weighted task data.
   *
   * Formula: sum(grade * weight) / sum(weight) for completed tasks with grades
   */
  calculateAssessedGrade(data: GradeData): number | null {
    if (data.totalWeight === 0) {
      return null;
    }
    return data.weightedSum / data.totalWeight;
  }

  /**
   * Calculate grade from a list of tasks.
   * Safely handles null/undefined weights by treating them as 0.
   */
  calculateFromTasks(tasks: Task[]): GradeCalculationResult {
    // Guard against empty or null/undefined input
    if (!tasks || tasks.length === 0) {
      return {
        assessedGrade: null,
        totalWeight: 0,
        completedWeight: 0,
        remainingWeight: 0,
      };
    }

    const completedWithGrades = tasks.filter((t) => t.isCompleted && t.grade !== null);

    // Guard against null/undefined weights by treating them as 0
    const totalWeight = tasks.reduce((sum, t) => sum + (t.weight ?? 0), 0);
    const completedWeight = completedWithGrades.reduce(
      (sum, t) => sum + (t.weight ?? 0),
      0
    );

    const weightedSum = completedWithGrades.reduce(
      (sum, t) => sum + (t.grade ?? 0) * (t.weight ?? 0),
      0
    );

    // Guard against division by zero
    const assessedGrade = completedWeight > 0 ? weightedSum / completedWeight : null;

    return {
      assessedGrade,
      totalWeight,
      completedWeight,
      remainingWeight: totalWeight - completedWeight,
    };
  }

  /**
   * Calculate what-if grade with simulated changes.
   *
   * @param tasks Current list of tasks
   * @param scenarios List of grade changes to simulate
   */
  calculateWhatIf(tasks: Task[], scenarios: WhatIfScenario[]): WhatIfResult {
    // Calculate original grade
    const original = this.calculateFromTasks(tasks);

    // Apply scenarios to a copy of tasks
    const simulatedTasks = tasks.map((task) => {
      const scenario = scenarios.find((s) => s.taskId === task.id);
      if (scenario) {
        return { ...task, grade: scenario.simulatedGrade, isCompleted: true };
      }
      return task;
    });

    // Calculate simulated grade
    const simulated = this.calculateFromTasks(simulatedTasks);

    return {
      originalGrade: original.assessedGrade,
      simulatedGrade: simulated.assessedGrade ?? 0,
      gradeChange: (simulated.assessedGrade ?? 0) - (original.assessedGrade ?? 0),
      scenarios,
    };
  }

  /**
   * Calculate what grade is needed on remaining work to achieve target.
   *
   * @param currentGrade Current assessed grade (0-100)
   * @param currentWeight Weight of completed work
   * @param remainingWeight Weight of remaining work
   * @param targetGrade Desired final grade (0-100)
   */
  calculateNeededGrade(
    currentGrade: number | null,
    currentWeight: number,
    remainingWeight: number,
    targetGrade: number
  ): GradeProjection {
    // If no remaining weight, projection is current grade
    if (remainingWeight === 0) {
      return {
        currentGrade,
        projectedGrade: currentGrade ?? 0,
        neededAverage: null,
        isAchievable: (currentGrade ?? 0) >= targetGrade,
      };
    }

    const totalWeight = currentWeight + remainingWeight;

    // Guard against zero or negative total weight
    if (totalWeight <= 0) {
      return {
        currentGrade,
        projectedGrade: currentGrade ?? 0,
        neededAverage: null,
        isAchievable: false,
      };
    }

    const currentContribution = (currentGrade ?? 0) * (currentWeight / totalWeight);
    const neededContribution = targetGrade - currentContribution;
    const neededAverage = neededContribution / (remainingWeight / totalWeight);

    return {
      currentGrade,
      projectedGrade: currentGrade ?? 0,
      neededAverage: Math.round(neededAverage * 100) / 100,
      isAchievable: neededAverage <= 100,
    };
  }

  /**
   * Determine grade letter from numeric grade.
   */
  getGradeLetter(grade: number): string {
    if (grade >= 90) return 'A+';
    if (grade >= 85) return 'A';
    if (grade >= 80) return 'A-';
    if (grade >= 77) return 'B+';
    if (grade >= 73) return 'B';
    if (grade >= 70) return 'B-';
    if (grade >= 67) return 'C+';
    if (grade >= 63) return 'C';
    if (grade >= 60) return 'C-';
    if (grade >= 57) return 'D+';
    if (grade >= 53) return 'D';
    if (grade >= 50) return 'D-';
    return 'F';
  }

  /**
   * Calculate GPA points from grade.
   * Uses 4.0 scale.
   */
  getGpaPoints(grade: number): number {
    if (grade >= 90) return 4.0;
    if (grade >= 85) return 4.0;
    if (grade >= 80) return 3.7;
    if (grade >= 77) return 3.3;
    if (grade >= 73) return 3.0;
    if (grade >= 70) return 2.7;
    if (grade >= 67) return 2.3;
    if (grade >= 63) return 2.0;
    if (grade >= 60) return 1.7;
    if (grade >= 57) return 1.3;
    if (grade >= 53) return 1.0;
    if (grade >= 50) return 0.7;
    return 0.0;
  }

  /**
   * Calculate weighted average across multiple courses.
   */
  calculateCumulativeGpa(courses: Array<{ grade: number; credits: number }>): number {
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    if (totalCredits === 0) return 0;

    const totalPoints = courses.reduce(
      (sum, c) => sum + this.getGpaPoints(c.grade) * c.credits,
      0
    );

    return Math.round((totalPoints / totalCredits) * 100) / 100;
  }
}
