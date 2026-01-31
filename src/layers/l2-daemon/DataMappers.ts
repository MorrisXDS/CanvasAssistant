/**
 * Data Mappers - Transform Canvas API responses to local database schema
 *
 * Each mapper converts the Canvas API format to the format expected by
 * our local SQLite tables. This keeps transformation logic centralized
 * and testable.
 *
 * Validation: Uses Zod schemas from InputValidator to validate incoming data
 * before processing. Invalid fields are logged and defaults are used.
 */

import { convert } from 'html-to-text';
import { z } from 'zod';

// Validation schemas for defensive parsing
const SafeNumber = z.number().catch(0);
const SafeString = z.string().catch('');
const SafeNullableString = z.string().nullable().catch(null);
const SafeNullableNumber = z.number().nullable().catch(null);
const SafeBoolean = z.boolean().catch(false);
const SafeStringArray = z.array(z.string()).catch([]);

/**
 * Safely parse a value with a Zod schema, returning the default on failure
 */
function safeParse<T>(schema: z.ZodType<T>, value: unknown, fieldName?: string): T {
  const result = schema.safeParse(value);
  if (!result.success && fieldName) {
    // Validation failures are silently handled - schema will use defaults
    // In debug builds, enable: Logger.debug(`DataMapper validation: ${fieldName} - ${result.error.message}`);
  }
  return result.success ? result.data : schema.parse(undefined);
}

// Canvas API response types
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

// Local database record types (with index signatures for Database.upsert compatibility)
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
  task_type: string; // Derived from Canvas submission_types: 'assignment' | 'quiz' | 'discussion' | 'reading' | 'external'
  is_completed: number; // SQLite boolean: 0 or 1
  submission_status: 'pending' | 'submitted' | 'graded'; // Canvas workflow state mapped
  completed_at: string | null;
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

/**
 * Map Canvas attachment to local attachment record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapAttachment(
  canvas: CanvasAttachment,
  courseId: number
): LocalNotificationAttachment {
  const attachmentId = safeParse(SafeNumber, canvas.id, 'attachment.id');
  const displayName =
    safeParse(SafeString, canvas.display_name, 'attachment.display_name') ||
    `Attachment_${attachmentId}`;
  const filename =
    safeParse(SafeString, canvas.filename, 'attachment.filename') || displayName;
  const url = safeParse(SafeString, canvas.url, 'attachment.url');
  const size = safeParse(SafeNullableNumber, canvas.size, 'attachment.size');
  const contentType = safeParse(
    SafeNullableString,
    canvas.content_type,
    'attachment.content_type'
  );

  return {
    course_id: courseId,
    external_id: String(attachmentId),
    display_name: displayName,
    filename: filename,
    url: url,
    size_bytes: size,
    content_type: contentType,
    local_path: null,
    download_status: 'pending',
  };
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

// Policy detection keywords
const POLICY_KEYWORDS = {
  late_submission: ['late', 'deadline', 'extension', 'overdue', 'past due'],
  grace_period: ['grace', 'token', 'free pass', 'slip day', 'slip days'],
  penalties: ['penalty', 'deduction', '-5%', '-10%', 'penalize', 'penalized'],
  weight_changes: ['weight', 'reweight', 'redistribute', 'weighted'],
  drops: ['drop lowest', 'drop', 'forgive', 'forgiven'],
  bonus: ['bonus', 'extra credit', 'additional marks', 'additional points'],
  resubmission: ['resubmit', 'redo', 'correction', 'revision', 'reattempt'],
};

/**
 * Map Canvas course to local course record
 * Uses Zod schemas for defensive validation of incoming data
 * @param canvas - Canvas course data from API
 * @param baseUrl - Canvas base URL
 * @param defaultTargetGrade - User's default target grade (from settings)
 */
