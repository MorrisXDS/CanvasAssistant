/**
 * L3 Intelligence - Dependency Resolver
 *
 * Resolves task dependencies based on module sequential progress
 * requirements and completion status.
 */

import { Database } from '../l1-persistence/Database';
import { ModuleDependency, PriorityFactor, TaskForPriority } from './types';

/**
 * Module item data from database
 */
interface ModuleItemData {
  id: number;
  external_id: string;
  module_id: number;
  title: string;
  item_type: string;
  content_id: string | null;
  position: number;
  completion_requirement: string | null;
  published: number;
}

/**
 * Module data from database
 */
interface ModuleData {
  id: number;
  external_id: string;
  course_id: number;
  name: string;
  position: number;
  require_sequential_progress: number;
  published: number;
}

/**
 * Completion status tracking
 */
interface CompletionStatus {
  moduleItemId: number;
  completed: boolean;
  completedAt: Date | null;
}

/**
 * Dependency resolution result for a task
 */
export interface DependencyResult {
  /** Whether all prerequisites are met */
  prerequisitesMet: boolean;
  /** Module dependency information */
  dependency: ModuleDependency | null;
  /** Priority factor if blocked */
  factor: PriorityFactor | null;
  /** List of blocking items */
  blockingItems: Array<{
    moduleId: number;
    moduleName: string;
    itemTitle: string;
    position: number;
  }>;
}

/**
 * Dependency Resolver
 *
 * Checks module sequential progress requirements to determine
 * if tasks are blocked by incomplete prerequisites.
 */
export class DependencyResolver {
  private db: Database;
  private completionCache: Map<number, CompletionStatus[]> = new Map();

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Resolve dependencies for a task
   */
  resolve(task: TaskForPriority, courseId: number): DependencyResult {
    const result: DependencyResult = {
      prerequisitesMet: true,
      dependency: null,
      factor: null,
      blockingItems: [],
    };

    // Find module item for this task (by content_id matching external_id)
    const moduleItem = this.findModuleItemForTask(task.id, courseId);
    if (!moduleItem) {
      return result; // No module association
    }

    // Get the module
    const module = this.getModule(moduleItem.module_id);
    if (!module || !module.require_sequential_progress) {
      return result; // Module doesn't require sequential progress
    }

    // Get all items in this module before the task's position
    const prerequisiteItems = this.getPrerequisiteItems(
      moduleItem.module_id,
      moduleItem.position
    );

    // Check completion status of prerequisites
    const incompleteItems = this.findIncompleteItems(prerequisiteItems, courseId);

    if (incompleteItems.length > 0) {
      result.prerequisitesMet = false;
      result.blockingItems = incompleteItems.map((item) => ({
        moduleId: module.id,
        moduleName: module.name,
        itemTitle: item.title,
        position: item.position,
      }));

      result.dependency = {
        taskId: task.id,
        moduleId: module.id,
        moduleName: module.name,
        position: moduleItem.position,
        prerequisiteModuleIds: [module.id],
        prerequisitesMet: false,
        blockedReason: `Complete ${incompleteItems.length} item${incompleteItems.length > 1 ? 's' : ''} first`,
      };

      result.factor = {
        id: 'dependency_blocked',
        name: 'Prerequisites',
        icon: '🔒',
        impact: -50,
        description: `Blocked by ${incompleteItems.length} incomplete item${incompleteItems.length > 1 ? 's' : ''}`,
        recommendation: `Complete "${incompleteItems[0].title}" first`,
      };
    } else {
      result.dependency = {
        taskId: task.id,
        moduleId: module.id,
        moduleName: module.name,
        position: moduleItem.position,
        prerequisiteModuleIds: [module.id],
        prerequisitesMet: true,
      };
    }

    return result;
  }

  /**
   * Resolve dependencies for multiple tasks
   */
  resolveAll(tasks: TaskForPriority[], courseId: number): Map<number, DependencyResult> {
    const results = new Map<number, DependencyResult>();

    for (const task of tasks) {
      results.set(task.id, this.resolve(task, courseId));
    }

    return results;
  }

  /**
   * Find module item associated with a task
   */
  private findModuleItemForTask(taskId: number, courseId: number): ModuleItemData | null {
    // Get task external_id
    const task = this.db.executeReadOne<{ external_id: string | null }>(
      'SELECT external_id FROM tasks WHERE id = ?',
      [taskId]
    );

    if (!task?.external_id) {
      return null;
    }

    // Find module item with matching content_id
    return (
      this.db.executeReadOne<ModuleItemData>(
        `SELECT mi.* FROM module_items mi
       JOIN modules m ON mi.module_id = m.id
       WHERE m.course_id = ?
         AND mi.item_type = 'Assignment'
         AND mi.content_id = ?`,
        [courseId, task.external_id]
      ) || null
    );
  }

