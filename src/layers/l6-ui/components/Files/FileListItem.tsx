/**
 * FileListItem Component
 * List view file row with type-specific icons and metadata
 */

import React from 'react';
import {
  File,
  FileText,
  Image,
  FileSpreadsheet,
  Presentation,
  Archive,
  Code,
  Music,
  Video,
  Download,
  CheckCircle,
  AlertCircle,
  Loader2,
  FolderOpen,
  Square,
  CheckSquare,
  ScrollText,
  // Module item icons
  HelpCircle,
  ClipboardList,
  MessageSquare,
  ExternalLink,
  Wrench,
  FileQuestion,
} from 'lucide-react';
import styles from './FilesPage.module.css';
import { formatFileSize } from '../../constants';
import { NotificationDot, type UpdateType } from '../shared';

// Types
export interface FileAttachment {
  id: number;
  notificationId: number;
  courseId: number;
  externalId: string;
  displayName: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  contentType: string | null;
  localPath: string | null;
  downloadStatus: string;
  downloadedAt: string | null;
  courseCode: string;
  courseName: string;
  notificationTitle: string;
  source: 'attachment';
}

export interface FileResource {
  id: number;
  externalId: string;
  courseId: number;
  parentFolderId: number | null;
  folderPath: string | null;
  type: string;
  title: string;
  url: string | null;
  localPath: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  syncedAt: string | null;
  source: 'resource';
}

export interface FilePage {
  id: number;
  externalId: string | null;
  courseId: number;
  pageType: string;
  title: string;
  urlSlug: string | null;
  hasContent: boolean;
  isFrontPage: boolean;
  published: boolean;
  lastSyncedAt: string | null;
  folderPath: string;
  sizeBytes: null; // Pages don't have a file size
  source: 'page';
}

export interface FileModuleItem {
  id: number;
  externalId: string;
  courseId: number;
  title: string;
  itemType: string; // Dynamic - any Canvas type (File, Page, Assignment, Quiz, etc.)
  contentId: string | null;
  url: string | null;
  externalUrl: string | null;
  pageUrl: string | null; // Page slug for Page type items (e.g., "lab-kit")
  position: number;
  indent: number;
  moduleName: string;
  modulePosition: number;
  courseCode: string;
  courseName: string;
  sizeBytes: null; // Module items don't have a file size
  hasLocalContent: boolean; // True if Page has body_html or File has local_path
  source: 'module';
}

export type FileItem = FileAttachment | FileResource | FilePage | FileModuleItem;

// Content category types
export type ContentCategory =
  | 'Lecture Slides'
  | 'Lab Manual'
  | 'Assignment'
  | 'Tutorial'
  | 'Notes'
  | 'Reading'
  | 'Syllabus'
  | 'Solution'
  | 'Exam'
  | 'Other';

// File type for icon coloring
export type FileIconType =
  | 'pdf'
  | 'image'
  | 'spreadsheet'
  | 'presentation'
  | 'document'
  | 'archive'
  | 'code'
  | 'audio'
  | 'video'
  | 'page'
  | 'generic'
  // Module item types
  | 'module-file'
  | 'module-page'
  | 'module-quiz'
  | 'module-assignment'
  | 'module-discussion'
  | 'module-external-url'
  | 'module-external-tool'
  | 'module-unknown';

// Categorize file based on filename and folder path
export function categorizeFile(
  filename: string,
  folderPath: string | null
): ContentCategory {
  const lower = (filename + ' ' + (folderPath || '')).toLowerCase();

  if (/lecture|slides?|ppt|presentation/i.test(lower)) return 'Lecture Slides';
  if (/lab\s*(manual|guide|\d)|laboratory/i.test(lower)) return 'Lab Manual';
  if (/assign(ment)?|homework|hw\d|problem\s*set|pset/i.test(lower)) return 'Assignment';
  if (/tutorial|tut\d|practice/i.test(lower)) return 'Tutorial';
  if (/notes?|summary|review/i.test(lower)) return 'Notes';
  if (/reading|textbook|chapter|article/i.test(lower)) return 'Reading';
  if (/syllabus|outline|course\s*info/i.test(lower)) return 'Syllabus';
  if (/solution|answer|key|marking|rubric/i.test(lower)) return 'Solution';
  if (/exam|midterm|final|quiz|test/i.test(lower)) return 'Exam';

  return 'Other';
}

