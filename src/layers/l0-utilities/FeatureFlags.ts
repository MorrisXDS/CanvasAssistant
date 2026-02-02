/**
 * FeatureFlags - Hybrid TypeScript + SQLite Feature Flag System
 *
 * Provides type-safe feature flags with:
 * - Compile-time flag definitions
 * - Runtime overrides via SQLite
 * - Percentage-based rollouts
 * - Development/production modes
 */

import { EventEmitter } from 'events';
import type { Database } from '../l1-persistence/Database';
import { Logger, ComponentLogger } from './Logger';

/**
 * Flag types for different use cases.
 */
export enum FlagType {
  BOOLEAN = 'boolean',
  PERCENTAGE = 'percentage',
  STRING = 'string',
  NUMBER = 'number',
}

/**
 * Flag category for organization.
 */
export enum FlagCategory {
  EXPERIMENTAL = 'experimental',
  PERFORMANCE = 'performance',
  UI = 'ui',
  SYNC = 'sync',
  DEBUG = 'debug',
}

/**
 * Definition of a single feature flag.
 */
export interface FlagDefinition<T = unknown> {
  key: string;
  type: FlagType;
  defaultValue: T;
  category: FlagCategory;
  description: string;
  addedVersion: string;
  /** If true, flag is hidden from UI */
  internal?: boolean;
}

/**
 * All feature flag definitions.
 * This is the single source of truth for available flags.
 */
export const FLAG_DEFINITIONS = {
  // Experimental features
  'experimental.smart_priority_v2': {
    key: 'experimental.smart_priority_v2',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.EXPERIMENTAL,
    description: 'Enable smart priority v2 algorithm with ML-based predictions',
    addedVersion: '1.2.0',
  },
  'experimental.ai_suggestions': {
    key: 'experimental.ai_suggestions',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.EXPERIMENTAL,
    description: 'Enable AI-powered task suggestions',
    addedVersion: '1.2.0',
  },
  'experimental.grade_predictions': {
    key: 'experimental.grade_predictions',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.EXPERIMENTAL,
    description: 'Enable grade prediction based on historical data',
    addedVersion: '1.2.0',
  },

  // Performance features
  'performance.lazy_load_tasks': {
    key: 'performance.lazy_load_tasks',
    type: FlagType.BOOLEAN,
    defaultValue: true,
    category: FlagCategory.PERFORMANCE,
    description: 'Lazy load tasks instead of fetching all at once',
    addedVersion: '1.2.0',
  },
  'performance.virtualize_lists': {
    key: 'performance.virtualize_lists',
    type: FlagType.BOOLEAN,
    defaultValue: true,
    category: FlagCategory.PERFORMANCE,
    description: 'Use virtualization for long lists',
    addedVersion: '1.2.0',
  },
  'performance.cache_ttl_seconds': {
    key: 'performance.cache_ttl_seconds',
    type: FlagType.NUMBER,
    defaultValue: 300,
    category: FlagCategory.PERFORMANCE,
    description: 'Cache TTL in seconds for API responses',
    addedVersion: '1.2.0',
  },

  // UI features
  'ui.dark_mode': {
    key: 'ui.dark_mode',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.UI,
    description: 'Enable dark mode theme',
    addedVersion: '1.2.0',
  },
  'ui.compact_view': {
    key: 'ui.compact_view',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.UI,
    description: 'Use compact view for task lists',
    addedVersion: '1.2.0',
  },
  'ui.calendar_week_start': {
    key: 'ui.calendar_week_start',
    type: FlagType.STRING,
    defaultValue: 'sunday',
    category: FlagCategory.UI,
    description: 'First day of the week in calendar view',
    addedVersion: '1.2.0',
  },

  // Sync features
  'sync.batch_size': {
    key: 'sync.batch_size',
    type: FlagType.NUMBER,
    defaultValue: 50,
    category: FlagCategory.SYNC,
    description: 'Number of items to sync per batch',
    addedVersion: '1.2.0',
  },
  'sync.auto_sync_interval_minutes': {
    key: 'sync.auto_sync_interval_minutes',
    type: FlagType.NUMBER,
    defaultValue: 15,
    category: FlagCategory.SYNC,
    description: 'Auto-sync interval in minutes (0 to disable)',
    addedVersion: '1.2.0',
  },

  // Debug features
  'debug.verbose_logging': {
    key: 'debug.verbose_logging',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.DEBUG,
    description: 'Enable verbose debug logging',
    addedVersion: '1.2.0',
    internal: true,
  },
  'debug.show_priority_scores': {
    key: 'debug.show_priority_scores',
    type: FlagType.BOOLEAN,
    defaultValue: false,
    category: FlagCategory.DEBUG,
    description: 'Show priority scores in task list',
    addedVersion: '1.2.0',
  },
} as const;

