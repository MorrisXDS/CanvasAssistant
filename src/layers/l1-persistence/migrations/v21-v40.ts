import type { Migration } from '../MigrationRunner';

/**
 * Migrations v21-40: Task workflows, intelligence tables, calendar imports
 *
 * - v21: folder_path on resources
 * - v22-24: Task type system (global_task_types, course_task_groups, task columns)
 * - v25-29: Grace tokens, policy rules, grade replacements, weight transfers, priority calc
 * - v30: Priority calculation columns
 * - v31-33: Imported calendars
 * - v34: Announcement file references
 * - v35: Enrollment terms
 * - v36: Notification HTML
 * - v37: Endpoint backoff
 * - v38-39: Sync preferences, field modifications
 * - v40: Content file references, HTML exports, resource version tracking
 */
export const migrationsV21toV40: Migration[] = [
  {
    version: 21,
    description: 'Add folder_path column to resources for Canvas folder hierarchy',
    up: `
      ALTER TABLE resources ADD COLUMN folder_path TEXT;
      CREATE INDEX idx_resources_folder_path ON resources(folder_path);
    `,
    down: `
      DROP INDEX IF EXISTS idx_resources_folder_path;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 22,
    description: 'Create global_task_types table for system-wide task categorization',
    up: `
      CREATE TABLE global_task_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        canvas_patterns TEXT,
        default_weight REAL DEFAULT 0.0,
        is_system BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Insert default task types
      INSERT INTO global_task_types (name, display_name, description, canvas_patterns, default_weight, is_system) VALUES
        ('assignment', 'Assignment', 'Regular homework and assignments', '["assignment","homework","hw"]', 10.0, TRUE),
        ('quiz', 'Quiz', 'Short quizzes and assessments', '["quiz","assessment"]', 5.0, TRUE),
        ('exam', 'Exam', 'Major examinations', '["exam","test","term test","termtest"]', 20.0, TRUE),
        ('midterm', 'Midterm', 'Midterm examinations', '["midterm","mid-term","mid term"]', 25.0, TRUE),
        ('final', 'Final', 'Final examinations', '["final","final exam"]', 30.0, TRUE),
        ('project', 'Project', 'Course projects', '["project","capstone"]', 15.0, TRUE),
        ('lab', 'Lab', 'Laboratory work', '["lab","laboratory","practical"]', 10.0, TRUE),
        ('discussion', 'Discussion', 'Discussion posts and participation', '["discussion","forum","participation"]', 5.0, TRUE),
        ('attendance', 'Attendance', 'Attendance records', '["attendance","presence"]', 5.0, TRUE),
        ('other', 'Other', 'Uncategorized tasks', '[]', 5.0, TRUE);

      CREATE INDEX idx_global_task_types_name ON global_task_types(name);
    `,
    down: `
      DROP INDEX IF EXISTS idx_global_task_types_name;
      DROP TABLE global_task_types;
    `,
  },
  {
    version: 23,
    description:
      'Create course_task_groups table for course-specific task categorization',
    up: `
      CREATE TABLE course_task_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        global_type_id INTEGER,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        weight_percent REAL DEFAULT 0.0,
        drop_lowest INTEGER DEFAULT 0,
        canvas_group_id TEXT,
        canvas_group_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(global_type_id) REFERENCES global_task_types(id),
        UNIQUE(course_id, name)
      );

      CREATE INDEX idx_course_task_groups_course ON course_task_groups(course_id);
      CREATE INDEX idx_course_task_groups_type ON course_task_groups(global_type_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_course_task_groups_course;
      DROP INDEX IF EXISTS idx_course_task_groups_type;
      DROP TABLE course_task_groups;
    `,
  },
  {
    version: 24,
    description: 'Add task_group_id and task_type columns to tasks table',
    up: `
      ALTER TABLE tasks ADD COLUMN task_group_id INTEGER REFERENCES course_task_groups(id);
      ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'assignment';
      ALTER TABLE tasks ADD COLUMN canvas_assignment_group_id TEXT;
      ALTER TABLE tasks ADD COLUMN original_grade REAL;
      ALTER TABLE tasks ADD COLUMN effective_grade REAL;
      ALTER TABLE tasks ADD COLUMN grade_override_reason TEXT;
      ALTER TABLE tasks ADD COLUMN submission_status TEXT;

      CREATE INDEX idx_tasks_group ON tasks(task_group_id);
      CREATE INDEX idx_tasks_type ON tasks(task_type);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_group;
      DROP INDEX IF EXISTS idx_tasks_type;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 25,
    description: 'Create grace_tokens table for tracking student token usage',
    up: `
      CREATE TABLE grace_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        policy_id INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        tokens_remaining INTEGER NOT NULL,
        hours_per_token INTEGER DEFAULT 24,
        max_tokens_per_task INTEGER DEFAULT 2,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(policy_id) REFERENCES course_policies(id) ON DELETE CASCADE,
        UNIQUE(course_id, policy_id)
      );

      CREATE TABLE grace_token_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        grace_token_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        tokens_used INTEGER NOT NULL,
        hours_extended INTEGER NOT NULL,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(grace_token_id) REFERENCES grace_tokens(id) ON DELETE CASCADE,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE(grace_token_id, task_id)
      );

      CREATE INDEX idx_grace_tokens_course ON grace_tokens(course_id);
      CREATE INDEX idx_grace_token_usage_token ON grace_token_usage(grace_token_id);
      CREATE INDEX idx_grace_token_usage_task ON grace_token_usage(task_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_grace_tokens_course;
      DROP INDEX IF EXISTS idx_grace_token_usage_token;
      DROP INDEX IF EXISTS idx_grace_token_usage_task;
      DROP TABLE grace_token_usage;
      DROP TABLE grace_tokens;
    `,
  },
  {
    version: 26,
    description: 'Create policy_rules table for polymorphic policy configuration',
    up: `
      CREATE TABLE policy_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL,
        rule_key TEXT NOT NULL,
        rule_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(policy_id) REFERENCES course_policies(id) ON DELETE CASCADE,
        UNIQUE(policy_id, rule_key)
      );

      CREATE INDEX idx_policy_rules_policy ON policy_rules(policy_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_policy_rules_policy;
      DROP TABLE policy_rules;
    `,
  },
  {
    version: 27,
    description: 'Add scope columns to course_policies for granular targeting',
    up: `
      ALTER TABLE course_policies ADD COLUMN scope_type TEXT CHECK(scope_type IN ('course', 'group', 'task')) DEFAULT 'course';
      ALTER TABLE course_policies ADD COLUMN target_group_id INTEGER REFERENCES course_task_groups(id);
      ALTER TABLE course_policies ADD COLUMN target_task_id INTEGER REFERENCES tasks(id);
      ALTER TABLE course_policies ADD COLUMN applicable_types TEXT;
      ALTER TABLE course_policies ADD COLUMN excluded_types TEXT;

      CREATE INDEX idx_course_policies_scope ON course_policies(scope_type);
      CREATE INDEX idx_course_policies_target_group ON course_policies(target_group_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_course_policies_scope;
      DROP INDEX IF EXISTS idx_course_policies_target_group;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 28,
    description: 'Create grade_replacements table for tracking grade replacement rules',
    up: `
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
    `,
    down: `
      DROP INDEX IF EXISTS idx_grade_replacements_policy;
      DROP INDEX IF EXISTS idx_grade_replacements_course;
      DROP TABLE grade_replacements;
    `,
  },
  {
    version: 29,
    description: 'Create weight_transfers table for tracking weight transfer rules',
    up: `
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
    `,
    down: `
      DROP INDEX IF EXISTS idx_weight_transfers_policy;
      DROP INDEX IF EXISTS idx_weight_transfers_course;
      DROP TABLE weight_transfers;
    `,
  },
  {
    version: 30,
    description: 'Add priority calculation columns to tasks',
    up: `
      ALTER TABLE tasks ADD COLUMN pain_index REAL DEFAULT 0.0;
      ALTER TABLE tasks ADD COLUMN penalty_severity REAL DEFAULT 0.0;
      ALTER TABLE tasks ADD COLUMN has_safety_net BOOLEAN DEFAULT FALSE;
      ALTER TABLE tasks ADD COLUMN days_until_cutoff INTEGER;

      CREATE INDEX idx_tasks_pain_index ON tasks(pain_index DESC);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_pain_index;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 31,
    description: 'Create imported_calendars table for ICS calendar management',
    up: `
      CREATE TABLE imported_calendars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        file_hash TEXT,
        color TEXT DEFAULT '#6366F1',
        event_count INTEGER DEFAULT 0,
        is_visible BOOLEAN DEFAULT TRUE,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_imported_calendars_visible ON imported_calendars(is_visible);
    `,
    down: `
      DROP INDEX IF EXISTS idx_imported_calendars_visible;
      DROP TABLE imported_calendars;
    `,
  },
  {
    version: 32,
    description: 'Extend calendar_events for imported calendars',
    up: `
      ALTER TABLE calendar_events ADD COLUMN imported_calendar_id INTEGER REFERENCES imported_calendars(id) ON DELETE CASCADE;
      ALTER TABLE calendar_events ADD COLUMN location TEXT;
      ALTER TABLE calendar_events ADD COLUMN uid TEXT;
      CREATE INDEX idx_calendar_events_imported_calendar ON calendar_events(imported_calendar_id);
      CREATE INDEX idx_calendar_events_uid ON calendar_events(uid);
    `,
    down: `
      DROP INDEX IF EXISTS idx_calendar_events_imported_calendar;
      DROP INDEX IF EXISTS idx_calendar_events_uid;
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 33,
    description: 'Update calendar_events source_type CHECK to include imported',
    up: `
      -- SQLite doesn't support altering CHECK constraints, so we recreate the table
      CREATE TABLE calendar_events_new (
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
        FOREIGN KEY(course_id) REFERENCES courses(id),
        FOREIGN KEY(parent_event_id) REFERENCES calendar_events_new(id)
      );

      -- Copy existing data
      INSERT INTO calendar_events_new (
        id, external_id, source_type, course_id, imported_calendar_id, title, description,
        start_at, end_at, all_day, location, uid, recurrence_rule, recurrence_exception_dates,
        parent_event_id, created_at, updated_at, deleted_at
      )
      SELECT
        id, external_id, source_type, course_id, imported_calendar_id, title, description,
        start_at, end_at, all_day, location, uid, recurrence_rule, recurrence_exception_dates,
        parent_event_id, created_at, updated_at, deleted_at
      FROM calendar_events;

      -- Drop old table and rename new one
      DROP TABLE calendar_events;
      ALTER TABLE calendar_events_new RENAME TO calendar_events;

      -- Recreate indexes
      CREATE INDEX idx_calendar_events_imported_calendar ON calendar_events(imported_calendar_id);
      CREATE INDEX idx_calendar_events_uid ON calendar_events(uid);
    `,
    down: `
      -- Revert to old constraint (would lose 'imported' events)
      SELECT 1;
    `,
  },
  {
    version: 34,
    description:
      'Add announcement_file_references table for tracking file mentions in announcements',
    up: `
      -- Table to map file references in announcement messages to attachments
      CREATE TABLE IF NOT EXISTS announcement_file_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
        attachment_id INTEGER REFERENCES notification_attachments(id) ON DELETE SET NULL,
        start_position INTEGER NOT NULL,
        end_position INTEGER NOT NULL,
        matched_text TEXT NOT NULL,
        original_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_file_refs_notification ON announcement_file_references(notification_id);
      CREATE INDEX idx_file_refs_attachment ON announcement_file_references(attachment_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_file_refs_notification;
      DROP INDEX IF EXISTS idx_file_refs_attachment;
      DROP TABLE IF EXISTS announcement_file_references;
    `,
  },
  {
    version: 35,
    description: 'Add enrollment_terms table and enrollment_term_id to courses',
    up: `
      -- Table to store enrollment terms from Canvas
      CREATE TABLE IF NOT EXISTS enrollment_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        start_at DATETIME,
        end_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_enrollment_terms_external ON enrollment_terms(external_id);

      -- Add enrollment_term_id column to courses
      ALTER TABLE courses ADD COLUMN enrollment_term_id INTEGER;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN, so we can't cleanly revert
      DROP INDEX IF EXISTS idx_enrollment_terms_external;
      DROP TABLE IF EXISTS enrollment_terms;
    `,
  },
  {
    version: 36,
    description: 'Add message_html column to notifications for original HTML content',
    up: `
      ALTER TABLE notifications ADD COLUMN message_html TEXT;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 37,
    description:
      'Create endpoint_backoff table for tracking auth failures with exponential backoff',
    up: `
      CREATE TABLE endpoint_backoff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        course_id INTEGER,
        failure_count INTEGER DEFAULT 1,
        last_failure_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        next_retry_at DATETIME NOT NULL,
        last_success_at DATETIME,
        error_code TEXT,
        error_message TEXT,
        UNIQUE(endpoint, course_id)
      );

      CREATE INDEX idx_endpoint_backoff_next_retry ON endpoint_backoff(next_retry_at);
      CREATE INDEX idx_endpoint_backoff_course ON endpoint_backoff(course_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_endpoint_backoff_next_retry;
      DROP INDEX IF EXISTS idx_endpoint_backoff_course;
      DROP TABLE endpoint_backoff;
    `,
  },
  {
    version: 38,
    description:
      'Create sync_preferences table for remembering user sync conflict choices',
    up: `
      CREATE TABLE IF NOT EXISTS sync_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        field TEXT NOT NULL,
        prefer_local BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity, entity_id, field)
      );

      CREATE INDEX idx_sync_preferences_entity ON sync_preferences(entity, entity_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_sync_preferences_entity;
      DROP TABLE IF EXISTS sync_preferences;
    `,
  },
  {
    version: 39,
    description: 'Create field_modifications table for tracking local changes',
    up: `
      CREATE TABLE IF NOT EXISTS field_modifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        field TEXT NOT NULL,
        modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(table_name, entity_id, field)
      );

      CREATE INDEX idx_field_modifications_entity ON field_modifications(table_name, entity_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_field_modifications_entity;
      DROP TABLE IF EXISTS field_modifications;
    `,
  },
  {
    version: 40,
    description:
      'Add content_file_references, html_exports tables and resource version tracking',
    up: `
      -- Table to track file references extracted from HTML content (pages, assignments, syllabus, etc.)
      CREATE TABLE IF NOT EXISTS content_file_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK(source_type IN ('page', 'assignment', 'syllabus', 'module', 'announcement')),
        source_id TEXT NOT NULL,
        canvas_file_id TEXT NOT NULL,
        extracted_url TEXT NOT NULL,
        resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
        download_status TEXT DEFAULT 'pending' CHECK(download_status IN ('pending', 'downloading', 'completed', 'failed', 'not_found')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, source_type, source_id, canvas_file_id)
      );

      CREATE INDEX idx_content_file_refs_course ON content_file_references(course_id);
      CREATE INDEX idx_content_file_refs_source ON content_file_references(source_type, source_id);
      CREATE INDEX idx_content_file_refs_canvas_file ON content_file_references(canvas_file_id);
      CREATE INDEX idx_content_file_refs_status ON content_file_references(download_status);

      -- Table to track exported HTML files (pages, syllabus, assignments as local HTML)
      CREATE TABLE IF NOT EXISTS html_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK(source_type IN ('page', 'assignment', 'syllabus', 'module', 'announcement')),
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content_hash TEXT,
        local_path TEXT,
        remote_updated_at TEXT,
        exported_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(course_id, source_type, source_id)
      );

      CREATE INDEX idx_html_exports_course ON html_exports(course_id);
      CREATE INDEX idx_html_exports_source ON html_exports(source_type, source_id);

      -- Add version tracking and context columns to resources table
      ALTER TABLE resources ADD COLUMN remote_updated_at TEXT;
      ALTER TABLE resources ADD COLUMN context_type TEXT CHECK(context_type IN ('page', 'assignment', 'syllabus', 'module', 'announcement', 'files'));
      ALTER TABLE resources ADD COLUMN context_id TEXT;

      CREATE INDEX idx_resources_remote_updated ON resources(remote_updated_at);
      CREATE INDEX idx_resources_context ON resources(context_type, context_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_resources_context;
      DROP INDEX IF EXISTS idx_resources_remote_updated;
      DROP INDEX IF EXISTS idx_html_exports_source;
      DROP INDEX IF EXISTS idx_html_exports_course;
      DROP INDEX IF EXISTS idx_content_file_refs_status;
      DROP INDEX IF EXISTS idx_content_file_refs_canvas_file;
      DROP INDEX IF EXISTS idx_content_file_refs_source;
      DROP INDEX IF EXISTS idx_content_file_refs_course;
      DROP TABLE IF EXISTS html_exports;
      DROP TABLE IF EXISTS content_file_references;
      -- Note: Cannot drop columns in SQLite easily
    `,
  },
];
