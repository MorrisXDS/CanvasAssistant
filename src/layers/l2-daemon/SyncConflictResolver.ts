/**
 * Sync Conflict Resolver
 *
 * Handles conflicts between Canvas data and locally modified data.
 * - Fields Canvas doesn't provide → Always preserved
 * - Fields Canvas provides but user modified → Queued for user decision
 */

import { EventEmitter } from 'events';
import { Database } from '../l1-persistence/Database';
import { isCanvasField } from './CanvasFieldMappings';

export interface SyncConflict {
  id: string;
  entity: 'course' | 'task' | 'notification';
  entityId: number;
  externalId: string;
  entityName: string; // Human readable name (course name, task title)
  field: string;
  fieldLabel: string; // Human readable field name
  localValue: unknown;
  canvasValue: unknown;
  timestamp: string;
}

export interface ConflictResolution {
  conflictId: string;
  useCanvasValue: boolean;
  rememberChoice: boolean; // Remember for this field on this entity
  rememberForAll: boolean; // Remember for this field on all entities of this type
}

export interface SyncPreference {
  entity: 'course' | 'task' | 'notification';
  entityId: number | null; // null = applies to all entities of this type
  field: string;
  preferCanvas: boolean;
  createdAt: string;
}

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  target_grade: 'Target Grade',
  color: 'Course Color',
  nickname: 'Course Nickname',
  is_hidden: 'Hidden Status',
  assessed_grade: 'Assessed Grade',
  weight: 'Assignment Weight',
  priority_score: 'Priority Score',
  grade: 'Grade',
  task_type: 'Task Type',
  task_group_id: 'Task Group',
  current_grade: 'Current Grade',
  title: 'Title',
  description: 'Description',
  due_at: 'Due Date',
  name: 'Name',
  code: 'Course Code',
};

export class SyncConflictResolver extends EventEmitter {
  private db: Database;
  private pendingConflicts: Map<string, SyncConflict> = new Map();
  private preferences: SyncPreference[] = [];
  private conflictIdCounter = 0;

  constructor(db: Database) {
    super();
    this.db = db;
    this.loadPreferences();
    this.loadPendingConflicts();
  }