/**
 * Type for flag keys (compile-time safety).
 */
export type FlagKey = keyof typeof FLAG_DEFINITIONS;

/**
 * Get the value type for a specific flag.
 */
export type FlagValue<K extends FlagKey> = (typeof FLAG_DEFINITIONS)[K]['defaultValue'];

/**
 * Options for FeatureFlags service.
 */
export interface FeatureFlagsOptions {
  /** SQLite database for persistence */
  db?: Database;
  /** Enable development mode (all experimental flags enabled) */
  devMode?: boolean;
  /** User ID for percentage-based rollouts */
  userId?: string;
  /** Logger for error/warning messages */
  logger?: Logger;
}

/**
 * Stored flag override.
 */
interface FlagOverride {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * FeatureFlags - Core service for feature flag management.
 *
 * Usage:
 * ```typescript
 * const flags = new FeatureFlags({ db });
 *
 * if (flags.isEnabled('experimental.smart_priority_v2')) {
 *   // Use new algorithm
 * }
 *
 * const ttl = flags.get('performance.cache_ttl_seconds');
 * ```
 */
export class FeatureFlags extends EventEmitter {
  private readonly db?: Database;
  private readonly devMode: boolean;
  private readonly userId: string;
  private readonly overrides: Map<string, unknown> = new Map();
  private readonly log: ComponentLogger | null;
  private initialized = false;

  constructor(options: FeatureFlagsOptions = {}) {
    super();
    this.db = options.db;
    this.devMode = options.devMode ?? false;
    this.userId = options.userId ?? 'default';
    this.log = options.logger?.child('featureFlags') ?? null;
  }

