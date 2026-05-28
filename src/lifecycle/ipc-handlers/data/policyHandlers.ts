/**
 * Policy IPC Handlers
 *
 * Per ADR-0007 / PR-H: no `database.execute*` calls — all reads route
 * through `PolicyReader`. Visibility composes via `VisibilityOracle`
 * for the list endpoint; the per-course endpoint bypasses (sub-decision α).
 *
 * `course_policies` is a zombie table per ADR-0003 — both handlers
 * return [] in production today. The migration closes the raw-SQL
 * violation regardless; if the table is ever repopulated, behaviour
 * is preserved verbatim.
 */

import { ipcMain } from 'electron';
import type { IpcContext } from '../IpcContext';
import { PolicyReader } from '../../../layers/l1-persistence';
import type { PolicyRow } from '../../../layers/l1-persistence/DatabaseRowTypes';

function mapPolicyRowToResponse(row: PolicyRow) {
  return {
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
  };
}

/**
 * Register policy-related IPC handlers
 */
export function registerPolicyHandlers(ctx: IpcContext): void {
  const database = ctx.getDatabase();
  const logger = ctx.getLogger();
  const getVisibilityOracle = ctx.getVisibilityOracle;

  const reader = new PolicyReader(database);

  // Get active policies for one course. Single-id bypass — caller knew
  // the course id.
  ipcMain.handle('data:getPolicies', (_event, courseId: number) => {
    try {
      return reader.getByCourseId(courseId).map(mapPolicyRowToResponse);
    } catch (error) {
      logger.error(`Failed to get policies: ${error}`);
      throw error;
    }
  });

  // Get active policies across visible courses (for policy badges on
  // tasks). Composes Oracle.getVisibleCourseIds(); intersects with
  // optional caller-supplied course-id list.
  ipcMain.handle('data:getAllPolicies', (_event, options?: { courseIds?: number[] }) => {
    try {
      const visibleIds = getVisibilityOracle()?.getVisibleCourseIds() ?? [];

      let scopeIds: number[];
      if (
        options?.courseIds &&
        Array.isArray(options.courseIds) &&
        options.courseIds.length > 0
      ) {
        const visibleSet = new Set(visibleIds);
        scopeIds = options.courseIds.filter((id) => visibleSet.has(id));
      } else {
        scopeIds = visibleIds;
      }

      return reader.getByCourseIds(scopeIds).map(mapPolicyRowToResponse);
    } catch (error) {
      logger.error(`Failed to get all policies: ${error}`);
      throw error;
    }
  });
}