  /**
   * Load pending conflicts from database (survives app crashes)
   */
  private loadPendingConflicts(): void {
    try {
      const rows = this.db.executeRead<{
        conflict_id: string;
        entity: 'course' | 'task' | 'notification';
        entity_id: number;
        external_id: string;
        entity_name: string;
        field: string;
        field_label: string;
        local_value: string;
        canvas_value: string;
        timestamp: string;
      }>('SELECT * FROM pending_sync_conflicts');

      for (const row of rows) {
        const conflict: SyncConflict = {
          id: row.conflict_id,
          entity: row.entity,
          entityId: row.entity_id,
          externalId: row.external_id,
          entityName: row.entity_name,
          field: row.field,
          fieldLabel: row.field_label,
          localValue: JSON.parse(row.local_value),
          canvasValue: JSON.parse(row.canvas_value),
          timestamp: row.timestamp,
        };
        this.pendingConflicts.set(conflict.id, conflict);

        // Update counter to avoid ID collisions
        const match = conflict.id.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > this.conflictIdCounter) {
            this.conflictIdCounter = num;
          }
        }
      }
    } catch {
      // Table might not exist yet
      this.pendingConflicts = new Map();
    }
  }

  /**
   * Save a pending conflict to database
   */
  private savePendingConflict(conflict: SyncConflict): void {
    try {
      this.db.executeWrite(
        `INSERT OR REPLACE INTO pending_sync_conflicts
         (conflict_id, entity, entity_id, external_id, entity_name, field, field_label, local_value, canvas_value, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conflict.id,
          conflict.entity,
          conflict.entityId,
          conflict.externalId,
          conflict.entityName,
          conflict.field,
          conflict.fieldLabel,
          JSON.stringify(conflict.localValue),
          JSON.stringify(conflict.canvasValue),
          conflict.timestamp,
        ],
        'pending_sync_conflicts'
      );
    } catch (_error) {
      // Silently fail - in-memory still works as fallback
    }
  }

  /**
   * Delete a pending conflict from database
   */
  private deletePendingConflict(conflictId: string): void {
    try {
      this.db.executeWrite(
        'DELETE FROM pending_sync_conflicts WHERE conflict_id = ?',
        [conflictId],
        'pending_sync_conflicts'
      );
    } catch {
      // Ignore - might not exist
    }
  }

  /**
   * Load saved sync preferences from database
   */
  private loadPreferences(): void {
    try {
      // Use aliases to map snake_case DB columns to camelCase interface properties
      const rows = this.db.executeRead<SyncPreference>(
        `SELECT
          entity,
          entity_id as entityId,
          field,
          prefer_canvas as preferCanvas,
          created_at as createdAt
         FROM sync_preferences`
      );
      this.preferences = rows;
    } catch {
      // Table might not exist yet - that's ok
      this.preferences = [];
    }
  }

  /**
   * Reload preferences from database (call after external changes)
   */
  reloadPreferences(): void {
    this.loadPreferences();
  }

  /**
   * Ensure sync_preferences and pending_sync_conflicts tables exist
   */
  ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        field TEXT NOT NULL,
        prefer_canvas INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity, entity_id, field)
      )
    `);

    // Create pending_sync_conflicts table to persist conflicts across app restarts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_sync_conflicts (
        conflict_id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        field TEXT NOT NULL,
        field_label TEXT NOT NULL,
        local_value TEXT NOT NULL,
        canvas_value TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add prefer_canvas column if table was created without it
    try {
      this.db.exec('ALTER TABLE sync_preferences ADD COLUMN prefer_canvas INTEGER NOT NULL DEFAULT 1');
    } catch { /* Column might already exist */ }

    // Note: local_modified_fields columns are now added via migration 49
    // Removed duplicate ALTER TABLE statements that caused migration errors
  }

  /**
   * Check if a field is provided by Canvas for an entity type.
   * Delegates to CanvasFieldMappings for single source of truth.
   */
  isCanvasProvidedField(entity: string, field: string): boolean {
    return isCanvasField(entity, field);
  }

  /**
   * Get user's saved preference for a conflict
   */
  getPreference(
    entity: 'course' | 'task' | 'notification',
    entityId: number,
    field: string
  ): SyncPreference | null {
    // First check for entity-specific preference
    const specific = this.preferences.find(
      p => p.entity === entity && p.entityId === entityId && p.field === field
    );
    if (specific) return specific;

    // Then check for global preference for this entity type + field
    const global = this.preferences.find(
      p => p.entity === entity && p.entityId === null && p.field === field
    );
    return global || null;
  }

  /**
   * Detect conflicts between local and Canvas data
   * Returns fields that need user decision
   *
   * Field source handling:
   * - 'canvas': Accept Canvas updates (no conflict)
   * - 'user': Create conflict if values differ (user explicitly set this)
   * - 'guessed': Accept Canvas updates silently if allow_guessed_override is true
   */
  detectConflicts(
    entity: 'course' | 'task' | 'notification',
    tableName: string,
    entityId: number,
    externalId: string,
    entityName: string,
    localRecord: Record<string, unknown> | undefined,
    canvasData: Record<string, unknown>,
    options?: { allowGuessedOverride?: boolean }
  ): {
    autoResolved: Record<string, unknown>;
    conflicts: SyncConflict[];
    preservedFields: string[];
  } {
    const autoResolved: Record<string, unknown> = {};
    const conflicts: SyncConflict[] = [];
    const preservedFields: string[] = [];

    if (!localRecord) {
      // New record - no conflicts, use all Canvas data
      return { autoResolved: canvasData, conflicts: [], preservedFields: [] };
    }

    // Get locally modified fields (legacy tracking)
    const localModifiedStr = localRecord.local_modified_fields as string | null;
    const localModifiedFields = new Set<string>(
      localModifiedStr ? JSON.parse(localModifiedStr) : []
    );

    // Get field sources (new tracking)
    const fieldSourcesStr = localRecord.field_sources as string | null;
    const fieldSources: Record<string, 'canvas' | 'user' | 'guessed'> =
      fieldSourcesStr ? JSON.parse(fieldSourcesStr) : {};

    // Check if guessed override is allowed (default true)
    const allowGuessedOverride = options?.allowGuessedOverride ?? true;

    for (const [field, canvasValue] of Object.entries(canvasData)) {
      if (field === 'id' || field === 'external_id' || field === 'local_modified_fields' || field === 'field_sources') {
        continue;
      }

      const localValue = localRecord[field];
      const isCanvasProvided = this.isCanvasProvidedField(tableName, field);
      const fieldSource = fieldSources[field];

      if (!isCanvasProvided) {
        // Canvas doesn't provide this field - always preserve local value
        preservedFields.push(field);
        continue;
      }

      // Check field source first (new system)
      if (fieldSource === 'canvas') {
        // Field came from Canvas - always accept Canvas updates
        autoResolved[field] = canvasValue;
        continue;
      }

      if (fieldSource === 'guessed') {
        // Field was auto-filled/guessed
        if (allowGuessedOverride) {
          // Canvas can override guessed values silently
          autoResolved[field] = canvasValue;
          continue;
        }
        // If override not allowed, treat as user-set and fall through to conflict check
      }

      // Canvas provides this field - check modification status
      const isModified = fieldSource === 'user' || localModifiedFields.has(field);

      if (!isModified) {
        // User hasn't modified this field - use Canvas value
        autoResolved[field] = canvasValue;
        continue;
      }

      // User has modified this field - check for actual difference
      if (this.valuesEqual(localValue, canvasValue)) {
        // Values are the same - no conflict
        autoResolved[field] = canvasValue;
        continue;
      }

      // Values differ - check for saved preference
      const pref = this.getPreference(entity, entityId, field);
      if (pref) {
        // User has a saved preference
        autoResolved[field] = pref.preferCanvas ? canvasValue : localValue;
        if (!pref.preferCanvas) {
          preservedFields.push(field);
        }
        continue;
      }

      // No preference - create conflict for user decision
      const conflictId = `${entity}-${externalId}-${field}-${++this.conflictIdCounter}`;
      const conflict: SyncConflict = {
        id: conflictId,
        entity,
        entityId,
        externalId,
        entityName,
        field,
        fieldLabel: FIELD_LABELS[field] || field,
        localValue,
        canvasValue,
        timestamp: new Date().toISOString(),
      };

      conflicts.push(conflict);
      this.pendingConflicts.set(conflictId, conflict);
      // Persist conflict to database so it survives app restart
      this.savePendingConflict(conflict);
    }

    return { autoResolved, conflicts, preservedFields };
  }

  /**
   * Compare two values for equality
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null && b === undefined) return true;
    if (a === undefined && b === null) return true;
    if (typeof a === 'number' && typeof b === 'number') {
      return Math.abs(a - b) < 0.0001;
    }
    if (typeof a === 'string' && typeof b === 'string') {
      return a.trim() === b.trim();
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Get all pending conflicts
   */
  getPendingConflicts(): SyncConflict[] {
    return Array.from(this.pendingConflicts.values());
  }

  /**
   * Resolve a conflict with user's decision
   */
  resolveConflict(resolution: ConflictResolution): { field: string; value: unknown } | null {
    const conflict = this.pendingConflicts.get(resolution.conflictId);
    if (!conflict) return null;

    // Save preference if requested
    if (resolution.rememberChoice || resolution.rememberForAll) {
      this.savePreference({
        entity: conflict.entity,
        entityId: resolution.rememberForAll ? null : conflict.entityId,
        field: conflict.field,
        preferCanvas: resolution.useCanvasValue,
        createdAt: new Date().toISOString(),
      });
    }

    // Remove from pending (both memory and database)
    this.pendingConflicts.delete(resolution.conflictId);
    this.deletePendingConflict(resolution.conflictId);

    return {
      field: conflict.field,
      value: resolution.useCanvasValue ? conflict.canvasValue : conflict.localValue,
    };
  }

  /**
   * Resolve all pending conflicts with a batch decision
   */
  resolveAllConflicts(useCanvasValues: boolean): Array<{ field: string; value: unknown }> {
    const results: Array<{ field: string; value: unknown }> = [];

    for (const [id, conflict] of this.pendingConflicts) {
      results.push({
        field: conflict.field,
        value: useCanvasValues ? conflict.canvasValue : conflict.localValue,
      });
      // Delete from database
      this.deletePendingConflict(id);
    }

    this.pendingConflicts.clear();
    return results;
  }

  /**
   * Save a sync preference
   */
  private savePreference(pref: SyncPreference): void {
    this.db.executeWrite(
      `INSERT INTO sync_preferences (entity, entity_id, field, prefer_canvas, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(entity, entity_id, field) DO UPDATE SET
         prefer_canvas = excluded.prefer_canvas`,
      [pref.entity, pref.entityId, pref.field, pref.preferCanvas ? 1 : 0, pref.createdAt],
      'sync_preferences'
    );

    // Update local cache
    const existing = this.preferences.findIndex(
      p => p.entity === pref.entity && p.entityId === pref.entityId && p.field === pref.field
    );
    if (existing >= 0) {
      this.preferences[existing] = pref;
    } else {
      this.preferences.push(pref);
    }
  }

  /**
   * Mark a field as locally modified
   */
  markFieldModified(
    tableName: string,
    entityId: number,
    field: string
  ): void {
    const record = this.db.executeReadOne<{ local_modified_fields: string | null }>(
      `SELECT local_modified_fields FROM ${tableName} WHERE id = ?`,
      [entityId]
    );

    const modified = new Set<string>(
      record?.local_modified_fields ? JSON.parse(record.local_modified_fields) : []
    );
    modified.add(field);

    this.db.executeWrite(
      `UPDATE ${tableName} SET local_modified_fields = ? WHERE id = ?`,
      [JSON.stringify(Array.from(modified)), entityId],
      tableName
    );
  }

  /**
   * Clear a field's modified status (after user chooses to use Canvas value)
   */
  clearFieldModified(
    tableName: string,
    entityId: number,
    field: string
  ): void {
    const record = this.db.executeReadOne<{ local_modified_fields: string | null }>(
      `SELECT local_modified_fields FROM ${tableName} WHERE id = ?`,
      [entityId]
    );

    if (!record?.local_modified_fields) return;

    const modified = new Set<string>(JSON.parse(record.local_modified_fields));
    modified.delete(field);

    this.db.executeWrite(
      `UPDATE ${tableName} SET local_modified_fields = ? WHERE id = ?`,
      [modified.size > 0 ? JSON.stringify(Array.from(modified)) : null, entityId],
      tableName
    );
  }

  /**
   * Get all saved preferences
   */
  getAllPreferences(): SyncPreference[] {
    return [...this.preferences];
  }

  /**
   * Delete a saved preference
   */
  deletePreference(entity: string, entityId: number | null, field: string): void {
    this.db.executeWrite(
      'DELETE FROM sync_preferences WHERE entity = ? AND entity_id IS ? AND field = ?',
      [entity, entityId, field],
      'sync_preferences'
    );

    this.preferences = this.preferences.filter(
      p => !(p.entity === entity && p.entityId === entityId && p.field === field)
    );
  }

  /**
   * Clear all preferences
   */
  clearAllPreferences(): void {
    this.db.executeWrite('DELETE FROM sync_preferences', [], 'sync_preferences');
    this.preferences = [];
  }

  /**
   * Set the source for a field value
   * @param tableName - 'tasks' or 'courses'
   * @param entityId - The record ID
   * @param field - Field name
   * @param source - 'canvas', 'user', or 'guessed'
   */
  setFieldSource(
    tableName: string,
    entityId: number,
    field: string,
    source: 'canvas' | 'user' | 'guessed'
  ): void {
    const record = this.db.executeReadOne<{ field_sources: string | null }>(
      `SELECT field_sources FROM ${tableName} WHERE id = ?`,
      [entityId]
    );

    const sources: Record<string, string> = record?.field_sources
      ? JSON.parse(record.field_sources)
      : {};
    sources[field] = source;

    this.db.executeWrite(
      `UPDATE ${tableName} SET field_sources = ? WHERE id = ?`,
      [JSON.stringify(sources), entityId],
      tableName
    );

    // If marking as 'user', also add to local_modified_fields for backwards compatibility
    if (source === 'user') {
      this.markFieldModified(tableName, entityId, field);
    }
  }

  /**
   * Set multiple field sources at once
   */
  setFieldSources(
    tableName: string,
    entityId: number,
    sources: Record<string, 'canvas' | 'user' | 'guessed'>
  ): void {
    const record = this.db.executeReadOne<{ field_sources: string | null }>(
      `SELECT field_sources FROM ${tableName} WHERE id = ?`,
      [entityId]
    );

    const existing: Record<string, string> = record?.field_sources
      ? JSON.parse(record.field_sources)
      : {};
    const updated = { ...existing, ...sources };

    this.db.executeWrite(
      `UPDATE ${tableName} SET field_sources = ? WHERE id = ?`,
      [JSON.stringify(updated), entityId],
      tableName
    );

    // Update local_modified_fields for backwards compatibility
    for (const [field, source] of Object.entries(sources)) {
      if (source === 'user') {
        this.markFieldModified(tableName, entityId, field);
      }
    }
  }

  /**
   * Get the source for a field value
   */
  getFieldSource(
    tableName: string,
    entityId: number,
    field: string
  ): 'canvas' | 'user' | 'guessed' | null {
    const record = this.db.executeReadOne<{ field_sources: string | null }>(
      `SELECT field_sources FROM ${tableName} WHERE id = ?`,
      [entityId]
    );

    if (!record?.field_sources) return null;

    const sources = JSON.parse(record.field_sources);
    return sources[field] || null;
  }

  /**
   * Get all field sources for an entity
   */
  getFieldSources(
    tableName: string,
    entityId: number
  ): Record<string, 'canvas' | 'user' | 'guessed'> {
    const record = this.db.executeReadOne<{ field_sources: string | null }>(
      `SELECT field_sources FROM ${tableName} WHERE id = ?`,
      [entityId]
    );

    return record?.field_sources ? JSON.parse(record.field_sources) : {};
  }
}
