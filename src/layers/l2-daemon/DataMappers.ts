/**
 * Data Mappers - Transform Canvas API responses to local database schema
 *
 * Each mapper converts the Canvas API format to the format expected by
 * our local SQLite tables. This keeps transformation logic centralized
 * and testable.
 */

import { convert } from 'html-to-text';

// Canvas API response types
export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollment_term_id: number;
  default_view: string;
  syllabus_body?: string;
  enrollments?: Array<{
    type: string;
    computed_current_score?: number;
    computed_current_grade?: string;
  }>;
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
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  title: string;
  type: 'File' | 'Page' | 'Discussion' | 'Assignment' | 'Quiz' | 'SubHeader' | 'ExternalUrl' | 'ExternalTool';
  content_id?: number;
  position: number;
  indent: number;
  url?: string;
  external_url?: string;
  html_url?: string;
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
  landing_page_url: string | null;
  syllabus_body: string | null;
  last_synced_at: string;
}

export interface LocalTask {
  [key: string]: unknown;
  external_id: string;
  source_type: 'canvas' | 'user';
  course_id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  unlock_at: string | null;
  points_possible: number | null;
  submission_types: string | null;
  weight: number;
  is_completed: number; // SQLite boolean: 0 or 1
}

export interface LocalNotification {
  [key: string]: unknown;
  source_type: 'canvas' | 'system';
  source_id: string;
  course_id: number;
  title: string;
  message: string;
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
 */
export function mapAttachment(
  canvas: CanvasAttachment,
  courseId: number
): LocalNotificationAttachment {
  return {
    course_id: courseId,
    external_id: String(canvas.id),
    display_name: canvas.display_name,
    filename: canvas.filename,
    url: canvas.url,
    size_bytes: canvas.size || null,
    content_type: canvas.content_type || null,
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
  type: 'file' | 'folder' | 'external_url' | 'page';
  title: string;
  url: string | null;
  local_path: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  unlock_at: string | null;
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
 */
export function mapCourse(canvas: CanvasCourse, baseUrl: string): LocalCourse {
  const enrollment = canvas.enrollments?.[0];
  const currentGrade = enrollment?.computed_current_score ?? null;

  return {
    external_id: String(canvas.id),
    code: canvas.course_code,
    name: canvas.name,
    current_grade: currentGrade,
    assessed_grade: null,
    target_grade: 85.0,
    landing_page_url: `${baseUrl}/courses/${canvas.id}`,
    syllabus_body: canvas.syllabus_body ?? null,
    last_synced_at: new Date().toISOString(),
  };
}

/**
 * Map Canvas assignment to local task record
 */
export function mapAssignment(canvas: CanvasAssignment, localCourseId: number): LocalTask {
  return {
    external_id: String(canvas.id),
    source_type: 'canvas',
    course_id: localCourseId,
    title: canvas.name,
    description: canvas.description,
    due_at: canvas.due_at,
    unlock_at: canvas.unlock_at,
    points_possible: canvas.points_possible,
    submission_types: canvas.submission_types?.join(',') ?? null,
    weight: 0, // Will be calculated by L3 Intelligence
    is_completed: canvas.has_submitted_submissions ? 1 : 0, // SQLite boolean
  };
}

/**
 * Strip HTML and convert to clean plain text using html-to-text library
 * Exported for use in migration and reprocessing
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  return convert(html, {
    wordwrap: false,
    preserveNewlines: true,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'table', format: 'dataTable' },
    ],
  }).trim();
}

export interface MappedAnnouncement {
  notification: LocalNotification;
  attachments: LocalNotificationAttachment[];
}

/**
 * Map Canvas announcement to local notification record with attachments
 */
export function mapAnnouncement(
  canvas: CanvasAnnouncement,
  localCourseId: number,
  baseUrl: string,
  externalCourseId: string
): MappedAnnouncement {
  // Convert HTML to clean plain text for storage
  const cleanMessage = htmlToPlainText(canvas.message);

  // Strip HTML tags for policy analysis
  const plainText = (canvas.title + ' ' + cleanMessage).toLowerCase();

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
  const canvasUrl = `${baseUrl}/courses/${externalCourseId}/discussion_topics/${canvas.id}`;

  // Map attachments
  const attachments: LocalNotificationAttachment[] = (canvas.attachments || []).map(
    (att) => mapAttachment(att, localCourseId)
  );

  return {
    notification: {
      source_type: 'canvas',
      source_id: String(canvas.id),
      course_id: localCourseId,
      title: canvas.title,
      message: cleanMessage,
      url: canvasUrl,
      priority_level: isPolicyRelated ? 'high' : 'medium',
      published_at: canvas.posted_at,
      is_policy_related: isPolicyRelated ? 1 : 0, // SQLite boolean
      policy_keywords: foundKeywords.length > 0 ? JSON.stringify(foundKeywords) : null,
    },
    attachments,
  };
}

/**
 * Map Canvas module to local module record
 */
export function mapModule(canvas: CanvasModule, localCourseId: number): LocalModule {
  return {
    external_id: String(canvas.id),
    course_id: localCourseId,
    name: canvas.name,
    position: canvas.position,
    unlock_at: canvas.unlock_at,
    require_sequential_progress: canvas.require_sequential_progress ? 1 : 0, // SQLite boolean
    published: canvas.published ? 1 : 0, // SQLite boolean
  };
}

/**
 * Map Canvas module item to local module item record
 */
export function mapModuleItem(
  canvas: CanvasModuleItem,
  localModuleId: number
): LocalModuleItem {
  return {
    external_id: String(canvas.id),
    module_id: localModuleId,
    title: canvas.title,
    item_type: canvas.type,
    content_id: canvas.content_id ? String(canvas.content_id) : null,
    position: canvas.position,
    indent: canvas.indent,
    url: canvas.html_url ?? null,
    external_url: canvas.external_url ?? null,
    completion_requirement: canvas.completion_requirement
      ? JSON.stringify(canvas.completion_requirement)
      : null,
    published: canvas.published ? 1 : 0, // SQLite boolean
  };
}

/**
 * Map Canvas page to local page record
 */
export function mapPage(
  canvas: CanvasPage,
  localCourseId: number,
  pageType: 'syllabus' | 'landing' | 'content' | 'module_item' = 'content'
): LocalPage {
  // Strip HTML for plain text version
  const bodyText = canvas.body
    ? canvas.body
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : null;

  return {
    external_id: canvas.url,
    course_id: localCourseId,
    page_type: pageType,
    title: canvas.title,
    url_slug: canvas.url,
    body_html: canvas.body,
    body_text: bodyText,
    is_front_page: canvas.front_page ? 1 : 0, // SQLite boolean
    published: canvas.published ? 1 : 0, // SQLite boolean
  };
}

/**
 * Map Canvas file to local resource record
 */
export function mapFile(
  canvas: CanvasFile,
  localCourseId: number,
  localFolderId: number | null = null
): LocalResource {
  return {
    external_id: String(canvas.id),
    course_id: localCourseId,
    parent_folder_id: localFolderId,
    type: 'file',
    title: canvas.display_name,
    url: canvas.url,
    local_path: null, // Set when downloaded
    size_bytes: canvas.size,
    mime_type: canvas.content_type,
    unlock_at: canvas.unlock_at,
  };
}

/**
 * Map Canvas folder to local resource record
 */
export function mapFolder(
  canvas: CanvasFolder,
  localCourseId: number,
  localParentFolderId: number | null = null
): LocalResource {
  return {
    external_id: String(canvas.id),
    course_id: localCourseId,
    parent_folder_id: localParentFolderId,
    type: 'folder',
    title: canvas.name,
    url: null,
    local_path: null,
    size_bytes: null,
    mime_type: null,
    unlock_at: null,
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
export function calculatePolicyConfidence(
  text: string,
  keywords: string[]
): number {
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
