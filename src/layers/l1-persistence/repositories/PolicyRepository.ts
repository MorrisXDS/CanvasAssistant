/**
 * PolicyRepository - Database operations for course policies
 *
 * Encapsulates all SQL operations for the course_policies table.
 */

import type { Database } from '../Database';
import type { Policy } from '../../../shared/ipc-contract';
import { BaseRepository, PolicyRow } from './BaseRepository';

export interface PolicyConfig {
  [key: string]: unknown;
}

export interface GraceTokenConfig extends PolicyConfig {
  total_tokens: number;
  tokens_used: number;
  hours_per_token: number;
  max_tokens_per_task: number;
  applies_to: string[];
  excludes: string[];
}

export interface PolicyUpdates {
  policyName?: string;
  policyConfig?: PolicyConfig;
  rawText?: string | null;
  isUserVerified?: boolean;
  isActive?: boolean;
}

export interface CreatePolicyParams {
  courseId: number;
  policyType: string;
  policyName: string;
  policyConfig: PolicyConfig;
  rawText?: string | null;
  isUserVerified?: boolean;
  isActive?: boolean;
}

export class PolicyRepository extends BaseRepository<Policy, PolicyRow> {
  constructor(db: Database) {
    super(db);
  }

  protected mapRowToEntity(row: PolicyRow): Policy {
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

  protected mapEntityToRow(_entity: Partial<Policy>): Record<string, unknown> {
    return {};
  }

  /**
   * Find all policies for a course.
   */
  findByCourseId(courseId: number): Policy[] {
    return this.queryAll<PolicyRow>(
      'SELECT * FROM course_policies WHERE course_id = ? ORDER BY policy_type, policy_name',
      [courseId]
    );
  }

  /**
   * Find active policies for a course.
   */
  findActiveByCourseId(courseId: number): Policy[] {
    return this.queryAll<PolicyRow>(
      'SELECT * FROM course_policies WHERE course_id = ? AND is_active = 1 ORDER BY policy_type, policy_name',
      [courseId]
    );
  }

  /**
   * Find a policy by its ID.
   */
  findById(id: number): Policy | null {
    return this.queryOne<PolicyRow>('SELECT * FROM course_policies WHERE id = ?', [id]);
  }

  /**
   * Find a specific policy type for a course.
   */
  findByType(courseId: number, policyType: string): Policy | null {
    return this.queryOne<PolicyRow>(
      'SELECT * FROM course_policies WHERE course_id = ? AND policy_type = ? AND is_active = 1',
      [courseId, policyType]
    );
  }

  /**
   * Find grace token policy for a course.
   */
  findGraceTokenPolicy(courseId: number): (Policy & { policyConfig: GraceTokenConfig }) | null {
    const policy = this.findByType(courseId, 'grace_tokens');
    if (!policy) return null;

    return {
      ...policy,
      policyConfig: policy.policyConfig as GraceTokenConfig,
    };
  }

  /**
   * Create a new policy.
   */
  create(params: CreatePolicyParams): Policy {
    const result = this.db.executeWrite(
      `INSERT INTO course_policies (
        course_id, policy_type, policy_name, policy_config, raw_text, is_user_verified, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.courseId,
        params.policyType,
        params.policyName,
        JSON.stringify(params.policyConfig),
        params.rawText ?? null,
        params.isUserVerified ? 1 : 0,
        params.isActive !== false ? 1 : 0,
      ],
      'course_policies'
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Update a policy and return the updated entity.
   */
  update(id: number, updates: PolicyUpdates): Policy | null {
    const mappedUpdates: Record<string, unknown> = {};

    if (updates.policyName !== undefined) mappedUpdates.policy_name = updates.policyName;
    if (updates.policyConfig !== undefined) mappedUpdates.policy_config = JSON.stringify(updates.policyConfig);
    if (updates.rawText !== undefined) mappedUpdates.raw_text = updates.rawText;
    if (updates.isUserVerified !== undefined) mappedUpdates.is_user_verified = updates.isUserVerified ? 1 : 0;
    if (updates.isActive !== undefined) mappedUpdates.is_active = updates.isActive ? 1 : 0;

    const keys = Object.keys(mappedUpdates);
    if (keys.length === 0) {
      return this.findById(id);
    }

    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = [...Object.values(mappedUpdates), id];

    this.db.executeWrite(
      `UPDATE course_policies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values,
      'course_policies'
    );

    return this.findById(id);
  }

  /**
   * Update policy config directly.
   */
  updateConfig(id: number, config: PolicyConfig): Policy | null {
    return this.update(id, { policyConfig: config });
  }

  /**
   * Delete a policy.
   */
  delete(id: number): boolean {
    const result = this.db.executeWrite(
      'DELETE FROM course_policies WHERE id = ?',
      [id],
      'course_policies'
    );
    return result.changes > 0;
  }

  /**
   * Deactivate a policy (soft delete).
   */
  deactivate(id: number): Policy | null {
    return this.update(id, { isActive: false });
  }

  /**
   * Check if a policy exists.
   */
  exists(id: number): boolean {
    const row = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM course_policies WHERE id = ?',
      [id]
    );
    return row !== null;
  }

  /**
   * Check if a policy type exists for a course.
   */
  typeExists(courseId: number, policyType: string): boolean {
    const row = this.db.executeReadOne<{ id: number }>(
      'SELECT id FROM course_policies WHERE course_id = ? AND policy_type = ? AND is_active = 1',
      [courseId, policyType]
    );
    return row !== null;
  }
}
