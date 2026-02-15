/**
 * Data Mapper Types - TypeScript interfaces for Canvas API and local database
 *
 * Extracted from DataMappers.ts for maintainability.
 * This module contains pure type definitions with no runtime code.
 */

// =============================================================================
// CANVAS API RESPONSE TYPES
// =============================================================================

export interface CanvasTerm {
  id: number;
  name: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  default_view: string;
  syllabus_body?: string;
  term?: CanvasTerm;
  enrollments?: Array<{
    type: string;
    computed_current_score?: number;
    computed_current_grade?: string;
  }>;
}

export interface CanvasSubmission {
  id?: number;
  workflow_state?: string; // 'unsubmitted' | 'submitted' | 'graded' | 'pending_review'
  submitted_at?: string | null;
  graded_at?: string | null;
  score?: number | null;
  grade?: string | null;
  late?: boolean;
  missing?: boolean;
  excused?: boolean;
  // Late penalty fields from Canvas API
  late_policy_status?: 'none' | 'late' | 'missing' | 'extended' | null;
  points_deducted?: number | null;
  seconds_late?: number;
  entered_score?: number | null; // Pre-penalty score
  entered_grade?: string | null; // Pre-penalty grade string
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number;
  submission_types: string[];
  has_submitted_submissions: boolean;
  course_id: number;
  grading_type: string;
  assignment_group_id: number;
  submission?: CanvasSubmission; // Included when fetched with include[]=submission
}

export interface CanvasAttachment {
  id: number;
  uuid: string;
  display_name: string;
  filename: string;
  url: string;
  size: number;
  content_type: string;
  created_at: string;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string;
  posted_at: string;
  context_code: string;
  user_name?: string;
  author?: { display_name: string };
  attachments?: CanvasAttachment[];
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  require_sequential_progress: boolean;
  publish_final_grade: boolean;
  published: boolean;
  items_count: number;
  items_url: string;
  items?: CanvasModuleItem[];
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  title: string;
  type: string; // Accept any type Canvas returns (File, Page, Discussion, Assignment, Quiz, SubHeader, ExternalUrl, ExternalTool, etc.)
  content_id?: number;
  position: number;
  indent: number;
  url?: string; // API URL for the content (e.g., /api/v1/courses/123/pages/my-page)
  external_url?: string;
  html_url?: string; // Browser URL for viewing in Canvas
  page_url?: string; // Page slug for Page type items (e.g., "my-page")
  completion_requirement?: {
    type: string;
    min_score?: number;
    completed?: boolean;
  };
  published: boolean;
}

export interface CanvasPage {
  url: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  editing_roles: string;
  published: boolean;
  front_page: boolean;
}

export interface CanvasFile {
  id: number;
  uuid: string;
  folder_id: number;
  display_name: string;
  filename: string;
  url: string;
  size: number;
  content_type: string;
  created_at: string;
  updated_at: string;
  modified_at?: string; // Canvas uses modified_at for actual content changes
  unlock_at: string | null;
  hidden: boolean;
}

export interface CanvasFolder {
  id: number;
  name: string;
  full_name: string;
  context_id: number;
  context_type: string;
  parent_folder_id: number | null;
  created_at: string;
  updated_at: string;
  position: number;
  files_count: number;
  folders_count: number;
}

// =============================================================================
// LOCAL DATABASE RECORD TYPES
// =============================================================================

// Note: Index signatures are for Database.upsert compatibility

export interface LocalCourse {
  [key: string]: unknown;
  external_id: string;
  code: string;
  name: string;
  current_grade: number | null;
  assessed_grade: number | null;
  target_grade: number;
  target_grade_source: 'default' | 'manual';
  landing_page_url: string | null;
  syllabus_body: string | null;
  last_synced_at: string;
  enrollment_term_id: number | null;
  credits: number;
}

