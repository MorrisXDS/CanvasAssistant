/**
 * Test script for Notification Dot System
 *
 * Run with: npx ts-node scripts/test-notification-dots.ts
 * Or import and run specific functions from main process
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), 'AppData/Roaming/CanvasAssistant/canvas.db');

interface TestConfig {
  courseId: number;
  taskId: number;
  fileId: number;
}

/**
 * Insert test sync_updates to verify notification dots
 */
export function createTestSyncUpdates(db: Database.Database, config: TestConfig) {
  const { courseId, taskId, fileId } = config;
  const now = new Date().toISOString();

  const inserts = [
    // Blue dot: task field updated (due_at changed)
    {
      course_id: courseId,
      entity_type: 'task',
      entity_id: taskId,
      change_type: 'updated',
      changed_field: 'due_at',
      title: 'Test: Due Date Changed',
      subtitle: 'Due date changed',
      old_value: '2025-02-10T23:59:00Z',
      new_value: '2025-02-15T23:59:00Z',
      created_at: now,
      seen_at: null,
    },
    // Blue dot: task field updated (weight changed)
    {
      course_id: courseId,
      entity_type: 'task',
      entity_id: taskId,
      change_type: 'updated',
      changed_field: 'weight',
      title: 'Test: Weight Changed',
      subtitle: 'Weight changed',
      old_value: '10',
      new_value: '15',
      created_at: now,
      seen_at: null,
    },
    // Orange dot: grade changed
    {
      course_id: courseId,
      entity_type: 'grade',
      entity_id: taskId,
      change_type: 'grade_changed',
      changed_field: 'grade',
      title: 'Test: Grade Updated',
      subtitle: 'Grade: 85%',
      old_value: '80',
      new_value: '85',
      created_at: now,
      seen_at: null,
    },
    // Green dot: new file
    {
      course_id: courseId,
      entity_type: 'file',
      entity_id: fileId,
      change_type: 'new',
      changed_field: null,
      title: 'test-lecture.pdf',
      subtitle: '2.5 MB',
      old_value: null,
      new_value: null,
      created_at: now,
      seen_at: null,
    },
  ];

  const stmt = db.prepare(`
    INSERT INTO sync_updates (
      course_id, entity_type, entity_id, change_type, changed_field,
      title, subtitle, old_value, new_value, created_at, seen_at
    ) VALUES (
      @course_id, @entity_type, @entity_id, @change_type, @changed_field,
      @title, @subtitle, @old_value, @new_value, @created_at, @seen_at
    )
  `);

  const insertMany = db.transaction((items: typeof inserts) => {
    for (const item of items) {
      stmt.run(item);
    }
  });

  insertMany(inserts);
  console.log(`✅ Created ${inserts.length} test sync_updates`);
}

/**
 * Clear all test sync_updates (those with 'Test:' prefix)
 */
export function clearTestSyncUpdates(db: Database.Database) {
  const result = db
    .prepare(
      `
    DELETE FROM sync_updates WHERE title LIKE 'Test:%' OR title LIKE 'test-%'
  `
    )
    .run();
  console.log(`🗑️  Cleared ${result.changes} test sync_updates`);
}

/**
 * Mark all sync_updates as seen (simulates user viewing everything)
 */
export function markAllSeen(db: Database.Database) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
    UPDATE sync_updates SET seen_at = ? WHERE seen_at IS NULL
  `
    )
    .run(now);
  console.log(`👁️  Marked ${result.changes} sync_updates as seen`);
}

/**
 * Show current sync_updates status
 */
export function showStatus(db: Database.Database) {
  const stats = db
    .prepare(
      `
    SELECT
      change_type,
      COUNT(*) as total,
      SUM(CASE WHEN seen_at IS NULL THEN 1 ELSE 0 END) as unseen
    FROM sync_updates
    GROUP BY change_type
  `
    )
    .all();

  console.log('\n📊 Sync Updates Status:');
  console.log('─'.repeat(40));
  for (const row of stats as Array<{
    change_type: string;
    total: number;
    unseen: number;
  }>) {
    console.log(`  ${row.change_type}: ${row.unseen} unseen / ${row.total} total`);
  }
  console.log('─'.repeat(40));
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const db = new Database(DB_PATH);

  // Get first course and task for testing
  const course = db.prepare('SELECT id FROM courses LIMIT 1').get() as
    | { id: number }
    | undefined;
  const task = db.prepare('SELECT id FROM tasks LIMIT 1').get() as
    | { id: number }
    | undefined;
  const file = db.prepare('SELECT id FROM resources LIMIT 1').get() as
    | { id: number }
    | undefined;

  if (!course || !task) {
    console.error('❌ No courses or tasks found. Sync with Canvas first.');
    process.exit(1);
  }

  const config: TestConfig = {
    courseId: course.id,
    taskId: task.id,
    fileId: file?.id || 1,
  };

  switch (command) {
    case 'create':
      createTestSyncUpdates(db, config);
      break;
    case 'clear':
      clearTestSyncUpdates(db);
      break;
    case 'seen':
      markAllSeen(db);
      break;
    case 'status':
      showStatus(db);
      break;
    default:
      console.log(`
Usage: npx ts-node scripts/test-notification-dots.ts <command>

Commands:
  create  - Create test sync_updates (shows dots)
  clear   - Remove test sync_updates
  seen    - Mark all as seen (clears dots)
  status  - Show current sync_updates stats

Test Flow:
  1. Run 'create' to add test updates
  2. Open app - verify dots appear on sidebar, courses, tasks
  3. Expand a task - verify dots clear for that task
  4. Run 'status' to check unseen counts
  5. Run 'clear' to clean up
      `);
  }

  db.close();
}
