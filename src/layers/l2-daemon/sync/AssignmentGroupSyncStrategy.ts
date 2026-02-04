/**
 * AssignmentGroupSyncStrategy - Syncs Canvas assignment groups for courses
 *
 * Assignment groups contain important metadata:
 * - group_weight: Percentage weight of this group in final grade
 * - drop_lowest/drop_highest: Drop rules
 * - never_drop: Assignment IDs that cannot be dropped
 */

import { BaseSyncStrategy, SyncContext, SyncResult } from './SyncStrategy';
import type { CanvasAssignmentGroup } from '../CanvasClient';

export class AssignmentGroupSyncStrategy extends BaseSyncStrategy {
  readonly entityType = 'assignment_groups';

  constructor(context: SyncContext) {
    super(context);
  }

  async syncForCourse(
    canvasCourseId: number,
    localCourseId: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    this.log?.info(`Syncing assignment groups for course ${canvasCourseId}`);

    try {
      // Fetch assignment groups from Canvas
      const groups = await this.rateLimiter.enqueue(
        () => this.client.getAssignmentGroups(canvasCourseId),
        4 // Medium priority
      );

      this.log?.debug(`Fetched ${groups.length} assignment groups from Canvas`);

      let synced = 0;
      const errors: string[] = [];

      for (const group of groups) {
        try {
          await this.upsertGroup(group, localCourseId);
          synced++;
        } catch (error) {
          const msg = `Failed to sync group ${group.name}: ${error}`;
          this.log?.warn(msg);
          errors.push(msg);
        }
      }

      const duration = Date.now() - startTime;
      this.log?.info(
        `Synced ${synced}/${groups.length} assignment groups for course ${canvasCourseId} in ${duration}ms`
      );

      return this.successResult(synced, duration, errors);
    } catch (error) {
      const duration = Date.now() - startTime;
      const msg = `Failed to sync assignment groups: ${error}`;
      this.log?.error(msg);
      return this.failedResult(msg, duration);
    }
  }

  /**
   * Upsert a single assignment group to the database
   */
  private async upsertGroup(
    group: CanvasAssignmentGroup,
    localCourseId: number
  ): Promise<void> {
    const data = {
      course_id: localCourseId,
      canvas_group_id: group.id,
      name: group.name,
      position: group.position || 0,
      group_weight: group.group_weight ?? null,
      drop_lowest: group.rules?.drop_lowest ?? 0,
      drop_highest: group.rules?.drop_highest ?? 0,
      never_drop: group.rules?.never_drop ? JSON.stringify(group.rules.never_drop) : null,
      synced_at: new Date().toISOString(),
    };

    this.db.upsert('canvas_assignment_groups', data, ['course_id', 'canvas_group_id']);
  }

  /**
   * Get the local assignment group ID for a Canvas group ID
   * Used by TaskSyncStrategy to link tasks to groups
   */
  resolveLocalGroupId(canvasGroupId: number, localCourseId: number): number | null {
    const localGroup = this.db.executeReadOne<{ id: number }>(
      `SELECT id FROM canvas_assignment_groups
       WHERE course_id = ? AND canvas_group_id = ?`,
      [localCourseId, canvasGroupId]
    );
    return localGroup?.id ?? null;
  }

  /**
   * Get all assignment groups for a course
   */
  getGroupsForCourse(localCourseId: number): Array<{
    id: number;
    canvas_group_id: number;
    name: string;
    group_weight: number | null;
    drop_lowest: number;
    drop_highest: number;
  }> {
    return this.db.executeRead(
      `SELECT id, canvas_group_id, name, group_weight, drop_lowest, drop_highest
       FROM canvas_assignment_groups
       WHERE course_id = ?
       ORDER BY position`,
      [localCourseId]
    );
  }
}
