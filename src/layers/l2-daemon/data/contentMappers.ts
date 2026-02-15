/**
 * Content Mappers - Transform Canvas announcements, modules, and pages to local schema
 */

import { z } from 'zod';
import { safeParse } from './courseMappers';
import { mapAttachment } from './courseMappers';
import {
  htmlToPlainText,
  extractHtmlLinks,
  detectFileReferences,
} from './htmlParsingUtils';
import { POLICY_KEYWORDS } from './policyDetection';
import type {
  CanvasAnnouncement,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
  LocalNotificationAttachment,
  LocalModule,
  LocalModuleItem,
  LocalPage,
  MappedAnnouncement,
} from './DataMapperTypes';

// Validation schemas for defensive parsing
const SafeNumber = z.number().catch(0);
const SafeString = z.string().catch('');
const SafeNullableString = z.string().nullable().catch(null);
const SafeNullableNumber = z.number().nullable().catch(null);
const SafeBoolean = z.boolean().catch(false);

/**
 * Map Canvas announcement to local notification record with attachments
 */
export function mapAnnouncement(
  canvas: CanvasAnnouncement,
  localCourseId: number,
  baseUrl: string,
  externalCourseId: string
): MappedAnnouncement {
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

  const canvasUrl = `${baseUrl}/courses/${externalCourseId}/discussion_topics/${announcementId}`;

  const attachments: LocalNotificationAttachment[] = (canvas.attachments || []).map(
    (att) => mapAttachment(att, localCourseId)
  );

  const fileReferences = detectFileReferences(cleanMessage, attachments, htmlLinkMap);

  return {
    notification: {
      source_type: 'canvas',
      source_id: String(announcementId),
      course_id: localCourseId,
      title: title,
      message: cleanMessage,
      message_html: message || null,
      url: canvasUrl,
      priority_level: isPolicyRelated ? 'high' : 'medium',
      published_at: postedAt || new Date().toISOString(),
      is_policy_related: isPolicyRelated ? 1 : 0,
      policy_keywords: foundKeywords.length > 0 ? JSON.stringify(foundKeywords) : null,
    },
    attachments,
    fileReferences,
  };
}

/**
 * Map Canvas module to local module record
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
    require_sequential_progress: requireSequential ? 1 : 0,
    published: published ? 1 : 0,
  };
}

/**
 * Map Canvas module item to local module item record
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
  const pageUrl = safeParse(SafeNullableString, canvas.page_url, 'moduleItem.page_url');
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
    published: published ? 1 : 0,
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
  const pageUrl = safeParse(SafeString, canvas.url, 'page.url');
  const title =
    safeParse(SafeString, canvas.title, 'page.title') || pageUrl || 'Untitled Page';
  const body = safeParse(SafeNullableString, canvas.body, 'page.body');
  const isFrontPage = safeParse(SafeBoolean, canvas.front_page, 'page.front_page');
  const published = safeParse(SafeBoolean, canvas.published, 'page.published');
  const updatedAt = safeParse(SafeNullableString, canvas.updated_at, 'page.updated_at');

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
    is_front_page: isFrontPage ? 1 : 0,
    published: published ? 1 : 0,
    remote_updated_at: updatedAt,
  };
}
