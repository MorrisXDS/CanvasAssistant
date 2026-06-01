/**
 * ApplyConflictResolutionCommand — writes a resolved conflict value back to the
 * winning entity row, extracted from syncHandlers (ADR-0007).
 *
 * The original handler built `UPDATE ${table} SET ${field} = ?` by string
 * interpolation from the conflict record. Both the table and the column are
 * derived data, so this command HARDENS that path:
 *   - `table` must be one of the three known conflict entity tables.
 *   - `field` must be a syntactically-valid identifier AND an actual column of
 *     that table (looked up via PRAGMA table_info and cached).
 * Anything else throws — the interpolation can never carry attacker-controlled
 * SQL. Valid (table, field) pairs behave exactly as before.
 */

import type { Database } from '../../../l1-persistence/Database';

const ALLOWED_TABLES = new Set(['courses', 'tasks', 'notifications']);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class ApplyConflictResolutionCommand {
  /** Cache of table → its column-name set (tables are allow-listed first). */
  private readonly columnCache = new Map<string, Set<string>>();

  constructor(private readonly db: Database) {}

  /**
   * Apply `value` to `table.field` for the row with the given id. Throws if the
   * table is not an allowed conflict table or the field is not a real column.
   */
  apply(table: string, field: string, value: unknown, entityId: number): void {
    this.assertTable(table);
    this.assertField(table, field);

    this.db.executeWrite(
      `UPDATE ${table} SET ${field} = ? WHERE id = ?`,
      [value as string | number | null, entityId],
      table
    );
  }

  private assertTable(table: string): void {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Refusing conflict UPDATE on non-allowlisted table: ${table}`);
    }
  }

  private assertField(table: string, field: string): void {
    if (!IDENTIFIER.test(field)) {
      throw new Error(`Refusing conflict UPDATE on invalid field identifier: ${field}`);
    }
    if (!this.columnsOf(table).has(field)) {
      throw new Error(`Refusing conflict UPDATE on unknown column ${table}.${field}`);
    }
  }

  private columnsOf(table: string): Set<string> {
    const cached = this.columnCache.get(table);
    if (cached) return cached;
    // `table` is already allow-listed, so interpolating it into PRAGMA is safe.
    const rows = this.db.executeRead<{ name: string }>(`PRAGMA table_info(${table})`);
    const cols = new Set(rows.map((r) => r.name));
    this.columnCache.set(table, cols);
    return cols;
  }
}
