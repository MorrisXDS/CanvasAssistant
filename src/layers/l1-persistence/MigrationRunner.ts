import { Database } from './Database';
import fs from 'fs';
import path from 'path';

export interface Migration {
  version: number;
  description: string;
  up: string;
  down?: string;
}

/**
 * Migration Runner for SQLite database
 *
 * Handles:
 * - Running migrations in order
 * - Tracking applied migrations
 * - Rollback support (if down SQL provided)
 * - Automatic backup before migrations
 */
export class MigrationRunner {
  private db: Database;
  private migrationsPath: string;
  private migrations: Migration[] = [];

  constructor(db: Database, migrationsPath?: string) {
    this.db = db;
    this.migrationsPath = migrationsPath || path.join(process.cwd(), 'migrations');
  }

  /**
   * Load migrations from TypeScript/JavaScript files or use programmatic migrations
   */
  loadMigrations(migrations?: Migration[]): void {
    if (migrations) {
      this.migrations = migrations.sort((a, b) => a.version - b.version);
      return;
    }

    // Load from files if no programmatic migrations provided
    if (!fs.existsSync(this.migrationsPath)) {
      return;
    }

    const files = fs
      .readdirSync(this.migrationsPath)
      .filter((f) => f.match(/^\d{3}_.*\.(ts|js)$/));

    for (const file of files) {
      const filePath = path.join(this.migrationsPath, file);

      const migration = require(filePath);
      if (migration.default) {
        this.migrations.push(migration.default);
      }
    }

    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Get pending migrations (not yet applied)
   */
  getPendingMigrations(): Migration[] {
    const currentVersion = this.db.getSchemaVersion();
    return this.migrations.filter((m) => m.version > currentVersion);
  }

  /**
   * Run all pending migrations
   */
  runAll(): { applied: number; errors: string[] } {
    const pending = this.getPendingMigrations();
    const errors: string[] = [];
    let applied = 0;

    for (const migration of pending) {
      try {
        this.runMigration(migration);
        applied++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Migration ${migration.version}: ${message}`);
        break; // Stop on first error
      }
    }

    return { applied, errors };
  }

  /**
   * Run a single migration
   */
  private runMigration(migration: Migration): void {
    this.db.transaction(() => {
      // Execute migration SQL
      this.db.exec(migration.up);

      // Record migration as applied
      this.db.recordMigration(migration.version, migration.description);
    });
  }

  /**
   * Rollback to a specific version
   */
  rollbackTo(targetVersion: number): { rolledBack: number; errors: string[] } {
    const currentVersion = this.db.getSchemaVersion();
    const errors: string[] = [];
    let rolledBack = 0;

    if (targetVersion >= currentVersion) {
      return { rolledBack: 0, errors: ['Target version is not lower than current'] };
    }

    // Get migrations to rollback in reverse order
    const toRollback = this.migrations
      .filter((m) => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    for (const migration of toRollback) {
      if (!migration.down) {
        errors.push(`Migration ${migration.version} has no rollback SQL`);
        break;
      }

      try {
        this.db.transaction(() => {
          this.db.exec(migration.down!);
          // Use parameterized query to prevent SQL injection
          this.db.executeWrite('DELETE FROM schema_version WHERE version = ?', [
            migration.version,
          ]);
        });
        rolledBack++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Rollback ${migration.version}: ${message}`);
        break;
      }
    }

    return { rolledBack, errors };
  }

  /**
   * Get migration status
   */
  getStatus(): {
    currentVersion: number;
    pendingCount: number;
    migrations: Array<{
      version: number;
      description: string;
      applied: boolean;
    }>;
  } {
    const currentVersion = this.db.getSchemaVersion();
    const pending = this.getPendingMigrations();

    return {
      currentVersion,
      pendingCount: pending.length,
      migrations: this.migrations.map((m) => ({
        version: m.version,
        description: m.description,
        applied: m.version <= currentVersion,
      })),
    };
  }
}

/**
 * Core schema migrations for CID
 * Based on CID_Implementation_Plan_v4.0.md Part II
 */
export const coreMigrations: Migration[] = [
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
      -- Note: These columns may already exist from SyncConflictResolver or migration 50's table recreation
      -- This migration is now a no-op to avoid duplicate column errors; columns are ensured by later migrations
      SELECT 1;
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
];