export interface LocalTask {
  [key: string]: unknown;
  external_id: string;
  source_type: 'canvas' | 'user';
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  due_time_known: number; // 1 = time known, 0 = only date known (assume midnight)
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  submission_types: string | null;
  weight: number;
  grade: number | null; // Percentage grade from Canvas (score / points_possible * 100)
  task_type: string; // Classified from title/submission_types using TaskTypeClassifier
  task_subtype: string | null; // Subtype for more specific categorization (e.g., 'numbered', 'webwork')
  is_completed: number; // SQLite boolean: 0 or 1
  submission_status: 'pending' | 'submitted' | 'graded'; // Canvas workflow state mapped
  completed_at: string | null;
  // Late penalty tracking fields
  entered_grade: number | null; // Pre-penalty percentage grade
  points_deducted: number | null; // Points removed by late policy
  late_policy_status: string; // 'none' | 'late' | 'missing' | 'extended'
  seconds_late: number; // How late the submission was
  is_excused: number; // SQLite boolean: 0 or 1
  is_missing: number; // SQLite boolean: 0 or 1
  // Task linking fields
  assignment_group_id: number | null; // FK to canvas_assignment_groups
  // Classification metadata stored in field_sources JSON
  field_sources?: string | null; // JSON string with TaskTypeFieldSource for task_type
}

export interface LocalNotification {
  [key: string]: unknown;
  source_type: 'canvas' | 'system';
  source_id: string;
  course_id: number;
  title: string;
  message: string;
  message_html: string | null; // Original HTML content for display
  url: string | null;
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  published_at: string;
  is_policy_related: number; // SQLite boolean: 0 or 1
  policy_keywords: string | null;
}

export interface LocalNotificationAttachment {
  [key: string]: unknown;
  course_id: number;
  external_id: string;
  display_name: string;
  filename: string;
  url: string;
  size_bytes: number | null;
  content_type: string | null;
  local_path: string | null;
  download_status: 'pending' | 'downloading' | 'completed' | 'failed';
}

export interface LocalModule {
  [key: string]: unknown;
  external_id: string;
  course_id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  require_sequential_progress: number; // SQLite boolean: 0 or 1
  published: number; // SQLite boolean: 0 or 1
}

export interface LocalModuleItem {
  [key: string]: unknown;
  external_id: string;
  module_id: number;
  title: string;
  item_type: string;
  content_id: string | null;
  position: number;
  indent: number;
  url: string | null;
  external_url: string | null;
  page_url: string | null; // Page slug for Page type items
  completion_requirement: string | null;
  published: number; // SQLite boolean: 0 or 1
}

export interface LocalPage {
  [key: string]: unknown;
  external_id: string;
  course_id: number;
  page_type: 'syllabus' | 'landing' | 'content' | 'module_item';
  title: string;
  url_slug: string | null;
  body_html: string | null;
  body_text: string | null;
  is_front_page: number; // SQLite boolean: 0 or 1
  published: number; // SQLite boolean: 0 or 1
  remote_updated_at?: string | null;
}

export interface LocalResource {
  [key: string]: unknown;
  external_id: string;
  course_id: number;
  parent_folder_id: number | null;
  folder_path: string | null;
  type: 'file' | 'folder' | 'external_url' | 'page';
  title: string;
  url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  unlock_at: string | null;
  remote_updated_at: string | null;
  context_type:
    | 'page'
    | 'assignment'
    | 'syllabus'
    | 'module'
    | 'announcement'
    | 'files'
    | null;
  context_id: string | null;
}

// =============================================================================
// MAPPER RESULT TYPES
// =============================================================================

export interface MappedAnnouncement {
  notification: LocalNotification;
  attachments: LocalNotificationAttachment[];
  fileReferences: FileReference[];
}

/**
 * Represents a file reference detected in announcement message
 */
export interface FileReference {
  startPosition: number;
  endPosition: number;
  matchedText: string;
  originalUrl: string | null;
  attachmentExternalId: string | null; // To link to attachment after insert
}

// =============================================================================
// CANVAS TASK QUEUE TYPES
// =============================================================================

/**
 * Local database record for canvas_task_queue table
 * Stages new Canvas assignments for user review before acceptance
 */
export interface LocalCanvasTaskQueue {
  [key: string]: unknown;
  external_id: string;
  canvas_data: string; // JSON string of full CanvasAssignment
  course_id: number;

  // Denormalized fields for UI display (avoid JSON parsing)
  title: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  task_type: string | null;

  // Queue state
  status: 'pending' | 'accepted' | 'rejected' | 'merged';

  // User task matching
  matched_user_task_id: number | null;
  match_confidence: number | null;
}
