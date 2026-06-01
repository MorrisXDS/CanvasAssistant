import type { Migration } from '../MigrationRunner';

/**
 * Migrations v81-102: Linking, queue, sync, classification
 *
 * - v81: Canvas late penalty tracking
 * - v82: Canvas assignment groups
 * - v83: Per-course policy authority
 * - v84: Task linking columns
 * - v85: Link suggestions
 * - v86-88: Task notes, expected grade, soft-delete (with fixes)
 * - v89: Canvas task queue
 * - v90: Queue acceptance tracking
 * - v91: Auto-accept canvas tasks setting
 * - v92: Task start_at
 * - v93: Grade curve adjustment
 * - v94: Sync sessions and updates
 * - v96: is_action_required on sync_updates
 * - v97: updated_at on sync_updates
 * - v98: values_changed_at on canvas_task_queue
 * - v99: Add 'page' to sync_updates entity_type
 * - v100: Task subtype classification
 * - v101: changed_field on sync_updates
 * - v102: syllabus_prompt_dismissed_at on courses
 */
export const migrationsV81toV102: Migration[] = [
  {
    version: 81,
    description: 'Add Canvas late penalty tracking fields to tasks',
    up: `
      -- Pre-penalty grade (what Canvas shows before late deductions)
      ALTER TABLE tasks ADD COLUMN entered_grade REAL;
      -- Points deducted by Canvas late policy
      ALTER TABLE tasks ADD COLUMN points_deducted REAL;
      -- Canvas late policy status: 'none' | 'late' | 'missing' | 'extended'
      ALTER TABLE tasks ADD COLUMN late_policy_status TEXT DEFAULT 'none';
      -- How late the submission was in seconds
      ALTER TABLE tasks ADD COLUMN seconds_late INTEGER DEFAULT 0;
      -- Whether assignment was excused by instructor
      ALTER TABLE tasks ADD COLUMN is_excused INTEGER DEFAULT 0;
      -- Whether assignment is marked as missing
      ALTER TABLE tasks ADD COLUMN is_missing INTEGER DEFAULT 0;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 82,
    description: 'Create canvas_assignment_groups table for drop/weight rules',
    up: `
      -- Store Canvas assignment group metadata for drop_lowest, group weights
      CREATE TABLE canvas_assignment_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        canvas_group_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        group_weight REAL,
        drop_lowest INTEGER DEFAULT 0,
        drop_highest INTEGER DEFAULT 0,
        never_drop TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        UNIQUE(course_id, canvas_group_id)
      );

      CREATE INDEX idx_assignment_groups_course ON canvas_assignment_groups(course_id);

      -- Add FK from tasks to assignment groups (local ID reference)
      ALTER TABLE tasks ADD COLUMN assignment_group_id INTEGER REFERENCES canvas_assignment_groups(id);

      CREATE INDEX idx_tasks_assignment_group ON tasks(assignment_group_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_assignment_group;
      DROP INDEX IF EXISTS idx_assignment_groups_course;
      DROP TABLE IF EXISTS canvas_assignment_groups;
      -- Can't drop column from tasks
      SELECT 1;
    `,
  },
  {
    version: 83,
    description: 'Add per-course policy authority settings',
    up: `
      -- Authority for late penalty: 'canvas' | 'local' | 'both'
      ALTER TABLE courses ADD COLUMN late_penalty_authority TEXT DEFAULT 'canvas';
      -- Authority for drop lowest: 'canvas' | 'local' | 'off'
      ALTER TABLE courses ADD COLUMN drop_lowest_authority TEXT DEFAULT 'canvas';
      -- Grade calculation mode: 'canvas' | 'local' | 'both'
      ALTER TABLE courses ADD COLUMN grade_calc_mode TEXT DEFAULT 'canvas';
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 84,
    description: 'Add task linking columns for user-Canvas task matching',
    up: `
      -- Track which user task this Canvas task was linked from
      ALTER TABLE tasks ADD COLUMN linked_from_user_task TEXT;
      -- Track which Canvas task a user task was merged into (for soft-deleted user tasks)
      ALTER TABLE tasks ADD COLUMN merged_into_task_id INTEGER REFERENCES tasks(id);
      -- Confidence score of the link (0.0 - 1.0)
      ALTER TABLE tasks ADD COLUMN link_confidence REAL;
      -- How the link was created: 'auto', 'suggested', 'manual'
      ALTER TABLE tasks ADD COLUMN link_method TEXT;

      CREATE INDEX idx_tasks_linked_from ON tasks(linked_from_user_task);
      CREATE INDEX idx_tasks_merged_into ON tasks(merged_into_task_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_merged_into;
      DROP INDEX IF EXISTS idx_tasks_linked_from;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 85,
    description: 'Create link_suggestions table for user review of task matches',
    up: `
      CREATE TABLE link_suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        canvas_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        confidence REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by TEXT,
        UNIQUE(user_task_id, canvas_task_id)
      );

      CREATE INDEX idx_link_suggestions_status ON link_suggestions(status);
      CREATE INDEX idx_link_suggestions_user_task ON link_suggestions(user_task_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_link_suggestions_user_task;
      DROP INDEX IF EXISTS idx_link_suggestions_status;
      DROP TABLE IF EXISTS link_suggestions;
    `,
  },
  {
    version: 86,
    description: 'Add user notes, expected grade, and soft-delete columns to tasks',
    up: `
      -- User's personal notes on the task
      ALTER TABLE tasks ADD COLUMN notes TEXT;

      -- User's expected/estimated grade before Canvas grades it
      ALTER TABLE tasks ADD COLUMN user_expected_grade REAL;

      -- Whether to use user's expected grade in calculations
      ALTER TABLE tasks ADD COLUMN use_expected_in_calc INTEGER DEFAULT 0;

      -- Soft-delete timestamp (for merged user tasks)
      ALTER TABLE tasks ADD COLUMN deleted_at DATETIME;

      CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_deleted_at;
      -- SQLite doesn't support DROP COLUMN in older versions
      -- These columns would need table recreation to remove
    `,
  },
  {
    version: 87,
    description: 'Add deleted_at column to tasks (fix for partial v86 migration)',
    up: `
      -- Soft-delete timestamp (for merged user tasks)
      -- Using IF NOT EXISTS pattern via PRAGMA
      ALTER TABLE tasks ADD COLUMN deleted_at DATETIME;

      CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_deleted_at;
    `,
  },
  {
    version: 88,
    description: 'Ensure all v86 task columns exist (robust fix)',
    up: `
      -- These will error on "duplicate column name" which MigrationRunner handles
      -- This ensures all columns exist even if v86 was partially applied
      ALTER TABLE tasks ADD COLUMN notes TEXT;
      ALTER TABLE tasks ADD COLUMN user_expected_grade REAL;
      ALTER TABLE tasks ADD COLUMN use_expected_in_calc INTEGER DEFAULT 0;
      ALTER TABLE tasks ADD COLUMN deleted_at DATETIME;
      CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_deleted_at;
    `,
  },
  {
    version: 89,
    description: 'Create canvas_task_queue table for staging new Canvas tasks',
    up: `
      -- Queue for staging new Canvas assignments before user acceptance
      -- All new Canvas tasks are staged here for user review
      CREATE TABLE canvas_task_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,      -- Canvas assignment ID
        canvas_data TEXT NOT NULL,              -- JSON: full Canvas payload
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

        -- Denormalized for UI (avoid JSON parsing)
        title TEXT NOT NULL,
        description TEXT,
        due_at DATETIME,
        points_possible REAL,
        task_type TEXT,

        -- Queue state
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'accepted', 'rejected', 'merged')),

        -- User task matching
        matched_user_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        match_confidence REAL,

        -- Timestamps
        first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by TEXT,  -- 'user' | 'auto' | 'bulk'

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_canvas_task_queue_course ON canvas_task_queue(course_id);
      CREATE INDEX idx_canvas_task_queue_status ON canvas_task_queue(status);
      CREATE INDEX idx_canvas_task_queue_external ON canvas_task_queue(external_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_canvas_task_queue_external;
      DROP INDEX IF EXISTS idx_canvas_task_queue_status;
      DROP INDEX IF EXISTS idx_canvas_task_queue_course;
      DROP TABLE IF EXISTS canvas_task_queue;
    `,
  },
  {
    version: 90,
    description: 'Add queue acceptance tracking columns to tasks table',
    up: `
      -- Track which queue entry a task was accepted from
      ALTER TABLE tasks ADD COLUMN accepted_from_queue_id INTEGER
        REFERENCES canvas_task_queue(id) ON DELETE SET NULL;
      -- How the task was accepted: 'manual'|'auto'|'bulk'|'legacy'
      ALTER TABLE tasks ADD COLUMN acceptance_method TEXT;
      -- When the task was accepted from the queue
      ALTER TABLE tasks ADD COLUMN accepted_at DATETIME;

      CREATE INDEX idx_tasks_accepted_from ON tasks(accepted_from_queue_id);

      -- Mark all existing Canvas tasks as 'legacy' (accepted before queue system)
      UPDATE tasks SET acceptance_method = 'legacy' WHERE source_type = 'canvas';
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_accepted_from;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 91,
    description: 'Add auto_accept_canvas_tasks setting to courses table',
    up: `
      -- Per-course setting for automatic queue acceptance
      -- 0 = queue all (default) - all new tasks go to queue for review
      -- 1 = auto-accept all - new tasks become active immediately
      -- 2 = auto-accept if matching user task exists - merge automatically
      ALTER TABLE courses ADD COLUMN auto_accept_canvas_tasks INTEGER DEFAULT 0;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 92,
    description: 'Add start_at column to tasks for user-defined task start dates',
    up: `
      -- User-defined start date for a task (independent of Canvas unlock_at)
      -- This is local-only: not synced from Canvas, never overwritten by sync
      -- unlock_at = Canvas availability date (when assignment unlocks)
      -- start_at = User's planned start date (when they want to begin working)
      ALTER TABLE tasks ADD COLUMN start_at DATETIME;

      CREATE INDEX idx_tasks_start_at ON tasks(start_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_start_at;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 93,
    description: 'Add grade_curve_adjustment column to courses',
    up: (db) => {
      // Check if column exists using PRAGMA table_info
      const columns = db.executeRead<{ name: string }>(
        "SELECT name FROM pragma_table_info('courses') WHERE name = 'grade_curve_adjustment'"
      );

      if (columns.length === 0) {
        // Column doesn't exist, add it
        db.exec('ALTER TABLE courses ADD COLUMN grade_curve_adjustment REAL DEFAULT 0.0');
      }
      // If column exists, do nothing - migration is just ensuring consistency
    },
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 94,
    description:
      'Create sync_sessions and sync_updates tables for sync notification system',
    up: `
      -- Table: sync_sessions (tracks each sync operation)
      CREATE TABLE IF NOT EXISTS sync_sessions (
        id TEXT PRIMARY KEY,                    -- UUID
        started_at DATETIME NOT NULL,
        completed_at DATETIME,
        total_new_tasks INTEGER DEFAULT 0,
        total_updated_tasks INTEGER DEFAULT 0,
        total_new_announcements INTEGER DEFAULT 0,
        total_grade_changes INTEGER DEFAULT 0,
        total_new_files INTEGER DEFAULT 0,
        dismissed_at DATETIME,                  -- NULL = active session
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Table: sync_updates (individual change records + conflicts)
      CREATE TABLE IF NOT EXISTS sync_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_session_id TEXT NOT NULL,
        course_id INTEGER NOT NULL,
        entity_type TEXT CHECK(entity_type IN ('task', 'announcement', 'grade', 'file', 'conflict')) NOT NULL,
        entity_id INTEGER NOT NULL,
        external_id TEXT,
        change_type TEXT CHECK(change_type IN ('new', 'updated', 'grade_changed', 'conflict')) NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,                          -- Due date, score, file size, field name for conflicts
        old_value TEXT,                         -- Previous value / local value for conflicts
        new_value TEXT,                         -- New value / canvas value for conflicts
        conflict_field TEXT,                    -- For conflicts: which field (is_completed, due_at, etc.)
        conflict_resolution TEXT,               -- NULL = unresolved, 'local' or 'canvas'
        remember_choice INTEGER DEFAULT 0,      -- For conflicts: remember preference
        seen_at DATETIME,                       -- NULL = unseen (for non-conflicts)
        resolved_at DATETIME,                   -- For conflicts: when resolved
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(sync_session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sync_updates_course ON sync_updates(course_id);
      CREATE INDEX IF NOT EXISTS idx_sync_updates_seen ON sync_updates(seen_at);
      CREATE INDEX IF NOT EXISTS idx_sync_updates_session ON sync_updates(sync_session_id);
      CREATE INDEX IF NOT EXISTS idx_sync_updates_type ON sync_updates(entity_type);
      CREATE INDEX IF NOT EXISTS idx_sync_updates_entity ON sync_updates(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_sync_sessions_started ON sync_sessions(started_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_sync_sessions_started;
      DROP INDEX IF EXISTS idx_sync_updates_entity;
      DROP INDEX IF EXISTS idx_sync_updates_type;
      DROP INDEX IF EXISTS idx_sync_updates_session;
      DROP INDEX IF EXISTS idx_sync_updates_seen;
      DROP INDEX IF EXISTS idx_sync_updates_course;
      DROP TABLE IF EXISTS sync_updates;
      DROP TABLE IF EXISTS sync_sessions;
    `,
  },

  // Migration 95: Add local_modified_fields column to courses for sync conflict tracking
  {
    version: 95,
    description: 'Add local_modified_fields column to courses for sync conflict tracking',
    up: `
      ALTER TABLE courses ADD COLUMN local_modified_fields TEXT;
    `,
    down: `SELECT 1;`,
  },

  // Migration 96: Add is_action_required to sync_updates for queued tasks
  {
    version: 96,
    description: 'Add is_action_required column to sync_updates for queued tasks',
    up: `
      ALTER TABLE sync_updates ADD COLUMN is_action_required INTEGER DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_sync_updates_action_required ON sync_updates(is_action_required);
    `,
    down: `
      DROP INDEX IF EXISTS idx_sync_updates_action_required;
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
    `,
  },

  // Migration 97: Add updated_at to sync_updates for tracking value changes on unresolved conflicts
  {
    version: 97,
    description:
      'Add updated_at column to sync_updates for tracking Canvas value changes',
    up: `
      -- Track when Canvas value changed on an unresolved conflict
      -- If updated_at > created_at, the item was modified by Canvas after initial detection
      ALTER TABLE sync_updates ADD COLUMN updated_at DATETIME;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
      SELECT 1;
    `,
  },

  // Migration 98: Add values_changed_at to canvas_task_queue for tracking queued task updates
  {
    version: 98,
    description:
      'Add values_changed_at column to canvas_task_queue for tracking value changes',
    up: `
      -- Track when queued task values actually changed (vs just metadata refresh)
      -- If values_changed_at IS NOT NULL, the task preview changed since first seen
      ALTER TABLE canvas_task_queue ADD COLUMN values_changed_at DATETIME;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
      SELECT 1;
    `,
  },
  // Migration 99: Add 'page' to sync_updates entity_type for tracking page updates
  {
    version: 99,
    description: 'Add page to sync_updates entity_type check constraint',
    up: `
      -- SQLite doesn't support ALTER CHECK, so recreate table
      CREATE TABLE sync_updates_v99 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_session_id TEXT NOT NULL,
        course_id INTEGER NOT NULL,
        entity_type TEXT CHECK(entity_type IN ('task', 'announcement', 'grade', 'file', 'page', 'conflict')) NOT NULL,
        entity_id INTEGER NOT NULL,
        external_id TEXT,
        change_type TEXT CHECK(change_type IN ('new', 'updated', 'grade_changed', 'conflict')) NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        old_value TEXT,
        new_value TEXT,
        conflict_field TEXT,
        conflict_resolution TEXT,
        remember_choice INTEGER DEFAULT 0,
        seen_at DATETIME,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        is_action_required INTEGER DEFAULT 0,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(sync_session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
      );

      INSERT INTO sync_updates_v99 SELECT * FROM sync_updates;
      DROP TABLE sync_updates;
      ALTER TABLE sync_updates_v99 RENAME TO sync_updates;

      CREATE INDEX idx_sync_updates_course ON sync_updates(course_id);
      CREATE INDEX idx_sync_updates_seen ON sync_updates(seen_at);
      CREATE INDEX idx_sync_updates_session ON sync_updates(sync_session_id);
      CREATE INDEX idx_sync_updates_type ON sync_updates(entity_type);
      CREATE INDEX idx_sync_updates_entity ON sync_updates(entity_type, entity_id);
    `,
    down: `
      -- Recreate without 'page' type (data loss for page entries)
      CREATE TABLE sync_updates_old (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_session_id TEXT NOT NULL,
        course_id INTEGER NOT NULL,
        entity_type TEXT CHECK(entity_type IN ('task', 'announcement', 'grade', 'file', 'conflict')) NOT NULL,
        entity_id INTEGER NOT NULL,
        external_id TEXT,
        change_type TEXT CHECK(change_type IN ('new', 'updated', 'grade_changed', 'conflict')) NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        old_value TEXT,
        new_value TEXT,
        conflict_field TEXT,
        conflict_resolution TEXT,
        remember_choice INTEGER DEFAULT 0,
        seen_at DATETIME,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME,
        is_action_required INTEGER DEFAULT 0,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(sync_session_id) REFERENCES sync_sessions(id) ON DELETE CASCADE
      );

      INSERT INTO sync_updates_old SELECT * FROM sync_updates WHERE entity_type != 'page';
      DROP TABLE sync_updates;
      ALTER TABLE sync_updates_old RENAME TO sync_updates;

      CREATE INDEX idx_sync_updates_course ON sync_updates(course_id);
      CREATE INDEX idx_sync_updates_seen ON sync_updates(seen_at);
      CREATE INDEX idx_sync_updates_session ON sync_updates(sync_session_id);
      CREATE INDEX idx_sync_updates_type ON sync_updates(entity_type);
      CREATE INDEX idx_sync_updates_entity ON sync_updates(entity_type, entity_id);
    `,
  },
  // Migration 100: Add task_subtype column for tiered task type classification
  {
    version: 100,
    description:
      'Add task_subtype column for tiered task type classification with confidence tracking',
    up: `
      -- Add task_subtype column to store subtype classification
      -- Examples: 'numbered', 'webwork', 'final', 'midterm', 'problem_set'
      ALTER TABLE tasks ADD COLUMN task_subtype TEXT;

      -- Create composite index for type + subtype queries
      CREATE INDEX idx_tasks_type_subtype ON tasks(task_type, task_subtype);
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
      DROP INDEX IF EXISTS idx_tasks_type_subtype;
      SELECT 1;
    `,
  },
  // Migration 101: Add changed_field column for tracking which field changed in sync updates
  {
    version: 101,
    description:
      'Add changed_field column to sync_updates for field-level update tracking',
    up: `
      -- Add changed_field column to track which specific field changed for 'updated' changeType
      -- This complements existing conflict_field which is for conflicts
      ALTER TABLE sync_updates ADD COLUMN changed_field TEXT;

      -- Create index for efficient querying by entity + field
      CREATE INDEX idx_sync_updates_changed ON sync_updates(entity_type, entity_id, changed_field);
    `,
    down: `
      DROP INDEX IF EXISTS idx_sync_updates_changed;
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
      SELECT 1;
    `,
  },
  // Migration 102: Add syllabus_prompt_dismissed_at for persistent syllabus prompt dismissal
  {
    version: 102,
    description:
      'Add syllabus_prompt_dismissed_at column to courses for persistent prompt dismissal',
    up: `
      ALTER TABLE courses ADD COLUMN syllabus_prompt_dismissed_at DATETIME;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
      SELECT 1;
    `,
  },
  // Migration 103: Add remote_updated_at to course_pages for change detection
  {
    version: 103,
    description: 'Add remote_updated_at column to course_pages for page change detection',
    up: `
      ALTER TABLE course_pages ADD COLUMN remote_updated_at TEXT;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN, column will remain but be unused
      SELECT 1;
    `,
  },
  // Migration 104: Index notification_attachments.external_id (ADR-0008 PR-F.2)
  //
  // FileEntityProvider.findByCanvasId looks up attachments by external_id;
  // without this index the query path is SCAN over the whole table. The
  // schema's existing UNIQUE(notification_id, external_id) does not help
  // for lookups that filter on external_id alone. Safe additive change —
  // non-unique index, allows the existing duplicate external_id rows
  // (one per announcement) to coexist.
  {
    version: 104,
    description: 'Index notification_attachments.external_id for FileEntity lookups',
    up: `
      CREATE INDEX IF NOT EXISTS idx_notification_attachments_external_id
        ON notification_attachments(external_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_notification_attachments_external_id;
    `,
  },
  // Migration 105: Drop dead/zombie tables left behind by ADR-0003 (L3
  // intelligence removal) and never-wired-up features. Audited 2026-06-01 —
  // each has no production writer/reader AND no inbound FK from a live table;
  // their only references were teardown DELETEs in resetAppState (removed in the
  // same change). The `down` recreates each table from its original DDL for a
  // faithful, reversible migration.
  //
  // NOT dropped here: `course_task_groups` — although the table itself is dead,
  // `tasks.task_group_id` and `course_policies.target_group_id` still carry FK
  // columns pointing at it (and TaskRepository writes task_group_id), so
  // removing it safely needs those columns dropped first (a tasks-table rebuild).
  // Deferred to its own PR. (grade_replacements / weight_transfers DO reference
  // course_task_groups, but they are the children — dropping them is safe.)
  {
    version: 105,
    description:
      'Drop dead/zombie tables (ADR-0003 intelligence + grade + field leftovers)',
    up: `
      -- grade-layer policy children (FK→course_policies/course_task_groups; nothing references them)
      DROP INDEX IF EXISTS idx_grade_replacements_policy;
      DROP INDEX IF EXISTS idx_grade_replacements_course;
      DROP TABLE IF EXISTS grade_replacements;

      DROP INDEX IF EXISTS idx_weight_transfers_policy;
      DROP INDEX IF EXISTS idx_weight_transfers_course;
      DROP TABLE IF EXISTS weight_transfers;

      -- intelligence-layer leftovers (PriorityEngine/ROI/recommendations, removed per ADR-0003)
      DROP INDEX IF EXISTS idx_adaptive_weights_type;
      DROP INDEX IF EXISTS idx_adaptive_weights_course;
      DROP INDEX IF EXISTS idx_adaptive_weights_factor;
      DROP TABLE IF EXISTS adaptive_weight_adjustments;

      DROP INDEX IF EXISTS idx_user_insights_expires;
      DROP INDEX IF EXISTS idx_user_insights_acknowledged;
      DROP INDEX IF EXISTS idx_user_insights_severity;
      DROP INDEX IF EXISTS idx_user_insights_type;
      DROP TABLE IF EXISTS user_insights;

      DROP INDEX IF EXISTS idx_recommendations_dismissed;
      DROP INDEX IF EXISTS idx_recommendations_valid;
      DROP INDEX IF EXISTS idx_recommendations_course;
      DROP INDEX IF EXISTS idx_recommendations_task;
      DROP INDEX IF EXISTS idx_recommendations_type;
      DROP TABLE IF EXISTS recommendations;

      DROP INDEX IF EXISTS idx_workload_snapshots_date;
      DROP TABLE IF EXISTS workload_snapshots;

      DROP INDEX IF EXISTS idx_effort_estimations_type;
      DROP INDEX IF EXISTS idx_effort_estimations_course;
      DROP INDEX IF EXISTS idx_effort_estimations_task;
      DROP TABLE IF EXISTS effort_estimations;

      DROP INDEX IF EXISTS idx_user_behavior_patterns_type;
      DROP TABLE IF EXISTS user_behavior_patterns;

      DROP INDEX IF EXISTS idx_task_completion_events_completed;
      DROP INDEX IF EXISTS idx_task_completion_events_type;
      DROP INDEX IF EXISTS idx_task_completion_events_course;
      DROP INDEX IF EXISTS idx_task_completion_events_task;
      DROP TABLE IF EXISTS task_completion_events;

      -- never-wired-up field zombies
      DROP INDEX IF EXISTS idx_field_suppressions_expires;
      DROP INDEX IF EXISTS idx_field_suppressions_key;
      DROP TABLE IF EXISTS field_notification_suppressions;

      DROP INDEX IF EXISTS idx_field_modifications_entity;
      DROP TABLE IF EXISTS field_modifications;
    `,
    down: `
      CREATE TABLE grade_replacements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        source_task_id INTEGER,
        source_group_id INTEGER,
        target_task_id INTEGER,
        target_group_id INTEGER,
        replacement_type TEXT CHECK(replacement_type IN ('if_higher', 'always', 'best_of')) NOT NULL,
        replacement_ratio REAL DEFAULT 1.0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(policy_id) REFERENCES course_policies(id) ON DELETE CASCADE,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(source_task_id) REFERENCES tasks(id),
        FOREIGN KEY(source_group_id) REFERENCES course_task_groups(id),
        FOREIGN KEY(target_task_id) REFERENCES tasks(id),
        FOREIGN KEY(target_group_id) REFERENCES course_task_groups(id)
      );
      CREATE INDEX idx_grade_replacements_policy ON grade_replacements(policy_id);
      CREATE INDEX idx_grade_replacements_course ON grade_replacements(course_id);

      CREATE TABLE weight_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        source_task_id INTEGER,
        source_group_id INTEGER,
        target_task_id INTEGER,
        target_group_id INTEGER,
        transfer_type TEXT CHECK(transfer_type IN ('full', 'partial', 'conditional')) NOT NULL,
        transfer_percent REAL DEFAULT 100.0,
        condition_type TEXT CHECK(condition_type IN ('missed', 'lower', 'always')),
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(policy_id) REFERENCES course_policies(id) ON DELETE CASCADE,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(source_task_id) REFERENCES tasks(id),
        FOREIGN KEY(source_group_id) REFERENCES course_task_groups(id),
        FOREIGN KEY(target_task_id) REFERENCES tasks(id),
        FOREIGN KEY(target_group_id) REFERENCES course_task_groups(id)
      );
      CREATE INDEX idx_weight_transfers_policy ON weight_transfers(policy_id);
      CREATE INDEX idx_weight_transfers_course ON weight_transfers(course_id);

      CREATE TABLE task_completion_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        task_type TEXT NOT NULL,
        started_at DATETIME,
        completed_at DATETIME NOT NULL,
        due_at DATETIME,
        time_to_complete_minutes INTEGER,
        day_of_week INTEGER NOT NULL,
        hour_of_day INTEGER NOT NULL,
        days_before_due INTEGER,
        was_late BOOLEAN DEFAULT FALSE,
        score_achieved REAL,
        points_possible REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_task_completion_events_task ON task_completion_events(task_id);
      CREATE INDEX idx_task_completion_events_course ON task_completion_events(course_id);
      CREATE INDEX idx_task_completion_events_type ON task_completion_events(task_type);
      CREATE INDEX idx_task_completion_events_completed ON task_completion_events(completed_at);

      CREATE TABLE user_behavior_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        pattern_value TEXT NOT NULL,
        sample_size INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0.0,
        last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pattern_type, pattern_key)
      );
      CREATE INDEX idx_user_behavior_patterns_type ON user_behavior_patterns(pattern_type);

      CREATE TABLE effort_estimations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id),
        task_type TEXT NOT NULL,
        points_possible REAL,
        estimated_minutes INTEGER NOT NULL,
        actual_minutes INTEGER,
        estimation_method TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_id)
      );
      CREATE INDEX idx_effort_estimations_task ON effort_estimations(task_id);
      CREATE INDEX idx_effort_estimations_course ON effort_estimations(course_id);
      CREATE INDEX idx_effort_estimations_type ON effort_estimations(task_type);

      CREATE TABLE workload_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date DATE NOT NULL UNIQUE,
        total_tasks_due INTEGER DEFAULT 0,
        total_estimated_minutes INTEGER DEFAULT 0,
        tasks_by_course TEXT,
        tasks_by_urgency TEXT,
        deadline_clustering_score REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_workload_snapshots_date ON workload_snapshots(snapshot_date);

      CREATE TABLE recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recommendation_type TEXT NOT NULL,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        priority_score REAL DEFAULT 50.0,
        valid_from DATETIME NOT NULL,
        valid_until DATETIME NOT NULL,
        dismissed_at DATETIME,
        acted_on_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_recommendations_type ON recommendations(recommendation_type);
      CREATE INDEX idx_recommendations_task ON recommendations(task_id);
      CREATE INDEX idx_recommendations_course ON recommendations(course_id);
      CREATE INDEX idx_recommendations_valid ON recommendations(valid_from, valid_until);
      CREATE INDEX idx_recommendations_dismissed ON recommendations(dismissed_at);

      CREATE TABLE user_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insight_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT CHECK(severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
        data_json TEXT NOT NULL,
        acknowledged_at DATETIME,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_user_insights_type ON user_insights(insight_type);
      CREATE INDEX idx_user_insights_severity ON user_insights(severity);
      CREATE INDEX idx_user_insights_acknowledged ON user_insights(acknowledged_at);
      CREATE INDEX idx_user_insights_expires ON user_insights(expires_at);

      CREATE TABLE adaptive_weight_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factor_name TEXT NOT NULL,
        course_id INTEGER REFERENCES courses(id),
        task_type TEXT,
        weight_multiplier REAL DEFAULT 1.0,
        adjustment_reason TEXT,
        sample_size INTEGER DEFAULT 0,
        last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(factor_name, course_id, task_type)
      );
      CREATE INDEX idx_adaptive_weights_factor ON adaptive_weight_adjustments(factor_name);
      CREATE INDEX idx_adaptive_weights_course ON adaptive_weight_adjustments(course_id);
      CREATE INDEX idx_adaptive_weights_type ON adaptive_weight_adjustments(task_type);

      CREATE TABLE field_notification_suppressions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_key TEXT NOT NULL UNIQUE,
        suppressed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );
      CREATE INDEX idx_field_suppressions_key ON field_notification_suppressions(field_key);
      CREATE INDEX idx_field_suppressions_expires ON field_notification_suppressions(expires_at);

      CREATE TABLE field_modifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        field TEXT NOT NULL,
        modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(table_name, entity_id, field)
      );
      CREATE INDEX idx_field_modifications_entity ON field_modifications(table_name, entity_id);
    `,
  },
  // Migration 106: Drop `policy_announcements` (ADR-0003 cleanup). The table was
  // written every sync (announcement policy-keyword detection) but read by
  // nothing since ADR-0003 removed the consumer that turned detections into
  // `course_policies` rows. The two orphan writers + the dead `policy-detected`
  // event are removed in the same change. No table FKs to it (its own FKs to
  // notifications/courses just go away). Reversible — `down` recreates it.
  {
    version: 106,
    description: 'Drop policy_announcements (ADR-0003 orphan-writer cleanup)',
    up: `
      DROP INDEX IF EXISTS idx_policy_announcements_notification;
      DROP INDEX IF EXISTS idx_policy_announcements_course;
      DROP TABLE IF EXISTS policy_announcements;
    `,
    down: `
      CREATE TABLE policy_announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER NOT NULL UNIQUE,
        course_id INTEGER NOT NULL,
        detected_policy_type TEXT,
        confidence_score REAL DEFAULT 0.0,
        extracted_rules TEXT,
        is_confirmed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(notification_id) REFERENCES notifications(id),
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );
      CREATE INDEX idx_policy_announcements_notification ON policy_announcements(notification_id);
      CREATE INDEX idx_policy_announcements_course ON policy_announcements(course_id);
    `,
  },
  // Migration 107: Drop vestigial scoring/value columns (ADR-0003 cleanup).
  // All six are write-only-or-dead: no app code reads them.
  //   - tasks.pain_index / penalty_severity / has_safety_net / days_until_cutoff
  //     — old ROI/priority scoring inputs (v30). Only ever written by the
  //     import-restore path (now stopped); no readers. `idx_tasks_pain_index`
  //     is dropped first (can't DROP an indexed column).
  //   - tasks.effective_grade — the live `effectiveGrade` used by the grade
  //     simulator is COMPUTED (getEffectiveGrade / simulation ?? task.grade),
  //     never this column. The column only ever appeared in migrations.
  //   - courses.grade_volatility — schema-present since v1, never read or written.
  // NOT touched: tasks.lock_at (alive — Canvas-authoritative, synced + exported)
  // and sync_preferences.prefer_local (still written verbatim by the conflict
  // commands; deferred). Reversible — `down` re-adds the columns + index.
  {
    version: 107,
    description: 'Drop vestigial task/course scoring columns (ADR-0003 cleanup)',
    up: `
      DROP INDEX IF EXISTS idx_tasks_pain_index;
      ALTER TABLE tasks DROP COLUMN pain_index;
      ALTER TABLE tasks DROP COLUMN penalty_severity;
      ALTER TABLE tasks DROP COLUMN has_safety_net;
      ALTER TABLE tasks DROP COLUMN days_until_cutoff;
      ALTER TABLE tasks DROP COLUMN effective_grade;
      ALTER TABLE courses DROP COLUMN grade_volatility;
    `,
    down: `
      ALTER TABLE courses ADD COLUMN grade_volatility REAL DEFAULT 0.0;
      ALTER TABLE tasks ADD COLUMN effective_grade REAL;
      ALTER TABLE tasks ADD COLUMN pain_index REAL DEFAULT 0.0;
      ALTER TABLE tasks ADD COLUMN penalty_severity REAL DEFAULT 0.0;
      ALTER TABLE tasks ADD COLUMN has_safety_net BOOLEAN DEFAULT FALSE;
      ALTER TABLE tasks ADD COLUMN days_until_cutoff INTEGER;
      CREATE INDEX idx_tasks_pain_index ON tasks(pain_index DESC);
    `,
  },
];
