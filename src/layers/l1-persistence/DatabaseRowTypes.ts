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
  /** User-set submission status, independent of Canvas. Used for OR logic with submission_status */
  user_submission_status: string | null;
  task_type: string | null;
  task_group_id: number | null;
  /** FK to calendar_events.id for task-calendar linking. ON DELETE SET NULL */
  calendar_event_id: number | null;
  /** Location for the task (e.g., room, building) */
  location: string | null;
  local_modified_at: string | null;
  field_sources: string | null; // JSON: {"due_at": "guessed", "grade": "canvas"}
  created_at: string;
  updated_at: string;
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
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  weight: number | null;
  is_completed: number;
  grade: number | null;
  completed_at?: string | null;
  task_type: string | null;
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
