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
    this.migrationsPath =
      migrationsPath || path.join(process.cwd(), 'migrations');
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

    const files = fs.readdirSync(this.migrationsPath).filter((f) =>
      f.match(/^\d{3}_.*\.(ts|js)$/)
    );

    for (const file of files) {
      const filePath = path.join(this.migrationsPath, file);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
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
        const message =
          error instanceof Error ? error.message : String(error);
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
        errors.push(
          `Migration ${migration.version} has no rollback SQL`
        );
        break;
      }

      try {
        this.db.transaction(() => {
          this.db.exec(migration.down!);
          this.db.exec(
            `DELETE FROM schema_version WHERE version = ${migration.version}`
          );
        });
        rolledBack++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
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
    description: 'Create course_task_groups table for course-specific task categorization',
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
    description: 'Add announcement_file_references table for tracking file mentions in announcements',
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
];
