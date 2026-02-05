/**
 * Sync Conflict Resolver
 *
 * Handles conflicts between Canvas data and locally modified data.
 * - Fields Canvas doesn't provide → Always preserved
 * - Fields Canvas provides but user modified → Queued for user decision
 */

import { EventEmitter } from 'events';
import { Database } from '../l1-persistence/Database';
import { isCanvasField, isAuthoritativeField } from './CanvasFieldMappings';
import type { TaskTypeFieldSource } from '../l1-persistence/DatabaseRowTypes';

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
  courseName?: string; // Course name for task/notification conflicts
  courseId?: number; // Course ID for task/notification conflicts
}

export interface ConflictResolution {
  conflictId: string;
  useCanvasValue: boolean;
  rememberChoice: boolean; // Remember for this field on this entity
  rememberForAll: boolean; // Remember for this field on all entities of this type
  expiresAt?: string | null; // ISO date when preference expires (null = never)
}

export interface SyncPreference {
  entity: 'course' | 'task' | 'notification';
  entityId: number | null; // null = applies to all entities of this type
  field: string;
  preferCanvas: boolean;
  createdAt: string;
  expiresAt: string | null; // ISO date when preference expires (null = never)
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
        course_name: string | null;
        course_id: number | null;
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
          courseName: row.course_name || undefined,
          courseId: row.course_id || undefined,
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
         (conflict_id, entity, entity_id, external_id, entity_name, field, field_label, local_value, canvas_value, timestamp, course_name, course_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          conflict.courseName || null,
          conflict.courseId || null,
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
          created_at as createdAt,
          expires_at as expiresAt
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
        course_name TEXT,
        course_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add course columns if table was created without them
    try {
      this.db.exec('ALTER TABLE pending_sync_conflicts ADD COLUMN course_name TEXT');
    } catch {
      /* Column might already exist */
    }
    try {
      this.db.exec('ALTER TABLE pending_sync_conflicts ADD COLUMN course_id INTEGER');
    } catch {
      /* Column might already exist */
    }

    // Add prefer_canvas column if table was created without it
    try {
      this.db.exec(
        'ALTER TABLE sync_preferences ADD COLUMN prefer_canvas INTEGER NOT NULL DEFAULT 1'
      );
    } catch {
      /* Column might already exist */
    }

    // Add expires_at column for preference expiration
    try {
      this.db.exec(
        'ALTER TABLE sync_preferences ADD COLUMN expires_at TEXT DEFAULT NULL'
      );
    } catch {
      /* Column might already exist */
    }

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
   * Check if a preference has expired
   */
  private isPreferenceExpired(pref: SyncPreference): boolean {
    if (!pref.expiresAt) return false; // No expiration = never expires
    return new Date(pref.expiresAt) < new Date();
  }

  /**
   * Get user's saved preference for a conflict
   * Returns null if preference has expired
   */
  getPreference(
    entity: 'course' | 'task' | 'notification',
    entityId: number,
    field: string
  ): SyncPreference | null {
    // First check for entity-specific preference
    const specific = this.preferences.find(
      (p) => p.entity === entity && p.entityId === entityId && p.field === field
    );
    if (specific) {
      if (this.isPreferenceExpired(specific)) {
        // Preference expired - delete it and return null
        this.deletePreference(entity, entityId, field);
        return null;
      }
      return specific;
    }

    // Then check for global preference for this entity type + field
    const global = this.preferences.find(
      (p) => p.entity === entity && p.entityId === null && p.field === field
    );
    if (global) {
      if (this.isPreferenceExpired(global)) {
        // Preference expired - delete it and return null
        this.deletePreference(entity, null, field);
        return null;
      }
      return global;
    }

    return null;
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
    options?: { allowGuessedOverride?: boolean; courseName?: string; courseId?: number }
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

    // Get field sources (new tracking) - may contain extended TaskTypeFieldSource objects
    const fieldSourcesStr = localRecord.field_sources as string | null;
    const fieldSources: Record<
      string,
      'canvas' | 'user' | 'guessed' | TaskTypeFieldSource
    > = fieldSourcesStr ? JSON.parse(fieldSourcesStr) : {};

    // Extract canvas field sources for task_type comparison
    const canvasFieldSourcesStr = canvasData.field_sources as string | null;
    const canvasFieldSources: Record<string, TaskTypeFieldSource> = canvasFieldSourcesStr
      ? JSON.parse(canvasFieldSourcesStr)
      : {};

    // Check if guessed override is allowed (default true)
    const allowGuessedOverride = options?.allowGuessedOverride ?? true;

    for (const [field, canvasValue] of Object.entries(canvasData)) {
      if (
        field === 'id' ||
        field === 'external_id' ||
        field === 'local_modified_fields' ||
        field === 'field_sources'
      ) {
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

      // Authoritative fields always use Canvas values without conflict
      if (isAuthoritativeField(tableName, field)) {
        autoResolved[field] = canvasValue;
        continue;
      }

      // Special handling for task_type with tiered classification system
      if (field === 'task_type' && tableName === 'tasks') {
        const taskTypeResult = this.handleTaskTypeConflict(
          localValue as string,
          canvasValue as string,
          fieldSources.task_type,
          canvasFieldSources.task_type
        );

        if (taskTypeResult.action === 'use_canvas') {
          autoResolved[field] = canvasValue;
          // Also update task_subtype if present
          if (canvasData.task_subtype !== undefined) {
            autoResolved['task_subtype'] = canvasData.task_subtype;
          }
          continue;
        } else if (taskTypeResult.action === 'preserve_local') {
          preservedFields.push(field);
          if (localRecord.task_subtype !== undefined) {
            preservedFields.push('task_subtype');
          }
          continue;
        }
        // If action === 'conflict', fall through to normal conflict handling
      }

      // Check field source first (new system)
      // BUT: respect local_modified_fields - if user explicitly modified this field,
      // don't auto-accept Canvas value even if field_sources says 'canvas'
      if (fieldSource === 'canvas' && !localModifiedFields.has(field)) {
        // Field came from Canvas AND user hasn't modified it - accept Canvas updates
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

      // No preference - check if conflict already exists for this entity/field
      const existingConflict = Array.from(this.pendingConflicts.values()).find(
        (c) => c.entity === entity && c.entityId === entityId && c.field === field
      );

      if (existingConflict) {
        // Update existing conflict with new values
        existingConflict.localValue = localValue;
        existingConflict.canvasValue = canvasValue;
        existingConflict.timestamp = new Date().toISOString();
        existingConflict.entityName = entityName;
        existingConflict.courseName = options?.courseName;
        existingConflict.courseId = options?.courseId;
        // Update in database
        this.savePendingConflict(existingConflict);
        conflicts.push(existingConflict);
        // Preserve local value until conflict is resolved
        preservedFields.push(field);
      } else {
        // Create new conflict
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
          courseName: options?.courseName,
          courseId: options?.courseId,
        };

        conflicts.push(conflict);
        this.pendingConflicts.set(conflictId, conflict);
        // Persist conflict to database so it survives app restart
        this.savePendingConflict(conflict);
        // Preserve local value until conflict is resolved
        preservedFields.push(field);
      }
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
      // Check if both look like ISO dates and compare as dates
      if (this.looksLikeIsoDate(a) && this.looksLikeIsoDate(b)) {
        return this.datesEqual(a, b);
      }
      return a.trim() === b.trim();
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Check if a string looks like an ISO date
   */
  private looksLikeIsoDate(s: string): boolean {
    // Match patterns like: 2026-01-30T23:59, 2026-01-31T04:59:00Z, 2026-01-30T23:59:00.000Z
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  }

  /**
   * Compare two date strings for equality (within 1 minute tolerance)
   */
  private datesEqual(a: string, b: string): boolean {
    try {
      const dateA = new Date(a);
      const dateB = new Date(b);
      // If either is invalid, fall back to string comparison
      if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
        return a.trim() === b.trim();
      }
      // Compare with 1 minute tolerance (60000ms) to handle rounding differences
      return Math.abs(dateA.getTime() - dateB.getTime()) < 60000;
    } catch {
      return a.trim() === b.trim();
    }
  }

  /**
   * Get all pending conflicts
   */
  getPendingConflicts(): SyncConflict[] {
    return Array.from(this.pendingConflicts.values());
  }

  /**
   * Resolve a conflict with user's decision
   *
   * Returns the resolved field, value, and metadata for updating field_sources.
   * The caller should update field_sources based on useCanvasValue:
   * - If useCanvasValue is true, set field_sources[field] = 'canvas'
   * - If useCanvasValue is false, set field_sources[field] = 'user'
   */
  resolveConflict(resolution: ConflictResolution): {
    field: string;
    value: unknown;
    entity: 'course' | 'task' | 'notification';
    entityId: number;
    useCanvasValue: boolean;
  } | null {
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
        expiresAt: resolution.expiresAt ?? null,
      });
    }

    // Remove from pending (both memory and database)
    this.pendingConflicts.delete(resolution.conflictId);
    this.deletePendingConflict(resolution.conflictId);

    // Update field_sources based on resolution
    const tableName =
      conflict.entity === 'course'
        ? 'courses'
        : conflict.entity === 'task'
          ? 'tasks'
          : 'notifications';
    const newSource = resolution.useCanvasValue ? 'canvas' : 'user';
    this.setFieldSource(tableName, conflict.entityId, conflict.field, newSource);

    // If choosing local value, also clear the field from local_modified_fields
    // since the user has explicitly chosen this value
    if (!resolution.useCanvasValue) {
      // Keep in local_modified_fields to prevent future auto-override
    } else {
      // Clear from local_modified_fields since user chose Canvas value
      this.clearFieldModified(tableName, conflict.entityId, conflict.field);
    }

    return {
      field: conflict.field,
      value: resolution.useCanvasValue ? conflict.canvasValue : conflict.localValue,
      entity: conflict.entity,
      entityId: conflict.entityId,
      useCanvasValue: resolution.useCanvasValue,
    };
  }

