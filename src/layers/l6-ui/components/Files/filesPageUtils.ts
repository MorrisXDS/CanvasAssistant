/**
 * FilesPage Utilities
 * Pure helpers: localStorage persistence, getFileExtension, matchesSizeFilter, getFolderIcon
 */

import React from 'react';
import {
  Megaphone,
  BookOpen,
  FlaskConical,
  ClipboardList,
  GraduationCap,
  FileQuestion,
  Library,
  FolderArchive,
  FileText,
} from 'lucide-react';
import { getFileName } from './FileListItem';
import type { SizeFilter } from './FileFilterPanel';
import type { FolderTypeConfig } from './folderTypes';
import type {
  FileItem,
  ExpandedState,
  ViewPreferences,
  FileExplorerSettings,
} from './filesPageTypes';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';

// Storage keys
export const EXPANDED_STATE_KEY = 'fileExplorerExpandedState';
export const VIEW_PREFS_KEY = 'fileExplorerViewPrefs';

// Storage helpers
export function loadFileExplorerSettings(): FileExplorerSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FILE_EXPLORER);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load file explorer settings:', e);
  }
  return { defaultState: 'remember', defaultViewMode: 'list' };
}

export function loadExpandedState(): ExpandedState {
  try {
    const stored = localStorage.getItem(EXPANDED_STATE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load expanded state:', e);
  }
  return { courses: [], folders: [] };
}

export function saveExpandedState(courses: Set<number>, folders: Set<string>): void {
  try {
    localStorage.setItem(
      EXPANDED_STATE_KEY,
      JSON.stringify({
        courses: Array.from(courses),
        folders: Array.from(folders),
      })
    );
  } catch (e) {
    console.error('Failed to save expanded state:', e);
  }
}

export function loadViewPrefs(): ViewPreferences {
  try {
    const stored = localStorage.getItem(VIEW_PREFS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load view preferences:', e);
  }
  return { defaultExpandAll: false, viewMode: 'list' };
}

export function saveViewPrefs(prefs: ViewPreferences): void {
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save view preferences:', e);
  }
}

// Get file extension
export function getFileExtension(file: FileItem): string {
  const filename = getFileName(file);
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return filename.includes('.') ? ext : '';
}

// Check file size against filter
export function matchesSizeFilter(file: FileItem, filter: SizeFilter): boolean {
  if (filter === 'all') return true;
  const size = file.sizeBytes;
  if (size === null) return false;

  const MB = 1024 * 1024;
  switch (filter) {
    case 'small':
      return size < 1 * MB;
    case 'medium':
      return size >= 1 * MB && size < 10 * MB;
    case 'large':
      return size >= 10 * MB;
    default:
      return true;
  }
}

// Get folder icon based on type
export function getFolderIcon(
  type: FolderTypeConfig,
  size: number = 14
): React.ReactElement {
  switch (type.type) {
    case 'announcements':
      return React.createElement(Megaphone, { size });
    case 'lectures':
      return React.createElement(BookOpen, { size });
    case 'labs':
      return React.createElement(FlaskConical, { size });
    case 'assignments':
      return React.createElement(ClipboardList, { size });
    case 'tutorials':
      return React.createElement(GraduationCap, { size });
    case 'exams':
      return React.createElement(FileQuestion, { size });
    case 'resources':
      return React.createElement(Library, { size });
    case 'pages':
      return React.createElement(FileText, { size });
    default:
      return React.createElement(FolderArchive, { size });
  }
}
