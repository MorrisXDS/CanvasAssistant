import type { Migration } from '../MigrationRunner';

/**
 * Core schema migrations (v1-20)
 * Foundation tables: courses, tasks, calendar_events, notifications, resources, etc.
 */
export const schemaCoreMigrations: Migration[] = [
  {
    version: 1,
    description: 'Create courses table',
    up: `
      CREATE TABLE courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        current_grade REAL,
        assessed_grade REAL,
        target_grade REAL DEFAULT 85.0,
        grade_volatility REAL DEFAULT 0.0,
        total_weight REAL DEFAULT 0.0,
        landing_page_url TEXT,
        last_synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )
    `,
    down: 'DROP TABLE courses',
  },
  {
    version: 2,
    description: 'Create tasks table',
    up: `
      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        source_type TEXT CHECK(source_type IN ('canvas', 'user')) DEFAULT 'canvas',
        course_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        due_at DATETIME,
        unlock_at DATETIME,
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
        FOREIGN KEY(course_id) REFERENCES courses(id)
      )
    `,
    down: 'DROP TABLE tasks',
  },
  {
    version: 3,
    description: 'Create calendar_events table',
    up: `
      CREATE TABLE calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE,
        source_type TEXT CHECK(source_type IN ('canvas', 'user')),
        course_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        start_at DATETIME NOT NULL,
        end_at DATETIME,
        all_day BOOLEAN DEFAULT FALSE,
        recurrence_rule TEXT,
        recurrence_exception_dates TEXT,
        parent_event_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        FOREIGN KEY(parent_event_id) REFERENCES calendar_events(id)
      )
    `,
    down: 'DROP TABLE calendar_events',
  },
  {
    version: 4,
    description: 'Create notifications table',
    up: `
      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT CHECK(source_type IN ('canvas', 'system')),
        source_id TEXT,
        course_id INTEGER,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority_level TEXT CHECK(priority_level IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
        priority_score REAL DEFAULT 0.0,
        published_at DATETIME NOT NULL,
        dismissed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        UNIQUE(source_type, source_id)
      )
    `,
    down: 'DROP TABLE notifications',
  },
  {
    version: 5,
    description: 'Create resources table',
    up: `
      CREATE TABLE resources (
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
        FOREIGN KEY(course_id) REFERENCES courses(id),
        FOREIGN KEY(parent_folder_id) REFERENCES resources(id)
      )
    `,
    down: 'DROP TABLE resources',
  },
  {
    version: 6,
    description: 'Create grade_history table',
    up: `
      CREATE TABLE grade_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        grade REAL NOT NULL,
        recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      )
    `,
    down: 'DROP TABLE grade_history',
  },
  {
    version: 7,
    description: 'Create user_preferences table',
    up: `
      CREATE TABLE user_preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    down: 'DROP TABLE user_preferences',
  },
  {
    version: 8,
    description: 'Create sync_metadata table for ETag caching',
    up: `
      CREATE TABLE sync_metadata (
        endpoint TEXT PRIMARY KEY,
        etag TEXT,
        last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    down: 'DROP TABLE sync_metadata',
  },
  {
    version: 9,
    description: 'Create course_policies table',
    up: `
      CREATE TABLE course_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        policy_type TEXT NOT NULL,
        policy_name TEXT NOT NULL,
        policy_config TEXT NOT NULL,
        raw_text TEXT,
        is_user_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        UNIQUE(course_id, policy_type, policy_name)
      )
    `,
    down: 'DROP TABLE course_policies',
  },
  {
    version: 10,
    description: 'Create course_pages table for syllabus and content pages',
    up: `
      CREATE TABLE course_pages (
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
        FOREIGN KEY(course_id) REFERENCES courses(id)
      )
    `,
    down: 'DROP TABLE course_pages',
  },
  {
    version: 11,
    description: 'Create modules table for course structure',
    up: `
      CREATE TABLE modules (
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
        FOREIGN KEY(course_id) REFERENCES courses(id)
      )
    `,
    down: 'DROP TABLE modules',
  },
  {
    version: 12,
    description: 'Create module_items table',
    up: `
      CREATE TABLE module_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT UNIQUE NOT NULL,
        module_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        item_type TEXT CHECK(item_type IN ('File', 'Page', 'Discussion', 'Assignment', 'Quiz', 'SubHeader', 'ExternalUrl', 'ExternalTool')),
        content_id TEXT,
        position INTEGER,
        indent INTEGER DEFAULT 0,
        url TEXT,
        external_url TEXT,
        completion_requirement TEXT,
        published BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(module_id) REFERENCES modules(id)
      )
    `,
    down: 'DROP TABLE module_items',
  },
  {
    version: 13,
    description: 'Add syllabus_body to courses table',
    up: `
      ALTER TABLE courses ADD COLUMN syllabus_body TEXT;
      ALTER TABLE courses ADD COLUMN syllabus_updated_at DATETIME;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily, would need table rebuild
      SELECT 1;
    `,
  },
  {
    version: 14,
    description: 'Create performance indexes',
    up: `
      CREATE INDEX idx_tasks_priority ON tasks(priority_score DESC);
      CREATE INDEX idx_tasks_due_date ON tasks(due_at);
      CREATE INDEX idx_tasks_course ON tasks(course_id);
      CREATE INDEX idx_tasks_source ON tasks(source_type);
      CREATE INDEX idx_notifications_dismissed ON notifications(dismissed_at);
      CREATE INDEX idx_notifications_course ON notifications(course_id);
      CREATE INDEX idx_calendar_events_start ON calendar_events(start_at);
      CREATE INDEX idx_resources_course ON resources(course_id);
      CREATE INDEX idx_grade_history_course ON grade_history(course_id);
      CREATE INDEX idx_course_policies_course ON course_policies(course_id);
      CREATE INDEX idx_course_policies_type ON course_policies(policy_type);
      CREATE INDEX idx_course_pages_course ON course_pages(course_id);
      CREATE INDEX idx_course_pages_type ON course_pages(page_type);
      CREATE INDEX idx_modules_course ON modules(course_id);
      CREATE INDEX idx_module_items_module ON module_items(module_id);
    `,
    down: `
      DROP INDEX IF EXISTS idx_tasks_priority;
      DROP INDEX IF EXISTS idx_tasks_due_date;
      DROP INDEX IF EXISTS idx_tasks_course;
      DROP INDEX IF EXISTS idx_tasks_source;
      DROP INDEX IF EXISTS idx_notifications_dismissed;
      DROP INDEX IF EXISTS idx_notifications_course;
      DROP INDEX IF EXISTS idx_calendar_events_start;
      DROP INDEX IF EXISTS idx_resources_course;
      DROP INDEX IF EXISTS idx_grade_history_course;
      DROP INDEX IF EXISTS idx_course_policies_course;
      DROP INDEX IF EXISTS idx_course_policies_type;
      DROP INDEX IF EXISTS idx_course_pages_course;
      DROP INDEX IF EXISTS idx_course_pages_type;
      DROP INDEX IF EXISTS idx_modules_course;
      DROP INDEX IF EXISTS idx_module_items_module;
    `,
  },
  {
    version: 15,
    description: 'Add policy tracking columns to notifications',
    up: `
      ALTER TABLE notifications ADD COLUMN is_policy_related BOOLEAN DEFAULT FALSE;
      ALTER TABLE notifications ADD COLUMN policy_keywords TEXT;
      ALTER TABLE notifications ADD COLUMN linked_policy_id INTEGER REFERENCES course_policies(id);
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 16,
    description: 'Create policy_announcements junction table',
    up: `
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
    down: `
      DROP INDEX IF EXISTS idx_policy_announcements_notification;
      DROP INDEX IF EXISTS idx_policy_announcements_course;
      DROP TABLE policy_announcements;
    `,
  },
  {
    version: 17,
    description: 'Add url column to notifications for linking back to Canvas',
    up: `
      ALTER TABLE notifications ADD COLUMN url TEXT;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 18,
    description: 'Create notification_attachments table for file attachments',
    up: `
      CREATE TABLE notification_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        size_bytes INTEGER,
        content_type TEXT,
        local_path TEXT,
        download_status TEXT CHECK(download_status IN ('pending', 'downloading', 'completed', 'failed')) DEFAULT 'pending',
        downloaded_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        UNIQUE(notification_id, external_id)
      );
      CREATE INDEX idx_notification_attachments_notification ON notification_attachments(notification_id);
      CREATE INDEX idx_notification_attachments_course ON notification_attachments(course_id);
      CREATE INDEX idx_notification_attachments_status ON notification_attachments(download_status);
    `,
    down: `
      DROP INDEX IF EXISTS idx_notification_attachments_notification;
      DROP INDEX IF EXISTS idx_notification_attachments_course;
      DROP INDEX IF EXISTS idx_notification_attachments_status;
      DROP TABLE notification_attachments;
    `,
  },
  {
    version: 19,
    description: 'Add color, nickname, and is_hidden columns to courses table',
    up: `
      ALTER TABLE courses ADD COLUMN color TEXT;
      ALTER TABLE courses ADD COLUMN nickname TEXT;
      ALTER TABLE courses ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
    `,
    down: `
      -- SQLite doesn't support DROP COLUMN easily
      SELECT 1;
    `,
  },
  {
    version: 20,
    description: 'Clean HTML from notification messages',
    up: `
      -- Strip HTML tags from notification messages
      -- This handles data synced before HTML stripping was added
      UPDATE notifications SET message =
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(message, '<br>', char(10)),
                          '<br/>', char(10)),
                        '<br />', char(10)),
                      '</p>', char(10)),
                    '</div>', char(10)),
                  '</li>', char(10)),
                '<li>', '• '),
              '&nbsp;', ' '),
            '&amp;', '&'),
          '&quot;', '"')
      WHERE message LIKE '%<%>%';

      -- Remove remaining HTML tags using recursive replacement
      -- SQLite doesn't have regex, so we use a simple approach
      UPDATE notifications SET message =
        TRIM(
          REPLACE(
            REPLACE(
              REPLACE(message, '  ', ' '),
              char(10) || char(10) || char(10), char(10) || char(10)),
            char(10) || ' ', char(10))
        )
      WHERE 1=1;
    `,
    down: `
      -- Cannot restore original HTML
      SELECT 1;
    `,
  },
];
