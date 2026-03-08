/**
 * SettingsManager - Centralized settings management singleton
 *
 * Provides:
 * - Type-safe get/set operations with Zod validation
 * - Event subscription for setting changes
 * - localStorage persistence with fallback
 * - IPC propagation for main process settings
 */

import {
  STORAGE_KEYS,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMAS,
  SettingsTypeMap,
  StorageKey,
} from './settingsSchema';
import { createLogger } from '../logger';

const logger = createLogger('SettingsManager');

// Browser-compatible event listener type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventListener = (event: any) => void;

// =============================================================================
// TYPES
// =============================================================================

export interface SettingChangeEvent<
  K extends keyof SettingsTypeMap = keyof SettingsTypeMap,
> {
  key: K;
  value: SettingsTypeMap[K];
  previousValue: SettingsTypeMap[K] | undefined;
}

export type SettingChangeCallback<K extends keyof SettingsTypeMap> = (
  event: SettingChangeEvent<K>
) => void;

// =============================================================================
// SETTINGS MANAGER
// =============================================================================

/**
 * Singleton class for managing application settings.
 *
 * Usage:
 *   const settings = SettingsManager.getInstance();
 *   const theme = settings.get(STORAGE_KEYS.APPEARANCE);
 *   settings.set(STORAGE_KEYS.APPEARANCE, { theme: 'dark', sidebarCollapsed: false });
 *   settings.onChange(STORAGE_KEYS.APPEARANCE, (event) => console.log('Theme changed:', event));
 */
export class SettingsManager {
  private static instance: SettingsManager | null = null;
  private cache: Map<string, unknown> = new Map();
  private initialized = false;
  private listeners: Map<string, Set<EventListener>> = new Map();

  private constructor() {
    // Browser-compatible - no EventEmitter needed
  }