export function mapCourse(
  canvas: CanvasCourse,
  baseUrl: string,
  defaultTargetGrade: number = 80
): LocalCourse {
  // Validate incoming data with safe defaults
  const courseId = safeParse(SafeNumber, canvas.id, 'course.id');
  const courseCode =
    safeParse(SafeString, canvas.course_code, 'course.course_code') ||
    `Course_${courseId}`;
  const courseName = safeParse(SafeString, canvas.name, 'course.name') || courseCode;
  const syllabusBody = safeParse(
    SafeNullableString,
    canvas.syllabus_body,
    'course.syllabus_body'
  );
  const enrollmentTermId = safeParse(
    SafeNullableNumber,
    canvas.enrollment_term_id,
    'course.enrollment_term_id'
  );

  // Extract enrollment data with validation
  const enrollment = canvas.enrollments?.[0];
  const currentGrade = enrollment
    ? safeParse(
        SafeNullableNumber,
        enrollment.computed_current_score,
        'course.enrollment.computed_current_score'
      )
    : null;

  return {
    external_id: String(courseId),
    code: courseCode,
    name: courseName,
    current_grade: currentGrade,
    assessed_grade: null,
    target_grade: defaultTargetGrade,
    target_grade_source: 'default',
    landing_page_url: `${baseUrl}/courses/${courseId}`,
    syllabus_body: syllabusBody,
    last_synced_at: new Date().toISOString(),
    enrollment_term_id: enrollmentTermId,
  };
}

/**
 * Map Canvas assignment to local task record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapAssignment(
  canvas: CanvasAssignment,
  localCourseId: number
): LocalTask {
  // Validate incoming data with safe defaults
  const assignmentId = safeParse(SafeNumber, canvas.id, 'assignment.id');
  const assignmentName =
    safeParse(SafeString, canvas.name, 'assignment.name') || `Assignment_${assignmentId}`;
  const description = safeParse(
    SafeNullableString,
    canvas.description,
    'assignment.description'
  );
  const dueAt = safeParse(SafeNullableString, canvas.due_at, 'assignment.due_at');
  const unlockAt = safeParse(
    SafeNullableString,
    canvas.unlock_at,
    'assignment.unlock_at'
  );
  const lockAt = safeParse(SafeNullableString, canvas.lock_at, 'assignment.lock_at');
  const pointsPossible = safeParse(
    SafeNullableNumber,
    canvas.points_possible,
    'assignment.points_possible'
  );
  const submissionTypes = safeParse(
    SafeStringArray,
    canvas.submission_types,
    'assignment.submission_types'
  );

  // Determine submission status from Canvas workflow_state (authoritative source)
  // Canvas workflow_state: 'unsubmitted' | 'submitted' | 'graded' | 'pending_review'
  // Maps to our submission_status: 'pending' | 'submitted' | 'graded'
  const submission = canvas.submission;
  const workflowState = submission?.workflow_state;
  const submittedAt = submission?.submitted_at;
  const score = submission?.score;

  // Map Canvas workflow_state to our submission_status
  // Canvas workflow_state takes precedence over any user-set status
  let submissionStatus: 'pending' | 'submitted' | 'graded' = 'pending';
  if (workflowState === 'graded' || submission?.grade != null) {
    submissionStatus = 'graded';
  } else if (
    workflowState === 'submitted' ||
    workflowState === 'pending_review' ||
    submittedAt != null
  ) {
    submissionStatus = 'submitted';
  }

  // Calculate grade as percentage from score / points_possible
  let grade: number | null = null;
  if (score != null && pointsPossible != null && pointsPossible > 0) {
    grade = (score / pointsPossible) * 100;
  }

  // Derive task_type from submission_types
  const taskType = deriveTaskType(submissionTypes);

  // Detect if due time is known or only date
  // Midnight (00:00:00) timestamps often indicate "date only" from Canvas
  // Times like 23:59:00 or other specific times indicate known time
  let dueTimeKnown = 1; // Assume time is known by default
  if (dueAt) {
    const dueDate = new Date(dueAt);
    const hours = dueDate.getUTCHours();
    const minutes = dueDate.getUTCMinutes();
    const seconds = dueDate.getUTCSeconds();
    // Midnight UTC often means "date only" - Canvas didn't have a specific time
    if (hours === 0 && minutes === 0 && seconds === 0) {
      dueTimeKnown = 0;
    }
  }

  return {
    external_id: String(assignmentId),
    source_type: 'canvas',
    course_id: localCourseId,
    title: assignmentName,
    description,
    due_at: dueAt,
    due_time_known: dueTimeKnown,
    unlock_at: unlockAt,
    lock_at: lockAt,
    points_possible: pointsPossible,
    submission_types: submissionTypes.length > 0 ? submissionTypes.join(',') : null,
    weight: 0, // Will be calculated by L3 Intelligence
    grade,
    task_type: taskType,
    is_completed: submissionStatus !== 'pending' ? 1 : 0,
    submission_status: submissionStatus,
    completed_at:
      submittedAt || (submissionStatus !== 'pending' ? new Date().toISOString() : null),
  };
}

/**
 * Derive task_type from Canvas submission_types array
 * Maps Canvas submission types to our task categories
 */
