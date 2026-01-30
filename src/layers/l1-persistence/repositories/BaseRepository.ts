/**
 * BaseRepository - Common repository functionality
 *
 * Provides a base class for all repositories with common patterns
 * for mapping between DB rows and entity objects.
 */

import type { Database } from '../Database';

// Re-export row types from centralized location for backwards compatibility
export type {
  CourseRow,
  TaskRow,
  PolicyRow,
  NotificationRow,
} from '../DatabaseRowTypes';

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
