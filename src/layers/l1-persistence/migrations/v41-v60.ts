import type { Migration } from '../MigrationRunner';

/**
 * Migrations v41-60: Content analysis, grading, sync enhancements
 *
 * - v41: lock_at on tasks
 * - v42: Behavioral analytics tables
 * - v43: Workload, recommendations, insights, adaptive weights
 * - v44: Field notification suppressions
 * - v45: Message display history
 * - v46: Target grade source
 * - v47: Field sources tracking
 * - v48: Per-course auto_assign_due_date
 * - v49: Local modified fields
 * - v50: ON DELETE CASCADE for tasks/notifications
 * - v51: Sync checkpoints
 * - v52: Visibility settings
 * - v53: Content analysis
 * - v54: Course syllabuses
 * - v55: Syllabus source_type
 * - v56: Message display sub_type
 * - v57-58: Task completion fixes
 * - v59: Submission status population
 * - v60: is_optional on tasks
 */
export const migrationsV41toV60: Migration[] = [
  {
    version: 41,
    description: 'Add lock_at column to tasks for submission lock deadlines',
    up: `
      ALTER TABLE tasks ADD COLUMN lock_at DATETIME;
      CREATE INDEX idx_tasks_lock_at ON tasks(lock_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_lock_at;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 42,
    description: 'Create behavioral analytics tables for adaptive learning',
    up: `
      -- Track task completion events for pattern analysis
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

      -- Aggregated user behavior patterns
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

      -- Effort estimations per task
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
    `,
    down: `
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
    `,
  },
  {
    version: 43,
    description: 'Create workload, recommendations, insights, and adaptive weight tables',
    up: `
      -- Daily workload snapshots
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

      -- Generated recommendations
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

      -- User insights
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

      -- Adaptive weight adjustments
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
    `,
    down: `
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
    `,
  },
  {
    version: 44,
    description:
      'Create field_notification_suppressions table for data completeness alerts',
    up: `
      CREATE TABLE field_notification_suppressions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_key TEXT NOT NULL UNIQUE,
        suppressed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );

      CREATE INDEX idx_field_suppressions_key ON field_notification_suppressions(field_key);
      CREATE INDEX idx_field_suppressions_expires ON field_notification_suppressions(expires_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_field_suppressions_expires;
      DROP INDEX IF EXISTS idx_field_suppressions_key;
      DROP TABLE IF EXISTS field_notification_suppressions;
    `,
  },
  {
    version: 45,
    description:
      'Create message_display_history table for duplicate prevention with probation',
    up: `
      -- Track display history for insights/recommendations to prevent duplicates
      CREATE TABLE message_display_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_type TEXT NOT NULL CHECK(message_type IN ('insight', 'recommendation')),
        content_hash TEXT NOT NULL,
        display_count INTEGER DEFAULT 1,
        first_shown_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_shown_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        grounded_until DATETIME,
        quiet_period_start DATETIME
      );

      CREATE UNIQUE INDEX idx_message_display_hash ON message_display_history(message_type, content_hash);
      CREATE INDEX idx_message_display_grounded ON message_display_history(grounded_until);
    `,
    down: `
      DROP INDEX IF EXISTS idx_message_display_grounded;
      DROP INDEX IF EXISTS idx_message_display_hash;
      DROP TABLE IF EXISTS message_display_history;
    `,
  },
  {
    version: 46,
    description: 'Add target_grade_source column to courses for default/manual tracking',
    up: `
      -- Add column to track whether target grade is using app default or was manually set
      -- 'default' = follows app default changes automatically
      -- 'manual' = user explicitly set, independent of app default
      ALTER TABLE courses ADD COLUMN target_grade_source TEXT DEFAULT 'default' CHECK(target_grade_source IN ('default', 'manual'));

      -- Set existing courses with non-85 target grades as 'manual' (likely user-modified)
      -- Courses with exactly 85.0 (the old hardcoded default) stay as 'default'
      UPDATE courses SET target_grade_source = 'manual' WHERE target_grade != 85.0;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 47,
    description: 'Add field_sources tracking for guessed vs user-set fields',
    up: `
      -- Track source of field values: 'canvas' (from API), 'user' (manually set), 'guessed' (auto-filled)
      -- JSON object: {"due_at": "guessed", "title": "canvas", "grade": "user"}
      ALTER TABLE tasks ADD COLUMN field_sources TEXT;
      ALTER TABLE courses ADD COLUMN field_sources TEXT;

      -- Per-course setting to control whether Canvas can silently override guessed values
      -- 1 = allow Canvas to override guessed values (default), 0 = treat guessed as user
      ALTER TABLE courses ADD COLUMN allow_guessed_override INTEGER DEFAULT 1;

      -- Initialize field_sources as empty JSON for existing records
      UPDATE tasks SET field_sources = '{}' WHERE field_sources IS NULL;
      UPDATE courses SET field_sources = '{}' WHERE field_sources IS NULL;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 48,
    description: 'Add per-course auto_assign_due_date setting',
    up: `
      -- Per-course setting for auto-assigning due dates to tasks without one
      -- NULL = inherit from app default, 0 = disabled, 1 = enabled
      ALTER TABLE courses ADD COLUMN auto_assign_due_date INTEGER DEFAULT NULL;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 49,
    description: 'Add local_modified_fields column for sync conflict tracking',
    up: `
      -- Track which fields the user has explicitly modified
      -- Used to detect conflicts when Canvas values change
      ALTER TABLE tasks ADD COLUMN local_modified_fields TEXT;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 50,
    description: 'Add ON DELETE CASCADE to tasks and notifications foreign keys',
    up: `
      -- Rebuild tasks table with CASCADE on course_id foreign key
      -- This prevents orphaned task records when courses are deleted
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        source_type TEXT CHECK(source_type IN ('canvas', 'user')) DEFAULT 'canvas',
        course_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        due_at DATETIME,
        unlock_at DATETIME,
        lock_at DATETIME,
        points_possible REAL,
        submission_types TEXT,
        weight REAL DEFAULT 0.0,
        grade REAL,
        priority_score REAL DEFAULT 0.0,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at DATETIME,
        local_modified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        task_group_id INTEGER,
        task_type TEXT DEFAULT 'assignment',
        canvas_assignment_group_id TEXT,
        original_grade REAL,
        effective_grade REAL,
        grade_override_reason TEXT,
        submission_status TEXT,
        pain_index REAL DEFAULT 0.0,
        penalty_severity REAL DEFAULT 0.0,
        has_safety_net BOOLEAN DEFAULT FALSE,
        days_until_cutoff INTEGER,
        field_sources TEXT,
        local_modified_fields TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(task_group_id) REFERENCES course_task_groups(id)
      );

      -- Copy existing data
      INSERT INTO tasks_new SELECT
        id, external_id, source_type, course_id, title, description,
        due_at, unlock_at, lock_at, points_possible, submission_types,
        weight, grade, priority_score, is_completed, completed_at,
        local_modified_at, created_at, updated_at, task_group_id,
        task_type, canvas_assignment_group_id, original_grade,
        effective_grade, grade_override_reason, submission_status,
        pain_index, penalty_severity, has_safety_net, days_until_cutoff,
        field_sources, local_modified_fields
      FROM tasks;

      -- Drop old table and rename
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;

      -- Recreate indexes
      CREATE INDEX idx_tasks_priority ON tasks(priority_score DESC);
      CREATE INDEX idx_tasks_due_date ON tasks(due_at);
      CREATE INDEX idx_tasks_course ON tasks(course_id);
      CREATE INDEX idx_tasks_source ON tasks(source_type);
      CREATE INDEX idx_tasks_group ON tasks(task_group_id);
      CREATE INDEX idx_tasks_type ON tasks(task_type);
      CREATE INDEX idx_tasks_pain_index ON tasks(pain_index DESC);
      CREATE INDEX idx_tasks_lock_at ON tasks(lock_at);

      -- Rebuild notifications table with CASCADE on course_id foreign key
      CREATE TABLE notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT CHECK(source_type IN ('canvas', 'system')),
        source_id TEXT,
        course_id INTEGER,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        message_html TEXT,
        priority_level TEXT CHECK(priority_level IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        priority_score REAL DEFAULT 0.0,
        published_at DATETIME NOT NULL,
        dismissed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        url TEXT,
        is_policy_related BOOLEAN DEFAULT FALSE,
        policy_keywords TEXT,
        linked_policy_id INTEGER,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(linked_policy_id) REFERENCES course_policies(id),
        UNIQUE(source_type, source_id)
      );

      -- Copy existing data
      INSERT INTO notifications_new SELECT
        id, source_type, source_id, course_id, title, message,
        message_html, priority_level, priority_score, published_at,
        dismissed_at, created_at, url, is_policy_related,
        policy_keywords, linked_policy_id
      FROM notifications;

      -- Drop old table and rename
      DROP TABLE notifications;
      ALTER TABLE notifications_new RENAME TO notifications;

      -- Recreate indexes
      CREATE INDEX idx_notifications_dismissed ON notifications(dismissed_at);
      CREATE INDEX idx_notifications_course ON notifications(course_id);
    `,
    down: `
      -- Reverting CASCADE requires table rebuild (complex)
      -- This down migration just ensures the schema remains valid
      SELECT 1;
    `,
  },
  {
    version: 51,
    description: 'Add sync_checkpoints table for resumable sync',
    up: `
      -- Track sync progress for resumable partial syncs
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT UNIQUE NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        phase TEXT CHECK(phase IN ('fetch', 'commit', 'completed', 'failed')) DEFAULT 'fetch',
        options_json TEXT,
        -- Course IDs that have been fully fetched
        fetched_course_ids TEXT DEFAULT '[]',
        -- Cached fetch data for courses (JSON)
        fetched_data_json TEXT,
        -- Progress tracking
        total_courses INTEGER DEFAULT 0,
        completed_courses INTEGER DEFAULT 0,
        -- Error tracking
        last_error TEXT,
        error_count INTEGER DEFAULT 0,
        -- Timestamps
        last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      -- Index for finding incomplete syncs
      CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_phase ON sync_checkpoints(phase);
      CREATE INDEX IF NOT EXISTS idx_sync_checkpoints_started ON sync_checkpoints(started_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_sync_checkpoints_phase;
      DROP INDEX IF EXISTS idx_sync_checkpoints_started;
      DROP TABLE IF EXISTS sync_checkpoints;
    `,
  },
  {
    version: 52,
    description: 'Add visibility_settings table for centralized visibility management',
    up: `
      -- Store visibility settings in database (accessible from both main and renderer)
      CREATE TABLE IF NOT EXISTS visibility_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Migrate term selection from localStorage to database
      -- Default: 'auto' (matches existing UI default)
      INSERT OR IGNORE INTO visibility_settings (key, value) VALUES ('term_selection', 'auto');
    `,
    down: `
      DROP TABLE IF EXISTS visibility_settings;
    `,
  },
  {
    version: 53,
    description: 'Create content_analysis table for document intelligence',
    up: `
      -- Table to store content analysis results for documents (PDFs, pages, syllabus, etc.)
      CREATE TABLE IF NOT EXISTS content_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL CHECK(source_type IN ('course_page', 'resource', 'attachment', 'syllabus')),
        source_id INTEGER NOT NULL,
        course_id INTEGER,
        document_type TEXT CHECK(document_type IN ('syllabus', 'rubric', 'assignment', 'reading', 'lecture', 'notes', 'other', 'unknown')),
        extracted_text TEXT,
        extracted_entities TEXT, -- JSON: { dates: [], percentages: [], policies: [], keywords: [] }
        embeddings BLOB, -- Vector for semantic search (future ML layer)
        analysis_level INTEGER DEFAULT 1 CHECK(analysis_level IN (1, 2, 3, 4)),
        -- Level 1 = text extraction only
        -- Level 2 = rule-based extraction (regex)
        -- Level 3 = local ML (Transformers.js)
        -- Level 4 = LLM analysis
        analyzed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_content_analysis_source ON content_analysis(source_type, source_id);
      CREATE INDEX idx_content_analysis_course ON content_analysis(course_id);
      CREATE INDEX idx_content_analysis_type ON content_analysis(document_type);
      CREATE INDEX idx_content_analysis_level ON content_analysis(analysis_level);
      CREATE UNIQUE INDEX idx_content_analysis_unique ON content_analysis(source_type, source_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_content_analysis_unique;
      DROP INDEX IF EXISTS idx_content_analysis_level;
      DROP INDEX IF EXISTS idx_content_analysis_type;
      DROP INDEX IF EXISTS idx_content_analysis_course;
      DROP INDEX IF EXISTS idx_content_analysis_source;
      DROP TABLE IF EXISTS content_analysis;
    `,
  },
  {
    version: 54,
    description:
      'Create course_syllabuses table and add based_on_syllabus_reviewed_at to course_policies',
    up: `
      -- Table for user-designated syllabus files per course
      -- Users explicitly mark which file is the syllabus, enabling:
      -- 1. Change detection: Monitor if Canvas shows the file was modified
      -- 2. Review tracking: Track when user last reviewed the syllabus
      -- 3. Policy staleness: Link policies to syllabus review dates
      CREATE TABLE IF NOT EXISTS course_syllabuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL UNIQUE,
        resource_id INTEGER NOT NULL,
        -- Canvas updated_at when file was marked (for change detection)
        resource_updated_at TEXT,
        -- When user last reviewed the syllabus
        last_reviewed_at DATETIME NOT NULL,
        -- When we detected the file was modified on Canvas (NULL if no change)
        change_detected_at DATETIME,
        -- When user marked this file as syllabus
        marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_course_syllabuses_course ON course_syllabuses(course_id);
      CREATE INDEX idx_course_syllabuses_resource ON course_syllabuses(resource_id);

      -- Add column to track when policies were entered relative to syllabus review
      -- If syllabus is updated after this date, warn that policy may be stale
      ALTER TABLE course_policies ADD COLUMN based_on_syllabus_reviewed_at DATETIME;
    `,
    down: `
      DROP INDEX IF EXISTS idx_course_syllabuses_resource;
      DROP INDEX IF EXISTS idx_course_syllabuses_course;
      DROP TABLE IF EXISTS course_syllabuses;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 55,
    description: 'Add source_type column to course_syllabuses for attachment support',
    up: `
      -- Add source_type column to distinguish between resources and attachments
      -- 'resource' = from resources table (file synced from Canvas)
      -- 'attachment' = from notification_attachments table (announcement attachment)
      ALTER TABLE course_syllabuses ADD COLUMN source_type TEXT NOT NULL DEFAULT 'resource';
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 56,
    description:
      'Add sub_type column to message_display_history for type-specific frequency settings',
    up: `
      -- Add sub_type column to store the specific type (e.g., 'work_now', 'course_struggle')
      -- This enables type-specific grounding/quiet period settings
      ALTER TABLE message_display_history ADD COLUMN sub_type TEXT;

      -- Create index for querying by sub_type
      CREATE INDEX idx_message_display_subtype ON message_display_history(sub_type);
    `,
    down: `
      DROP INDEX IF EXISTS idx_message_display_subtype;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 57,
    description: 'Fix completed_at for tasks marked complete without timestamp',
    up: `
      -- Fix inconsistency where is_completed = 1 but completed_at is NULL
      -- Set completed_at to current timestamp for these tasks
      UPDATE tasks
      SET completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE is_completed = 1 AND completed_at IS NULL;
    `,
  },
  {
    version: 58,
    description:
      'Reset incorrectly completed tasks - will be fixed on next sync with submission data',
    up: `
      -- Tasks marked complete but without grade should be re-evaluated on next sync
      -- Reset is_completed for tasks that:
      -- 1. Have no grade (not graded by instructor)
      -- 2. Have no weight (not a graded assignment we track)
      -- These will get proper status from Canvas submission.workflow_state on next sync
      UPDATE tasks
      SET is_completed = 0, completed_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE is_completed = 1
        AND grade IS NULL
        AND source_type = 'canvas';
    `,
  },
  {
    version: 59,
    description: 'Populate submission_status based on existing task state',
    up: `
      -- Set submission_status based on current is_completed and grade
      -- This will be overwritten by Canvas workflow_state on next sync
      UPDATE tasks
      SET submission_status = CASE
        WHEN grade IS NOT NULL THEN 'graded'
        WHEN is_completed = 1 THEN 'submitted'
        ELSE 'pending'
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE submission_status IS NULL;
    `,
  },
  {
    version: 60,
    description: 'Add is_optional column to tasks for user-marked optional coursework',
    up: `
      -- Add is_optional flag - user can mark any task as optional
      -- Optional tasks appear in "Not for Grade" section and are not overwritten by Canvas sync
      ALTER TABLE tasks ADD COLUMN is_optional INTEGER DEFAULT 0;
    `,
  },
];
