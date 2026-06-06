/**
 * Store Selectors
 * Reusable selectors for querying store state
 */

import type { StoreState } from '../types';
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
   * Get incomplete tasks sorted by due date (earliest first)
   */
  priorityTasks: (state: StoreState) =>
    state.tasks
      .filter((t) => !t.isCompleted)
      .sort((a, b) => {
        const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return aDue - bDue;
      }),

  /**
   * Get undismissed notifications
   */
  activeNotifications: (state: StoreState) =>
    state.notifications.filter((n) => !n.dismissedAt),

  /**
   * Get notifications whose course is currently in `state.courses`. System
   * notifications (`courseId === null`) are always included. The IPC handler
   * already filters by visibility, but there is a brief window between
   * `fetchCourses` and `fetchNotifications` re-fetches after a visibility
   * change where `state.notifications` may carry entries for a course that
   * was just hidden/archived. This selector closes that staleness window.
   *
   * Centralises the per-component `notifications.filter(n => courseMap.has(n.courseId))`
   * pattern (see CLAUDE.md §8). Prefer `useStore(selectors.visibleNotifications)`
   * over the inline filter in new code.
   */
  visibleNotifications: (state: StoreState) => {
    const courseIds = new Set(state.courses.map((c) => c.id));
    return state.notifications.filter(
      (n) => n.courseId === null || courseIds.has(n.courseId)
    );
  },

  /**
   * Get tasks whose course is currently in `state.courses`. Defends the same
   * staleness window as `visibleNotifications` for the tasks list. Use
   * `useStore(selectors.visibleTasks)` over the inline
   * `tasks.filter(t => courseMap.has(t.courseId))` pattern.
   */
  visibleTasks: (state: StoreState) => {
    const courseIds = new Set(state.courses.map((c) => c.id));
    return state.tasks.filter((t) => courseIds.has(t.courseId));
  },

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

  /**
   * The pending update notification payload, or null when no update is
   * available / has been dismissed. Batch B renders the UpdateAvailableModal
   * by reading this selector (SSOT — no local isOpen state).
   */
  pendingUpdate: (state: StoreState) => state.updateAvailable,
};
