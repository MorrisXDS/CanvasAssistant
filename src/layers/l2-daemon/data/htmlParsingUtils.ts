/**
 * HTML Parsing Utilities - Convert HTML to plain text and extract links/file references
 */

import { convert } from 'html-to-text';
import type { LocalNotificationAttachment, FileReference } from './DataMapperTypes';

/**
 * Strip HTML and convert to clean plain text using html-to-text library
 * Preserves paragraph structure and formatting
 * Exported for use in migration and reprocessing
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';

  const text = convert(html, {
    wordwrap: false,
    preserveNewlines: false,
    selectors: [
      { selector: 'p', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
      { selector: 'div', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
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
      {
        selector: 'blockquote',
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1 },
      },
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'table', format: 'dataTable' },
      { selector: 'br', format: 'lineBreak' },
      { selector: 'hr', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
    ],
  });

  return text.replace(/\n{2,}/g, '\n').trim();
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
export function extractHtmlLinks(html: string): Map<string, string> {
  const linkMap = new Map<string, string>();
  if (!html) return linkMap;

  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
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

  const extensionPattern = FILE_EXTENSIONS.map((ext) => ext.replace('.', '\\.')).join(
    '|'
  );
  const fileRegex = new RegExp(
    `[\\w\\s\\-\\(\\)\\[\\]\\.,]+\\.(${extensionPattern})`,
    'gi'
  );

  let match;
  while ((match = fileRegex.exec(plainText)) !== null) {
    const filename = match[0].trim();
    const filenameLower = filename.toLowerCase();

    const attachment = attachments.find(
      (a) =>
        a.display_name.toLowerCase() === filenameLower ||
        a.filename.toLowerCase() === filenameLower
    );

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