function deriveTaskType(submissionTypes: string[]): string {
  // Check for not graded first (info items)
  if (submissionTypes.includes('not_graded')) {
    return 'info';
  }

  // Check for quiz
  if (submissionTypes.includes('online_quiz')) {
    return 'quiz';
  }

  // Check for discussion
  if (submissionTypes.includes('discussion_topic')) {
    return 'discussion';
  }

  // Check for no submission required (but graded - like attendance)
  if (submissionTypes.includes('none')) {
    return 'attendance';
  }

  // Check for external tool (could be exam proctoring, etc.)
  if (submissionTypes.includes('external_tool')) {
    return 'external';
  }

  // Default to assignment for upload, text entry, media, on_paper, etc.
  return 'assignment';
}

/**
 * Strip HTML and convert to clean plain text using html-to-text library
 * Preserves paragraph structure and formatting
 * Exported for use in migration and reprocessing
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  const text = convert(html, {
    wordwrap: false,
    preserveNewlines: false, // Don't preserve raw newlines from HTML source
    selectors: [
      // Paragraphs get single line break - we'll handle spacing in CSS
      { selector: 'p', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
      { selector: 'div', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
      // Headings
      {
        selector: 'h1',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false },
      },
      {
        selector: 'h2',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false },
      },
      {
        selector: 'h3',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false },
      },
      {
        selector: 'h4',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false },
      },
      {
        selector: 'h5',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false },
      },
      {
        selector: 'h6',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, uppercase: false },
      },
      // Lists
      {
        selector: 'ul',
        format: 'unorderedList',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1, itemPrefix: '• ' },
      },
      {
        selector: 'ol',
        format: 'orderedList',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1 },
      },
      // Block quotes
      {
        selector: 'blockquote',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1 },
      },
      // Links - keep text, ignore href
      { selector: 'a', options: { ignoreHref: true } },
      // Skip images
      { selector: 'img', format: 'skip' },
      // Tables
      { selector: 'table', format: 'dataTable' },
      // Line breaks
      { selector: 'br', format: 'lineBreak' },
      // Horizontal rules
      { selector: 'hr', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
    ],
  });

  // Collapse any 2+ consecutive newlines to single newline
  return text.replace(/\n{2,}/g, '\n').trim();
}

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

/**
 * Common file extensions to detect in text
 */
const FILE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'tgz',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'js',
  'ts',
  'html',
  'css',
  'rb',
  'go',
  'rs',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'bmp',
  'webp',
  'mp4',
  'mp3',
  'wav',
  'avi',
  'mov',
  'mkv',
  'csv',
  'json',
  'xml',
  'yaml',
  'yml',
  'md',
];

/**
 * Extract links from HTML before conversion to plain text
 * Returns map of link text -> original URL
 */
function extractHtmlLinks(html: string): Map<string, string> {
  const linkMap = new Map<string, string>();
  if (!html) return linkMap;

  // Match <a> tags with href and extract text content
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    // Strip any inner HTML tags from link text
    const text = match[2].replace(/<[^>]*>/g, '').trim();
    if (text && url) {
      linkMap.set(text.toLowerCase(), url);
    }
  }

  return linkMap;
}

