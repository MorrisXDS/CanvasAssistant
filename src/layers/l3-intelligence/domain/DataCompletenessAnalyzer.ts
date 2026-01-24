/**
 * DataCompletenessAnalyzer - Analyzes data completeness for intelligence features
 *
 * Pure domain functions that check for missing data fields that affect
 * priority calculation quality and generate actionable notifications.
 */

import { CourseForPriority, TaskForPriority, Insight, InsightSeverity } from '../types';

/**
 * Severity levels for missing fields
 */
type FieldImportance = 'critical' | 'recommended' | 'optional';

/**
 * A missing field notification
 */
export interface MissingFieldNotification {
  /** Unique key for this field (e.g., 'course:123:targetGrade') */
  fieldKey: string;
  /** Entity type */
  entityType: 'course' | 'task';
  /** Entity ID */
  entityId: number;
  /** Entity name for display */
  entityName: string;
  /** Field name */
  fieldName: string;
  /** How important this field is */
  importance: FieldImportance;
  /** User-friendly title */
  title: string;
  /** Description of why this field matters */
  description: string;
  /** Action to take */
  action: {
    label: string;
    type: 'navigate' | 'modal';
    target: string; // route or modal ID
  };
}

/**
 * Analyze courses for missing critical fields
 */
export function analyzeCourseCompleteness(
  courses: CourseForPriority[]
): MissingFieldNotification[] {
  const notifications: MissingFieldNotification[] = [];

  for (const course of courses) {
    // Target grade is critical for priority scoring
    // Check if it's the default value (80) which likely means not explicitly set
    // We consider it "unset" if it equals the default and no current grade exists
    if (course.targetGrade === 80 && course.currentGrade === null) {
      notifications.push({
        fieldKey: `course:${course.id}:targetGrade`,
        entityType: 'course',
        entityId: course.id,
        entityName: course.code,
        fieldName: 'targetGrade',
        importance: 'critical',
        title: `Set Target Grade for ${course.code}`,
        description:
          'Setting a target grade enables priority scoring and grade predictions. Tasks will be prioritized based on how they help you reach your goal.',
        action: {
          label: 'Set Target',
          type: 'navigate',
          target: `/course/${course.id}`,
        },
      });
    }

    // Current grade is recommended
    if (course.currentGrade === null) {
      notifications.push({
        fieldKey: `course:${course.id}:currentGrade`,
        entityType: 'course',
        entityId: course.id,
        entityName: course.code,
        fieldName: 'currentGrade',
        importance: 'recommended',
        title: `Missing Current Grade for ${course.code}`,
        description:
          'Current grade helps calculate how much each task impacts your final grade. Sync your grades or enter manually.',
        action: {
          label: 'Sync Grades',
          type: 'navigate',
          target: `/course/${course.id}`,
        },
      });
    }
  }

  return notifications;
}

/**
 * Analyze tasks for missing fields that affect priority
 */
export function analyzeTaskCompleteness(
  tasks: TaskForPriority[],
  courses: Map<number, CourseForPriority>
): MissingFieldNotification[] {
  const notifications: MissingFieldNotification[] = [];
  const tasksWithMissingWeight: TaskForPriority[] = [];
  const tasksWithMissingDue: TaskForPriority[] = [];

  for (const task of tasks) {
    // Only check incomplete tasks
    if (task.isCompleted) continue;

    // Weight is important for grade impact calculations
    if (task.weight === null || task.weight === 0) {
      tasksWithMissingWeight.push(task);
    }

    // Due date is critical for urgency
    if (task.dueAt === null) {
      tasksWithMissingDue.push(task);
    }
  }

  // Group notifications by course for tasks without weight
  // Only notify if significant number are missing
  if (tasksWithMissingWeight.length >= 3) {
    // Group by course
    const byCourse = new Map<number, TaskForPriority[]>();
    for (const task of tasksWithMissingWeight) {
      const existing = byCourse.get(task.courseId) || [];
      existing.push(task);
      byCourse.set(task.courseId, existing);
    }

    for (const [courseId, courseTasks] of byCourse) {
      const course = courses.get(courseId);
      if (!course || courseTasks.length < 2) continue;

      notifications.push({
        fieldKey: `course:${courseId}:tasksWeight`,
        entityType: 'course',
        entityId: courseId,
        entityName: course.code,
        fieldName: 'weight',
        importance: 'recommended',
        title: `${courseTasks.length} Tasks Missing Weight in ${course.code}`,
        description:
          'Assignment weights help prioritize based on grade impact. Check your syllabus to set weights.',
        action: {
          label: 'View Course',
          type: 'navigate',
          target: `/course/${courseId}`,
        },
      });
    }
  }

  // Tasks without due dates (aggregate if many)
  if (tasksWithMissingDue.length >= 5) {
    notifications.push({
      fieldKey: `global:tasksDueDate`,
      entityType: 'task',
      entityId: 0,
      entityName: 'Multiple Tasks',
      fieldName: 'dueAt',
      importance: 'critical',
      title: `${tasksWithMissingDue.length} Tasks Have No Due Date`,
      description:
        'Tasks without due dates cannot be prioritized by urgency. These may be assignments with flexible deadlines.',
      action: {
        label: 'View Tasks',
        type: 'navigate',
        target: '/tasks',
      },
    });
  }

  return notifications;
}

