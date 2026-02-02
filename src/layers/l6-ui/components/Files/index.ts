/**
 * Files Components
 * Re-export all Files-related components
 */

export { FilesPage } from './FilesPage';
export { FileListItem } from './FileListItem';
export { FileGridItem } from './FileGridItem';
export { FileFilterPanel } from './FileFilterPanel';
export { FileSyncConfig } from './FileSyncConfig';
export { FileSelectionBar } from './FileSelectionBar';

// Types
export type {
  FileItem,
  FileAttachment,
  FileResource,
  ContentCategory,
  FileIconType,
  FileListItemProps,
} from './FileListItem';

export type { FileGridItemProps } from './FileGridItem';

export type {
  FileFilterPanelProps,
  SourceFilter,
  StatusFilter,
  SizeFilter,
  Course,
} from './FileFilterPanel';

export type { FileSyncConfigProps, SyncPreferences } from './FileSyncConfig';

export type { FileSelectionBarProps } from './FileSelectionBar';

// Utilities
export {
  categorizeFile,
  extractModuleContext,
  getCategoryColor,
  getFileName,
  isFileDownloaded,
  formatFileSize,
  getFileIconType,
  getFileIcon,
  getFileIconClass,
} from './FileListItem';

export {
  detectFolderType,
  getFolderTypeFromPath,
  getFolderDepth,
  getFolderDepthClass,
  parseFolderPath,
  buildFolderTree,
  getCourseColor,
  getShortCode,
  getCoursePrefix,
  getCourseTerm,
  FOLDER_TYPES,
  DEFAULT_FOLDER_CONFIG,
  COURSE_COLORS,
} from './folderTypes';

export type {
  FolderType,
  FolderTypeConfig,
  FolderSegment,
  FolderTreeNode,
} from './folderTypes';
