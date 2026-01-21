import BetterSqlite3, { Database as SQLiteDatabase } from 'better-sqlite3';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';

export interface DatabaseConfig {
  dbPath: string;
  migrationsPath?: string;
  verbose?: boolean;
}

export interface CommitEvent {
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  rowId?: number;
}

/**
 * Layer 1 Persistence - SQLite Database with WAL mode and event emission
 *
 * Features:
 * - WAL mode for concurrent reads during writes
 * - NORMAL synchronous for <1ms write latency
 * - Foreign key enforcement
 * - Event emission on data changes
 * - Migration tracking via schema_version table
 */
export class Database extends EventEmitter {
  private db: SQLiteDatabase;
  private dbPath: string;
  private isInitialized: boolean = false;

  constructor(config: DatabaseConfig) {
    super();
    this.dbPath = config.dbPath;

    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Initialize SQLite with optional verbose logging
    this.db = new BetterSqlite3(this.dbPath, {
      verbose: config.verbose ? console.log : undefined,
    });

    // Configure for performance and safety
    this.configurePragmas();
  }

  /**
   * Configure SQLite PRAGMAs for optimal performance
   */
  private configurePragmas(): void {
    // WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // NORMAL sync for <1ms writes (safe with WAL)
    this.db.pragma('synchronous = NORMAL');

    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');

    // Increase cache size for better read performance (64MB)
    this.db.pragma('cache_size = -64000');

    // Memory-mapped I/O for faster reads (256MB)
    this.db.pragma('mmap_size = 268435456');

    // Temp store in memory
    this.db.pragma('temp_store = MEMORY');
  }

  /**
   * Initialize database with schema version tracking
   */
  initialize(): void {
    if (this.isInitialized) return;

    // Create schema_version table for migration tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      )
    `);

    this.isInitialized = true;
  }

  /**
   * Get current schema version
   */
  getSchemaVersion(): number {
    const row = this.db
      .prepare('SELECT MAX(version) as version FROM schema_version')
      .get() as { version: number | null };
    return row?.version ?? 0;
  }

  /**
   * Record a migration as applied
   */
  recordMigration(version: number, description: string): void {
    this.db
      .prepare(
        'INSERT INTO schema_version (version, description) VALUES (?, ?)'
      )
      .run(version, description);
  }

  /**
   * Execute SQL within a transaction with commit event emission
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Execute a write operation and emit commit event
   */
  executeWrite(
    sql: string,
    params: unknown[] = [],
    tableName?: string
  ): { changes: number; lastInsertRowid: number } {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    // Convert BigInt to Number for serialization compatibility
    const normalizedResult = {
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };

    // Emit commit event if table name provided
    if (tableName) {
      const operation = this.detectOperation(sql);
      this.emit('commit', {
        table: tableName,
        operation,
        rowId: normalizedResult.lastInsertRowid || undefined,
      } as CommitEvent);
    }

    return normalizedResult;
  }

  /**
   * Execute a read query
   */
  executeRead<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Execute a read query returning single row
   */
  executeReadOne<T>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  /**
   * Execute raw SQL (for migrations, schema changes)
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Prepare a statement for repeated execution
   */
  prepare(sql: string): BetterSqlite3.Statement {
    return this.db.prepare(sql);
  }

  /**
   * Upsert operation with conflict resolution
   * @param conflictColumns - Single column name or array of column names for composite unique constraint
   * @param updateTimestamp - Whether to automatically update updated_at column (default: true)
   */
  upsert(
    tableName: string,
    data: Record<string, unknown>,
    conflictColumns: string | string[] = 'external_id',
    updateTimestamp: boolean = true
  ): BetterSqlite3.RunResult {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');

    // Handle both single and composite conflict columns
    const conflictColArray = Array.isArray(conflictColumns) ? conflictColumns : [conflictColumns];
    const conflictClause = conflictColArray.join(', ');

    const updates = columns
      .filter((col) => !conflictColArray.includes(col) && col !== 'id')
      .map((col) => `${col} = excluded.${col}`);

    // Optionally add updated_at if the table has that column
    if (updateTimestamp && !columns.includes('updated_at')) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
    }

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(${conflictClause}) DO UPDATE SET
        ${updates.join(', ')}
    `;

    return this.executeWrite(sql, values, tableName);
  }

  /**
   * Detect SQL operation type from query
   */
  private detectOperation(
    sql: string
  ): 'INSERT' | 'UPDATE' | 'DELETE' {
    const upperSql = sql.trim().toUpperCase();
    if (upperSql.startsWith('INSERT')) return 'INSERT';
    if (upperSql.startsWith('UPDATE')) return 'UPDATE';
    if (upperSql.startsWith('DELETE')) return 'DELETE';
    return 'UPDATE'; // Default for complex queries
  }

  /**
   * Get database file path
   */
  getPath(): string {
    return this.dbPath;
  }

  /**
   * Get database file size in bytes
   */
  getSize(): number {
    try {
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Checkpoint WAL file (merge into main database)
   */
  checkpoint(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
  }

  /**
   * Measure write latency (for performance testing)
   */
  measureWriteLatency(): number {
    const start = process.hrtime.bigint();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _latency_test (id INTEGER PRIMARY KEY, value TEXT);
      INSERT INTO _latency_test (value) VALUES ('test');
      DELETE FROM _latency_test;
    `);

    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // Convert to milliseconds
  }

  /**
   * Close database connection
   */
  close(): void {
    // Checkpoint before close to ensure all data is written
    this.checkpoint();
    this.db.close();
  }
}