/**
 * Detect file references in plain text message
 * Matches against attachments and extracts positions
 */
export function detectFileReferences(
  plainText: string,
  attachments: LocalNotificationAttachment[],
  htmlLinkMap: Map<string, string>
): FileReference[] {
  const references: FileReference[] = [];
  if (!plainText) return references;

  // Build regex for file extensions
  const extensionPattern = FILE_EXTENSIONS.map((ext) => ext.replace('.', '\\.')).join(
    '|'
  );
  // Match filenames - word chars, spaces, dashes, parens, dots followed by extension
  const fileRegex = new RegExp(
    `[\\w\\s\\-\\(\\)\\[\\]\\.,]+\\.(${extensionPattern})`,
    'gi'
  );

  let match;
  while ((match = fileRegex.exec(plainText)) !== null) {
    const filename = match[0].trim();
    const filenameLower = filename.toLowerCase();

    // Try to find matching attachment
    const attachment = attachments.find(
      (a) =>
        a.display_name.toLowerCase() === filenameLower ||
        a.filename.toLowerCase() === filenameLower
    );

    // Try to find original URL from HTML links
    const originalUrl = htmlLinkMap.get(filenameLower) || null;

    references.push({
      startPosition: match.index,
      endPosition: match.index + match[0].length,
      matchedText: filename,
      originalUrl,
      attachmentExternalId: attachment?.external_id || null,
    });
  }

  return references;
}

