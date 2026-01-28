/**
 * Centralized Task Filters
 * Reusable filter predicates for task queries across the application
 */

import type { Task } from '../types';

/**
 * Filter out completed and optional tasks
 * Use this for active task lists (upcoming, priority queue, etc.)
 */
export function isActiveTask(task: Task): boolean {
  return !task.isCompleted && !task.isOptional;
}

/**
 * Filter for tasks that should appear in priority/upcoming lists
 * Excludes completed, optional, and tasks without due dates
 */
export function isPriorityTask(task: Task): boolean {
  return isActiveTask(task) && !!task.dueAt;
}

/**
 * Filter for overdue tasks
 * Excludes completed and optional tasks, only includes past-due tasks
 */
export function isOverdueTask(task: Task): boolean {
  if (!isActiveTask(task) || !task.dueAt) return false;
  return new Date(task.dueAt) < new Date();
}

/**
 * Filter for upcoming (not yet due) tasks
 * Excludes completed and optional tasks, only includes future-due tasks
 */
export function isUpcomingTask(task: Task): boolean {
  if (!isActiveTask(task) || !task.dueAt) return false;
  return new Date(task.dueAt) >= new Date();
}
