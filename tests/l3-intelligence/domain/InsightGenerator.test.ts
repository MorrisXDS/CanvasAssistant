/**
 * InsightGenerator Domain Service Tests
 */

import {
  generateDeadlinePatternInsight,
  generateCourseStruggleInsight,
  generateProductivityWindowInsight,
  generateWorkloadWarningInsight,
  generateStreakInsight,
  generateImprovementInsight,
  generateAllInsights,
  isInsightValid,
  getActiveInsights,
  getInsightIcon,
  getSeverityColor,
} from '../../../src/layers/l3-intelligence/domain/InsightGenerator';
import {
  TaskCompletionEvent,
  CoursePerformance,
  WeeklyRhythm,
  WorkloadDistribution,
  TaskForPriority,
  Insight,
} from '../../../src/layers/l3-intelligence/types';

describe('InsightGenerator', () => {
  const createEvent = (
    overrides: Partial<TaskCompletionEvent> = {}
  ): TaskCompletionEvent => ({
    taskId: 1,
    courseId: 1,
    taskType: 'assignment',
    startedAt: null,
    completedAt: new Date(),
    dueAt: new Date(),
    timeToCompleteMinutes: 60,
    dayOfWeek: 1,
    hourOfDay: 10,
    daysBeforeDue: 1,
    wasLate: false,
    scoreAchieved: 85,
    pointsPossible: 100,
    ...overrides,
  });

  const createTask = (overrides: Partial<TaskForPriority> = {}): TaskForPriority => ({
    id: 1,
    courseId: 1,
    title: 'Test Task',
    dueAt: new Date(),
    unlockAt: null,
    lockAt: null,
    pointsPossible: 100,
    weight: 10,
    isCompleted: false,
    isPinned: false,
    grade: null,
    submittedAt: null,
    taskType: 'assignment',
    taskGroupId: null,
    submissionStatus: null,
    ...overrides,
  });

  describe('generateDeadlinePatternInsight', () => {
    it('should return null for insufficient data', () => {
      const events = Array(5).fill(null).map(() => createEvent());
      const result = generateDeadlinePatternInsight(events, new Date());
      expect(result).toBeNull();
    });

    it('should identify problematic days', () => {
      // Create events with Friday having high late rate
      const events: TaskCompletionEvent[] = [];

      // Find a Friday - getDay() returns 0-6 where 5 is Friday
      const friday = new Date();
      const currentDay = friday.getDay();
      const daysUntilFriday = (5 - currentDay + 7) % 7;
      friday.setDate(friday.getDate() + daysUntilFriday);

      // Friday (day 5) - mostly late
      for (let i = 0; i < 5; i++) {
        const dueDate = new Date(friday);
        dueDate.setDate(dueDate.getDate() - i * 7); // Different Fridays (going back in time)
        events.push(createEvent({
          taskId: i + 1,
          dueAt: dueDate,
          wasLate: true,
          dayOfWeek: 5, // Friday
        }));
      }

      // Find a Monday for other days
      const monday = new Date();
      const daysUntilMonday = (1 - monday.getDay() + 7) % 7;
      monday.setDate(monday.getDate() + daysUntilMonday);

      // Other days - on time (on Mondays)
      for (let i = 0; i < 10; i++) {
        const dueDate = new Date(monday);
        dueDate.setDate(dueDate.getDate() - i * 7); // Different Mondays
        events.push(createEvent({
          taskId: 100 + i,
          dueAt: dueDate,
          wasLate: false,
          dayOfWeek: 1, // Monday
        }));
      }

      const result = generateDeadlinePatternInsight(events, new Date());

      expect(result).not.toBeNull();
      expect(result!.type).toBe('deadline_pattern');
      expect(result!.title).toContain('Friday');
    });

    it('should not generate insight if no day has >30% late rate', () => {
      const events: TaskCompletionEvent[] = [];

      // Find the closest Sunday to start from
      const baseDate = new Date();
      const daysFromSunday = baseDate.getDay();
      baseDate.setDate(baseDate.getDate() - daysFromSunday); // Go to Sunday

      // All on time across different days
      for (let day = 0; day < 7; day++) {
        for (let i = 0; i < 3; i++) {
          const dueDate = new Date(baseDate);
          dueDate.setDate(dueDate.getDate() + day - i * 7); // day offset + weeks back
          events.push(createEvent({
            taskId: day * 10 + i,
            dueAt: dueDate,
            wasLate: false,
            dayOfWeek: day,
          }));
        }
      }

      const result = generateDeadlinePatternInsight(events, new Date());
      expect(result).toBeNull();
    });
  });

  describe('generateCourseStruggleInsight', () => {
    it('should return null for no struggling courses', () => {
      const performance: CoursePerformance[] = [
        {
          courseId: 1,
          courseCode: 'CS101',
          courseName: 'Intro to CS',
          avgScore: 90,
          onTimeRate: 0.95,
          lateRate: 0.05,
          missedRate: 0,
          totalTasks: 10,
          struggleScore: 20,
        },
      ];

      const result = generateCourseStruggleInsight(performance, new Date());
      expect(result).toBeNull();
    });

    it('should identify course with high struggle score', () => {
      const performance: CoursePerformance[] = [
        {
          courseId: 1,
          courseCode: 'MATH201',
          courseName: 'Calculus II',
          avgScore: 55,
          onTimeRate: 0.4,
          lateRate: 0.6,
          missedRate: 0,
          totalTasks: 10,
          struggleScore: 75,
        },
      ];

      const result = generateCourseStruggleInsight(performance, new Date());

      expect(result).not.toBeNull();
      expect(result!.type).toBe('course_struggle');
      expect(result!.title).toContain('MATH201');
      expect(result!.severity).toBe('critical'); // 75 >= 70
    });

    it('should set severity based on struggle score', () => {
      const mediumStruggle: CoursePerformance[] = [
        {
          courseId: 1,
          courseCode: 'CS101',
          courseName: 'Test',
          avgScore: 65,
          onTimeRate: 0.6,
          lateRate: 0.4,
          missedRate: 0,
          totalTasks: 10,
          struggleScore: 55,
        },
      ];

      const result = generateCourseStruggleInsight(mediumStruggle, new Date());

      expect(result!.severity).toBe('info'); // 55 < 60
    });
  });

  describe('generateProductivityWindowInsight', () => {
    it('should return null for insufficient data', () => {
      const rhythm: WeeklyRhythm = {
        productiveDays: [],
        productiveHours: [],
        peakDay: 0,
        peakHour: 0,
        sampleSize: 10, // < 15
        confidence: 0.2,
      };

      const result = generateProductivityWindowInsight(rhythm, new Date());
      expect(result).toBeNull();
    });

    it('should identify peak productivity time', () => {
      const rhythm: WeeklyRhythm = {
        productiveDays: Array(7).fill(null).map((_, i) => ({
          dayOfWeek: i,
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
          completionCount: i === 2 ? 20 : 5,
          avgScore: 85,
        })),
        productiveHours: Array(24).fill(null).map((_, i) => ({
          hour: i,
          completionCount: i === 14 ? 15 : 2,
          avgScore: 85,
        })),
        peakDay: 2, // Tuesday
        peakHour: 14, // 2pm
        sampleSize: 50,
        confidence: 0.9,
      };

      const result = generateProductivityWindowInsight(rhythm, new Date());

      expect(result).not.toBeNull();
      expect(result!.type).toBe('productivity_window');
      expect(result!.title).toContain('Peak Productivity');
      expect(result!.description).toContain('Tuesday');
      expect(result!.description).toContain('2pm');
    });
  });

  describe('generateWorkloadWarningInsight', () => {
    it('should return null for low clustering', () => {
      const workload: WorkloadDistribution = {
        startDate: new Date(),
        endDate: new Date(),
        dailySnapshots: [],
        peakDay: null,
        peakMinutes: 60,
        avgDailyMinutes: 60,
        clusteringScore: 0.3, // Low
        balanceScore: 70,
      };

      const result = generateWorkloadWarningInsight(workload, [], new Date());
      expect(result).toBeNull();
    });

    it('should warn about clustered deadlines', () => {
      const peakDay = new Date();
      peakDay.setDate(peakDay.getDate() + 2);

      // Use 3 tasks to get 'warning' severity (4+ triggers 'critical')
      const tasks: TaskForPriority[] = Array(3)
        .fill(null)
        .map((_, i) => createTask({ id: i + 1, dueAt: peakDay }));

      const workload: WorkloadDistribution = {
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        dailySnapshots: [],
        peakDay,
        peakMinutes: 180, // Under 360 threshold
        avgDailyMinutes: 60,
        clusteringScore: 0.7, // High
        balanceScore: 30,
      };

      const result = generateWorkloadWarningInsight(workload, tasks, new Date());

      expect(result).not.toBeNull();
      expect(result!.type).toBe('workload_warning');
      expect(result!.severity).toBe('warning');
    });

    it('should set critical severity for many tasks', () => {
      const peakDay = new Date();
      peakDay.setDate(peakDay.getDate() + 1);

      const tasks: TaskForPriority[] = Array(5)
        .fill(null)
        .map((_, i) => createTask({ id: i + 1, dueAt: peakDay }));

      const workload: WorkloadDistribution = {
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        dailySnapshots: [],
        peakDay,
        peakMinutes: 300,
        avgDailyMinutes: 60,
        clusteringScore: 0.8,
        balanceScore: 20,
      };

      const result = generateWorkloadWarningInsight(workload, tasks, new Date());

      expect(result!.severity).toBe('critical');
    });
  });

  describe('generateStreakInsight', () => {
    it('should return null for short streaks', () => {
      const events = [
        createEvent({ wasLate: false }),
        createEvent({ wasLate: false }),
        createEvent({ wasLate: false }),
      ];

      const result = generateStreakInsight(events, new Date());
      expect(result).toBeNull();
    });

    it('should celebrate 5+ task streaks', () => {
      const events = Array(7)
        .fill(null)
        .map((_, i) =>
          createEvent({
            taskId: i + 1,
            wasLate: false,
            completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
          })
        );

      const result = generateStreakInsight(events, new Date());

      expect(result).not.toBeNull();
      expect(result!.type).toBe('streak');
      expect(result!.title).toContain('7');
    });

    it('should break streak on late submission', () => {
      const events = [
        createEvent({ taskId: 1, wasLate: false, completedAt: new Date() }),
        createEvent({ taskId: 2, wasLate: false, completedAt: new Date(Date.now() - 1000) }),
        createEvent({ taskId: 3, wasLate: true, completedAt: new Date(Date.now() - 2000) }), // Breaks streak
        createEvent({ taskId: 4, wasLate: false, completedAt: new Date(Date.now() - 3000) }),
        createEvent({ taskId: 5, wasLate: false, completedAt: new Date(Date.now() - 4000) }),
      ];

      const result = generateStreakInsight(events, new Date());

      // Streak is only 2 (before late), so no insight
      expect(result).toBeNull();
    });
  });

  describe('generateImprovementInsight', () => {
    it('should return null for insufficient data', () => {
      const events = Array(4).fill(null).map(() => createEvent());
      const result = generateImprovementInsight(events, new Date());
      expect(result).toBeNull();
    });

    it('should detect grade improvement', () => {
      const events: TaskCompletionEvent[] = [];

      // Earlier events (lower scores)
      for (let i = 0; i < 5; i++) {
        events.push(createEvent({
          taskId: i + 1,
          scoreAchieved: 70,
          pointsPossible: 100,
          completedAt: new Date(Date.now() - (10 - i) * 24 * 60 * 60 * 1000),
        }));
      }

      // Recent events (higher scores)
      for (let i = 0; i < 5; i++) {
        events.push(createEvent({
          taskId: 10 + i,
          scoreAchieved: 90,
          pointsPossible: 100,
          completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        }));
      }

      const result = generateImprovementInsight(events, new Date());

      expect(result).not.toBeNull();
      expect(result!.type).toBe('improvement');
      expect(result!.title).toContain('20%');
    });

    it('should not report small improvements', () => {
      const events: TaskCompletionEvent[] = [];

      // Earlier events
      for (let i = 0; i < 5; i++) {
        events.push(createEvent({
          taskId: i + 1,
          scoreAchieved: 80,
          pointsPossible: 100,
          completedAt: new Date(Date.now() - (10 - i) * 24 * 60 * 60 * 1000),
        }));
      }

      // Recent events (only 3% improvement)
      for (let i = 0; i < 5; i++) {
        events.push(createEvent({
          taskId: 10 + i,
          scoreAchieved: 83,
          pointsPossible: 100,
          completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        }));
      }

      const result = generateImprovementInsight(events, new Date());
      expect(result).toBeNull();
    });
  });

  describe('generateAllInsights', () => {
    it('should generate multiple insight types', () => {
      const events: TaskCompletionEvent[] = [];

      // Create enough events for streaks
      for (let i = 0; i < 10; i++) {
        events.push(createEvent({
          taskId: i + 1,
          wasLate: false,
          completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        }));
      }

      const rhythm: WeeklyRhythm = {
        productiveDays: Array(7).fill(null).map((_, i) => ({
          dayOfWeek: i,
          dayName: 'Day',
          completionCount: 10,
          avgScore: 85,
        })),
        productiveHours: Array(24).fill(null).map((_, i) => ({
          hour: i,
          completionCount: 5,
          avgScore: 85,
        })),
        peakDay: 1,
        peakHour: 10,
        sampleSize: 50,
        confidence: 0.9,
      };

      const results = generateAllInsights(
        events,
        [],
        rhythm,
        null,
        [],
        new Date()
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should sort by severity', () => {
      const events: TaskCompletionEvent[] = [];

      // Create events that will generate multiple insights
      for (let i = 0; i < 20; i++) {
        events.push(createEvent({
          taskId: i + 1,
          wasLate: false,
          scoreAchieved: i < 10 ? 60 : 90, // Improvement pattern
          completedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        }));
      }

      const coursePerformance: CoursePerformance[] = [
        {
          courseId: 1,
          courseCode: 'CS101',
          courseName: 'Test',
          avgScore: 50,
          onTimeRate: 0.3,
          lateRate: 0.7,
          missedRate: 0,
          totalTasks: 10,
          struggleScore: 80, // Critical
        },
      ];

      const rhythm: WeeklyRhythm = {
        productiveDays: [],
        productiveHours: [],
        peakDay: 1,
        peakHour: 10,
        sampleSize: 5, // Not enough for productivity insight
        confidence: 0.1,
      };

      const results = generateAllInsights(
        events,
        coursePerformance,
        rhythm,
        null,
        [],
        new Date()
      );

      // Critical should come first
      if (results.length >= 2) {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        for (let i = 1; i < results.length; i++) {
          expect(severityOrder[results[i - 1].severity]).toBeLessThanOrEqual(
            severityOrder[results[i].severity]
          );
        }
      }
    });
  });

  describe('isInsightValid', () => {
    it('should return false for acknowledged insights', () => {
      const insight: Insight = {
        type: 'streak',
        title: 'Test',
        description: 'Test',
        severity: 'info',
        data: {},
        acknowledgedAt: new Date(),
        expiresAt: null,
      };

      expect(isInsightValid(insight, new Date())).toBe(false);
    });

    it('should return false for expired insights', () => {
      const insight: Insight = {
        type: 'streak',
        title: 'Test',
        description: 'Test',
        severity: 'info',
        data: {},
        acknowledgedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      };

      expect(isInsightValid(insight, new Date())).toBe(false);
    });

    it('should return true for valid insights', () => {
      const insight: Insight = {
        type: 'streak',
        title: 'Test',
        description: 'Test',
        severity: 'info',
        data: {},
        acknowledgedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      };

      expect(isInsightValid(insight, new Date())).toBe(true);
    });
  });

  describe('getActiveInsights', () => {
    it('should filter to valid insights only', () => {
      const now = new Date();
      const insights: Insight[] = [
        {
          type: 'streak',
          title: 'Valid',
          description: 'Test',
          severity: 'info',
          data: {},
          acknowledgedAt: null,
          expiresAt: new Date(now.getTime() + 60000),
        },
        {
          type: 'streak',
          title: 'Acknowledged',
          description: 'Test',
          severity: 'info',
          data: {},
          acknowledgedAt: new Date(),
          expiresAt: new Date(now.getTime() + 60000),
        },
        {
          type: 'streak',
          title: 'Expired',
          description: 'Test',
          severity: 'info',
          data: {},
          acknowledgedAt: null,
          expiresAt: new Date(now.getTime() - 1000),
        },
      ];

      const active = getActiveInsights(insights, now);

      expect(active).toHaveLength(1);
      expect(active[0].title).toBe('Valid');
    });
  });

  describe('getInsightIcon', () => {
    it('should return appropriate icons', () => {
      expect(getInsightIcon('deadline_pattern')).toBe('calendar-warning');
      expect(getInsightIcon('course_struggle')).toBe('alert-triangle');
      expect(getInsightIcon('productivity_window')).toBe('clock-check');
      expect(getInsightIcon('workload_warning')).toBe('layers');
      expect(getInsightIcon('streak')).toBe('flame');
      expect(getInsightIcon('improvement')).toBe('trending-up');
    });
  });

  describe('getSeverityColor', () => {
    it('should return appropriate colors', () => {
      expect(getSeverityColor('critical')).toBe('#ef4444');
      expect(getSeverityColor('warning')).toBe('#f59e0b');
      expect(getSeverityColor('info')).toBe('#3b82f6');
    });
  });
});
