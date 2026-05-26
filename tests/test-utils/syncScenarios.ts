/**
 * Sync pipeline test utilities.
 * Seed helpers write to a real SQLite DB (Node ABI, via npm test pretest).
 * Canvas mock factories return plain objects matching the CanvasAssignment shape.
 */

import type { Database } from '../../src/layers/l1-persistence/Database';

// ---------------------------------------------------------------------------
// Canvas mock factories
// ---------------------------------------------------------------------------

export interface MockAssignmentOptions {
  id: number;
  name: string;
  courseId?: number;
  dueAt?: string | null;
  pointsPossible?: number | null;
  description?: string | null;
  submissionTypes?: string[];
  gradingType?: string;
  assignmentGroupId?: number;
}

export function mockCanvasAssignment(
  opts: MockAssignmentOptions
): Record<string, unknown> {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description ?? null,
    due_at: opts.dueAt ?? null,
    unlock_at: null,
    lock_at: null,
    points_possible: opts.pointsPossible !== undefined ? opts.pointsPossible : 100,
    submission_types: opts.submissionTypes ?? ['online_upload'],
    has_submitted_submissions: false,
    course_id: opts.courseId ?? 12345,
    grading_type: opts.gradingType ?? 'points',
    assignment_group_id: opts.assignmentGroupId ?? 1,
  };
}

export interface MockCourseOptions {
  id: number;
  name?: string;
  code?: string;
  termId?: number;
}

export function mockCanvasCourse(opts: MockCourseOptions): Record<string, unknown> {
  return {
    id: opts.id,
    name: opts.name ?? 'Test Course',
    course_code: opts.code ?? 'TEST101',
    enrollment_term_id: opts.termId ?? 1,
    default_view: 'modules',
    enrollments: [{ type: 'student', computed_current_score: null }],
  };
}

// ---------------------------------------------------------------------------
// DB seed helpers
// ---------------------------------------------------------------------------

/** Seed a course row. Returns the local row id (auto-increment). */
export function seedCourse(
  db: Database,
  opts: {
    externalId: string;
    name?: string;
    code?: string;
    isHidden?: boolean;
    archivedAt?: string | null;
    deletedAt?: string | null;
  }
): number {
  db.executeWrite(
    `INSERT INTO courses (external_id, code, name, is_hidden, archived_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      opts.externalId,
      opts.code ?? 'TEST101',
      opts.name ?? 'Test Course',
      opts.isHidden ? 1 : 0,
      opts.archivedAt ?? null,
      opts.deletedAt ?? null,
    ],
    'courses'
  );
  const row = db.executeReadOne<{ id: number }>(
    'SELECT id FROM courses WHERE external_id = ?',
    [opts.externalId]
  );
  if (!row)
    throw new Error(`seedCourse: failed to find inserted course ${opts.externalId}`);
  return row.id;
}

export interface SeedTaskOptions {
  courseId: number;
  title: string;
  externalId?: string | null;
  sourceType?: 'user' | 'canvas';
  acceptanceMethod?: string | null;
  dueAt?: string | null;
  weight?: number | null;
  priorityScore?: number | null;
  grade?: number | null;
  deletedAt?: string | null;
  mergedIntoTaskId?: number | null;
  fieldSources?: Record<string, string>;
}

/** Seed a task row. Returns the local row id. */
export function seedTask(db: Database, opts: SeedTaskOptions): number {
  db.executeWrite(
    `INSERT INTO tasks
       (course_id, title, external_id, source_type, acceptance_method,
        due_at, weight, priority_score, grade, deleted_at, merged_into_task_id, field_sources)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.courseId,
      opts.title,
      opts.externalId ?? null,
      opts.sourceType ?? 'user',
      opts.acceptanceMethod ?? null,
      opts.dueAt ?? null,
      opts.weight ?? null,
      opts.priorityScore ?? null,
      opts.grade ?? null,
      opts.deletedAt ?? null,
      opts.mergedIntoTaskId ?? null,
      opts.fieldSources ? JSON.stringify(opts.fieldSources) : null,
    ],
    'tasks'
  );
  // Retrieve by rowid (last insert)
  const row = db.executeReadOne<{ id: number }>(
    'SELECT id FROM tasks WHERE rowid = last_insert_rowid()'
  );
  if (!row) throw new Error('seedTask: failed to find inserted task');
  return row.id;
}

export interface SeedQueueEntryOptions {
  externalId: string;
  courseId: number;
  title: string;
  status?: 'pending' | 'rejected' | 'accepted' | 'merged';
  dueAt?: string | null;
  pointsPossible?: number | null;
  canvasData?: Record<string, unknown>;
}

/** Seed a canvas_task_queue row. */
export function seedQueueEntry(db: Database, opts: SeedQueueEntryOptions): void {
  const canvasData = opts.canvasData ?? { id: opts.externalId, name: opts.title };
  db.executeWrite(
    `INSERT INTO canvas_task_queue
       (external_id, canvas_data, course_id, title, due_at, points_possible, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.externalId,
      JSON.stringify(canvasData),
      opts.courseId,
      opts.title,
      opts.dueAt ?? null,
      opts.pointsPossible ?? null,
      opts.status ?? 'pending',
    ],
    'canvas_task_queue'
  );
}

// ---------------------------------------------------------------------------
// DB read helpers
// ---------------------------------------------------------------------------

export interface QueueRow {
  id: number;
  external_id: string;
  course_id: number;
  title: string;
  status: string;
  due_at: string | null;
  points_possible: number | null;
}

export function readQueue(db: Database): QueueRow[] {
  return db.executeRead<QueueRow>('SELECT * FROM canvas_task_queue ORDER BY id');
}

export interface TaskRow {
  id: number;
  course_id: number;
  title: string;
  external_id: string | null;
  source_type: string;
  acceptance_method: string | null;
  due_at: string | null;
  weight: number | null;
  grade: number | null;
  deleted_at: string | null;
  merged_into_task_id: number | null;
  linked_from_user_task: string | null;
  link_confidence: number | null;
  link_method: string | null;
}

export function readTasks(db: Database): TaskRow[] {
  return db.executeRead<TaskRow>('SELECT * FROM tasks ORDER BY id');
}

/** Read conflict records from sync_updates (change_type = 'conflict'). */
export interface ConflictRow {
  id: number;
  entity_type: string;
  entity_id: number;
  conflict_field: string | null;
  old_value: string | null;
  new_value: string | null;
  conflict_resolution: string | null;
}

export function readConflicts(db: Database): ConflictRow[] {
  return db.executeRead<ConflictRow>(
    "SELECT * FROM sync_updates WHERE change_type = 'conflict' ORDER BY id"
  );
}

/** Read link_suggestions rows. */
export interface LinkSuggestionRow {
  id: number;
  user_task_id: number;
  canvas_task_id: number;
  confidence: number;
}

export function readLinkSuggestions(db: Database): LinkSuggestionRow[] {
  return db.executeRead<LinkSuggestionRow>('SELECT * FROM link_suggestions ORDER BY id');
}