// Extract week/module context from folder path or filename
export function extractModuleContext(
  folderPath: string | null,
  filename: string
): string | null {
  const combined = (folderPath || '') + ' ' + filename;

  const weekMatch = combined.match(/week\s*(\d+)/i);
  if (weekMatch) return `Week ${weekMatch[1]}`;

  const moduleMatch = combined.match(/module\s*(\d+)/i);
  if (moduleMatch) return `Module ${moduleMatch[1]}`;

  const lectureMatch = combined.match(/lec(?:ture)?\s*(\d+)/i);
  if (lectureMatch) return `Lecture ${lectureMatch[1]}`;

  const labMatch = combined.match(/lab\s*(\d+)/i);
  if (labMatch) return `Lab ${labMatch[1]}`;

  const unitMatch = combined.match(/unit\s*(\d+)/i);
  if (unitMatch) return `Unit ${unitMatch[1]}`;

  return null;
}

// Get category color
export function getCategoryColor(category: ContentCategory): string {
  switch (category) {
    case 'Lecture Slides':
      return '#1976D2';
    case 'Lab Manual':
      return '#7B1FA2';
    case 'Assignment':
      return '#E65100';
    case 'Tutorial':
      return '#00897B';
    case 'Notes':
      return '#558B2F';
    case 'Reading':
      return '#5D4037';
    case 'Syllabus':
      return '#C62828';
    case 'Solution':
      return '#00838F';
    case 'Exam':
      return '#AD1457';
    default:
      return '#616161';
  }
}

// Get file name helper
export function getFileName(file: FileItem): string {
  if (file.source === 'attachment') {
    return file.displayName;
  }
  return file.title;
}

// Get folder path for module items (uses module name as top-level folder)
export function getModuleItemFolderPath(file: FileModuleItem): string {
  return file.moduleName;
}

/**
 * Get a canonical identifier for a file that's consistent across different representations.
 * The same underlying Canvas file will have the same canonical ID whether it appears
 * as a resource or as a module item.
 *
 * This enables unified state tracking (selection, download status) across duplicates.
 */
export function getCanonicalFileId(file: FileItem): string {
  if (file.source === 'resource') {
    // Resources use their Canvas external_id
    return `file:${(file as FileResource).externalId}`;
  }
  if (file.source === 'module') {
    const m = file as FileModuleItem;
    if (m.itemType === 'File' && m.contentId) {
      // File module items link to resources via content_id -> external_id
      return `file:${m.contentId}`;
    }
    if (m.itemType === 'Page' && m.pageUrl) {
      // Page module items link via page_url (slug)
      return `page:${m.courseId}:${m.pageUrl}`;
    }
    // Other module item types (Quiz, Assignment, ExternalUrl, etc.) are unique
    return `module:${m.id}`;
  }
  if (file.source === 'page') {
    const p = file as FilePage;
    // Pages use course + slug/external_id
    return `page:${p.courseId}:${p.externalId || p.urlSlug}`;
  }
  // Attachments are unique to their notification (file.source === 'attachment')
  return `attachment:${(file as FileAttachment).externalId}`;
}

// Check if file is downloaded/available
export function isFileDownloaded(file: FileItem): boolean {
  if (file.source === 'attachment') {
    return (file as FileAttachment).downloadStatus === 'completed';
  }
  if (file.source === 'page') {
    // Pages are always "available" - they're HTML content
    return (file as FilePage).hasContent;
  }
  if (file.source === 'module') {
    // Module items: Page types with body_html or File types with local_path
    return (file as FileModuleItem).hasLocalContent;
  }
  return file.localPath !== null;
}

// Re-export formatFileSize from constants for backwards compatibility
export { formatFileSize } from '../../constants';

// Map module item types to icon types
function getModuleItemIconType(itemType: string): FileIconType {
  switch (itemType) {
    case 'File':
      return 'module-file';
    case 'Page':
      return 'module-page';
    case 'Quiz':
      return 'module-quiz';
    case 'Assignment':
      return 'module-assignment';
    case 'Discussion':
      return 'module-discussion';
    case 'ExternalUrl':
      return 'module-external-url';
    case 'ExternalTool':
      return 'module-external-tool';
    default:
      return 'module-unknown';
  }
}

