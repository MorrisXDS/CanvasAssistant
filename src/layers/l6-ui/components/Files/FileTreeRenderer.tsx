/**
 * FileTreeRenderer
 * Renders the course/folder/file tree structure for the FilesPage
 */

import React from 'react';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { NotificationDot } from '../shared';
import type { UpdateType } from '../shared';
import type { FileItem } from './FileListItem';
import { FileListItem, isFileDownloaded, getCanonicalFileId } from './FileListItem';
import { FileGridItem } from './FileGridItem';
import {
  getFolderTypeFromPath,
  getFolderDepth,
  getCourseColor,
  getShortCode,
} from './folderTypes';
import { getFolderIcon } from './filesPageUtils';
import type { ViewMode } from './filesPageTypes';
import styles from './FilesPage.module.css';

interface CourseInfo {
  id: number;
  code: string;
  name: string;
  nickname?: string | null;
  color?: string | null;
}

interface FolderDragDrop {
  draggedFolder: { courseId: number; path: string } | null;
  dragOverFolder: { courseId: number; path: string } | null;
  handleDragStart: (e: React.DragEvent, courseId: number, path: string) => void;
  handleDragOver: (e: React.DragEvent, courseId: number, path: string) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDrop: (
    e: React.DragEvent,
    courseId: number,
    path: string,
    allPaths: string[]
  ) => void;
  sortFoldersByCustomOrder: (courseId: number, paths: string[]) => string[];
  hasCustomOrder: (courseId: number) => boolean;
}

interface CoursesDragDrop {
  draggedCourseId: number | null;
  dragOverCourseId: number | null;
  handleDragStart: (e: React.DragEvent, courseId: number) => void;
  handleDragOver: (e: React.DragEvent, courseId: number) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, courseId: number) => void;
  sortByCustomOrder: (courseIds: number[]) => number[];
}

export interface FileTreeRendererProps {
  groupedFiles: Map<number, Map<string, FileItem[]>>;
  courseMap: Map<number, CourseInfo>;
  expandedCourses: Set<number>;
  focusedRowIndex: number;
  rowIndexMap: Map<string, number>;
  viewMode: ViewMode;
  selectMode: boolean;
  selectedFiles: Set<string>;
  downloadingIds: Set<string>;
  folderModulePositions: Map<number, Map<string, number>>;

  // Drag-and-drop
  folderDragDrop: FolderDragDrop;
  coursesDragDrop: CoursesDragDrop;

  // Expansion
  toggleCourse: (courseId: number) => void;
  isFolderExpanded: (courseId: number, folderPath: string) => boolean;
  toggleFolder: (courseId: number, folderPath: string) => void;

  // File updates
  courseHasFileUpdates: (courseId: number) => boolean;
  getFolderFileUpdates: (
    courseId: number,
    folderPath: string,
    folderFiles: FileItem[]
  ) => Array<{ fileId: number; updateType: UpdateType }>;
  getFileUpdateType: (file: FileItem) => UpdateType | null;

  // File actions
  getFileKey: (file: FileItem) => string;
  toggleFileSelection: (file: FileItem) => void;
  handleDownload: (file: FileItem) => void;
  handleOpen: (file: FileItem) => void;
  canShowInFolder: (file: FileItem) => boolean;
  handleShowInFolder: (file: FileItem) => void;
  handleContextMenu: (file: FileItem, e: React.MouseEvent) => void;
}

