import type { Migration } from '../MigrationRunner';

/**
 * Migrations v61-80: Calendar, policy refinements, export/coordination
 *
 * - v61: Suppressed forever for recommendations/insights
 * - v62: due_time_known on tasks
 * - v63: Pending downloads
 * - v64: Pending sync data
 * - v65: ON DELETE CASCADE for remaining tables
 * - v66: Custom task types
 * - v67: Course archiving
 * - v68: User submission status
 * - v69: Task-calendar event linking
 * - v70: Calendar event task linking
 * - v71: Archive source tracking
 * - v72: Fix archive_source
 * - v73: HTML local paths schema
 * - v74: Export history
 * - v75: App settings
 * - v76: Sync/download operation coordination
 * - v77: Remove module_items CHECK constraint
 * - v78: page_url on module_items
 * - v79: Course credits
 * - v80: Task location
 */
export const migrationsV61toV80: Migration[] = [
  {
    version: 61,
    description:
      'Add suppressed_forever columns for permanent dismissal of recommendations/insights',
    up: `
      -- Add suppressed_forever to recommendations for "never show again" feature
      ALTER TABLE recommendations ADD COLUMN suppressed_forever INTEGER DEFAULT 0;
      CREATE INDEX idx_recommendations_suppressed ON recommendations(suppressed_forever);

      -- Add suppressed_forever to user_insights for "never show again" feature
      ALTER TABLE user_insights ADD COLUMN suppressed_forever INTEGER DEFAULT 0;
      CREATE INDEX idx_user_insights_suppressed ON user_insights(suppressed_forever);
    `,
    down: `
      DROP INDEX IF EXISTS idx_recommendations_suppressed;
      DROP INDEX IF EXISTS idx_user_insights_suppressed;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 62,
    description: 'Add due_time_known column to track whether task due time is certain',
    up: `
      -- Track whether the due time is known or only the date
      -- 1 = time is known (e.g., 11:59 PM from Canvas)
      -- 0 = only date known, time is assumed (midnight start of day)
      ALTER TABLE tasks ADD COLUMN due_time_known INTEGER DEFAULT 1;

      -- Existing tasks with due_at assume time is known (Canvas provided it)
      UPDATE tasks SET due_time_known = 1 WHERE due_at IS NOT NULL;
    `,
  },
  {
    version: 63,
    description: 'Create pending_downloads table for crash recovery',
    up: `
      -- Track download queue for crash recovery
      -- On app quit: save queued downloads
      -- On app startup: restore pending downloads
      CREATE TABLE IF NOT EXISTS pending_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id TEXT NOT NULL,
        course_code TEXT NOT NULL,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        context_folder TEXT,
        folder_path TEXT,
        expected_size INTEGER,
        priority INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'failed')),
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(resource_id)
      );

      CREATE INDEX idx_pending_downloads_status ON pending_downloads(status);
      CREATE INDEX idx_pending_downloads_priority ON pending_downloads(priority DESC);
    `,
    down: `
      DROP INDEX IF EXISTS idx_pending_downloads_priority;
      DROP INDEX IF EXISTS idx_pending_downloads_status;
      DROP TABLE IF EXISTS pending_downloads;
    `,
  },
  {
    version: 64,
    description: 'Create pending_sync_data table for crash-safe conflict resolution',
    up: `
      -- Store pending conflict data in database instead of memory
      -- Prevents data loss if app crashes during sync pause for conflict resolution
      CREATE TABLE IF NOT EXISTS pending_sync_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conflict_id TEXT UNIQUE NOT NULL,
        table_name TEXT NOT NULL,
        entity_id INTEGER,
        data_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_pending_sync_data_conflict ON pending_sync_data(conflict_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_pending_sync_data_conflict;
      DROP TABLE IF EXISTS pending_sync_data;
    `,
  },
  {
    version: 65,
    description: 'Add ON DELETE CASCADE to tables missing it',
    up: `
      -- First, clean up orphaned records that reference non-existent courses
      -- This prevents FOREIGN KEY constraint failures when recreating tables
      DELETE FROM calendar_events WHERE course_id IS NOT NULL AND course_id NOT IN (SELECT id FROM courses);
      DELETE FROM resources WHERE course_id NOT IN (SELECT id FROM courses);
      DELETE FROM grade_history WHERE course_id NOT IN (SELECT id FROM courses);
      DELETE FROM course_pages WHERE course_id NOT IN (SELECT id FROM courses);
      DELETE FROM modules WHERE course_id NOT IN (SELECT id FROM courses);

      -- calendar_events: Add CASCADE for course_id
      -- Note: parent_event_id self-reference already handled
      CREATE TABLE calendar_events_v65 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        source_type TEXT CHECK(source_type IN ('canvas', 'user', 'imported')),
        course_id INTEGER,
        imported_calendar_id INTEGER REFERENCES imported_calendars(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        start_at DATETIME NOT NULL,
        end_at DATETIME,
        all_day BOOLEAN DEFAULT FALSE,
        location TEXT,
        uid TEXT,
        recurrence_rule TEXT,
        recurrence_exception_dates TEXT,
        parent_event_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_event_id) REFERENCES calendar_events_v65(id) ON DELETE CASCADE
      );

      INSERT INTO calendar_events_v65 SELECT * FROM calendar_events;
      DROP TABLE calendar_events;
      ALTER TABLE calendar_events_v65 RENAME TO calendar_events;

      CREATE INDEX idx_calendar_events_start ON calendar_events(start_at);
      CREATE INDEX idx_calendar_events_imported_calendar ON calendar_events(imported_calendar_id);
      CREATE INDEX idx_calendar_events_uid ON calendar_events(uid);

      -- resources: Add CASCADE for course_id
      CREATE TABLE resources_v65 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        course_id INTEGER NOT NULL,
        parent_folder_id INTEGER,
        type TEXT CHECK(type IN ('file', 'folder', 'external_url', 'page')),
        title TEXT NOT NULL,
        url TEXT,
        local_path TEXT,
        size_bytes INTEGER,
        mime_type TEXT,
        unlock_at DATETIME,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        folder_path TEXT,
        remote_updated_at TEXT,
        context_type TEXT CHECK(context_type IN ('page', 'assignment', 'syllabus', 'module', 'announcement', 'files')),
        context_id TEXT,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_folder_id) REFERENCES resources_v65(id) ON DELETE SET NULL
      );

      INSERT INTO resources_v65 SELECT * FROM resources;
      DROP TABLE resources;
      ALTER TABLE resources_v65 RENAME TO resources;

      CREATE INDEX idx_resources_course ON resources(course_id);
      CREATE INDEX idx_resources_folder_path ON resources(folder_path);
      CREATE INDEX idx_resources_remote_updated ON resources(remote_updated_at);
      CREATE INDEX idx_resources_context ON resources(context_type, context_id);

      -- grade_history: Add CASCADE for course_id
      CREATE TABLE grade_history_v65 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        grade REAL NOT NULL,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      INSERT INTO grade_history_v65 SELECT * FROM grade_history;
      DROP TABLE grade_history;
      ALTER TABLE grade_history_v65 RENAME TO grade_history;

      CREATE INDEX idx_grade_history_course ON grade_history(course_id);

      -- course_pages: Add CASCADE for course_id
      CREATE TABLE course_pages_v65 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        course_id INTEGER NOT NULL,
        page_type TEXT CHECK(page_type IN ('syllabus', 'landing', 'content', 'module_item')),
        title TEXT NOT NULL,
        url_slug TEXT,
        body_html TEXT,
        body_text TEXT,
        is_front_page BOOLEAN DEFAULT FALSE,
        published BOOLEAN DEFAULT TRUE,
        last_synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      INSERT INTO course_pages_v65 SELECT * FROM course_pages;
      DROP TABLE course_pages;
      ALTER TABLE course_pages_v65 RENAME TO course_pages;

      CREATE INDEX idx_course_pages_course ON course_pages(course_id);
      CREATE INDEX idx_course_pages_type ON course_pages(page_type);

      -- modules: Add CASCADE for course_id
      CREATE TABLE modules_v65 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        course_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        position INTEGER,
        unlock_at DATETIME,
        require_sequential_progress BOOLEAN DEFAULT FALSE,
        published BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      INSERT INTO modules_v65 SELECT * FROM modules;
      DROP TABLE modules;
      ALTER TABLE modules_v65 RENAME TO modules;

      CREATE INDEX idx_modules_course ON modules(course_id);
    `,
    down: `
      -- Complex reversal - not easily reversible
      SELECT 1;
    `,
  },
  {
    version: 66,
    description: 'Create custom_task_types table for user-defined task types',
    up: `
      CREATE TABLE custom_task_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        course_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_custom_task_types_course ON custom_task_types(course_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_custom_task_types_course;
      DROP TABLE IF EXISTS custom_task_types;
    `,
  },
  {
    version: 67,
    description: 'Add archived_at column to courses for course archiving',
    up: `
      -- Add archived_at column to courses
      -- NULL = active course, non-NULL = archived at that timestamp
      -- Archived courses are hidden from dashboard, priorities, tasks pages but recoverable
      ALTER TABLE courses ADD COLUMN archived_at DATETIME DEFAULT NULL;
      CREATE INDEX idx_courses_archived ON courses(archived_at);
    `,
    down: `
      DROP INDEX IF EXISTS idx_courses_archived;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 68,
    description:
      'Add user_submission_status column to tasks for user-override submission tracking',
    up: `
      -- Add user_submission_status for OR logic with Canvas submission_status
      -- NULL = no user override, 'submitted' = user marked as submitted, 'graded' = user marked as graded
      -- Effective status = canvas OR user (if either is submitted/graded, effective is submitted/graded)
      ALTER TABLE tasks ADD COLUMN user_submission_status TEXT DEFAULT NULL;
      CREATE INDEX idx_tasks_user_submission ON tasks(user_submission_status);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_user_submission;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 69,
    description: 'Add calendar_event_id to tasks for task-calendar event linking',
    up: `
      -- Add calendar_event_id for optional task-calendar event linking
      -- NULL = no linked event, non-NULL = linked to calendar event
      -- ON DELETE SET NULL: if event is deleted, task link is cleared (not task itself)
      -- Bidirectional sync: task due_at changes update event, event time changes update task
      ALTER TABLE tasks ADD COLUMN calendar_event_id INTEGER DEFAULT NULL
        REFERENCES calendar_events(id) ON DELETE SET NULL;
      CREATE INDEX idx_tasks_calendar_event ON tasks(calendar_event_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_calendar_event;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 70,
    description:
      'Add task_id and calendar-specific fields to calendar_events for task-calendar unification',
    up: `
      -- Add task_id to calendar_events for bidirectional task-event linking
      -- Each task can have one auto-generated calendar event
      ALTER TABLE calendar_events ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;

      -- Add calendar-specific fields that don't affect the underlying task
      ALTER TABLE calendar_events ADD COLUMN color TEXT;
      ALTER TABLE calendar_events ADD COLUMN notes TEXT;
      ALTER TABLE calendar_events ADD COLUMN reminder_minutes INTEGER;

      -- Index for efficient task-event lookups
      CREATE INDEX idx_calendar_events_task ON calendar_events(task_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_calendar_events_task;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 71,
    description: 'Add archive_source to courses to track manual vs auto archives',
    up: `
      -- Track how a course was archived: 'manual' (user action) or 'auto' (term expired)
      -- Auto-archived courses cannot be restored by the user
      ALTER TABLE courses ADD COLUMN archive_source TEXT;

      -- Backfill: archived courses with expired terms are 'auto', others are 'manual'
      UPDATE courses SET archive_source = 'auto'
      WHERE archived_at IS NOT NULL
        AND enrollment_term_id IN (
          SELECT CAST(external_id AS INTEGER) FROM enrollment_terms
          WHERE end_at IS NOT NULL AND end_at < datetime('now')
        );

      UPDATE courses SET archive_source = 'manual'
      WHERE archived_at IS NOT NULL AND archive_source IS NULL;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 72,
    description: 'Fix archive_source for courses with expired terms',
    up: `
      -- Correct archive_source: courses with expired terms should be 'auto'
      UPDATE courses SET archive_source = 'auto'
      WHERE archived_at IS NOT NULL
        AND enrollment_term_id IN (
          SELECT CAST(external_id AS INTEGER) FROM enrollment_terms
          WHERE end_at IS NOT NULL AND end_at < datetime('now')
        );
    `,
    down: `
      SELECT 1;
    `,
  },
  {
    version: 73,
    description: 'Add HTML local paths schema for offline HTML with dependencies',
    up: `
      -- Store original HTML content (never modified by local path rewriting)
      -- This allows regeneration of local-path HTMLs when files change
      ALTER TABLE tasks ADD COLUMN description_original TEXT;
      ALTER TABLE notifications ADD COLUMN message_html_original TEXT;
      ALTER TABLE course_pages ADD COLUMN body_html_original TEXT;
      ALTER TABLE courses ADD COLUMN syllabus_body_original TEXT;

      -- Track HTML-to-HTML dependencies (for recursive resolution and cycle detection)
      CREATE TABLE IF NOT EXISTS html_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_source_type TEXT NOT NULL CHECK(parent_source_type IN ('page', 'assignment', 'syllabus', 'module', 'announcement')),
        parent_source_id TEXT NOT NULL,
        child_source_type TEXT NOT NULL CHECK(child_source_type IN ('page', 'assignment', 'syllabus', 'module', 'announcement', 'file')),
        child_source_id TEXT NOT NULL,
        child_canvas_url TEXT,
        is_cycle INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(parent_source_type, parent_source_id, child_source_type, child_source_id)
      );

      CREATE INDEX idx_html_deps_parent ON html_dependencies(parent_source_type, parent_source_id);
      CREATE INDEX idx_html_deps_child ON html_dependencies(child_source_type, child_source_id);
      CREATE INDEX idx_html_deps_cycle ON html_dependencies(is_cycle);

      -- Add ref_type to content_file_references for distinguishing file vs HTML refs
      ALTER TABLE content_file_references ADD COLUMN ref_type TEXT DEFAULT 'file';
      -- ref_type: 'file' (image, PDF, etc.) | 'html' (embedded HTML page/iframe)

      -- Track which HTML first triggered a file download (Option B - shared files)
      -- Format: 'assignment:123' or 'page:front-page'
      ALTER TABLE resources ADD COLUMN first_referenced_by TEXT;
    `,
    down: `
      DROP INDEX IF EXISTS idx_html_deps_cycle;
      DROP INDEX IF EXISTS idx_html_deps_child;
      DROP INDEX IF EXISTS idx_html_deps_parent;
      DROP TABLE IF EXISTS html_dependencies;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 74,
    description: 'Create export_history table for tracking backup operations',
    up: `
      CREATE TABLE IF NOT EXISTS export_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        export_type TEXT NOT NULL CHECK(export_type IN ('full', 'selective', 'csv', 'scheduled')),
        file_path TEXT,
        file_size INTEGER,
        encrypted INTEGER DEFAULT 0,
        courses_included TEXT,
        tasks_exported INTEGER DEFAULT 0,
        files_exported INTEGER DEFAULT 0,
        status TEXT DEFAULT 'completed' CHECK(status IN ('completed', 'failed', 'deleted')),
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_export_history_type ON export_history(export_type);
      CREATE INDEX idx_export_history_created ON export_history(created_at DESC);
      CREATE INDEX idx_export_history_status ON export_history(status);
    `,
    down: `
      DROP INDEX IF EXISTS idx_export_history_status;
      DROP INDEX IF EXISTS idx_export_history_created;
      DROP INDEX IF EXISTS idx_export_history_type;
      DROP TABLE IF EXISTS export_history;
    `,
  },
  {
    version: 75,
    description:
      'Create app_settings table for persistent settings (backup schedule, etc)',
    up: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `
      DROP TABLE IF EXISTS app_settings;
    `,
  },
  {
    version: 76,
    description: 'Add sync/download operation coordination schema',
    up: `
      -- Content hash columns for change detection during downloads
      ALTER TABLE course_pages ADD COLUMN content_hash TEXT;
      ALTER TABLE tasks ADD COLUMN description_hash TEXT;
      ALTER TABLE courses ADD COLUMN syllabus_hash TEXT;

      -- Active operations tracking table
      -- Prevents sync from interfering with downloads and vice versa
      CREATE TABLE IF NOT EXISTS active_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL CHECK(operation_type IN ('sync', 'download_html', 'download_file')),
        resource_type TEXT,
        resource_id TEXT,
        course_id INTEGER,
        session_id TEXT UNIQUE,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        heartbeat_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'stale', 'completed')),
        UNIQUE(operation_type, resource_type, resource_id)
      );

      CREATE INDEX idx_active_ops_type ON active_operations(operation_type);
      CREATE INDEX idx_active_ops_status ON active_operations(status);
      CREATE INDEX idx_active_ops_resource ON active_operations(resource_type, resource_id);
      CREATE INDEX idx_active_ops_session ON active_operations(session_id);

      -- Session tracking for dependencies (protects from deletion during download)
      ALTER TABLE html_dependencies ADD COLUMN download_session_id TEXT;
      ALTER TABLE html_dependencies ADD COLUMN recorded_content_hash TEXT;

      -- Version for optimistic locking on resources
      ALTER TABLE resources ADD COLUMN version INTEGER DEFAULT 0;

      CREATE INDEX idx_html_deps_session ON html_dependencies(download_session_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_html_deps_session;
      DROP INDEX IF EXISTS idx_active_ops_session;
      DROP INDEX IF EXISTS idx_active_ops_resource;
      DROP INDEX IF EXISTS idx_active_ops_status;
      DROP INDEX IF EXISTS idx_active_ops_type;
      DROP TABLE IF EXISTS active_operations;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 77,
    description:
      'Remove item_type CHECK constraint from module_items to allow any Canvas type',
    up: `
      -- Recreate module_items without CHECK constraint on item_type
      -- Canvas can return various item types beyond the original 8, so we accept any string
      CREATE TABLE module_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        module_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        item_type TEXT NOT NULL,
        content_id TEXT,
        position INTEGER,
        indent INTEGER DEFAULT 0,
        url TEXT,
        external_url TEXT,
        completion_requirement TEXT,
        published BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE
      );

      -- Copy existing data
      INSERT INTO module_items_new SELECT * FROM module_items;

      -- Drop old table and rename
      DROP TABLE module_items;
      ALTER TABLE module_items_new RENAME TO module_items;

      -- Recreate index
      CREATE INDEX idx_module_items_module ON module_items(module_id);
    `,
    down: `
      -- Reverting adds CHECK constraint back (may fail if unknown types exist)
      SELECT 1;
    `,
  },
  {
    version: 78,
    description: 'Add page_url column to module_items for Page type item slugs',
    up: `
      ALTER TABLE module_items ADD COLUMN page_url TEXT;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN in older versions, so we recreate
      CREATE TABLE module_items_backup AS SELECT
        id, external_id, module_id, title, item_type, content_id,
        position, indent, url, external_url, completion_requirement,
        published, created_at, updated_at
      FROM module_items;
      DROP TABLE module_items;
      ALTER TABLE module_items_backup RENAME TO module_items;
      CREATE INDEX idx_module_items_module ON module_items(module_id);
    `,
  },
  {
    version: 79,
    description: 'Add credits column to courses for weighted GPA calculation',
    up: `
      -- Credits/units for the course (e.g., 0.5, 1.0, 3.0)
      -- Used for calculating weighted average across courses
      ALTER TABLE courses ADD COLUMN credits REAL DEFAULT 1.0;

      -- Set default credits based on UofT course code convention:
      -- H (half-year) and S (summer) courses = 0.5 credit
      -- Y (full-year) courses = 1.0 credit
      UPDATE courses SET credits = 0.5
      WHERE code GLOB '*[HhSs][0-9]*';

      UPDATE courses SET credits = 1.0
      WHERE code GLOB '*[Yy][0-9]*';
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 80,
    description: 'Add location column to tasks for coursework location',
    up: `
      ALTER TABLE tasks ADD COLUMN location TEXT;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
];