// Determine file icon type based on content type and extension
export function getFileIconType(file: FileItem): FileIconType {
  // Pages are always 'page' type
  if (file.source === 'page') {
    return 'page';
  }

  // Module items use their Canvas type
  if (file.source === 'module') {
    return getModuleItemIconType((file as FileModuleItem).itemType);
  }

  const contentType =
    'contentType' in file ? file.contentType : 'mimeType' in file ? file.mimeType : null;
  const filename = getFileName(file);
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (
    contentType?.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)
  ) {
    return 'image';
  }
  if (contentType?.includes('pdf') || ext === 'pdf') {
    return 'pdf';
  }
  if (contentType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return 'spreadsheet';
  }
  if (contentType?.includes('presentation') || ['pptx', 'ppt'].includes(ext)) {
    return 'presentation';
  }
  if (contentType?.includes('word') || ['docx', 'doc', 'txt'].includes(ext)) {
    return 'document';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'archive';
  }
  if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'html', 'css', 'json'].includes(ext)) {
    return 'code';
  }
  if (contentType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return 'audio';
  }
  if (contentType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
    return 'video';
  }
  return 'generic';
}

// Get icon component for file type
export function getFileIcon(file: FileItem, size: number = 18): React.ReactNode {
  const iconType = getFileIconType(file);

  switch (iconType) {
    case 'image':
      return <Image size={size} />;
    case 'pdf':
      return <FileText size={size} />;
    case 'spreadsheet':
      return <FileSpreadsheet size={size} />;
    case 'presentation':
      return <Presentation size={size} />;
    case 'document':
      return <FileText size={size} />;
    case 'archive':
      return <Archive size={size} />;
    case 'code':
      return <Code size={size} />;
    case 'audio':
      return <Music size={size} />;
    case 'video':
      return <Video size={size} />;
    case 'page':
      return <ScrollText size={size} />;
    // Module item types
    case 'module-file':
      return <File size={size} />;
    case 'module-page':
      return <FileText size={size} />;
    case 'module-quiz':
      return <HelpCircle size={size} />;
    case 'module-assignment':
      return <ClipboardList size={size} />;
    case 'module-discussion':
      return <MessageSquare size={size} />;
    case 'module-external-url':
      return <ExternalLink size={size} />;
    case 'module-external-tool':
      return <Wrench size={size} />;
    case 'module-unknown':
      return <FileQuestion size={size} />;
    default:
      return <File size={size} />;
  }
}

// Get icon class for styling
export function getFileIconClass(iconType: FileIconType): string {
  const classMap: Record<FileIconType, string> = {
    pdf: styles.fileIconPdf,
    image: styles.fileIconImage,
    spreadsheet: styles.fileIconSpreadsheet,
    presentation: styles.fileIconPresentation,
    document: styles.fileIconDocument,
    archive: styles.fileIconArchive,
    code: styles.fileIconCode,
    audio: styles.fileIconAudio,
    video: styles.fileIconVideo,
    page: styles.fileIconPage,
    generic: styles.fileIconGeneric,
    // Module item types use generic styling
    'module-file': styles.fileIconGeneric,
    'module-page': styles.fileIconPage,
    'module-quiz': styles.fileIconGeneric,
    'module-assignment': styles.fileIconGeneric,
    'module-discussion': styles.fileIconGeneric,
    'module-external-url': styles.fileIconGeneric,
    'module-external-tool': styles.fileIconGeneric,
    'module-unknown': styles.fileIconGeneric,
  };
  return classMap[iconType] || styles.fileIconGeneric;
}

// Component Props
export interface FileListItemProps {
  file: FileItem;
  isDownloading: boolean;
  isSelected: boolean;
  selectMode: boolean;
  onToggleSelect: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onShowInFolder?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Optional update type for notification dot (null = no update) */
  updateType?: UpdateType | null;
}

