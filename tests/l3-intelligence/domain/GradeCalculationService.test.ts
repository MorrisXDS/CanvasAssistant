/**
 * GradeCalculationService Tests
 *
 * Tests for the pure grade calculation functions.
 */

import {
  GradeCalculationService,
  GradeData,
  WhatIfScenario,
} from '../../../src/layers/l3-intelligence/domain/GradeCalculationService';
import type { Task } from '../../../src/shared/ipc-contract';

// Helper to create a test task
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    externalId: 'ext-1',
    courseId: 100,
    title: 'Test Assignment',
    description: null,
    dueAt: null,
    dueTimeKnown: true,
    pointsPossible: 100,
    weight: 10,
    grade: null,
    isCompleted: false,
    isOptional: false,
    completedAt: null,
    priorityScore: 0,
    submissionStatus: null,
    userSubmissionStatus: null,
    effectiveSubmissionStatus: null,
    taskType: 'assignment',
    taskGroupId: null,
    calendarEventId: null,
    ...overrides,
  };
}

describe('GradeCalculationService', () => {
  let service: GradeCalculationService;

  beforeEach(() => {
    service = new GradeCalculationService();
  });

  describe('calculateAssessedGrade', () => {
    it('should return null for zero total weight', () => {
      const data: GradeData = { weightedSum: 0, totalWeight: 0 };
      expect(service.calculateAssessedGrade(data)).toBeNull();
    });

    it('should calculate weighted average correctly', () => {
      // (90 * 20 + 80 * 30) / 50 = 4200 / 50 = 84
      const data: GradeData = { weightedSum: 4200, totalWeight: 50 };
      expect(service.calculateAssessedGrade(data)).toBe(84);
    });

    it('should handle single task', () => {
      const data: GradeData = { weightedSum: 850, totalWeight: 10 };
      expect(service.calculateAssessedGrade(data)).toBe(85);
    });
  });

  describe('calculateFromTasks', () => {
    it('should return null grade for no completed tasks', () => {
      const tasks = [
        createTask({ weight: 10, grade: null, isCompleted: false }),
        createTask({ id: 2, weight: 20, grade: null, isCompleted: false }),
      ];

      const result = service.calculateFromTasks(tasks);

      expect(result.assessedGrade).toBeNull();
      expect(result.totalWeight).toBe(30);
      expect(result.completedWeight).toBe(0);
      expect(result.remainingWeight).toBe(30);
    });

    it('should calculate grade from completed tasks with grades', () => {
      const tasks = [
        createTask({ id: 1, weight: 10, grade: 90, isCompleted: true }),
        createTask({ id: 2, weight: 20, grade: 80, isCompleted: true }),
        createTask({ id: 3, weight: 30, grade: null, isCompleted: false }),
      ];

      const result = service.calculateFromTasks(tasks);

      // (90*10 + 80*20) / 30 = 2500 / 30 = 83.33...
      expect(result.assessedGrade).toBeCloseTo(83.33, 1);
      expect(result.totalWeight).toBe(60);
      expect(result.completedWeight).toBe(30);
      expect(result.remainingWeight).toBe(30);
    });

    it('should ignore completed tasks without grades', () => {
      const tasks = [
        createTask({ id: 1, weight: 10, grade: 90, isCompleted: true }),
        createTask({ id: 2, weight: 20, grade: null, isCompleted: true }), // No grade
      ];

      const result = service.calculateFromTasks(tasks);

      expect(result.assessedGrade).toBe(90);
      expect(result.completedWeight).toBe(10); // Only task with grade
    });

    it('should handle all tasks completed', () => {
      const tasks = [
        createTask({ id: 1, weight: 25, grade: 95, isCompleted: true }),
        createTask({ id: 2, weight: 25, grade: 85, isCompleted: true }),
        createTask({ id: 3, weight: 25, grade: 75, isCompleted: true }),
        createTask({ id: 4, weight: 25, grade: 65, isCompleted: true }),
      ];

      const result = service.calculateFromTasks(tasks);

      expect(result.assessedGrade).toBe(80);
      expect(result.remainingWeight).toBe(0);
    });
  });

  describe('calculateWhatIf', () => {
    it('should simulate grade changes correctly', () => {
      const tasks = [
        createTask({ id: 1, weight: 20, grade: 80, isCompleted: true }),
        createTask({ id: 2, weight: 30, grade: null, isCompleted: false }),
      ];

      const scenarios: WhatIfScenario[] = [
        { taskId: 2, simulatedGrade: 100 },
      ];

      const result = service.calculateWhatIf(tasks, scenarios);

      expect(result.originalGrade).toBe(80);
      // (80*20 + 100*30) / 50 = 4600 / 50 = 92
      expect(result.simulatedGrade).toBe(92);
      expect(result.gradeChange).toBe(12);
    });

    it('should handle multiple scenarios', () => {
      const tasks = [
        createTask({ id: 1, weight: 20, grade: 80, isCompleted: true }),
        createTask({ id: 2, weight: 20, grade: null, isCompleted: false }),
        createTask({ id: 3, weight: 20, grade: null, isCompleted: false }),
      ];

      const scenarios: WhatIfScenario[] = [
        { taskId: 2, simulatedGrade: 90 },
        { taskId: 3, simulatedGrade: 100 },
      ];

      const result = service.calculateWhatIf(tasks, scenarios);

      // (80*20 + 90*20 + 100*20) / 60 = 5400 / 60 = 90
      expect(result.simulatedGrade).toBe(90);
    });

    it('should handle no original grades', () => {
      const tasks = [
        createTask({ id: 1, weight: 20, grade: null, isCompleted: false }),
      ];

      const scenarios: WhatIfScenario[] = [
        { taskId: 1, simulatedGrade: 85 },
      ];

      const result = service.calculateWhatIf(tasks, scenarios);

      expect(result.originalGrade).toBeNull();
      expect(result.simulatedGrade).toBe(85);
    });

    it('should return scenarios in result', () => {
      const tasks = [createTask({ id: 1, weight: 10 })];
      const scenarios: WhatIfScenario[] = [{ taskId: 1, simulatedGrade: 95 }];

      const result = service.calculateWhatIf(tasks, scenarios);

      expect(result.scenarios).toEqual(scenarios);
    });
  });

  describe('calculateNeededGrade', () => {
    it('should return null needed average when no remaining weight', () => {
      const result = service.calculateNeededGrade(85, 100, 0, 90);

      expect(result.currentGrade).toBe(85);
      expect(result.neededAverage).toBeNull();
      expect(result.isAchievable).toBe(false);
    });

    it('should calculate needed grade for target', () => {
      // Current: 80% on 50% weight, want 85% final
      // Need: (85 - 80*0.5) / 0.5 = 45 / 0.5 = 90
      const result = service.calculateNeededGrade(80, 50, 50, 85);

      expect(result.neededAverage).toBe(90);
      expect(result.isAchievable).toBe(true);
    });

    it('should detect unachievable targets', () => {
      // Current: 60% on 50% weight, want 90% final
      // Need: (90 - 60*0.5) / 0.5 = 60 / 0.5 = 120 (impossible)
      const result = service.calculateNeededGrade(60, 50, 50, 90);

      expect(result.neededAverage).toBe(120);
      expect(result.isAchievable).toBe(false);
    });

    it('should handle null current grade', () => {
      const result = service.calculateNeededGrade(null, 0, 100, 85);

      expect(result.currentGrade).toBeNull();
      expect(result.neededAverage).toBe(85);
      expect(result.isAchievable).toBe(true);
    });

    it('should handle target already achieved', () => {
      const result = service.calculateNeededGrade(95, 100, 0, 90);

      expect(result.isAchievable).toBe(true);
    });
  });

  describe('getGradeLetter', () => {
    it('should return A+ for 90+', () => {
      expect(service.getGradeLetter(95)).toBe('A+');
      expect(service.getGradeLetter(90)).toBe('A+');
    });

    it('should return A for 85-89', () => {
      expect(service.getGradeLetter(89)).toBe('A');
      expect(service.getGradeLetter(85)).toBe('A');
    });

    it('should return A- for 80-84', () => {
      expect(service.getGradeLetter(84)).toBe('A-');
      expect(service.getGradeLetter(80)).toBe('A-');
    });

    it('should return B grades for 70-79', () => {
      expect(service.getGradeLetter(79)).toBe('B+');
      expect(service.getGradeLetter(75)).toBe('B');
      expect(service.getGradeLetter(70)).toBe('B-');
    });

    it('should return C grades for 60-69', () => {
      expect(service.getGradeLetter(69)).toBe('C+');
      expect(service.getGradeLetter(65)).toBe('C');
      expect(service.getGradeLetter(60)).toBe('C-');
    });

    it('should return D grades for 50-59', () => {
      expect(service.getGradeLetter(59)).toBe('D+');
      expect(service.getGradeLetter(55)).toBe('D');
      expect(service.getGradeLetter(50)).toBe('D-');
    });

    it('should return F for below 50', () => {
      expect(service.getGradeLetter(49)).toBe('F');
      expect(service.getGradeLetter(0)).toBe('F');
    });
  });

  describe('getGpaPoints', () => {
    it('should return 4.0 for A range', () => {
      expect(service.getGpaPoints(95)).toBe(4.0);
      expect(service.getGpaPoints(90)).toBe(4.0);
      expect(service.getGpaPoints(85)).toBe(4.0);
    });

    it('should return 3.7 for A-', () => {
      expect(service.getGpaPoints(82)).toBe(3.7);
    });

    it('should return correct B range points', () => {
      expect(service.getGpaPoints(78)).toBe(3.3); // B+
      expect(service.getGpaPoints(74)).toBe(3.0); // B
      expect(service.getGpaPoints(71)).toBe(2.7); // B-
    });

    it('should return correct C range points', () => {
      expect(service.getGpaPoints(68)).toBe(2.3); // C+
      expect(service.getGpaPoints(64)).toBe(2.0); // C
      expect(service.getGpaPoints(61)).toBe(1.7); // C-
    });

    it('should return correct D range points', () => {
      expect(service.getGpaPoints(58)).toBe(1.3); // D+
      expect(service.getGpaPoints(54)).toBe(1.0); // D
      expect(service.getGpaPoints(51)).toBe(0.7); // D-
    });

    it('should return 0.0 for F', () => {
      expect(service.getGpaPoints(40)).toBe(0.0);
    });
  });

  describe('calculateCumulativeGpa', () => {
    it('should return 0 for no courses', () => {
      expect(service.calculateCumulativeGpa([])).toBe(0);
    });

    it('should calculate weighted GPA correctly', () => {
      const courses = [
        { grade: 95, credits: 3 }, // 4.0 * 3 = 12
        { grade: 85, credits: 3 }, // 4.0 * 3 = 12
        { grade: 75, credits: 3 }, // 3.0 * 3 = 9
      ];
      // Total: (12 + 12 + 9) / 9 = 33 / 9 = 3.67 (rounded)
      expect(service.calculateCumulativeGpa(courses)).toBeCloseTo(3.67, 2);
    });

    it('should weight by credits', () => {
      const courses = [
        { grade: 90, credits: 1 }, // 4.0 * 1 = 4
        { grade: 60, credits: 4 }, // 1.7 * 4 = 6.8
      ];
      // Total: (4 + 6.8) / 5 = 10.8 / 5 = 2.16
      expect(service.calculateCumulativeGpa(courses)).toBeCloseTo(2.16, 2);
    });

    it('should handle single course', () => {
      const courses = [{ grade: 88, credits: 3 }];
      expect(service.calculateCumulativeGpa(courses)).toBe(4.0);
    });
  });
});
