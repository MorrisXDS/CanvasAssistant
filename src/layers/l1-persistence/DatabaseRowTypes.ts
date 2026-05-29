/**
 * DatabaseRowTypes - Centralized Database Row Interfaces
 *
 * Single source of truth for all database row interfaces used across
 * orchestrators and services. This prevents schema drift and ensures
 * consistent type definitions.
 *
 * IMPORTANT: When the database schema changes, update types HERE, not in
 * individual orchestrators.
 */

// =============================================================================
// Core Entity Rows (L1 Persistence)
// =============================================================================

/**
 * Course row from courses table
 * Used by: PriorityOrchestrator, InsightOrchestrator, RecommendationOrchestrator,
 *          WorkloadOrchestrator, BehaviorTrackingOrchestrator
 */
export interface CourseRow {
  id: number;
  external_id: string;
  code: string;
  name: string;
  target_grade: number;
  target_grade_source: 'default' | 'manual';
  assessed_grade: number | null;
  current_grade: number | null;
  total_weight: number;
  /** Grade curve adjustment in percentage points (e.g., +5.0 or -3.0) */
  grade_curve_adjustment: number;
  color: string | null;
  nickname: string | null;
  is_hidden: number;
  syllabus_body: string | null;
  last_synced_at: string | null;
  enrollment_term_id: number | null;
  /** Course credits/units for weighted GPA calculation */
  credits: number;
  /** ISO timestamp when course was archived, null if active */
  archived_at: string | null;
  /** How the course was archived: 'manual' (user) or 'auto' (term expired) */
  archive_source: 'manual' | 'auto' | null;
  created_at: string;
  updated_at: string;
  // Policy authority settings (v83)
  /** Authority for late penalty: 'canvas' | 'local' | 'both' */
  late_penalty_authority: string | null;
  /** Authority for drop lowest: 'canvas' | 'local' | 'off' */
  drop_lowest_authority: string | null;
  /** Grade calculation mode: 'canvas' | 'local' | 'both' */
  grade_calc_mode: string | null;

  // Queue acceptance settings (v91)
  /** Per-course auto-accept setting: 0=queue all, 1=auto-accept all, 2=auto-accept if matching user task */
  auto_accept_canvas_tasks: number;

  // Syllabus prompt dismissal (v102)
  /** ISO timestamp when user permanently dismissed the syllabus prompt, null if not dismissed */
  syllabus_prompt_dismissed_at: string | null;
}

/**
 * Minimal course row for queries that don't need all fields
 */
export interface CourseRowMinimal {
  id: number;
  code: string;
  name: string;
  current_grade: number | null;
  target_grade: number;
  total_weight: number;
}

/**
 * Course row for syllabus-only queries (ContentAnalysisOrchestrator)
 */
export interface CourseRowSyllabusOnly {
  id: number;
  syllabus_body: string | null;
}

/**
 * Task row from tasks table
 * Used by: PriorityOrchestrator, InsightOrchestrator, RecommendationOrchestrator,
 *          WorkloadOrchestrator, PolicyOrchestrator
 */
