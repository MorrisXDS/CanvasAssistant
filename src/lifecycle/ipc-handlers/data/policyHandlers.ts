/**
 * Policy IPC Handlers
 * Handlers for policy CRUD operations (data:getPolicies, data:getAllPolicies)
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';

/**
 * Register policy-related IPC handlers
 */
export function registerPolicyHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibleDataProvider = ctx.getVisibleDataProvider;

  // Get policies for a course
  ipcMain.handle('data:getPolicies', (_event, courseId: number) => {
    try {
      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        policy_name: string;
        policy_config: string;
        raw_text: string | null;
        is_user_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>(
        'SELECT * FROM course_policies WHERE course_id = ? AND is_active = 1 ORDER BY policy_type',
        [courseId]
      );

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        policyName: row.policy_name,
        policyConfig: JSON.parse(row.policy_config || '{}'),
        rawText: row.raw_text,
        isUserVerified: Boolean(row.is_user_verified),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error(`Failed to get policies: ${error}`);
      throw error;
    }
  });

  // Get all policies for multiple courses (for policy badges on tasks)
  ipcMain.handle('data:getAllPolicies', (_event, options?: { courseIds?: number[] }) => {
    try {
      const visibleIds = getVisibleDataProvider()?.getVisibleCourseIds() ?? [];

      let sql: string;
      let params: number[] = [];

      if (
        options?.courseIds &&
        Array.isArray(options.courseIds) &&
        options.courseIds.length > 0
      ) {
        // Filter provided courseIds to only visible ones
        const visibleSet = new Set(visibleIds);
        const filteredCourseIds = options.courseIds.filter((id) => visibleSet.has(id));

        if (filteredCourseIds.length === 0) return [];

        const placeholders = filteredCourseIds.map(() => '?').join(', ');
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) AND is_active = 1 ORDER BY course_id, policy_type`;
        params = filteredCourseIds;
      } else {
        // Return policies for all visible courses
        if (visibleIds.length === 0) return [];

        const placeholders = visibleIds.map(() => '?').join(', ');
        sql = `SELECT * FROM course_policies WHERE course_id IN (${placeholders}) AND is_active = 1 ORDER BY course_id, policy_type`;
        params = visibleIds;
      }

      const rows = database.executeRead<{
        id: number;
        course_id: number;
        policy_type: string;
        policy_name: string;
        policy_config: string;
        raw_text: string | null;
        is_user_verified: number;
        is_active: number;
        created_at: string;
        updated_at: string;
      }>(sql, params);

      return rows.map((row) => ({
        id: row.id,
        courseId: row.course_id,
        policyType: row.policy_type,
        policyName: row.policy_name,
        policyConfig: JSON.parse(row.policy_config || '{}'),
        rawText: row.raw_text,
        isUserVerified: Boolean(row.is_user_verified),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error(`Failed to get all policies: ${error}`);
      throw error;
    }
  });
}