/**
 * Map Canvas announcement to local notification record with attachments
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapAnnouncement(
  canvas: CanvasAnnouncement,
  localCourseId: number,
  baseUrl: string,
  externalCourseId: string
): MappedAnnouncement {
  // Validate incoming data with safe defaults
  const announcementId = safeParse(SafeNumber, canvas.id, 'announcement.id');
  const title =
    safeParse(SafeString, canvas.title, 'announcement.title') ||
    `Announcement_${announcementId}`;
  const message = safeParse(SafeString, canvas.message, 'announcement.message');
  const postedAt = safeParse(
    SafeNullableString,
    canvas.posted_at,
    'announcement.posted_at'
  );

  // Extract links from HTML before converting (to preserve original URLs)
  const htmlLinkMap = extractHtmlLinks(message);

  // Convert HTML to clean plain text for storage
  const cleanMessage = htmlToPlainText(message);

  // Strip HTML tags for policy analysis
  const plainText = (title + ' ' + cleanMessage).toLowerCase();

  // Detect policy-related keywords
  const foundKeywords: string[] = [];
  for (const [category, keywords] of Object.entries(POLICY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (plainText.includes(keyword.toLowerCase())) {
        foundKeywords.push(`${category}:${keyword}`);
      }
    }
  }

  const isPolicyRelated = foundKeywords.length > 0;

  // Build Canvas URL for the original announcement
  const canvasUrl = `${baseUrl}/courses/${externalCourseId}/discussion_topics/${announcementId}`;

  // Map attachments (Zod validation happens inside mapAttachment)
  const attachments: LocalNotificationAttachment[] = (canvas.attachments || []).map(
    (att) => mapAttachment(att, localCourseId)
  );

  // Detect file references in the clean message
  const fileReferences = detectFileReferences(cleanMessage, attachments, htmlLinkMap);

  return {
    notification: {
      source_type: 'canvas',
      source_id: String(announcementId),
      course_id: localCourseId,
      title: title,
      message: cleanMessage,
      message_html: message || null, // Store original HTML for display
      url: canvasUrl,
      priority_level: isPolicyRelated ? 'high' : 'medium',
      published_at: postedAt || new Date().toISOString(),
      is_policy_related: isPolicyRelated ? 1 : 0, // SQLite boolean
      policy_keywords: foundKeywords.length > 0 ? JSON.stringify(foundKeywords) : null,
    },
    attachments,
    fileReferences,
  };
}

/**
 * Map Canvas module to local module record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapModule(canvas: CanvasModule, localCourseId: number): LocalModule {
  const moduleId = safeParse(SafeNumber, canvas.id, 'module.id');
  const moduleName =
    safeParse(SafeString, canvas.name, 'module.name') || `Module_${moduleId}`;
  const position = safeParse(SafeNumber, canvas.position, 'module.position');
  const unlockAt = safeParse(SafeNullableString, canvas.unlock_at, 'module.unlock_at');
  const requireSequential = safeParse(
    SafeBoolean,
    canvas.require_sequential_progress,
    'module.require_sequential_progress'
  );
  const published = safeParse(SafeBoolean, canvas.published, 'module.published');

  return {
    external_id: String(moduleId),
    course_id: localCourseId,
    name: moduleName,
    position: position,
    unlock_at: unlockAt,
    require_sequential_progress: requireSequential ? 1 : 0, // SQLite boolean
    published: published ? 1 : 0, // SQLite boolean
  };
}

/**
 * Map Canvas module item to local module item record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapModuleItem(
  canvas: CanvasModuleItem,
  localModuleId: number
): LocalModuleItem {
  const itemId = safeParse(SafeNumber, canvas.id, 'moduleItem.id');
  const title =
    safeParse(SafeString, canvas.title, 'moduleItem.title') || `Item_${itemId}`;
  const itemType = safeParse(SafeString, canvas.type, 'moduleItem.type') || 'Unknown';
  const contentId = safeParse(
    SafeNullableNumber,
    canvas.content_id,
    'moduleItem.content_id'
  );
  const position = safeParse(SafeNumber, canvas.position, 'moduleItem.position');
  const indent = safeParse(SafeNumber, canvas.indent, 'moduleItem.indent');
  const htmlUrl = safeParse(SafeNullableString, canvas.html_url, 'moduleItem.html_url');
  const externalUrl = safeParse(
    SafeNullableString,
    canvas.external_url,
    'moduleItem.external_url'
  );
  const pageUrl = safeParse(
    SafeNullableString,
    canvas.page_url,
    'moduleItem.page_url'
  );
  const published = safeParse(SafeBoolean, canvas.published, 'moduleItem.published');

  return {
    external_id: String(itemId),
    module_id: localModuleId,
    title: title,
    item_type: itemType,
    content_id: contentId ? String(contentId) : null,
    position: position,
    indent: indent,
    url: htmlUrl,
    external_url: externalUrl,
    page_url: pageUrl,
    completion_requirement: canvas.completion_requirement
      ? JSON.stringify(canvas.completion_requirement)
      : null,
    published: published ? 1 : 0, // SQLite boolean
  };
}

/**
 * Map Canvas page to local page record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapPage(
  canvas: CanvasPage,
  localCourseId: number,
  pageType: 'syllabus' | 'landing' | 'content' | 'module_item' = 'content'
): LocalPage {
  const pageUrl = safeParse(SafeString, canvas.url, 'page.url');
  const title =
    safeParse(SafeString, canvas.title, 'page.title') || pageUrl || 'Untitled Page';
  const body = safeParse(SafeNullableString, canvas.body, 'page.body');
  const isFrontPage = safeParse(SafeBoolean, canvas.front_page, 'page.front_page');
  const published = safeParse(SafeBoolean, canvas.published, 'page.published');

  // Strip HTML for plain text version
  const bodyText = body
    ? body
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : null;

  return {
    external_id: pageUrl,
    course_id: localCourseId,
    page_type: pageType,
    title: title,
    url_slug: pageUrl,
    body_html: body,
    body_text: bodyText,
    is_front_page: isFrontPage ? 1 : 0, // SQLite boolean
    published: published ? 1 : 0, // SQLite boolean
  };
}

/**
 * Map Canvas file to local resource record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapFile(
  canvas: CanvasFile,
  localCourseId: number,
  localFolderId: number | null = null,
  folderPath: string | null = null,
  contextType: LocalResource['context_type'] = 'files',
  contextId: string | null = null
): Omit<LocalResource, 'local_path'> {
  // Note: local_path is intentionally omitted so it's never overwritten during sync
  // It gets set when user downloads the file

  const fileId = safeParse(SafeNumber, canvas.id, 'file.id');
  const displayName =
    safeParse(SafeString, canvas.display_name, 'file.display_name') || `File_${fileId}`;
  const url = safeParse(SafeNullableString, canvas.url, 'file.url');
  const size = safeParse(SafeNullableNumber, canvas.size, 'file.size');
  const contentType = safeParse(
    SafeNullableString,
    canvas.content_type,
    'file.content_type'
  );
  const unlockAt = safeParse(SafeNullableString, canvas.unlock_at, 'file.unlock_at');
  const modifiedAt = safeParse(
    SafeNullableString,
    canvas.modified_at,
    'file.modified_at'
  );
  const updatedAt = safeParse(SafeNullableString, canvas.updated_at, 'file.updated_at');

  // Use modified_at if available (actual content change), otherwise updated_at
  const remoteUpdatedAt = modifiedAt || updatedAt;

  return {
    external_id: String(fileId),
    course_id: localCourseId,
    parent_folder_id: localFolderId,
    folder_path: folderPath,
    type: 'file' as const,
    title: displayName,
    url: url,
    size_bytes: size,
    mime_type: contentType,
    unlock_at: unlockAt,
    remote_updated_at: remoteUpdatedAt,
    context_type: contextType,
    context_id: contextId,
  };
}

/**
 * Map Canvas folder to local resource record
 * Uses Zod schemas for defensive validation of incoming data
 */
