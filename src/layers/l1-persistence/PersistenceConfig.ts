/**
 * Layer 1: Persistence Configuration
 *
 * Configuration types and defaults for the persistence layer.
 */

export interface DatabaseConfig {
  /** SQLite cache size in KB */
  cacheSizeKb: number;
  /** Memory-mapped I/O size in bytes */
  mmapSizeBytes: number;
  /** Enable WAL mode */
  walMode: boolean;
}

export interface PersistenceConfig {
  database: DatabaseConfig;
  /** Default target grade for new courses */
  defaultTargetGrade: number;
}

export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  database: {
    cacheSizeKb: 64000, // 64MB
    mmapSizeBytes: 268435456, // 256MB
    walMode: true,
  },
  defaultTargetGrade: 85.0,
};
