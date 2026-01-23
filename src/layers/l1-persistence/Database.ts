import BetterSqlite3, { Database as SQLiteDatabase } from 'better-sqlite3';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { DatabaseConfig as AppDatabaseConfig } from '../l0-utilities/AppConfig';

export interface DatabaseConfig {
  dbPath: string;
  migrationsPath?: string;
  verbose?: boolean;
  /** Performance settings from AppConfig */
  performance?: Partial<AppDatabaseConfig>;
  /** Idle checkpoint delay in ms (default: 5 minutes) */
  idleCheckpointMs?: number;
  /** WAL file size threshold for checkpoint in bytes (default: 100MB) */
  walCheckpointThreshold?: number;
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
// Default performance settings
const DEFAULT_CACHE_SIZE_KB = 64000; // 64MB
const DEFAULT_MMAP_SIZE_BYTES = 268435456; // 256MB
const DEFAULT_IDLE_CHECKPOINT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_WAL_CHECKPOINT_THRESHOLD = 100 * 1024 * 1024; // 100MB

// SQL identifier validation - prevents SQL injection via table/column names
const VALID_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate that a string is a safe SQL identifier (table or column name)
 * Prevents SQL injection through dynamic table/column names
 */
function validateSqlIdentifier(name: string, type: 'table' | 'column'): void {
  if (!VALID_SQL_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${type} name: "${name}". Must match pattern ${VALID_SQL_IDENTIFIER}`);
  }
}

export class Database extends EventEmitter {
  private db: SQLiteDatabase;
  private dbPath: string;
  private isInitialized: boolean = false;
  private readonly cacheSizeKb: number;
  private readonly mmapSizeBytes: number;
  private readonly walMode: boolean;
  private readonly idleCheckpointMs: number;
  private readonly walCheckpointThreshold: number;

  // Checkpoint management
  private idleCheckpointTimer: NodeJS.Timeout | null = null;
  private lastWriteTime: number = 0;
  private walCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: DatabaseConfig) {
    super();
    this.dbPath = config.dbPath;

    // Performance settings from config or defaults
    this.cacheSizeKb = config.performance?.cacheSizeKb ?? DEFAULT_CACHE_SIZE_KB;
    this.mmapSizeBytes = config.performance?.mmapSizeBytes ?? DEFAULT_MMAP_SIZE_BYTES;
    this.walMode = config.performance?.walMode ?? true;
    this.idleCheckpointMs = config.idleCheckpointMs ?? DEFAULT_IDLE_CHECKPOINT_MS;
    this.walCheckpointThreshold = config.walCheckpointThreshold ?? DEFAULT_WAL_CHECKPOINT_THRESHOLD;

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

    // Start checkpoint management if WAL mode is enabled
    if (this.walMode) {
      this.startCheckpointManagement();
    }
  }

  /**
   * Configure SQLite PRAGMAs for optimal performance
   */
  private configurePragmas(): void {
    // WAL mode for better concurrency (if enabled)
    if (this.walMode) {
      this.db.pragma('journal_mode = WAL');
    }

    // NORMAL sync for <1ms writes (safe with WAL)
    this.db.pragma('synchronous = NORMAL');

    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');

    // Configurable cache size for read performance (negative value = KB)
    this.db.pragma(`cache_size = -${this.cacheSizeKb}`);

    // Configurable memory-mapped I/O for faster reads
    this.db.pragma(`mmap_size = ${this.mmapSizeBytes}`);

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

    // Track write time for idle checkpoint
    this.recordWrite();

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
   * @param preserveColumns - Columns to preserve (not overwrite) if record exists. Uses COALESCE to keep existing value.
   */
  upsert(
    tableName: string,
    data: Record<string, unknown>,
    conflictColumns: string | string[] = 'external_id',
    updateTimestamp: boolean = true,
    preserveColumns: string[] = []
  ): BetterSqlite3.RunResult {
    // Validate identifiers to prevent SQL injection
    validateSqlIdentifier(tableName, 'table');
    const columns = Object.keys(data);
    columns.forEach(col => validateSqlIdentifier(col, 'column'));
    const conflictColArray = Array.isArray(conflictColumns) ? conflictColumns : [conflictColumns];
    conflictColArray.forEach(col => validateSqlIdentifier(col, 'column'));
    preserveColumns.forEach(col => validateSqlIdentifier(col, 'column'));
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const conflictClause = conflictColArray.join(', ');

    const updates = columns
      .filter((col) => !conflictColArray.includes(col) && col !== 'id')
      .map((col) => {
        // For preserved columns, use COALESCE to keep existing value if it was user-modified
        if (preserveColumns.includes(col)) {
          return `${col} = COALESCE(${tableName}.${col}, excluded.${col})`;
        }
        return `${col} = excluded.${col}`;
      });

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
   * Upsert that only updates specified columns (for sync operations)
   * On INSERT: inserts all provided data
   * On UPDATE: only updates the columns specified in updateColumns
   *
   * This ensures local-only fields are never overwritten by sync.
   *
   * @param tableName - Table name
   * @param data - Full data for insert
   * @param conflictColumns - Conflict column(s) for upsert
   * @param updateColumns - Only these columns will be updated on conflict (others preserved)
   */
  upsertSyncData(
    tableName: string,
    data: Record<string, unknown>,
    conflictColumns: string | string[] = 'external_id',
    updateColumns: string[]
  ): BetterSqlite3.RunResult {
    // Validate identifiers to prevent SQL injection
    validateSqlIdentifier(tableName, 'table');
    const columns = Object.keys(data);
    columns.forEach(col => validateSqlIdentifier(col, 'column'));
    const conflictColArray = Array.isArray(conflictColumns) ? conflictColumns : [conflictColumns];
    conflictColArray.forEach(col => validateSqlIdentifier(col, 'column'));
    updateColumns.forEach(col => validateSqlIdentifier(col, 'column'));

    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    const conflictClause = conflictColArray.join(', ');

    // Only update the specified columns (Canvas-provided data)
    const updates = updateColumns
      .filter(col => !conflictColArray.includes(col) && col !== 'id' && columns.includes(col))
      .map(col => `${col} = excluded.${col}`);

    // Always update updated_at
    updates.push('updated_at = CURRENT_TIMESTAMP');

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
    const result = this.db.pragma('wal_checkpoint(TRUNCATE)');
    this.emit('checkpoint', {
      result,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Start checkpoint management (idle and WAL size based)
   */
  private startCheckpointManagement(): void {
    // Check WAL file size every 60 seconds
    this.walCheckInterval = setInterval(() => {
      this.checkWalFileSize();
    }, 60000);

    // Schedule idle checkpoint check
    this.scheduleIdleCheckpoint();
  }

  /**
   * Schedule or reschedule idle checkpoint
   */
  private scheduleIdleCheckpoint(): void {
    if (this.idleCheckpointTimer) {
      clearTimeout(this.idleCheckpointTimer);
    }

    this.idleCheckpointTimer = setTimeout(() => {
      const timeSinceLastWrite = Date.now() - this.lastWriteTime;
      if (timeSinceLastWrite >= this.idleCheckpointMs) {
        this.performIdleCheckpoint();
      } else {
        // Reschedule for remaining time
        this.scheduleIdleCheckpoint();
      }
    }, this.idleCheckpointMs);
  }

  /**
   * Perform idle checkpoint
   */
  private performIdleCheckpoint(): void {
    try {
      this.checkpoint();
      this.emit('idle-checkpoint', {
        timestamp: new Date().toISOString(),
        idleDurationMs: Date.now() - this.lastWriteTime,
      });
    } catch (error) {
      this.emit('checkpoint-error', {
        type: 'idle',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check WAL file size and checkpoint if above threshold
   */
  private checkWalFileSize(): void {
    const walPath = `${this.dbPath}-wal`;
    try {
      if (!fs.existsSync(walPath)) return;

      const stats = fs.statSync(walPath);
      if (stats.size >= this.walCheckpointThreshold) {
        this.checkpoint();
        this.emit('wal-size-checkpoint', {
          timestamp: new Date().toISOString(),
          walSizeBytes: stats.size,
          threshold: this.walCheckpointThreshold,
        });
      }
    } catch (error) {
      // Ignore errors - WAL file may not exist
    }
  }

  /**
   * Record write time (called after every write operation)
   */
  private recordWrite(): void {
    this.lastWriteTime = Date.now();
    this.scheduleIdleCheckpoint();
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
    // Clear checkpoint management timers
    if (this.idleCheckpointTimer) {
      clearTimeout(this.idleCheckpointTimer);
      this.idleCheckpointTimer = null;
    }
    if (this.walCheckInterval) {
      clearInterval(this.walCheckInterval);
      this.walCheckInterval = null;
    }

    // Checkpoint before close to ensure all data is written
    // Use try-finally to ensure db.close() is always called even if checkpoint fails
    try {
      this.checkpoint();
    } catch (error) {
      // Log but don't throw - we still need to close the connection
      this.emit('checkpoint-error', {
        type: 'close',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.db.close();
    }
  }
}
