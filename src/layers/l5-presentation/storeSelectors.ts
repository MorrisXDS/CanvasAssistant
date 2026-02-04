/**
 * Store Selectors
 * Reusable selectors for querying store state
 */

import type { StoreState } from './types';
import { getCachedCourseGrades } from './courseGradesCache';

/**
 * Selectors for common queries
 */
export const selectors = {
  /**
   * Get visible (non-hidden) courses
   */
  visibleCourses: (state: StoreState) => state.courses.filter((c) => !c.isHidden),

  /**
   * Get tasks for a specific course
   */
  courseTasks: (courseId: number) => (state: StoreState) =>
    state.tasks.filter((t) => t.courseId === courseId),

  /**
   * Get incomplete tasks sorted by priority
   */
  priorityTasks: (state: StoreState) =>
    state.tasks
      .filter((t) => !t.isCompleted)
      .sort((a, b) => b.priorityScore - a.priorityScore),

  /**
   * Get undismissed notifications
   */
  activeNotifications: (state: StoreState) =>
    state.notifications.filter((n) => !n.dismissedAt),

  /**
   * Get simulated grade for a task
   */
  simulatedGrade: (taskId: number) => (state: StoreState) =>
    state.simulation.grades.find((g) => g.taskId === taskId)?.simulatedGrade ?? null,

  /**
   * Get effective grade for a task (simulated if exists, else actual)
   */
  effectiveGrade: (taskId: number) => (state: StoreState) => {
    const simulated = selectors.simulatedGrade(taskId)(state);
    if (simulated !== null) return simulated;
    const task = state.tasks.find((t) => t.id === taskId);
    return task?.grade ?? null;
  },

  /**
   * Get visible imported calendars
   */
  visibleCalendars: (state: StoreState) =>
    state.importedCalendars.filter((c) => c.isVisible),

  /**
   * Get calendar events for visible calendars
   */
  visibleCalendarEvents: (state: StoreState) => {
    const visibleIds = new Set(
      state.importedCalendars.filter((c) => c.isVisible).map((c) => c.id)
    );
    return state.calendarEvents.filter(
      (e) => e.importedCalendarId && visibleIds.has(e.importedCalendarId)
    );
  },

  /**
   * Get events for a specific calendar
   */
  calendarEvents: (calendarId: number) => (state: StoreState) =>
    state.calendarEvents.filter((e) => e.importedCalendarId === calendarId),

  /**
   * Get memoized grade calculations for a course
   * Uses internal cache to avoid O(courses × tasks) calculations
   */
  courseGrades: (courseId: number) => (state: StoreState) =>
    getCachedCourseGrades(courseId, state.tasks),

  /**
   * Get all course grades (memoized)
   */
  allCourseGrades: (state: StoreState) => {
    const grades: Record<number, { earned: number; trend: number; assessed: number }> =
      {};
    for (const course of state.courses) {
      grades[course.id] = getCachedCourseGrades(course.id, state.tasks);
    }
    return grades;
  },
};