  /**
   * Get module by ID
   */
  private getModule(moduleId: number): ModuleData | null {
    return (
      this.db.executeReadOne<ModuleData>('SELECT * FROM modules WHERE id = ?', [
        moduleId,
      ]) || null
    );
  }

  /**
   * Get all module items before a given position
   */
  private getPrerequisiteItems(
    moduleId: number,
    beforePosition: number
  ): ModuleItemData[] {
    return this.db.executeRead<ModuleItemData>(
      `SELECT * FROM module_items
       WHERE module_id = ?
         AND position < ?
         AND completion_requirement IS NOT NULL
         AND published = 1
       ORDER BY position`,
      [moduleId, beforePosition]
    );
  }

  /**
   * Find items that haven't been completed
   */
  private findIncompleteItems(
    items: ModuleItemData[],
    courseId: number
  ): ModuleItemData[] {
    const incomplete: ModuleItemData[] = [];

    for (const item of items) {
      if (!this.isItemCompleted(item, courseId)) {
        incomplete.push(item);
      }
    }

    return incomplete;
  }

  /**
   * Check if a module item has been completed
   */
  private isItemCompleted(item: ModuleItemData, courseId: number): boolean {
    if (!item.completion_requirement) {
      return true; // No requirement means complete
    }

    const requirement = JSON.parse(item.completion_requirement);

    switch (requirement.type) {
      case 'must_view':
        // Check if item was viewed (would need page view tracking)
        // For now, assume viewed if task exists
        return true;

      case 'must_submit':
        return this.isTaskSubmitted(item, courseId);

      case 'must_contribute':
        // For discussions - check if user has posted
        return true; // Simplified

      case 'min_score':
        return this.hasMinScore(item, courseId, requirement.min_score);

      case 'must_mark_done':
        return this.isMarkedDone(item, courseId);

      default:
        return true;
    }
  }

  /**
   * Check if a task has been submitted
   */
  private isTaskSubmitted(item: ModuleItemData, courseId: number): boolean {
    if (!item.content_id) return true;

    const task = this.db.executeReadOne<{ is_completed: number }>(
      `SELECT is_completed FROM tasks
       WHERE course_id = ? AND external_id = ?`,
      [courseId, item.content_id]
    );

    return task?.is_completed === 1;
  }

  /**
   * Check if task has minimum score
   */
  private hasMinScore(item: ModuleItemData, courseId: number, minScore: number): boolean {
    if (!item.content_id) return true;

    const task = this.db.executeReadOne<{
      grade: number | null;
      points_possible: number | null;
    }>(
      `SELECT grade, points_possible FROM tasks
       WHERE course_id = ? AND external_id = ?`,
      [courseId, item.content_id]
    );

    if (!task?.grade || !task?.points_possible) {
      return false;
    }

    const percentage = (task.grade / task.points_possible) * 100;
    return percentage >= minScore;
  }

  /**
   * Check if item is marked as done (user preference)
   */
  private isMarkedDone(item: ModuleItemData, courseId: number): boolean {
    // This would check user_preferences or a completion tracking table
    // Simplified for now
    return this.isTaskSubmitted(item, courseId);
  }

  /**
   * Get all tasks that are blocked by dependencies
   */
  getBlockedTasks(courseId: number): Array<{
    taskId: number;
    taskTitle: string;
    blockingItems: DependencyResult['blockingItems'];
  }> {
    const tasks = this.db.executeRead<{ id: number; title: string }>(
      `SELECT t.id, t.title FROM tasks t
       WHERE t.course_id = ?
         AND t.is_completed = 0
         AND t.external_id IS NOT NULL`,
      [courseId]
    );

    const blocked: Array<{
      taskId: number;
      taskTitle: string;
      blockingItems: DependencyResult['blockingItems'];
    }> = [];

    for (const task of tasks) {
      const result = this.resolve(
        {
          id: task.id,
          courseId,
          title: task.title,
          dueAt: null,
          dueTimeKnown: true,
          unlockAt: null,
          lockAt: null,
          pointsPossible: null,
          weight: null,
          isCompleted: false,
          isPinned: false,
          grade: null,
          submittedAt: null,
          taskType: 'assignment',
          taskGroupId: null,
          submissionStatus: null,
        },
        courseId
      );

      if (!result.prerequisitesMet) {
        blocked.push({
          taskId: task.id,
          taskTitle: task.title,
          blockingItems: result.blockingItems,
        });
      }
    }

    return blocked;
  }

  /**
   * Clear completion cache
   */
  clearCache(): void {
    this.completionCache.clear();
  }
}