  // Event emitter methods (browser-compatible implementation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private emit(eventName: string, event: any): void {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
  }

  private on(eventName: string, listener: EventListener): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName)!.add(listener);
  }

  private off(eventName: string, listener: EventListener): void {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  private removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (SettingsManager.instance) {
      SettingsManager.instance.removeAllListeners();
      SettingsManager.instance.cache.clear();
      SettingsManager.instance = null;
    }
  }

  /**
   * Initialize settings manager, loading all settings from localStorage
   */
  initialize(): void {
    if (this.initialized) return;

    // Pre-load all known settings into cache
    for (const key of Object.values(STORAGE_KEYS)) {
      try {
        this.loadFromStorage(key);
      } catch {
        // Use default if loading fails
      }
    }

    this.initialized = true;
  }

  /**
   * Get a setting value by key with type safety
   */
  get<K extends keyof SettingsTypeMap>(key: K): SettingsTypeMap[K] {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key) as SettingsTypeMap[K];
    }

    // Load from storage
    const value = this.loadFromStorage(key);
    return value as SettingsTypeMap[K];
  }

  /**
   * Set a setting value with validation and event emission
   */
  set<K extends keyof SettingsTypeMap>(key: K, value: SettingsTypeMap[K]): boolean {
    try {
      // Validate if schema exists
      const schema = SETTINGS_SCHEMAS[key];
      if (schema) {
        const result = schema.safeParse(value);
        if (!result.success) {
          logger.error(`Validation failed for ${key}: ${result.error}`);
          return false;
        }
      }

      // Get previous value for event
      const previousValue = this.cache.get(key) as SettingsTypeMap[K] | undefined;

      // Update cache
      this.cache.set(key, value);

      // Persist to storage
      this.saveToStorage(key, value);

      // Emit change event
      const event: SettingChangeEvent<K> = {
        key,
        value,
        previousValue,
      };
      this.emit(`change:${key}`, event);
      this.emit('change', event);

      return true;
    } catch (error) {
      logger.error(`Failed to set ${key}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Update a setting partially (merge with existing)
   */
  update<K extends keyof SettingsTypeMap>(
    key: K,
    updates: Partial<SettingsTypeMap[K]>
  ): boolean {
    const current = this.get(key);

    // Only merge if current is an object
    if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
      const merged = { ...current, ...updates } as SettingsTypeMap[K];
      return this.set(key, merged);
    }

    // For non-objects, just set the value
    return this.set(key, updates as SettingsTypeMap[K]);
  }

  /**
   * Remove a setting (revert to default)
   */
  remove<K extends keyof SettingsTypeMap>(key: K): void {
    try {
      const previousValue = this.cache.get(key) as SettingsTypeMap[K] | undefined;
      const defaultValue = SETTINGS_DEFAULTS[key] as SettingsTypeMap[K];

      // Remove from localStorage
      localStorage.removeItem(key);

      // Update cache to default
      this.cache.set(key, defaultValue);

      // Emit change event
      this.emit(`change:${key}`, {
        key,
        value: defaultValue,
        previousValue,
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Subscribe to changes for a specific setting
   */
  onChange<K extends keyof SettingsTypeMap>(
    key: K,
    callback: SettingChangeCallback<K>
  ): () => void {
    const eventName = `change:${key}`;
    this.on(eventName, callback);

    // Return unsubscribe function
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * Subscribe to all setting changes
   */
  onAnyChange(callback: (event: SettingChangeEvent) => void): () => void {
    this.on('change', callback);
    return () => {
      this.off('change', callback);
    };
  }

  /**
   * Check if a setting exists in storage
   */
  has(key: StorageKey): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Reset all settings to defaults
   */
  resetAll(): void {
    for (const key of Object.values(STORAGE_KEYS)) {
      this.remove(key as keyof SettingsTypeMap);
    }
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private loadFromStorage<K extends keyof SettingsTypeMap>(key: K): SettingsTypeMap[K] {
    try {
      const stored = localStorage.getItem(key);

      if (stored === null) {
        // Return default if no stored value
        const defaultValue = SETTINGS_DEFAULTS[key];
        if (defaultValue !== undefined) {
          this.cache.set(key, defaultValue);
          return defaultValue as SettingsTypeMap[K];
        }
        return undefined as unknown as SettingsTypeMap[K];
      }

      // Parse stored value
      let value: unknown;

      // Handle boolean stored as string
      if (stored === 'true' || stored === 'false') {
        value = stored === 'true';
      } else {
        try {
          value = JSON.parse(stored);
        } catch {
          // Not JSON, treat as string
          value = stored;
        }
      }

      // Validate if schema exists
      const schema = SETTINGS_SCHEMAS[key];
      if (schema) {
        const result = schema.safeParse(value);
        if (result.success) {
          this.cache.set(key, result.data);
          return result.data as SettingsTypeMap[K];
        } else {
          // Validation failed, use default
          const defaultValue = SETTINGS_DEFAULTS[key];
          if (defaultValue !== undefined) {
            this.cache.set(key, defaultValue);
            return defaultValue as SettingsTypeMap[K];
          }
        }
      }

      this.cache.set(key, value);
      return value as SettingsTypeMap[K];
    } catch {
      // Return default on error
      const defaultValue = SETTINGS_DEFAULTS[key];
      if (defaultValue !== undefined) {
        this.cache.set(key, defaultValue);
        return defaultValue as SettingsTypeMap[K];
      }
      return undefined as unknown as SettingsTypeMap[K];
    }
  }

  private saveToStorage<K extends keyof SettingsTypeMap>(
    key: K,
    value: SettingsTypeMap[K]
  ): void {
    try {
      // Handle primitives vs objects
      if (typeof value === 'boolean') {
        localStorage.setItem(key, String(value));
      } else if (typeof value === 'string') {
        localStorage.setItem(key, value);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      logger.error(`Failed to save ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const settingsManager = SettingsManager.getInstance();
