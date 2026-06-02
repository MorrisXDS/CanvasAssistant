/**
 * Files Page
 * Facade component that composes hooks and delegates rendering to subcomponents.
 * Business logic lives in useFilesPageState, useFileSelection, and useFileDialogs.
 * Tree rendering lives in FileTreeRenderer.
 */

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { useKeymap } from '../../hooks/useKeymap';
import {
  FolderOpen,
  Loader2,
  Search,
  Grid,
  List,
  ChevronDown,
  RefreshCw,
  Filter,
  X,
  Square,
  CheckSquare,
  Settings,
} from 'lucide-react';
import { Card, ConfirmDialog, Dropdown } from '../shared';
import styles from './FilesPage.module.css';

// Extracted components
import { getFileName, isFileDownloaded, getCanonicalFileId } from './FileListItem';
import type { FileItem } from './FileListItem';
import { FileFilterPanel } from './FileFilterPanel';
import { FileSyncConfig } from './FileSyncConfig';
import { FileSelectionBar } from './FileSelectionBar';
import { FileContextMenu, FilePropertiesContent } from './FileContextMenu';
import { MissingDependenciesDialog } from './MissingDependenciesDialog';
import { ExternalLinkDialog } from './ExternalLinkDialog';
import { PageDownloadDialog } from './PageDownloadDialog';
import { getCourseColor, getShortCode } from './folderTypes';

// Decomposed hooks and renderer
import { useFilesPageState } from './useFilesPageState';
import { useFileSelection } from './useFileSelection';
import { useFileDialogs } from './useFileDialogs';
import { FileTreeRenderer } from './FileTreeRenderer';
import { useFileReveal } from './useFileReveal';

