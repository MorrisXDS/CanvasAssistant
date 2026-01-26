/**
 * BaseRepository - Common repository functionality
 *
 * Provides a base class for all repositories with common patterns
 * for mapping between DB rows and entity objects.
 */

import type { Database } from '../Database';

/**
 * Base class for repositories providing common database operations.
 */
export abstract class BaseRepository<TEntity, TRow> {
  constructor(protected readonly db: Database) {}

  /**
   * Map a database row to an entity object.
   * Subclasses must implement this.
   */
  protected abstract mapRowToEntity(row: TRow): TEntity;

  /**
   * Map an entity to database columns.
   * Subclasses must implement this.
   */
  protected abstract mapEntityToRow(entity: Partial<TEntity>): Record<string, unknown>;

  /**
   * Execute a read query and map results to entities.
   */
  protected queryAll<T extends TRow>(sql: string, params: unknown[] = []): TEntity[] {
    const rows = this.db.executeRead<T>(sql, params);
    return rows.map((row) => this.mapRowToEntity(row));
  }

  /**
   * Execute a read query expecting a single result.
   */
  protected queryOne<T extends TRow>(
    sql: string,
    params: unknown[] = []
  ): TEntity | null {
    const row = this.db.executeReadOne<T>(sql, params);
    return row ? this.mapRowToEntity(row) : null;
  }

  /**
   * Build SET clause for UPDATE statements.
   */
  protected buildSetClause(
    updates: Record<string, unknown>,
    excludeKeys: string[] = []
  ): { clause: string; values: unknown[] } {
    const entries = Object.entries(updates).filter(
      ([key, value]) => !excludeKeys.includes(key) && value !== undefined
    );

    const clause = entries.map(([key]) => `${this.toSnakeCase(key)} = ?`).join(', ');
    const values = entries.map(([, value]) => value);

    return { clause, values };
  }

  /**
   * Convert camelCase to snake_case.
   */
  protected toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase.
   */
  protected toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

/**
 * Common database row types used across repositories.
 */
export interface CourseRow {
  id: number;
  external_id: string;
  code: string;
  name: string;
  target_grade: number;
  target_grade_source: 'default' | 'manual';
  assessed_grade: number | null;
  current_grade: number | null;
  total_weight: number;
  color: string | null;
  nickname: string | null;
  is_hidden: number;
  syllabus_body: string | null;
  last_synced_at: string | null;
  enrollment_term_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  external_id: string;
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  weight: number;
  grade: number | null;
  points_possible: number | null;
  priority_score: number;
  is_completed: number;
  is_optional: number;
  completed_at: string | null;
  submission_status: string | null;
  task_type: string | null;
  task_group_id: number | null;
  local_modified_at: string | null;
  field_sources: string | null; // JSON: {"due_at": "guessed", "grade": "canvas"}
  created_at: string;
  updated_at: string;
}

export interface PolicyRow {
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
}

export interface NotificationRow {
  id: number;
  source_type: string;
  source_id: string;
  course_id: number | null;
  title: string;
  message: string;
  message_html: string | null;
  published_at: string;
  dismissed_at: string | null;
  url: string | null;
  created_at: string;
}