/**
 * Convert missing field notifications to insights
 */
export function generateDataCompletenessInsights(
  courseNotifications: MissingFieldNotification[],
  taskNotifications: MissingFieldNotification[],
  suppressedKeys: Set<string>,
  currentTime: Date
): Insight[] {
  const insights: Insight[] = [];
  const allNotifications = [...courseNotifications, ...taskNotifications];

  // Filter out suppressed notifications
  const activeNotifications = allNotifications.filter(
    (n) => !suppressedKeys.has(n.fieldKey)
  );

  // Only generate insights for critical/recommended items
  const priorityNotifications = activeNotifications.filter(
    (n) => n.importance === 'critical' || n.importance === 'recommended'
  );

  // Take top 3 to avoid overwhelming user
  const topNotifications = priorityNotifications.slice(0, 3);

  for (const notification of topNotifications) {
    const severity: InsightSeverity =
      notification.importance === 'critical' ? 'warning' : 'info';

    insights.push({
      type: 'data_completeness',
      title: notification.title,
      description: notification.description,
      severity,
      data: {
        fieldKey: notification.fieldKey,
        entityType: notification.entityType,
        entityId: notification.entityId,
        entityName: notification.entityName,
        fieldName: notification.fieldName,
        action: notification.action,
      },
      acknowledgedAt: null,
      expiresAt: new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week
    });
  }

  return insights;
}

/**
 * Get data completeness summary
 */
export interface DataCompletenessSummary {
  totalCourses: number;
  coursesWithTargetGrade: number;
  coursesWithCurrentGrade: number;
  totalTasks: number;
  tasksWithWeight: number;
  tasksWithDueDate: number;
  overallScore: number; // 0-100
}

export function getDataCompletenessSummary(
  courses: CourseForPriority[],
  tasks: TaskForPriority[]
): DataCompletenessSummary {
  const incompleteTasks = tasks.filter((t) => !t.isCompleted);

  const coursesWithTargetGrade = courses.filter(
    (c) => c.targetGrade !== 80 || c.currentGrade !== null
  ).length;
  const coursesWithCurrentGrade = courses.filter((c) => c.currentGrade !== null).length;
  const tasksWithWeight = incompleteTasks.filter(
    (t) => t.weight !== null && t.weight > 0
  ).length;
  const tasksWithDueDate = incompleteTasks.filter((t) => t.dueAt !== null).length;

  // Calculate overall score (weighted average)
  const totalCourses = courses.length || 1;
  const totalTasks = incompleteTasks.length || 1;

  const courseScore = ((coursesWithTargetGrade / totalCourses) * 0.7 +
    (coursesWithCurrentGrade / totalCourses) * 0.3) * 100;
  const taskScore = ((tasksWithWeight / totalTasks) * 0.4 +
    (tasksWithDueDate / totalTasks) * 0.6) * 100;

  const overallScore = Math.round(courseScore * 0.5 + taskScore * 0.5);

  return {
    totalCourses: courses.length,
    coursesWithTargetGrade,
    coursesWithCurrentGrade,
    totalTasks: incompleteTasks.length,
    tasksWithWeight,
    tasksWithDueDate,
    overallScore,
  };
}