export function FileListItem({
  file,
  isDownloading,
  isSelected,
  selectMode,
  onToggleSelect,
  onDownload,
  onOpen,
  onShowInFolder,
  onContextMenu,
  updateType,
}: FileListItemProps) {
  const isAttachment = file.source === 'attachment';
  const isModuleItem = file.source === 'module';
  const downloadStatus = isAttachment ? (file as FileAttachment).downloadStatus : null;
  const isDownloaded = isFileDownloaded(file);

  // Get metadata
  const filename = getFileName(file);
  const folderPath =
    file.source === 'resource' ? (file as FileResource).folderPath : null;
  const category = categorizeFile(filename, folderPath);
  const moduleContext = extractModuleContext(folderPath, filename);
  const categoryColor = getCategoryColor(category);
  const fileSize = formatFileSize(file.sizeBytes);
  const iconType = getFileIconType(file);
  const iconClass = getFileIconClass(iconType);

  // Check if this is an ExternalUrl module item (not downloadable)
  const isExternalUrl =
    isModuleItem && (file as FileModuleItem).itemType === 'ExternalUrl';

  // Handle double-click
  const handleDoubleClick = () => {
    if (selectMode) return;
    // ExternalUrl items should always open (they're not downloadable)
    if (isExternalUrl || isDownloaded) {
      onOpen();
    } else {
      onDownload();
    }
  };

  // Determine tooltip based on item type
  const getTooltip = () => {
    if (isExternalUrl)
      return 'Double-click to open external link, right-click for options';
    if (isDownloaded) return 'Double-click to open, right-click for options';
    return 'Double-click to download, right-click for options';
  };

  return (
    <div
      className={styles.fileListItem}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
      title={getTooltip()}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleDoubleClick();
        if (e.key === ' ' && selectMode) {
          e.preventDefault();
          onToggleSelect();
        }
      }}
    >
      {selectMode && (
        <button
          className={styles.checkbox}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          aria-label={isSelected ? 'Deselect file' : 'Select file'}
        >
          {isSelected ? (
            <CheckSquare size={16} color="var(--color-navy)" />
          ) : (
            <Square size={16} color="var(--text-muted)" />
          )}
        </button>
      )}

      <div className={`${styles.fileIcon} ${iconClass}`}>{getFileIcon(file, 16)}</div>

      <div className={styles.fileInfo}>
        <div
          className={styles.fileName}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {filename}
          {updateType && (
            <NotificationDot
              updateType={updateType}
              size="sm"
              style={{ flexShrink: 0 }}
            />
          )}
        </div>
        <div className={styles.fileMeta}>
          {/* Category badge */}
          <span
            className={styles.categoryBadge}
            style={{ backgroundColor: categoryColor }}
          >
            {category}
          </span>

          {/* File size */}
          {fileSize && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <span className={styles.fileSize}>{fileSize}</span>
            </>
          )}

          {/* Module/Week context */}
          {moduleContext && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <span className={styles.moduleContext}>{moduleContext}</span>
            </>
          )}

          {/* Source info for attachments */}
          {isAttachment && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <span
                className={styles.fileSource}
                title={(file as FileAttachment).notificationTitle}
              >
                from Announcement
              </span>
            </>
          )}

          {/* Source info for module items */}
          {isModuleItem && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <span className={styles.fileSource}>
                {(file as FileModuleItem).itemType}
              </span>
            </>
          )}

          {/* Download status indicator */}
          {isDownloaded && !isModuleItem && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <CheckCircle size={12} color="var(--color-success)" />
            </>
          )}
        </div>
      </div>

      <div className={styles.fileActions}>
        {/* ExternalUrl items: show external link icon, no download */}
        {isModuleItem && (file as FileModuleItem).itemType === 'ExternalUrl' ? (
          <button
            className={styles.fileActionButton}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="Open external link"
            aria-label="Open external link"
          >
            <ExternalLink size={14} color="var(--text-muted)" />
          </button>
        ) : isDownloading ? (
          <Loader2 size={14} className={styles.spinner} color="var(--text-secondary)" />
        ) : isDownloaded ? (
          <>
            <button
              className={styles.fileActionButton}
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              title="Open file"
              aria-label="Open file"
            >
              <CheckCircle size={14} color="var(--color-success)" />
            </button>
            {onShowInFolder && (
              <button
                className={styles.fileActionButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowInFolder();
                }}
                title="Show in folder"
                aria-label="Show in folder"
              >
                <FolderOpen size={14} />
              </button>
            )}
          </>
        ) : downloadStatus === 'failed' ? (
          <button
            className={styles.fileActionButton}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            title="Retry download"
            aria-label="Retry download"
          >
            <AlertCircle size={14} color="var(--color-error)" />
          </button>
        ) : (
          <button
            className={styles.fileActionButton}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            title="Download"
            aria-label="Download file"
          >
            <Download size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default FileListItem;
