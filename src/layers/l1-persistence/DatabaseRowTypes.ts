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
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
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
  task_group_id: number | null;
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
