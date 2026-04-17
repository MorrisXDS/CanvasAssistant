/**
 * UpdatesPage - Shows all sync updates in a two-column layout
 * Left: Action-required items (queued tasks needing accept/dismiss)
 * Right: Informational items (grades, files, announcements)
 *
 * This is a facade that delegates to subcomponents in the Updates/ folder.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle, AlertTriangle } from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { formatTimeAgo, getCleanCourseName } from '../../constants';
import type { SyncUpdate } from '../../../l5-presentation/types';

// Submodule imports
import { styles } from './Updates/updatesPageStyles';
import { UPDATE_LABELS } from './Updates/updatesPageConstants';
import { ActionRequiredItem } from './Updates/ActionRequiredItem';
import { ConflictItem } from './Updates/ConflictItem';
import { InformationalItem } from './Updates/InformationalItem';
import { useHotkeys } from 'react-hotkeys-hook';
import { useFocusedItem } from '../../hooks/useFocusedItem';

type FilterType = 'all' | 'task' | 'grade' | 'file' | 'page' | 'announcement';

const FILTER_KEYS: Record<string, FilterType> = {
  '1': 'all',
  '2': 'task',
  '3': 'grade',
  '4': 'file',
  '5': 'page',
  '6': 'announcement',
};

export function UpdatesPage() {
  const navigate = useNavigate();
  const {
    syncUpdates,
    fetchSyncUpdates,
    markSyncUpdatesSeen,
    markAllSyncUpdatesSeen,
    lastSyncedAt,
    acceptQueuedTask,
    rejectQueuedTask,
    resolveSyncConflict,
  } = useStore();

  // Ensure updates is always an array (defensive)
  const updates = syncUpdates.updates ?? [];
  const totalUnseen = syncUpdates.totalUnseen ?? 0;
  const [filter, setFilter] = useState<FilterType>('all');

  // Keyboard shortcuts for filter tabs
  useHotkeys('1, 2, 3, 4, 5, 6', (_, handler) => {
    const key = handler.keys?.join('') || '';
    const f = FILTER_KEYS[key];
    if (f) setFilter(f);
  });

  // Timer tick to force re-render of relative times every 30 seconds
  const [timeTick, setTimeTick] = useState(0);

  // Fetch updates on mount
  useEffect(() => {
    fetchSyncUpdates();
  }, [fetchSyncUpdates]);

  // Update relative times every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeTick((tick) => tick + 1);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Separate informational from action-required (conflicts + queued tasks)
  const informationalUpdates = useMemo(() => {
    let filtered = updates.filter(
      (u) => !u.isActionRequired && u.entityType !== 'conflict'
    );
    if (filter !== 'all') {
      filtered = filtered.filter((u) => u.entityType === filter);
    }
    return filtered;
  }, [updates, filter]);

  // Group action-required items (conflicts + queued tasks) by course
  // Each course group has conflicts array and tasks array
  const needsReviewByCourse = useMemo(() => {
    const grouped = new Map<
      number,
      {
        course: { id: number; code: string; name: string; color: string };
        conflicts: SyncUpdate[];
        tasks: SyncUpdate[];
      }
    >();

    // Add conflicts
    for (const update of updates.filter((u) => u.entityType === 'conflict')) {
      let group = grouped.get(update.courseId);
      if (!group) {
        group = {
          course: {
            id: update.courseId,
            code: update.courseCode || '',
            name: update.courseName || 'Unknown',
            color: update.courseColor || '#6B7280',
          },
          conflicts: [],
          tasks: [],
        };
        grouped.set(update.courseId, group);
      }
      group.conflicts.push(update);
    }

    // Add action-required tasks (non-conflicts)
    for (const update of updates.filter(
      (u) => u.isActionRequired && u.entityType !== 'conflict'
    )) {
      let group = grouped.get(update.courseId);
      if (!group) {
        group = {
          course: {
            id: update.courseId,
            code: update.courseCode || '',
            name: update.courseName || 'Unknown',
            color: update.courseColor || '#6B7280',
          },
          conflicts: [],
          tasks: [],
        };
        grouped.set(update.courseId, group);
      }
      group.tasks.push(update);
    }

    return Array.from(grouped.values());
  }, [updates]);

  // Flat list of action-required queued tasks for keyboard focus
  const flatActionTasks = useMemo(() => {
    const tasks: SyncUpdate[] = [];
    for (const group of needsReviewByCourse) {
      tasks.push(...group.tasks);
    }
    return tasks;
  }, [needsReviewByCourse]);

  // Focused item navigation (Left/Right + J/K) for queued tasks
  const { focusedItem: focusedActionTask } = useFocusedItem(flatActionTasks, {
    persistKey: 'updates-page',
  });

  // A: accept focused queued task
  useHotkeys('a', () => {
    if (focusedActionTask) {
      handleAcceptTask(focusedActionTask.entityId);
    }
  });

  // Total counts for header
  const totalNeedsReview = useMemo(() => {
    return needsReviewByCourse.reduce(
      (sum, g) => sum + g.conflicts.length + g.tasks.length,
      0
    );
  }, [needsReviewByCourse]);

  // Group informational by course with file/page counts
  const informationalByCourse = useMemo(() => {
    const grouped = new Map<
      number,
      {
        course: { id: number; code: string; name: string; color: string };
        items: SyncUpdate[];
        fileCount: number;
        pageCount: number;
      }
    >();
    for (const update of informationalUpdates) {
      let group = grouped.get(update.courseId);
      if (!group) {
        group = {
          course: {
            id: update.courseId,
            code: update.courseCode || '',
            name: update.courseName || 'Unknown',
            color: update.courseColor || '#6B7280',
          },
          items: [],
          fileCount: 0,
          pageCount: 0,
        };
        grouped.set(update.courseId, group);
      }
      group.items.push(update);
      if (update.entityType === 'file') {
        group.fileCount++;
      } else if (update.entityType === 'page') {
        group.pageCount++;
      }
    }
    return Array.from(grouped.values());
  }, [informationalUpdates]);

  // Count by type for filter tabs
  const countByType = useMemo(() => {
    const infoOnly = updates.filter(
      (u) => !u.isActionRequired && u.entityType !== 'conflict'
    );
    const counts: Record<string, number> = { all: infoOnly.length };
    for (const update of infoOnly) {
      counts[update.entityType] = (counts[update.entityType] || 0) + 1;
    }
    return counts;
  }, [updates]);

  // Handlers
  const handleMarkSeen = useCallback(
    async (updateId: number) => {
      await markSyncUpdatesSeen([updateId]);
    },
    [markSyncUpdatesSeen]
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllSyncUpdatesSeen({ excludeConflicts: true });
  }, [markAllSyncUpdatesSeen]);

  const handleAcceptTask = useCallback(
    async (entityId: number) => {
      await acceptQueuedTask(entityId);
      await fetchSyncUpdates();
    },
    [acceptQueuedTask, fetchSyncUpdates]
  );

  const handleRejectTask = useCallback(
    async (entityId: number) => {
      await rejectQueuedTask(entityId);
      await fetchSyncUpdates();
    },
    [rejectQueuedTask, fetchSyncUpdates]
  );

  const handleResolveConflict = useCallback(
    async (
      conflictId: string,
      useCanvasValue: boolean,
      rememberChoice: boolean,
      expiresAt: string | null
    ) => {
      await resolveSyncConflict(
        conflictId,
        useCanvasValue,
        rememberChoice,
        false,
        expiresAt
      );
      await fetchSyncUpdates();
    },
    [resolveSyncConflict, fetchSyncUpdates]
  );

  // Format last synced time
  const lastSyncedText = lastSyncedAt
    ? `Last synced ${formatTimeAgo(lastSyncedAt)}`
    : 'Not synced yet';

  // Empty state
  if (totalUnseen === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>What's New</h1>
            <p style={styles.subtitle}>{lastSyncedText}</p>
          </div>
        </div>

        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            <CheckCircle size={48} />
          </div>
          <h2 style={styles.emptyTitle}>All caught up!</h2>
          <p style={styles.emptySubtitle}>No new updates since your last sync.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>What's New</h1>
          <p style={styles.subtitle}>{lastSyncedText}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={styles.columnsContainer}>
        {/* Left Column - Action Required (Conflicts + Tasks grouped by course) */}
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
            <span style={styles.columnTitle}>Needs Review</span>
            <span style={styles.columnCount}>({totalNeedsReview})</span>
          </div>

          <div style={styles.columnContent}>
            {totalNeedsReview === 0 ? (
              <div style={styles.columnEmpty}>
                <CheckCircle
                  size={24}
                  style={{ color: 'var(--color-success)', marginBottom: 8 }}
                />
                <span>No items need review</span>
              </div>
            ) : (
              needsReviewByCourse.map((group) => (
                <div key={group.course.id} style={styles.courseSection}>
                  <div style={styles.courseSectionHeader}>
                    <div
                      style={{
                        ...styles.courseColor,
                        backgroundColor: group.course.color,
                      }}
                    />
                    <span style={styles.courseLabel}>
                      {group.course.code || getCleanCourseName(group.course.name)}
                    </span>
                  </div>

                  {/* Conflicts for this course */}
                  {group.conflicts.map((conflict) => (
                    <ConflictItem
                      key={conflict.id}
                      conflict={conflict}
                      onResolve={handleResolveConflict}
                    />
                  ))}

                  {/* Separator if both conflicts and tasks exist */}
                  {group.conflicts.length > 0 && group.tasks.length > 0 && (
                    <div style={styles.courseSeparator} />
                  )}

                  {/* Queued tasks for this course */}
                  {group.tasks.map((update) => (
                    <ActionRequiredItem
                      key={update.id}
                      update={update}
                      onAccept={() => handleAcceptTask(update.entityId)}
                      onReject={() => handleRejectTask(update.entityId)}
                      onNavigate={() =>
                        navigate(
                          `/course/${update.courseId}?highlightQueue=${update.entityId}`
                        )
                      }
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column - Informational */}
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <Bell size={18} style={{ color: 'var(--color-primary)' }} />
            <span style={styles.columnTitle}>Updates</span>
            <span style={styles.columnCount}>({informationalUpdates.length})</span>
            {informationalUpdates.length > 0 && (
              <button style={styles.markAllButton} onClick={handleMarkAllRead}>
                Mark All Read
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div style={styles.filterRow}>
            {(
              ['all', 'task', 'grade', 'file', 'page', 'announcement'] as FilterType[]
            ).map((type) => {
              const count = countByType[type] || 0;
              const isActive = filter === type;
              const label = type === 'all' ? 'All' : UPDATE_LABELS[type] + 's';

              return (
                <button
                  key={type}
                  className="updates-filter-tab"
                  style={{
                    ...styles.filterTab,
                    ...(isActive ? styles.filterTabActive : {}),
                  }}
                  onClick={() => setFilter(type)}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          <div style={styles.columnContent}>
            {informationalUpdates.length === 0 ? (
              <div style={styles.columnEmpty}>
                <CheckCircle
                  size={24}
                  style={{ color: 'var(--color-success)', marginBottom: 8 }}
                />
                <span>No updates</span>
              </div>
            ) : (
              informationalByCourse.map((group) => {
                // Build resource counts string
                const resourceParts: string[] = [];
                if (group.fileCount > 0) {
                  resourceParts.push(
                    `${group.fileCount} file${group.fileCount !== 1 ? 's' : ''}`
                  );
                }
                if (group.pageCount > 0) {
                  resourceParts.push(
                    `${group.pageCount} page${group.pageCount !== 1 ? 's' : ''}`
                  );
                }
                const resourceText =
                  resourceParts.length > 0 ? resourceParts.join(', ') : null;

                return (
                  <div key={group.course.id} style={styles.courseSection}>
                    <div style={styles.courseSectionHeader}>
                      <div
                        style={{
                          ...styles.courseColor,
                          backgroundColor: group.course.color,
                        }}
                      />
                      <span style={styles.courseLabel}>
                        {group.course.code || getCleanCourseName(group.course.name)}
                      </span>
                      {resourceText && (
                        <span style={styles.resourceCount}>{resourceText}</span>
                      )}
                    </div>
                    {group.items.map((update) => (
                      <InformationalItem
                        key={update.id}
                        update={update}
                        onMarkSeen={() => handleMarkSeen(update.id)}
                        timeTick={timeTick}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpdatesPage;