export interface TaskRow {
  id: number;
  external_id: string;
  /** Source type: 'canvas' (synced from Canvas) or 'user' (created locally). May be undefined in older DBs. */
  source_type?: 'canvas' | 'user';
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  due_time_known: number; // 1 = time known, 0 = only date known (assume midnight)
  /** User-defined start date for when to begin working on the task (local-only, not synced from Canvas) */
  start_at?: string | null;
  /** Canvas availability date (when assignment unlocks) */
  unlock_at?: string | null;
  lock_at?: string | null;
  weight: number;
  grade: number | null;
  points_possible: number | null;
  priority_score: number;
  is_completed: number;
  is_optional: number;
  completed_at: string | null;
  submission_status: string | null;
  task_type: string | null;
  /** Subtype for more specific task categorization (e.g., 'numbered', 'webwork', 'final') */
  task_subtype: string | null;
  task_group_id: number | null;
  /** FK to calendar_events.id for task-calendar linking. ON DELETE SET NULL */
  calendar_event_id: number | null;
  /** Location for the task (e.g., room, building) */
  location: string | null;
  local_modified_at: string | null;
  field_sources: string | null; // JSON: {"due_at": "guessed", "grade": "canvas"}
  created_at: string;
  updated_at: string;
  // Late penalty tracking fields (v81)
  /** Pre-penalty percentage grade from Canvas */
  entered_grade: number | null;
  /** Points deducted by Canvas late policy */
  points_deducted: number | null;
  /** Canvas late policy status: 'none' | 'late' | 'missing' | 'extended' */
  late_policy_status: string | null;
  /** How late the submission was in seconds */
  seconds_late: number | null;
  /** Whether assignment was excused by instructor */
  is_excused: number | null;
  /** Whether assignment is marked as missing */
  is_missing: number | null;
  // Assignment group linking (v82)
  /** FK to canvas_assignment_groups.id */
  assignment_group_id: number | null;
  // Task linking fields (v84)
  /** External ID of user task this Canvas task was linked from */
  linked_from_user_task: string | null;
  /** ID of Canvas task this user task was merged into */
  merged_into_task_id: number | null;
  /** Confidence score of the link (0.0 - 1.0) */
  link_confidence: number | null;
  /** How the link was created: 'auto', 'suggested', 'manual' */
  link_method: string | null;

  // User notes and grade estimate (v86)
  /** User's personal notes on this task */
  notes: string | null;
  /** User's expected/estimated grade before Canvas grades it */
  user_expected_grade: number | null;
  /** Whether to use user's expected grade in calculations */
  use_expected_in_calc: number;
  /** Soft-delete timestamp (for merged user tasks) */
  deleted_at: string | null;

  // Queue acceptance tracking (v90)
  /** FK to canvas_task_queue.id - which queue entry this task was accepted from */
  accepted_from_queue_id: number | null;
  /** How the task was accepted: 'manual' | 'auto' | 'bulk' | 'legacy' */
  acceptance_method: string | null;
  /** When the task was accepted from the queue */
  accepted_at: string | null;
}

/**
 * Minimal task row for priority/workload queries
 */
export interface TaskRowMinimal {
  id: number;
  course_id: number;
  title: string;
  due_at: string | null;
  due_time_known: number; // 1 = time known, 0 = only date known
  /** User-defined start date for when to begin working on the task */
  start_at?: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  weight: number | null;
  is_completed: number;
  grade: number | null;
  completed_at?: string | null;
  task_type: string | null;
  /** Subtype for more specific task categorization */
  task_subtype?: string | null;
  task_group_id: number | null;
  submission_status: string | null;
}

/**
 * Task row with priority score (WorkloadOrchestrator)
 */
export interface TaskRowWithPriority extends TaskRowMinimal {
  priority_score: number;
}

/**
 * Task row with field sources (InsightOrchestrator)
 */
export interface TaskRowWithFieldSources extends TaskRowMinimal {
  field_sources: string | null;
}

/**
 * Policy row from policies table
 */