  /**
   * Initialize the feature flags service.
   * Creates the feature_flags table if needed and loads overrides.
   */
  initialize(): void {
    if (this.initialized) return;

    if (this.db) {
      // Create table if not exists
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS feature_flags (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Load overrides from database
      this.loadOverrides();
    }

    this.initialized = true;
    this.emit('initialized');
  }

  /**
   * Check if a boolean flag is enabled.
   */
  isEnabled<K extends FlagKey>(key: K): boolean {
    const def = FLAG_DEFINITIONS[key];
    if (def.type !== FlagType.BOOLEAN) {
      this.log?.warn(`Flag '${key}' is not a boolean flag`);
      return false;
    }

    // Check for override
    if (this.overrides.has(key)) {
      return this.overrides.get(key) === true;
    }

    // In dev mode, enable all experimental flags
    if (this.devMode && def.category === FlagCategory.EXPERIMENTAL) {
      return true;
    }

    return def.defaultValue as boolean;
  }

  /**
   * Get the value of any flag.
   */
  get<K extends FlagKey>(key: K): FlagValue<K> {
    const def = FLAG_DEFINITIONS[key];

    // Check for override
    if (this.overrides.has(key)) {
      return this.overrides.get(key) as FlagValue<K>;
    }

    // In dev mode, enable all experimental flags
    if (
      this.devMode &&
      def.category === FlagCategory.EXPERIMENTAL &&
      def.type === FlagType.BOOLEAN
    ) {
      return true as FlagValue<K>;
    }

    return def.defaultValue as FlagValue<K>;
  }

  /**
   * Set a flag value (persisted to database).
   */
  set<K extends FlagKey>(key: K, value: FlagValue<K>): void {
    const def = FLAG_DEFINITIONS[key];
    if (!def) {
      this.log?.warn(`Unknown flag '${key}'`);
      return;
    }

    // Validate type
    const valid = this.validateValue(key, value);
    if (!valid) {
      this.log?.warn(`Invalid value for flag '${key}'`);
      return;
    }

    // Update in-memory
    this.overrides.set(key, value);

    // Persist to database
    if (this.db) {
      const serialized = this.serializeValue(value);
      this.db.executeWrite(
        `INSERT OR REPLACE INTO feature_flags (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        [key, serialized],
        'feature_flags'
      );
    }

    this.emit('flag-changed', { key, value, previousValue: def.defaultValue });
  }

  /**
   * Reset a flag to its default value.
   */
  reset<K extends FlagKey>(key: K): void {
    this.overrides.delete(key);

    if (this.db) {
      this.db.executeWrite(
        'DELETE FROM feature_flags WHERE key = ?',
        [key],
        'feature_flags'
      );
    }

    const def = FLAG_DEFINITIONS[key];
    this.emit('flag-changed', { key, value: def.defaultValue, previousValue: undefined });
  }

  /**
   * Reset all flags to defaults.
   */
  resetAll(): void {
    this.overrides.clear();

    if (this.db) {
      this.db.executeWrite('DELETE FROM feature_flags', [], 'feature_flags');
    }

    this.emit('all-flags-reset');
  }

  /**
   * Get all flag definitions.
   */
  getDefinitions(): typeof FLAG_DEFINITIONS {
    return FLAG_DEFINITIONS;
  }

  /**
   * Get all current flag values.
   */
  getAllValues(): Record<FlagKey, unknown> {
    const values: Record<string, unknown> = {};
    for (const key of Object.keys(FLAG_DEFINITIONS) as FlagKey[]) {
      values[key] = this.get(key);
    }
    return values as Record<FlagKey, unknown>;
  }

  /**
   * Get flags by category.
   */
  getByCategory(
    category: FlagCategory
  ): Array<FlagDefinition & { currentValue: unknown }> {
    return (Object.values(FLAG_DEFINITIONS) as FlagDefinition[])
      .filter((def) => def.category === category && !def.internal)
      .map((def) => ({
        ...def,
        currentValue: this.get(def.key as FlagKey),
      }));
  }

  /**
   * Check if a user should see a percentage-rolled-out feature.
   */
  isEnabledForPercentage(key: FlagKey, percentage: number): boolean {
    // Hash user ID to get a consistent percentage bucket
    const hash = this.hashUserId(this.userId);
    const bucket = hash % 100;
    return bucket < percentage;
  }

  /**
   * Load overrides from database.
   */
  private loadOverrides(): void {
    if (!this.db) return;

    try {
      const rows = this.db.executeRead<FlagOverride>(
        'SELECT key, value FROM feature_flags'
      );

      for (const row of rows) {
        const def = FLAG_DEFINITIONS[row.key as FlagKey];
        if (!def) continue;

        const value = this.deserializeValue(row.value, def.type);
        this.overrides.set(row.key, value);
      }
    } catch (error) {
      this.log?.error(
        'Failed to load overrides',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Validate a value against its flag type.
   */
  private validateValue<K extends FlagKey>(key: K, value: unknown): boolean {
    const def = FLAG_DEFINITIONS[key];
    const flagType = def.type as FlagType;

    switch (flagType) {
      case FlagType.BOOLEAN:
        return typeof value === 'boolean';
      case FlagType.NUMBER:
        return typeof value === 'number' && !isNaN(value);
      case FlagType.STRING:
        return typeof value === 'string';
      case FlagType.PERCENTAGE:
        return typeof value === 'number' && value >= 0 && value <= 100;
      default:
        return false;
    }
  }

  /**
   * Serialize a value for database storage.
   */
  private serializeValue(value: unknown): string {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return String(value);
  }

  /**
   * Deserialize a value from database.
   */
  private deserializeValue(value: string, type: FlagType): unknown {
    switch (type) {
      case FlagType.BOOLEAN:
        return value === 'true';
      case FlagType.NUMBER:
      case FlagType.PERCENTAGE:
        return parseFloat(value);
      case FlagType.STRING:
      default:
        return value;
    }
  }

  /**
   * Hash user ID to a number for percentage bucketing.
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