export function mapFolder(
  canvas: CanvasFolder,
  localCourseId: number,
  localParentFolderId: number | null = null
): Omit<LocalResource, 'local_path'> {
  const folderId = safeParse(SafeNumber, canvas.id, 'folder.id');
  const folderName =
    safeParse(SafeString, canvas.name, 'folder.name') || `Folder_${folderId}`;
  const fullName = safeParse(SafeString, canvas.full_name, 'folder.full_name');
  const updatedAt = safeParse(SafeNullableString, canvas.updated_at, 'folder.updated_at');

  // Canvas full_name is like "course files/Week 1/Lectures"
  // Remove the "course files" prefix for cleaner display
  let folderPath = fullName || folderName;

  if (folderPath.startsWith('course files/')) {
    folderPath = folderPath.substring('course files/'.length);
  } else if (folderPath === 'course files') {
    folderPath = '';
  }

  // Note: local_path is intentionally omitted - folders are not downloadable
  return {
    external_id: String(folderId),
    course_id: localCourseId,
    parent_folder_id: localParentFolderId,
    folder_path: folderPath || null,
    type: 'folder' as const,
    title: folderName,
    url: null,
    size_bytes: null,
    mime_type: null,
    unlock_at: null,
    remote_updated_at: updatedAt,
    context_type: 'files' as const,
    context_id: null,
  };
}

/**
 * Detect policy keywords in text and return matches
 */
export function detectPolicyKeywords(text: string): {
  isPolicy: boolean;
  keywords: string[];
  categories: string[];
} {
  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
  const foundKeywords: string[] = [];
  const foundCategories = new Set<string>();

  for (const [category, keywords] of Object.entries(POLICY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (plainText.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        foundCategories.add(category);
      }
    }
  }

  return {
    isPolicy: foundKeywords.length > 0,
    keywords: foundKeywords,
    categories: Array.from(foundCategories),
  };
}

/**
 * Calculate confidence score for policy detection (0-1)
 */
export function calculatePolicyConfidence(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  // Base score from number of keywords found
  const keywordScore = Math.min(keywords.length * 0.2, 0.6);

  // Boost for specific policy patterns
  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
  let patternBoost = 0;

  // Strong policy indicators
  const strongPatterns = [
    /late (submission|penalty|policy)/,
    /grace (period|token)/,
    /\d+%\s*(penalty|deduction)/,
    /drop (lowest|your lowest)/,
    /extension (policy|request)/,
    /resubmit(ted|tion)? (allowed|permitted)/,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(plainText)) {
      patternBoost += 0.15;
    }
  }

  return Math.min(keywordScore + patternBoost, 1.0);
}