export function FileTreeRenderer({
  groupedFiles,
  courseMap,
  expandedCourses,
  focusedRowIndex,
  rowIndexMap,
  viewMode,
  selectMode,
  selectedFiles,
  downloadingIds,
  folderModulePositions,
  folderDragDrop,
  coursesDragDrop,
  toggleCourse,
  isFolderExpanded,
  toggleFolder,
  courseHasFileUpdates,
  getFolderFileUpdates,
  getFileUpdateType,
  getFileKey,
  toggleFileSelection,
  handleDownload,
  handleOpen,
  canShowInFolder,
  handleShowInFolder,
  handleContextMenu,
}: FileTreeRendererProps) {
  // Sort courses by custom order
  const courseEntries = Array.from(groupedFiles.entries());
  const sortedCourseIds = coursesDragDrop.sortByCustomOrder(
    courseEntries.map(([id]) => id)
  );
  const sortedEntries = sortedCourseIds
    .map((id) => courseEntries.find(([cid]) => cid === id))
    .filter(Boolean) as [number, Map<string, FileItem[]>][];

  return (
    <div className={styles.courseList}>
      {sortedEntries.map(([courseId, folderMap]) => {
        const course = courseMap.get(courseId);
        const isExpanded = expandedCourses.has(courseId);
        const courseColor = getCourseColor(courseId, course?.color || null);
        const courseCode = course ? getShortCode(course.code) : 'Unknown';
        const isCoursesDragging = coursesDragDrop.draggedCourseId === courseId;
        const isCoursesDragOver = coursesDragDrop.dragOverCourseId === courseId;

        let totalInCourse = 0;
        let downloadedInCourse = 0;
        for (const fileList of folderMap.values()) {
          totalInCourse += fileList.length;
          downloadedInCourse += fileList.filter(isFileDownloaded).length;
        }

        // Sort folders
        const folderPaths = Array.from(folderMap.keys());

        let sortedPaths: string[];
        if (folderDragDrop.hasCustomOrder(courseId)) {
          sortedPaths = folderDragDrop.sortFoldersByCustomOrder(courseId, folderPaths);
        } else {
          const courseModulePositions = folderModulePositions.get(courseId);
          sortedPaths = [...folderPaths].sort((a, b) => {
            const posA = courseModulePositions?.get(a);
            const posB = courseModulePositions?.get(b);

            if (posA !== undefined && posB !== undefined) {
              return posA - posB;
            }
            if (posA !== undefined) return 1;
            if (posB !== undefined) return -1;

            return a.localeCompare(b);
          });
        }

        const sortedFolders = sortedPaths.map(
          (path) => [path, folderMap.get(path)!] as [string, FileItem[]]
        );

        return (
          <div
            key={courseId}
            className={styles.courseSection}
            draggable
            onDragStart={(e) => coursesDragDrop.handleDragStart(e, courseId)}
            onDragEnd={coursesDragDrop.handleDragEnd}
            onDragOver={(e) => coursesDragDrop.handleDragOver(e, courseId)}
            onDragLeave={coursesDragDrop.handleDragLeave}
            onDrop={(e) => coursesDragDrop.handleDrop(e, courseId)}
            style={{
              opacity: isCoursesDragging ? 0.5 : 1,
              boxShadow: isCoursesDragOver ? '0 0 0 2px var(--color-blue)' : 'none',
              borderRadius: isCoursesDragOver ? 'var(--radius-md)' : undefined,
              transition: 'opacity 150ms ease, box-shadow 150ms ease',
            }}
          >
            {/* Course Header */}
            <button
              className={styles.courseHeader}
              onClick={() => toggleCourse(courseId)}
              aria-expanded={isExpanded}
              data-focus-scope="files-page"
              data-focus-index={rowIndexMap.get(`course:${courseId}`) ?? -1}
              style={
                focusedRowIndex === rowIndexMap.get(`course:${courseId}`)
                  ? { outline: '2px solid var(--color-navy)', outlineOffset: '-2px' }
                  : undefined
              }
            >
              <div className={styles.courseHeaderLeft}>
                <span
                  className={styles.courseDragHandle}
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical size={14} />
                </span>
                {isExpanded ? (
                  <ChevronDown size={18} color="var(--text-secondary)" />
                ) : (
                  <ChevronRight size={18} color="var(--text-secondary)" />
                )}
                <span
                  className={styles.courseCodeBadge}
                  style={{ backgroundColor: courseColor }}
                >
                  {courseCode}
                </span>
                <span className={styles.courseHeaderName}>
                  {course?.nickname || course?.name || 'Unknown Course'}
                </span>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {courseHasFileUpdates(courseId) && (
                  <NotificationDot
                    color={courseColor}
                    size="md"
                    title="New file updates"
                  />
                )}
                <span className={styles.courseFileCount}>
                  {downloadedInCourse}/{totalInCourse} downloaded
                </span>
              </span>
            </button>

            {/* Folders and Files */}
            {isExpanded && (
              <div className={styles.foldersContainer}>
                {sortedFolders.map(([folderPath, folderFiles]) => (
                  <FolderSection
                    key={folderPath}
                    courseId={courseId}
                    courseColor={courseColor}
                    folderPath={folderPath}
                    focusedRowIndex={focusedRowIndex}
                    rowIndexMap={rowIndexMap}
                    folderFiles={folderFiles}
                    folderPaths={folderPaths}
                    viewMode={viewMode}
                    selectMode={selectMode}
                    selectedFiles={selectedFiles}
                    downloadingIds={downloadingIds}
                    folderDragDrop={folderDragDrop}
                    isFolderExpanded={isFolderExpanded}
                    toggleFolder={toggleFolder}
                    getFolderFileUpdates={getFolderFileUpdates}
                    getFileUpdateType={getFileUpdateType}
                    getFileKey={getFileKey}
                    toggleFileSelection={toggleFileSelection}
                    handleDownload={handleDownload}
                    handleOpen={handleOpen}
                    canShowInFolder={canShowInFolder}
                    handleShowInFolder={handleShowInFolder}
                    handleContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- FolderSection subcomponent ---

interface FolderSectionProps {
  courseId: number;
  courseColor: string;
  folderPath: string;
  focusedRowIndex: number;
  rowIndexMap: Map<string, number>;
  folderFiles: FileItem[];
  folderPaths: string[];
  viewMode: ViewMode;
  selectMode: boolean;
  selectedFiles: Set<string>;
  downloadingIds: Set<string>;
  folderDragDrop: FolderDragDrop;
  isFolderExpanded: (courseId: number, folderPath: string) => boolean;
  toggleFolder: (courseId: number, folderPath: string) => void;
  getFolderFileUpdates: (
    courseId: number,
    folderPath: string,
    folderFiles: FileItem[]
  ) => Array<{ fileId: number; updateType: UpdateType }>;
  getFileUpdateType: (file: FileItem) => UpdateType | null;
  getFileKey: (file: FileItem) => string;
  toggleFileSelection: (file: FileItem) => void;
  handleDownload: (file: FileItem) => void;
  handleOpen: (file: FileItem) => void;
  canShowInFolder: (file: FileItem) => boolean;
  handleShowInFolder: (file: FileItem) => void;
  handleContextMenu: (file: FileItem, e: React.MouseEvent) => void;
}

function FolderSection({
  courseId,
  courseColor,
  folderPath,
  focusedRowIndex,
  rowIndexMap,
  folderFiles,
  folderPaths,
  viewMode,
  selectMode,
  selectedFiles,
  downloadingIds,
  folderDragDrop,
  isFolderExpanded: isFolderExpandedFn,
  toggleFolder,
  getFolderFileUpdates,
  getFileUpdateType,
  getFileKey,
  toggleFileSelection,
  handleDownload,
  handleOpen,
  canShowInFolder,
  handleShowInFolder,
  handleContextMenu,
}: FolderSectionProps) {
  const folderExpanded = isFolderExpandedFn(courseId, folderPath);
  const folderDownloaded = folderFiles.filter(isFileDownloaded).length;
  const displayPath = folderPath || 'Root';

  const folderType = getFolderTypeFromPath(folderPath || null);
  const folderDepth = getFolderDepth(folderPath || null);

  const isDragging =
    folderDragDrop.draggedFolder?.courseId === courseId &&
    folderDragDrop.draggedFolder?.path === folderPath;
  const isDragOver =
    folderDragDrop.dragOverFolder?.courseId === courseId &&
    folderDragDrop.dragOverFolder?.path === folderPath;

  const folderFileUpdates = getFolderFileUpdates(courseId, folderPath, folderFiles);

  return (
    <div
      className={styles.folderSection}
      draggable
      onDragStart={(e) => folderDragDrop.handleDragStart(e, courseId, folderPath)}
      onDragEnd={folderDragDrop.handleDragEnd}
      onDragOver={(e) => folderDragDrop.handleDragOver(e, courseId, folderPath)}
      onDragLeave={folderDragDrop.handleDragLeave}
      onDrop={(e) => folderDragDrop.handleDrop(e, courseId, folderPath, folderPaths)}
      style={{
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDragOver ? '0 0 0 2px var(--color-blue)' : 'none',
        borderRadius: isDragOver ? 'var(--radius-md)' : undefined,
        transition: 'opacity 150ms ease, box-shadow 150ms ease',
      }}
    >
      {/* Folder Header with Type Color */}
      <button
        className={styles.folderHeader}
        onClick={() => toggleFolder(courseId, folderPath)}
        style={
          {
            '--folder-accent-color': folderType.color,
            paddingLeft: `calc(var(--space-6) + ${folderDepth * 20}px)`,
            ...(focusedRowIndex === rowIndexMap.get(`folder:${courseId}:${folderPath}`)
              ? { outline: '2px solid var(--color-navy)', outlineOffset: '-2px' }
              : {}),
          } as React.CSSProperties
        }
        data-focus-scope="files-page"
        data-focus-index={rowIndexMap.get(`folder:${courseId}:${folderPath}`) ?? -1}
        aria-expanded={folderExpanded}
      >
        <div className={styles.folderHeaderLeft}>
          <span
            className={styles.folderDragHandle}
            title="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} />
          </span>
          {folderExpanded ? (
            <ChevronDown size={14} color="var(--text-muted)" />
          ) : (
            <ChevronRight size={14} color="var(--text-muted)" />
          )}
          <span style={{ color: folderType.color }}>{getFolderIcon(folderType, 14)}</span>
          <span className={styles.folderName}>{displayPath}</span>
          <span
            className={styles.folderTypeBadge}
            style={{ backgroundColor: folderType.color }}
          >
            {folderType.label}
          </span>
        </div>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Notification dots for unseen file updates */}
          {folderFileUpdates.length > 0 && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
              title={`${folderFileUpdates.length} file${folderFileUpdates.length > 1 ? 's' : ''} with updates`}
            >
              {folderFileUpdates.slice(0, 3).map((update) => (
                <NotificationDot key={update.fileId} color={courseColor} size="sm" />
              ))}
              {folderFileUpdates.length > 3 && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    marginLeft: '2px',
                  }}
                >
                  ...
                </span>
              )}
            </span>
          )}
          <span className={styles.folderFileCount}>
            {folderDownloaded}/{folderFiles.length}
          </span>
        </span>
      </button>

      {/* Files in Folder */}
      {folderExpanded &&
        (viewMode === 'list' ? (
          <div
            className={styles.fileList}
            style={
              {
                '--folder-depth-offset': `${folderDepth * 20}px`,
              } as React.CSSProperties
            }
          >
            {folderFiles.map((file) => {
              const fileIdx = rowIndexMap.get(getCanonicalFileId(file)) ?? -1;
              const isFocused = focusedRowIndex === fileIdx && fileIdx >= 0;
              return (
                <div
                  key={getFileKey(file)}
                  data-focus-scope="files-page"
                  data-focus-index={fileIdx}
                  style={
                    isFocused
                      ? {
                          outline: '2px solid var(--color-navy)',
                          outlineOffset: '-2px',
                          borderRadius: '4px',
                        }
                      : undefined
                  }
                >
                  <FileListItem
                    file={file}
                    isDownloading={downloadingIds.has(getCanonicalFileId(file))}
                    isSelected={selectedFiles.has(getFileKey(file))}
                    selectMode={selectMode}
                    onToggleSelect={() => toggleFileSelection(file)}
                    onDownload={() => handleDownload(file)}
                    onOpen={() => handleOpen(file)}
                    onShowInFolder={
                      canShowInFolder(file) ? () => handleShowInFolder(file) : undefined
                    }
                    onContextMenu={(e) => handleContextMenu(file, e)}
                    updateType={getFileUpdateType(file)}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={styles.fileGrid}
            style={
              {
                '--folder-depth-offset': `${folderDepth * 20}px`,
              } as React.CSSProperties
            }
          >
            {folderFiles.map((file) => {
              const fileIdx = rowIndexMap.get(getCanonicalFileId(file)) ?? -1;
              const isFocused = focusedRowIndex === fileIdx && fileIdx >= 0;
              return (
                <div
                  key={getFileKey(file)}
                  data-focus-scope="files-page"
                  data-focus-index={fileIdx}
                  style={
                    isFocused
                      ? {
                          outline: '2px solid var(--color-navy)',
                          outlineOffset: '-2px',
                          borderRadius: '4px',
                        }
                      : undefined
                  }
                >
                  <FileGridItem
                    file={file}
                    isDownloading={downloadingIds.has(getCanonicalFileId(file))}
                    isSelected={selectedFiles.has(getFileKey(file))}
                    selectMode={selectMode}
                    onToggleSelect={() => toggleFileSelection(file)}
                    onDownload={() => handleDownload(file)}
                    onOpen={() => handleOpen(file)}
                    onShowInFolder={
                      canShowInFolder(file) ? () => handleShowInFolder(file) : undefined
                    }
                    onContextMenu={(e) => handleContextMenu(file, e)}
                    updateType={getFileUpdateType(file)}
                  />
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