export interface PolicyRow {
  id: number;
  course_id: number;
  policy_type: string;
  policy_name: string;
  policy_config: string;
  raw_text: string | null;
  is_user_verified: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/**
 * Minimal policy row for priority calculations
 */
export interface PolicyRowMinimal {
  id: number;
  course_id: number;
  policy_type: string;
  policy_name: string;
  policy_config: string;
  is_active: number;
}

/**
 * Custom (user-defined) task type row from the `custom_task_types` table.
 * A `course_id` of null means the type is global (available to all courses).
 */
export interface CustomTaskTypeRow {
  id: number;
  name: string;
  display_name: string;
  course_id: number | null;
  created_at: string;
}

/**
 * Notification row from notifications table
 */
export interface NotificationRow {
  id: number;
  source_type: string;
  source_id: string;
  course_id: number | null;
  title: string;
  message: string;
  message_html: string | null;
  published_at: string;
  dismissed_at: string | null;
  url: string | null;
  created_at: string;
}

// =============================================================================
// Grace Token Rows
// =============================================================================

/**
 * Grace token row for priority calculations (minimal)
 */
export interface GraceTokenRowMinimal {
  course_id: number;
  total_tokens: number;
  tokens_remaining: number;
  hours_per_token: number;
  max_tokens_per_task: number;
}

/**
 * Grace token row with full policy details (PolicyOrchestrator)
 */
export interface GraceTokenRow {
  id: number;
  course_id: number;
  policy_id: number;
  total_tokens: number;
  tokens_remaining: number;
  hours_per_token: number;
  max_tokens_per_task: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Intelligence Layer Rows
// =============================================================================

/**
 * Insight row from user_insights table
 */
export interface InsightRow {
  id: number;
  insight_type: string;
  title: string;
  description: string;
  severity: string;
  data_json: string;
  acknowledged_at: string | null;
  expires_at: string | null;
  suppressed_forever?: number;
  created_at: string;
}

/**
 * Recommendation row from recommendations table
 */
export interface RecommendationRow {
  id: number;
  recommendation_type: string;
  task_id: number | null;
  course_id: number | null;
  title: string;
  description: string;
  reasoning: string;
  priority_score: number;
  valid_from: string;
  valid_until: string;
  dismissed_at: string | null;
  acted_on_at: string | null;
  suppressed_forever?: number;
  created_at: string;
}

/**
 * Workload snapshot row from workload_snapshots table
 */
export interface WorkloadSnapshotRow {
  id: number;
  snapshot_date: string;
  total_tasks_due: number;
  total_estimated_minutes: number;
  tasks_by_course: string;
  tasks_by_urgency: string;
  deadline_clustering_score: number;
}

/**
 * Completion event row from completion_events table
 */
export interface CompletionEventRow {
  id: number;
  task_id: number;
  course_id: number;
  task_type: string;
  started_at: string | null;
  completed_at: string;
  due_at: string | null;
  time_to_complete_minutes: number | null;
  day_of_week: number;
  hour_of_day: number;
  days_before_due: number | null;
  was_late: number;
  score_achieved: number | null;
  points_possible: number | null;
}

/**
 * Behavior pattern row from behavior_patterns table
 */
export interface BehaviorPatternRow {
  id: number;
  pattern_type: string;
  pattern_key: string;
  pattern_value: string;
  sample_size: number;
  confidence: number;
  last_updated_at: string;
}

/**
 * Weight adjustment row from weight_adjustments table
 */
export interface WeightAdjustmentRow {
  id: number;
  factor_name: string;
  course_id: number | null;
  task_type: string | null;
  weight_multiplier: number;
  adjustment_reason: string | null;
  sample_size: number;
  last_updated_at: string;
}

/**
 * Course syllabus row for staleness checking
 */
export interface CourseSyllabusRow {
  id: number;
  course_id: number;
  resource_id: number;
  resource_updated_at: string | null;
  last_reviewed_at: string;
  change_detected_at: string | null;
}

// =============================================================================
// Content Analysis Rows
// =============================================================================

/**
 * Content analysis row from content_analysis table
 */
export interface ContentAnalysisRow {
  id: number;
  source_type: string;
  source_id: number;
  course_id: number | null;
  document_type: string | null;
  extracted_text: string | null;
  extracted_entities: string | null;
  analysis_level: number;
  analyzed_at: string | null;
}

/**
 * Course page row from course_pages table
 */
export interface CoursePageRow {
  id: number;
  course_id: number;
  title: string;
  body_html: string | null;
  page_type: string;
}

/**
 * Resource row from resources table
 */
export interface ResourceRow {
  id: number;
  course_id: number;
  title: string;
  local_path: string | null;
  mime_type: string | null;
}

/**
 * Full Canvas-file row from `resources` table where `type='file'` (ADR-0008).
 *
 * Used by `CanvasFileReader` and `FileEntityProvider` — they need more
 * columns than the minimal `ResourceRow` above. Mirrors the schema as
 * created in `migrations/schema-core.ts` (resources table).
 */
export interface CanvasFileRow {
  id: number;
  external_id: string;
  course_id: number;
  parent_folder_id: number | null;
  type: string;
  title: string;
  url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  unlock_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  folder_path: string | null;
  remote_updated_at: string | null;
  context_type: string | null;
  context_id: string | null;
  first_referenced_by: string | null;
  version: number;
}

/**
 * Full announcement-attachment row from `notification_attachments` (ADR-0008).
 *
 * Used by `AnnouncementAttachmentReader` and `FileEntityProvider`. Mirrors
 * the schema in `migrations/schema-core.ts` (notification_attachments).
 */
export interface NotificationAttachmentRow {
  id: number;
  notification_id: number;
  course_id: number;
  external_id: string;
  display_name: string;
  filename: string;
  url: string;
  size_bytes: number | null;
  content_type: string | null;
  local_path: string | null;
  download_status: 'pending' | 'downloading' | 'completed' | 'failed';
  downloaded_at: string | null;
  created_at: string;
}

// =============================================================================
// Download Queue Rows
// =============================================================================

/**
 * Pending download row from pending_downloads table
 * Used by: main.ts for download queue crash recovery
 */
export interface PendingDownloadRow {
  id: number;
  resource_id: string;
  course_code: string;
  url: string;
  filename: string;
  context_folder: string | null;
  folder_path: string | null;
  expected_size: number | null;
  priority: number;
  status: string;
  retry_count: number;
}

// =============================================================================
// Message Display History Rows
// =============================================================================

/**
 * Display history row from message_display_history table
 * Used by: MessageProbationService for duplicate prevention with exponential backoff
 */
export interface DisplayHistoryRow {
  id: number;
  message_type: string;
  sub_type: string;
  content_hash: string;
  display_count: number;
  first_shown_at: string;
  last_shown_at: string;
  grounded_until: string | null;
  quiet_period_start: string | null;
}

// =============================================================================
// Grace Token Usage Rows
// =============================================================================

/**
 * Token usage row from grace_token_usage table
 * Used by: GraceTokenUsageRepository for tracking grace token consumption
 */
export interface TokenUsageRow {
  id: number;
  grace_token_id: number;
  task_id: number;
  tokens_used: number;
  hours_extended: number;
  used_at: string;
  notes: string | null;
}

// =============================================================================
// Module Item Rows
// =============================================================================

/**
 * Module item row with joined module and course info
 * Used by: data:getModuleItems IPC handler for Files page
 */
export interface ModuleItemRow {
  id: number;
  external_id: string;
  title: string;
  item_type: string; // Dynamic - any Canvas type (File, Page, Assignment, Quiz, etc.)
  content_id: string | null;
  url: string | null;
  external_url: string | null;
  position: number;
  indent: number;
  module_name: string;
  module_position: number;
  course_id: number;
  course_code: string;
  course_name: string;
}

// =============================================================================
// Canvas Assignment Groups (v82)
// =============================================================================

/**
 * Assignment group row from canvas_assignment_groups table
 * Stores Canvas assignment group metadata for drop_lowest, group weights
 */
export interface AssignmentGroupRow {
  id: number;
  course_id: number;
  canvas_group_id: number;
  name: string;
  position: number;
  group_weight: number | null;
  drop_lowest: number;
  drop_highest: number;
  never_drop: string | null; // JSON array of Canvas assignment IDs
  synced_at: string;
}

// =============================================================================
// Task Link Suggestions (v85)
// =============================================================================

/**
 * Link suggestion row from link_suggestions table
 * For user review of medium-confidence task matches
 */
export interface LinkSuggestionRow {
  id: number;
  user_task_id: number;
  canvas_task_id: number;
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null; // 'user' | 'auto' | 'manual'
}

// =============================================================================
// Canvas Task Queue Rows (v89)
// =============================================================================

/**
 * Canvas task queue row from canvas_task_queue table
 * Stages new Canvas assignments for user review before becoming active tasks
 */
export interface CanvasTaskQueueRow {
  id: number;
  /** Canvas assignment external ID */
  external_id: string;
  /** Full Canvas API payload as JSON string */
  canvas_data: string;
  course_id: number;

