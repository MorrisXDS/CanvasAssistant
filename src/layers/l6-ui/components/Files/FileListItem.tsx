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
} from 'lucide-react';
import styles from './FilesPage.module.css';

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
  sizeBytes: null;  // Pages don't have a file size
  source: 'page';
}

export type FileItem = FileAttachment | FileResource | FilePage;

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
  | 'generic';

// Categorize file based on filename and folder path
export function categorizeFile(filename: string, folderPath: string | null): ContentCategory {
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
export function extractModuleContext(folderPath: string | null, filename: string): string | null {
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
    case 'Lecture Slides': return '#1976D2';
    case 'Lab Manual': return '#7B1FA2';
    case 'Assignment': return '#E65100';
    case 'Tutorial': return '#00897B';
    case 'Notes': return '#558B2F';
    case 'Reading': return '#5D4037';
    case 'Syllabus': return '#C62828';
    case 'Solution': return '#00838F';
    case 'Exam': return '#AD1457';
    default: return '#616161';
  }
}

// Get file name helper
export function getFileName(file: FileItem): string {
  if (file.source === 'attachment') {
    return file.displayName;
  }
  return file.title;
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
  return file.localPath !== null;
}

// Format file size
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Determine file icon type based on content type and extension
export function getFileIconType(file: FileItem): FileIconType {
  // Pages are always 'page' type
  if (file.source === 'page') {
    return 'page';
  }

  const contentType = 'contentType' in file ? file.contentType : ('mimeType' in file ? file.mimeType : null);
  const filename = getFileName(file);
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
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
    case 'image': return <Image size={size} />;
    case 'pdf': return <FileText size={size} />;
    case 'spreadsheet': return <FileSpreadsheet size={size} />;
    case 'presentation': return <Presentation size={size} />;
    case 'document': return <FileText size={size} />;
    case 'archive': return <Archive size={size} />;
    case 'code': return <Code size={size} />;
    case 'audio': return <Music size={size} />;
    case 'video': return <Video size={size} />;
    case 'page': return <ScrollText size={size} />;
    default: return <File size={size} />;
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
}: FileListItemProps) {
  const isAttachment = file.source === 'attachment';
  const downloadStatus = isAttachment ? (file as FileAttachment).downloadStatus : null;
  const isDownloaded = isFileDownloaded(file);

  // Get metadata
  const filename = getFileName(file);
  const folderPath = file.source === 'resource' ? (file as FileResource).folderPath : null;
  const category = categorizeFile(filename, folderPath);
  const moduleContext = extractModuleContext(folderPath, filename);
  const categoryColor = getCategoryColor(category);
  const fileSize = formatFileSize(file.sizeBytes);
  const iconType = getFileIconType(file);
  const iconClass = getFileIconClass(iconType);

  // Handle double-click
  const handleDoubleClick = () => {
    if (selectMode) return;
    if (isDownloaded) {
      onOpen();
    } else {
      onDownload();
    }
  };

  return (
    <div
      className={styles.fileListItem}
      onDoubleClick={handleDoubleClick}
      title={isDownloaded ? 'Double-click to open' : 'Double-click to download'}
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

      <div className={`${styles.fileIcon} ${iconClass}`}>
        {getFileIcon(file, 16)}
      </div>

      <div className={styles.fileInfo}>
        <div className={styles.fileName}>{filename}</div>
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

          {/* Download status indicator */}
          {isDownloaded && (
            <>
              <span className={styles.metaSeparator}>•</span>
              <CheckCircle size={12} color="var(--color-success)" />
            </>
          )}
        </div>
      </div>

      <div className={styles.fileActions}>
        {isDownloading ? (
          <Loader2
            size={14}
            className={styles.spinner}
            color="var(--text-secondary)"
          />
        ) : isDownloaded ? (
          <>
            <button
              className={styles.fileActionButton}
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              title="Open file"
              aria-label="Open file"
            >
              <CheckCircle size={14} color="var(--color-success)" />
            </button>
            {onShowInFolder && (
              <button
                className={styles.fileActionButton}
                onClick={(e) => { e.stopPropagation(); onShowInFolder(); }}
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
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            title="Retry download"
            aria-label="Retry download"
          >
            <AlertCircle size={14} color="var(--color-error)" />
          </button>
        ) : (
          <button
            className={styles.fileActionButton}
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
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