  /**
   * Resolve all pending conflicts with a batch decision
   *
   * Updates field_sources for all resolved conflicts:
   * - useCanvasValues=true: sets field_sources to 'canvas'
   * - useCanvasValues=false: sets field_sources to 'user'
   */
  resolveAllConflicts(useCanvasValues: boolean): Array<{
    field: string;
    value: unknown;
    entity: 'course' | 'task' | 'notification';
    entityId: number;
  }> {
    const results: Array<{
      field: string;
      value: unknown;
      entity: 'course' | 'task' | 'notification';
      entityId: number;
    }> = [];

    for (const [id, conflict] of this.pendingConflicts) {
      results.push({
        field: conflict.field,
        value: useCanvasValues ? conflict.canvasValue : conflict.localValue,
        entity: conflict.entity,
        entityId: conflict.entityId,
      });

      // Update field_sources
      const tableName =
        conflict.entity === 'course'
          ? 'courses'
          : conflict.entity === 'task'
            ? 'tasks'
            : 'notifications';
      const newSource = useCanvasValues ? 'canvas' : 'user';
      this.setFieldSource(tableName, conflict.entityId, conflict.field, newSource);

      // Clear from local_modified_fields if choosing Canvas value
      if (useCanvasValues) {
        this.clearFieldModified(tableName, conflict.entityId, conflict.field);
      }

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
      `INSERT INTO sync_preferences (entity, entity_id, field, prefer_canvas, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity, entity_id, field) DO UPDATE SET
         prefer_canvas = excluded.prefer_canvas,
         expires_at = excluded.expires_at`,
      [
        pref.entity,
        pref.entityId,
        pref.field,
        pref.preferCanvas ? 1 : 0,
        pref.createdAt,
        pref.expiresAt,
      ],
      'sync_preferences'
    );

    // Update local cache
    const existing = this.preferences.findIndex(
      (p) =>
        p.entity === pref.entity && p.entityId === pref.entityId && p.field === pref.field
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
  markFieldModified(tableName: string, entityId: number, field: string): void {
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
  clearFieldModified(tableName: string, entityId: number, field: string): void {
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
      (p) => !(p.entity === entity && p.entityId === entityId && p.field === field)
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
   * Clear all pending conflicts (used during data reset)
   */
  clearAllPendingConflicts(): void {
    this.db.executeWrite(
      'DELETE FROM pending_sync_conflicts',
      [],
      'pending_sync_conflicts'
    );
    this.pendingConflicts.clear();
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

  // =========================================================================
  // Task Type Conflict Resolution (Confidence-Aware)
  // =========================================================================

  /**
   * Handle task_type conflicts with tiered classification confidence
   *
   * Decision logic:
   * | Local Source | Canvas Tier vs Local | Action |
   * |--------------|---------------------|--------|
   * | `user` (explicitly set) | Any | NEVER overwrite - preserve user's choice |
   * | `canvas` | Canvas tier BETTER (lower number) | Silently upgrade |
   * | `canvas` | Canvas tier SAME/WORSE AND lower confidence | Preserve local |
   * | `canvas` | Canvas MORE confident AND values differ | Create conflict |
   *
   * @returns action: 'use_canvas' | 'preserve_local' | 'conflict'
   */
  private handleTaskTypeConflict(
    localValue: string,
    canvasValue: string,
    localMeta: 'canvas' | 'user' | 'guessed' | TaskTypeFieldSource | undefined,
    canvasMeta: TaskTypeFieldSource | undefined
  ): { action: 'use_canvas' | 'preserve_local' | 'conflict' } {
    // If values are the same, no conflict needed
    if (localValue === canvasValue) {
      return { action: 'use_canvas' };
    }

    // Extract source from potentially extended metadata
    const localSource = this.getSimpleSource(localMeta);

    // Rule 1: User explicitly set → NEVER overwrite
    if (localSource === 'user') {
      return { action: 'preserve_local' };
    }

    // If no extended metadata, fall back to simple comparison
    const localExtended = this.getExtendedMeta(localMeta);

    // If local has no tier info (legacy), allow Canvas to upgrade
    if (!localExtended || !localExtended.tier) {
      return { action: 'use_canvas' };
    }

    // If Canvas has no tier info (shouldn't happen), preserve local
    if (!canvasMeta || !canvasMeta.tier) {
      return { action: 'preserve_local' };
    }

    // Rule 2: Canvas tier BETTER (lower number) → Silently upgrade
    if (canvasMeta.tier < localExtended.tier) {
      return { action: 'use_canvas' };
    }

    // Rule 3: Canvas tier SAME or WORSE
    if (canvasMeta.tier >= localExtended.tier) {
      // Canvas same/worse tier AND lower/equal confidence → Preserve local
      if (canvasMeta.confidence <= localExtended.confidence) {
        return { action: 'preserve_local' };
      }

      // Canvas more confident AND values differ → Create conflict
      return { action: 'conflict' };
    }

    // Fallback (shouldn't reach here)
    return { action: 'conflict' };
  }

  /**
   * Get simple source from potentially extended metadata
   */
  private getSimpleSource(
    meta: 'canvas' | 'user' | 'guessed' | TaskTypeFieldSource | undefined
  ): 'canvas' | 'user' | 'guessed' | undefined {
    if (!meta) return undefined;
    if (typeof meta === 'string') return meta;
    return meta.source;
  }

  /**
   * Get extended metadata if available
   */
  private getExtendedMeta(
    meta: 'canvas' | 'user' | 'guessed' | TaskTypeFieldSource | undefined
  ): TaskTypeFieldSource | null {
    if (!meta) return null;
    if (typeof meta === 'string') return null;
    return meta;
  }
}