export function FilesPage() {
  const state = useFilesPageState();

  const selection = useFileSelection(state.groupedFiles);

  // Wrap toggleCourse/toggleFolder to also update Ctrl+A focus context
  const toggleCourseWithFocus = useCallback(
    (courseId: number) => {
      selection.setFocusFromCourse(courseId);
      state.toggleCourse(courseId);
    },
    [selection.setFocusFromCourse, state.toggleCourse]
  );

  const toggleFolderWithFocus = useCallback(
    (courseId: number, folderPath: string) => {
      selection.setFocusFromFolder(courseId, folderPath);
      state.toggleFolder(courseId, folderPath);
    },
    [selection.setFocusFromFolder, state.toggleFolder]
  );

  const dialogs = useFileDialogs(
    state.files,
    state.fetchFiles,
    state.downloadingIds,
    state.setDownloadingIds,
    state.markFileUpdateSeen
  );

  // "Reveal in Files": when navigated here with a `revealFileKey` in router
  // state (e.g. from an announcement file reference, issue #29), expand to +
  // scroll to + highlight that file's row. Logic lives in the hook.
  useFileReveal({
    loading: state.loading,
    sourceFilter: state.sourceFilter,
    setSourceFilter: state.setSourceFilter,
    expandedCourses: state.expandedCourses,
    groupedFiles: state.groupedFiles,
    isFolderExpanded: state.isFolderExpanded,
    toggleCourse: state.toggleCourse,
    toggleFolder: state.toggleFolder,
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation — flat list of all currently visible tree rows
  // (courses → expanded folders → files in expanded folders), in render order.
  // ---------------------------------------------------------------------------
  type FileTreeRow =
    | { kind: 'course'; id: number }
    | { kind: 'folder'; courseId: number; path: string }
    | { kind: 'file'; file: FileItem };

  const visibleRows = useMemo<FileTreeRow[]>(() => {
    const rows: FileTreeRow[] = [];
    const sortedIds = state.coursesDragDrop.sortByCustomOrder(
      Array.from(state.groupedFiles.keys())
    );
    for (const courseId of sortedIds) {
      rows.push({ kind: 'course', id: courseId });
      if (!state.expandedCourses.has(courseId)) continue;
      const folderMap = state.groupedFiles.get(courseId);
      if (!folderMap) continue;
      for (const [folderPath, files] of folderMap) {
        rows.push({ kind: 'folder', courseId, path: folderPath });
        if (!state.isFolderExpanded(courseId, folderPath)) continue;
        for (const file of files) {
          rows.push({ kind: 'file', file });
        }
      }
    }
    return rows;
  }, [
    state.groupedFiles,
    state.expandedCourses,
    state.isFolderExpanded,
    state.coursesDragDrop,
  ]);

  const rowIndexMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    visibleRows.forEach((row, i) => {
      const key =
        row.kind === 'course'
          ? `course:${row.id}`
          : row.kind === 'folder'
            ? `folder:${row.courseId}:${row.path}`
            : getCanonicalFileId(row.file);
      map.set(key, i);
    });
    return map;
  }, [visibleRows]);

  const [focusedRowIndex, setFocusedRowIndex] = useState(-1);
  const focusedRow = visibleRows[focusedRowIndex] ?? null;

  useEffect(() => {
    if (focusedRowIndex >= visibleRows.length) {
      setFocusedRowIndex(Math.max(-1, visibleRows.length - 1));
    }
  }, [visibleRows.length, focusedRowIndex]);

  useKeymap<'files'>(
    {
      files: {
        'ArrowUp,w': (e) => {
          e.preventDefault();
          setFocusedRowIndex((i) => (i <= 0 ? 0 : i - 1));
        },
        'ArrowDown,s': (e) => {
          e.preventDefault();
          setFocusedRowIndex((i) =>
            i < 0 ? 0 : Math.min(visibleRows.length - 1, i + 1)
          );
        },
        Enter: (e) => {
          e.preventDefault();
          if (!focusedRow) return;
          if (focusedRow.kind === 'course') toggleCourseWithFocus(focusedRow.id);
          else if (focusedRow.kind === 'folder')
            toggleFolderWithFocus(focusedRow.courseId, focusedRow.path);
          else dialogs.handleDownload(focusedRow.file);
        },
        'ArrowRight,d': (e) => {
          e.preventDefault();
          if (!focusedRow) return;
          if (focusedRow.kind === 'course' && !state.expandedCourses.has(focusedRow.id))
            toggleCourseWithFocus(focusedRow.id);
          else if (
            focusedRow.kind === 'folder' &&
            !state.isFolderExpanded(focusedRow.courseId, focusedRow.path)
          )
            toggleFolderWithFocus(focusedRow.courseId, focusedRow.path);
        },
        'ArrowLeft,a': (e) => {
          e.preventDefault();
          if (!focusedRow) return;
          if (focusedRow.kind === 'course' && state.expandedCourses.has(focusedRow.id))
            toggleCourseWithFocus(focusedRow.id);
          else if (
            focusedRow.kind === 'folder' &&
            state.isFolderExpanded(focusedRow.courseId, focusedRow.path)
          )
            toggleFolderWithFocus(focusedRow.courseId, focusedRow.path);
        },
        Space: (e) => {
          e.preventDefault();
          if (focusedRow?.kind === 'file') selection.toggleFileSelection(focusedRow.file);
        },
        Escape: () => setFocusedRowIndex(-1),
      },
    },
    { initialScope: 'files' }
  );

  // Loading state
  if (state.loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <Loader2 size={24} className={styles.spinner} />
          <span>Loading files...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Files</h1>
          <p className={styles.subtitle}>
            {state.totalFiles} file{state.totalFiles !== 1 ? 's' : ''} •{' '}
            {state.downloadedCount} downloaded
            {state.hasActiveFilters && ` • ${state.filteredCount} shown`}
          </p>
        </div>

        <div className={styles.headerActions}>
          {/* File Management Dropdown */}
          <Dropdown
            trigger={
              <button
                className={`${styles.actionButton} ${state.showSyncConfig ? styles.actionButtonActive : ''}`}
                title="File management"
              >
                <Settings size={16} />
                File Management
                <ChevronDown size={14} />
              </button>
            }
            isOpen={state.showSyncConfig}
            onOpenChange={state.setShowSyncConfig}
            align="left"
            width={380}
          >
            <FileSyncConfig
              filesDirectory={state.filesDirectory}
              onOpenFilesDirectory={state.handleOpenFilesDirectory}
              onClearFilesSync={state.handleClearFilesSync}
            />
          </Dropdown>

          {/* Sync Button */}
          <button
            className={styles.syncButton}
            onClick={state.handleSync}
            disabled={state.syncStatus === 'syncing'}
            title="Sync with Canvas"
          >
            <RefreshCw
              size={16}
              className={state.syncStatus === 'syncing' ? styles.spinner : undefined}
            />
            {state.syncStatus === 'syncing' ? 'Syncing...' : 'Sync'}
          </button>

          {/* Select Mode Toggle */}
          <button
            className={`${styles.actionButton} ${selection.selectMode ? styles.actionButtonActive : ''}`}
            onClick={() => {
              if (selection.selectMode) {
                selection.resetSelection();
              } else {
                selection.setSelectMode(true);
              }
            }}
            title="Select files to download"
          >
            {selection.selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
            Select
          </button>

          {/* Filter Dropdown */}
          <Dropdown
            trigger={
              <button
                className={`${styles.actionButton} ${state.showFilters || state.hasActiveFilters ? styles.actionButtonActive : ''}`}
                title="Toggle filters"
              >
                <Filter size={16} />
                Filters
                {state.hasActiveFilters && (
                  <span className={styles.filterBadge}>
                    {state.selectedPrefixes.size +
                      state.selectedTerms.size +
                      (state.sourceFilter !== 'all' ? 1 : 0) +
                      (state.statusFilter !== 'all' ? 1 : 0) +
                      state.selectedExtensions.size +
                      (state.sizeFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
                <ChevronDown size={14} />
              </button>
            }
            isOpen={state.showFilters}
            onOpenChange={state.setShowFilters}
            align="left"
            width={400}
          >
            <FileFilterPanel
              availablePrefixes={state.availablePrefixes}
              availableTerms={state.availableTerms}
              availableExtensions={state.availableExtensions}
              coursesWithFiles={state.coursesWithFiles}
              coursesByPrefix={state.coursesByPrefix}
              selectedPrefixes={state.selectedPrefixes}
              selectedTerms={state.selectedTerms}
              sourceFilter={state.sourceFilter}
              statusFilter={state.statusFilter}
              selectedExtensions={state.selectedExtensions}
              sizeFilter={state.sizeFilter}
              selectedCourseIds={state.selectedCourseIds}
              onTogglePrefix={state.togglePrefix}
              onToggleTerm={state.toggleTerm}
              onSourceFilterChange={state.setSourceFilter}
              onStatusFilterChange={state.setStatusFilter}
              onToggleExtension={state.toggleExtension}
              onSizeFilterChange={state.setSizeFilter}
              onToggleCourseFilter={state.toggleCourseFilter}
              onSelectAllCourses={() => state.setSelectedCourseIds(null)}
              onDeselectAllCourses={() => state.setSelectedCourseIds(new Set())}
              onClearFilters={state.clearFilters}
              getCourseColor={getCourseColor}
              getShortCode={getShortCode}
              isCourseFilterSelected={state.isCourseFilterSelected}
              hasActiveFilters={state.hasActiveFilters}
            />
          </Dropdown>

          {/* Search */}
          <div className={styles.searchBox}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search files..."
              value={state.searchQuery}
              onChange={(e) => state.setSearchQuery(e.target.value)}
              className={styles.searchInput}
              data-search-input
            />
            {state.searchQuery && (
              <button
                className={styles.clearSearch}
                onClick={() => state.setSearchQuery('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* View Toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewButton} ${state.viewMode === 'list' ? styles.viewButtonActive : ''}`}
              onClick={() => state.setViewMode('list')}
              aria-label="List view"
            >
              <List size={18} />
            </button>
            <button
              className={`${styles.viewButton} ${state.viewMode === 'grid' ? styles.viewButtonActive : ''}`}
              onClick={() => state.setViewMode('grid')}
              aria-label="Grid view"
            >
              <Grid size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Selection Bar */}
      {selection.selectMode && (
        <FileSelectionBar
          selectedCount={selection.selectedCount}
          pendingCount={selection.pendingCount}
          downloadedCount={selection.downloadedCount}
          onSelectAllPending={selection.selectAllVisible}
          onDeselectAll={selection.deselectAll}
          onCancel={() => selection.resetSelection()}
          onDownloadSelected={() =>
            selection.handleDownloadSelected(
              state.downloadingIds,
              state.setDownloadingIds,
              state.fetchFiles
            )
          }
          onDeleteSelectedLocal={() =>
            selection.handleDeleteSelectedLocal(state.fetchFiles)
          }
          onOpenSelectedInCanvas={selection.handleOpenSelectedInCanvas}
          isDownloading={state.downloadingIds.size > 0}
          downloadProgress={selection.downloadProgress}
        />
      )}

      {/* Empty State */}
      {state.totalFiles === 0 ? (
        <Card padding="lg">
          <div className={styles.emptyState}>
            <FolderOpen
              size={64}
              color="var(--color-navy)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 className={styles.emptyTitle}>No Files Yet</h2>
            <p className={styles.emptyText}>
              Files from Canvas and announcements will appear here after syncing.
            </p>
            <button className={styles.syncButtonLarge} onClick={state.handleSync}>
              <RefreshCw size={18} />
              Sync Now
            </button>
          </div>
        </Card>
      ) : state.filteredCount === 0 ? (
        <Card padding="lg">
          <div className={styles.emptyState}>
            <Search
              size={48}
              color="var(--text-muted)"
              style={{ marginBottom: 'var(--space-4)' }}
            />
            <h2 className={styles.emptyTitle}>No Results</h2>
            <p className={styles.emptyText}>No files match your current filters</p>
            <button className={styles.clearFiltersButton} onClick={state.clearFilters}>
              Clear filters
            </button>
          </div>
        </Card>
      ) : (
        /* File Tree - onClickCapture for Shift/Ctrl multi-select */
        <div
          onClickCapture={(e) => {
            if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return;
            const fileEl = (e.target as HTMLElement).closest('[data-file-key]');
            if (!fileEl) return;
            const key = fileEl.getAttribute('data-file-key')!;
            const allFiles: FileItem[] = [];
            for (const folderMap of state.groupedFiles.values()) {
              for (const fileList of folderMap.values()) {
                allFiles.push(...fileList);
              }
            }
            const file = allFiles.find((f) => getCanonicalFileId(f) === key);
            if (file) {
              e.stopPropagation();
              selection.handleMultiSelectClick(file, e);
            }
          }}
        >
          <FileTreeRenderer
            groupedFiles={state.groupedFiles}
            courseMap={state.courseMap}
            expandedCourses={state.expandedCourses}
            focusedRowIndex={focusedRowIndex}
            rowIndexMap={rowIndexMap}
            viewMode={state.viewMode}
            selectMode={selection.selectMode}
            selectedFiles={selection.selectedFiles}
            downloadingIds={state.downloadingIds}
            folderModulePositions={state.folderModulePositions}
            folderDragDrop={state.folderDragDrop}
            coursesDragDrop={state.coursesDragDrop}
            toggleCourse={toggleCourseWithFocus}
            isFolderExpanded={state.isFolderExpanded}
            toggleFolder={toggleFolderWithFocus}
            courseHasFileUpdates={state.courseHasFileUpdates}
            getFolderFileUpdates={state.getFolderFileUpdates}
            getFileUpdateType={state.getFileUpdateType}
            getFileKey={selection.getFileKey}
            toggleFileSelection={selection.toggleFileSelection}
            handleDownload={dialogs.handleDownload}
            handleOpen={dialogs.handleOpen}
            canShowInFolder={dialogs.canShowInFolder}
            handleShowInFolder={dialogs.handleShowInFolder}
            handleContextMenu={dialogs.handleContextMenu}
          />
        </div>
      )}

      {/* Download Confirmation Dialog */}
      <ConfirmDialog
        isOpen={dialogs.pendingDownload !== null}
        title={
          dialogs.pendingDownload && isFileDownloaded(dialogs.pendingDownload)
            ? 'Re-download File?'
            : 'Download File'
        }
        message={
          dialogs.pendingDownload && isFileDownloaded(dialogs.pendingDownload)
            ? `"${getFileName(dialogs.pendingDownload)}" has already been downloaded. Do you want to download it again? This will overwrite the existing file.`
            : `Download "${dialogs.pendingDownload ? getFileName(dialogs.pendingDownload) : ''}"?`
        }
        type={
          dialogs.pendingDownload && isFileDownloaded(dialogs.pendingDownload)
            ? 'warning'
            : 'info'
        }
        confirmText={
          dialogs.pendingDownload && isFileDownloaded(dialogs.pendingDownload)
            ? 'Re-download'
            : 'Download'
        }
        cancelText="Cancel"
        onConfirm={dialogs.confirmDownload}
        onCancel={() => dialogs.setPendingDownload(null)}
      />

      {/* File Context Menu */}
      {dialogs.contextMenu && (
        <FileContextMenu
          file={dialogs.contextMenu.file}
          position={{ x: dialogs.contextMenu.x, y: dialogs.contextMenu.y }}
          onClose={() => dialogs.setContextMenu(null)}
          onOpen={() => dialogs.handleOpen(dialogs.contextMenu!.file)}
          onDownload={() => dialogs.handleDownload(dialogs.contextMenu!.file)}
          onShowInFolder={() => dialogs.handleShowInFolder(dialogs.contextMenu!.file)}
          onCopyPath={() => dialogs.handleCopyPath(dialogs.contextMenu!.file)}
          onOpenInCanvas={() => dialogs.handleOpenInCanvas(dialogs.contextMenu!.file)}
          onDeleteLocal={() => dialogs.handleDeleteLocal(dialogs.contextMenu!.file)}
          onShowProperties={() => dialogs.handleShowProperties(dialogs.contextMenu!.file)}
        />
      )}

      {/* File Properties Dialog */}
      <ConfirmDialog
        isOpen={dialogs.propertiesFile !== null}
        title="File Properties"
        message=""
        type="info"
        confirmText="Close"
        onConfirm={() => dialogs.setPropertiesFile(null)}
        onCancel={() => dialogs.setPropertiesFile(null)}
        hideCancel
      >
        {dialogs.propertiesFile && (
          <FilePropertiesContent
            file={dialogs.propertiesFile}
            courseName={
              state.courseMap.get(dialogs.propertiesFile.courseId)?.nickname ||
              state.courseMap.get(dialogs.propertiesFile.courseId)?.name ||
              'Unknown Course'
            }
          />
        )}
      </ConfirmDialog>

      {/* Clear Files Sync Confirmation Dialog */}
      <ConfirmDialog
        isOpen={state.clearFilesSyncConfirmOpen}
        title="Clear File Data"
        message="Clear all synced file data? This will remove file information from the database but not delete downloaded files."
        type="warning"
        confirmText="Clear Data"
        cancelText="Cancel"
        onConfirm={state.confirmClearFilesSync}
        onCancel={state.cancelClearFilesSync}
      />

      {/* Missing Dependencies Dialog for HTML files */}
      <MissingDependenciesDialog
        isOpen={dialogs.missingDepsDialog.isOpen}
        onClose={dialogs.closeMissingDepsDialog}
        onDownload={dialogs.handleDownloadDependencies}
        onOpenAnyway={dialogs.handleOpenAnyway}
        missingDependencies={dialogs.missingDepsDialog.dependencies}
        totalSize={dialogs.missingDepsDialog.totalSize}
        fileName={
          dialogs.missingDepsDialog.file
            ? getFileName(dialogs.missingDepsDialog.file)
            : ''
        }
        isDownloading={dialogs.missingDepsDialog.isDownloading}
        downloadProgress={dialogs.missingDepsDialog.downloadProgress}
      />

      {/* External Link Confirmation Dialog */}
      <ExternalLinkDialog
        isOpen={dialogs.externalLinkDialog.isOpen}
        url={dialogs.externalLinkDialog.url}
        title={dialogs.externalLinkDialog.title}
        onClose={dialogs.closeExternalLinkDialog}
        onConfirm={dialogs.handleExternalLinkConfirm}
      />

      {/* Page Download Dialog (Local HTML Files) */}
      <PageDownloadDialog
        isOpen={dialogs.pageDownloadDialog.isOpen}
        pageTitle={dialogs.pageDownloadDialog.moduleItem?.title || ''}
        isDownloading={dialogs.pageDownloadDialog.isDownloading}
        onClose={dialogs.closePageDownloadDialog}
        onDownload={dialogs.handleDownloadPage}
        onOpenInCanvas={dialogs.handleOpenPageInCanvas}
      />

      {/* Content Changed Warning Toast */}
      {dialogs.contentChangedWarning.show && (
        <div className={styles.contentChangedWarning}>
          <div className={styles.contentChangedWarningContent}>
            <RefreshCw size={16} className={styles.contentChangedWarningIcon} />
            <span>
              Content for <strong>{dialogs.contentChangedWarning.fileName}</strong> was
              updated while downloading. Consider re-downloading for the latest version.
            </span>
          </div>
          <div className={styles.contentChangedWarningActions}>
            <button
              className={styles.contentChangedWarningButton}
              onClick={dialogs.handleRedownloadAfterChange}
            >
              Re-download
            </button>
            <button
              className={styles.contentChangedWarningDismiss}
              onClick={() =>
                dialogs.setContentChangedWarning({
                  show: false,
                  fileId: null,
                  fileName: null,
                })
              }
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilesPage;
