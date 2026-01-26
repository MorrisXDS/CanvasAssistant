/**
 * GraceTokenUsageRepository - Database operations for grace token usage records
 *
 * Tracks when and how grace tokens are used for specific tasks.
 * This provides a full audit trail of token consumption.
 */

import type { Database } from '../Database';
import { BaseRepository } from './BaseRepository';

/**
 * Database row for grace_token_usage table
 */
export interface TokenUsageRow {
  id: number;
  grace_token_id: number;
  task_id: number;
  tokens_used: number;
  hours_extended: number;
  used_at: string;
  notes: string | null;
}

/**
 * Token usage record entity
 */
export interface TokenUsageRecord {
  id: number;
  graceTokenId: number;
  taskId: number;
  tokensUsed: number;
  hoursExtended: number;
  usedAt: string;
  notes: string | null;
}

/**
 * Extended token usage record with task and course info
 */
export interface TokenUsageWithContext extends TokenUsageRecord {
  taskTitle: string;
  courseId: number;
  courseCode: string;
}

/**
 * Parameters for recording token usage
 */
export interface RecordUsageParams {
  graceTokenId: number;
  taskId: number;
  tokensUsed: number;
  hoursExtended: number;
  notes?: string;
}

/**
 * Repository for grace token usage records.
 */
export class GraceTokenUsageRepository extends BaseRepository<TokenUsageRecord, TokenUsageRow> {
  constructor(db: Database) {
    super(db);
  }

  protected mapRowToEntity(row: TokenUsageRow): TokenUsageRecord {
    return {
      id: row.id,
      graceTokenId: row.grace_token_id,
      taskId: row.task_id,
      tokensUsed: row.tokens_used,
      hoursExtended: row.hours_extended,
      usedAt: row.used_at,
      notes: row.notes,
    };
  }

  protected mapEntityToRow(_entity: Partial<TokenUsageRecord>): Record<string, unknown> {
    return {};
  }

  /**
   * Record a token usage event.
   */
  recordUsage(params: RecordUsageParams): TokenUsageRecord {
    const result = this.db.executeWrite(
      `INSERT INTO grace_token_usage (
        grace_token_id, task_id, tokens_used, hours_extended, notes
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(grace_token_id, task_id) DO UPDATE SET
        tokens_used = tokens_used + excluded.tokens_used,
        hours_extended = hours_extended + excluded.hours_extended,
        used_at = CURRENT_TIMESTAMP`,
      [
        params.graceTokenId,
        params.taskId,
        params.tokensUsed,
        params.hoursExtended,
        params.notes ?? null,
      ],
      'grace_token_usage'
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Find usage record by ID.
   */
  findById(id: number): TokenUsageRecord | null {
    return this.queryOne<TokenUsageRow>(
      'SELECT * FROM grace_token_usage WHERE id = ?',
      [id]
    );
  }

  /**
   * Find all usage records for a grace token policy.
   */
  findByGraceTokenId(graceTokenId: number): TokenUsageRecord[] {
    return this.queryAll<TokenUsageRow>(
      'SELECT * FROM grace_token_usage WHERE grace_token_id = ? ORDER BY used_at DESC',
      [graceTokenId]
    );
  }

  /**
   * Find usage record for a specific task.
   */
  findByTaskId(taskId: number): TokenUsageRecord | null {
    return this.queryOne<TokenUsageRow>(
      'SELECT * FROM grace_token_usage WHERE task_id = ?',
      [taskId]
    );
  }

  /**
   * Find all usage records for a course (via grace_tokens -> course_policies).
   */
  findByCourseId(courseId: number): TokenUsageWithContext[] {
    const rows = this.db.executeRead<TokenUsageRow & {
      task_title: string;
      course_id: number;
      course_code: string;
    }>(
      `SELECT
        gtu.*,
        t.title as task_title,
        c.id as course_id,
        c.code as course_code
      FROM grace_token_usage gtu
      JOIN grace_tokens gt ON gtu.grace_token_id = gt.id
      JOIN course_policies cp ON gt.policy_id = cp.id
      JOIN courses c ON cp.course_id = c.id
      JOIN tasks t ON gtu.task_id = t.id
      WHERE c.id = ?
      ORDER BY gtu.used_at DESC`,
      [courseId]
    );

    return rows.map((row) => ({
      ...this.mapRowToEntity(row),
      taskTitle: row.task_title,
      courseId: row.course_id,
      courseCode: row.course_code,
    }));
  }

  /**
   * Get total tokens used for a grace token policy.
   */
  getTotalUsed(graceTokenId: number): number {
    const row = this.db.executeReadOne<{ total: number }>(
      'SELECT COALESCE(SUM(tokens_used), 0) as total FROM grace_token_usage WHERE grace_token_id = ?',
      [graceTokenId]
    );
    return row?.total ?? 0;
  }

  /**
   * Delete usage record (for corrections/reversals).
   */
  delete(id: number): boolean {
    const result = this.db.executeWrite(
      'DELETE FROM grace_token_usage WHERE id = ?',
      [id],
      'grace_token_usage'
    );
    return result.changes > 0;
  }

  /**
   * Delete usage record for a specific task.
   */
  deleteByTaskId(taskId: number): boolean {
    const result = this.db.executeWrite(
      'DELETE FROM grace_token_usage WHERE task_id = ?',
      [taskId],
      'grace_token_usage'
    );
    return result.changes > 0;
  }
}