  // Denormalized fields for UI display
  title: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  task_type: string | null;

  /** Queue status: 'pending' | 'accepted' | 'rejected' | 'merged' */
  status: 'pending' | 'accepted' | 'rejected' | 'merged';

  /** ID of matching user task (for merge suggestions) */
  matched_user_task_id: number | null;
  /** Confidence score of the match (0.0 - 1.0) */
  match_confidence: number | null;

  /** When the task was first seen from Canvas */
  first_seen_at: string;
  /** When the task was last synced from Canvas */
  last_synced_at: string;
  /** When the queue entry was resolved (accepted/rejected/merged) */
  resolved_at: string | null;
  /** How the entry was resolved: 'user' | 'auto' | 'bulk' */
  resolved_by: string | null;
  /** When queued task values actually changed (vs just metadata refresh) */
  values_changed_at: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Minimal queue row for list displays
 */
export interface CanvasTaskQueueRowMinimal {
  id: number;
  external_id: string;
  course_id: number;
  title: string;
  due_at: string | null;
  task_type: string | null;
  status: string;
  matched_user_task_id: number | null;
  match_confidence: number | null;
  first_seen_at: string;
  /** When queued task values actually changed (vs just metadata refresh) */
  values_changed_at: string | null;
}

// =============================================================================
// Sync Updates Rows (v94)
// =============================================================================

/**
 * Sync session row from sync_sessions table
 * Tracks each sync operation for grouping updates
 */
export interface SyncSessionRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  total_new_tasks: number;
  total_updated_tasks: number;
  total_new_announcements: number;
  total_grade_changes: number;
  total_new_files: number;
  dismissed_at: string | null;
  created_at: string;
}

/**
 * Sync update row from sync_updates table
 * Individual change records and conflicts from sync operations
 */
export interface SyncUpdateRow {
  id: number;
  sync_session_id: string;
  course_id: number;
  entity_type: 'task' | 'announcement' | 'grade' | 'file' | 'conflict';
  entity_id: number;
  external_id: string | null;
  change_type: 'new' | 'updated' | 'grade_changed' | 'conflict';
  title: string;
  subtitle: string | null;
  old_value: string | null;
  new_value: string | null;
  conflict_field: string | null;
  conflict_resolution: 'local' | 'canvas' | null;
  remember_choice: number;
  is_action_required: number;
  seen_at: string | null;
  resolved_at: string | null;
  created_at: string;
  /** When Canvas value changed on an unresolved conflict (if updated_at > created_at, item was modified) */
  updated_at: string | null;
  /** Which specific field changed for 'updated' changeType (e.g., 'due_at', 'weight', 'grade') */
  changed_field: string | null;
}

/**
 * Sync update row with course info for UI display
 */
export interface SyncUpdateRowWithCourse extends SyncUpdateRow {
  course_code: string;
  course_name: string;
  course_color: string | null;
}

// =============================================================================
// Task Type Classification (v100)
// =============================================================================

/**
 * Extended field_sources format for task_type classification metadata
 * Stored in tasks.field_sources JSON under the 'task_type' key
 *
 * Example:
 * {
 *   "task_type": {
 *     "source": "canvas",
 *     "tier": 1,
 *     "confidence": 100,
 *     "detectedType": "quiz",
 *     "detectedSubtype": "numbered",
 *     "patternsMatched": ["tier1:/^quiz\\s*#?\\d+/i"]
 *   }
 * }
 */
export interface TaskTypeFieldSource {
  /** Who set this value: 'canvas' (from classification), 'user' (manually set), 'guessed' (legacy) */
  source: 'canvas' | 'user' | 'guessed';
  /** Detection tier (1=exact regex, 2=keyword, 3=submission type, 4=context) */
  tier: 1 | 2 | 3 | 4;
  /** Confidence score 0-100 */
  confidence: number;
  /** The detected type value */
  detectedType: string;
  /** The detected subtype value (null if none) */
  detectedSubtype: string | null;
  /** Patterns/indicators that matched during classification */
  patternsMatched: string[];
}
