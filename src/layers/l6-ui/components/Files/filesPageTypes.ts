/**
 * FilesPage Types
 * Local interfaces and type definitions for the Files page
 */

import type {
  FileItem,
  FileResource,
  FileAttachment,
  FilePage,
  FileModuleItem,
} from './FileListItem';
import type { MissingDependency } from './MissingDependenciesDialog';

export type { FileItem, FileResource, FileAttachment, FilePage, FileModuleItem };

export type ViewMode = 'list' | 'grid';

export interface ExpandedState {
  courses: number[];
  folders: string[];
}

export interface ViewPreferences {
  defaultExpandAll: boolean;
  viewMode: 'list' | 'grid';
}

export interface FileExplorerSettings {
  defaultState: 'collapsed' | 'expanded' | 'remember';
  defaultViewMode: 'list' | 'grid';
}

export interface FilesData {
  resources: FileResource[];
  attachments: FileAttachment[];
  pages: FilePage[];
  moduleItems: FileModuleItem[];
}

export interface ContextMenuState {
  file: FileItem;
  x: number;
  y: number;
}

export interface MissingDepsDialogState {
  isOpen: boolean;
  file: FileItem | null;
  dependencies: MissingDependency[];
  totalSize: number;
  isDownloading: boolean;
  downloadProgress: number;
}

export interface ExternalLinkDialogState {
  isOpen: boolean;
  url: string;
  title: string;
}

export interface PageDownloadDialogState {
  isOpen: boolean;
  moduleItem: FileModuleItem | null;
  isDownloading: boolean;
}

export interface ContentChangedWarningState {
  show: boolean;
  fileId: number | null;
  fileName: string | null;
}
