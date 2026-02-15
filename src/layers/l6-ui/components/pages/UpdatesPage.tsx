/**
 * UpdatesPage - Shows all sync updates in a two-column layout
 * Left: Action-required items (queued tasks needing accept/dismiss)
 * Right: Informational items (grades, files, announcements)
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  FileText,
  CheckCircle,
  Megaphone,
  AlertTriangle,
  Check,
  BarChart2,
  CheckSquare,
  XSquare,
  ExternalLink,
  RefreshCcw,
  ScrollText,
} from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { formatTimeAgo, getCleanCourseName, formatFieldValue } from '../../constants';
import type { SyncUpdate } from '../../../l5-presentation/types';

type FilterType = 'all' | 'task' | 'grade' | 'file' | 'page' | 'announcement';

// Icons for different update types
const UPDATE_ICONS: Record<string, typeof Bell> = {
  task: Bell,
  grade: BarChart2,
  file: FileText,
  page: ScrollText,
  announcement: Megaphone,
  conflict: AlertTriangle,
};

// Labels for update types
const UPDATE_LABELS: Record<string, string> = {
  task: 'Task',
  grade: 'Grade',
  file: 'File',
  page: 'Page',
  announcement: 'Announcement',
  conflict: 'Conflict',
};

// Field labels for display
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  due_at: 'Due date',
  points_possible: 'Points',
  weight: 'Weight',
  grade: 'Grade',
  is_completed: 'Completed status',
  submission_status: 'Submission status',
  description: 'Description',
};

/**
 * Format the change subtitle showing old → new values
 */
function formatChangeSubtitle(update: SyncUpdate): string {
  const field = update.changedField;

  // If no field info, fall back to original subtitle
  if (!field) {
    return update.subtitle || UPDATE_LABELS[update.entityType];
  }

  const fieldLabel = FIELD_LABELS[field] || field;
  const newFormatted = formatFieldValue(field, update.newValue);

  // Handle created (no old value) - no arrow needed
  if (
    update.oldValue === null ||
    update.oldValue === undefined ||
    update.oldValue === ''
  ) {
    return `${fieldLabel}: Created ${newFormatted}`;
  }

  const oldFormatted = formatFieldValue(field, update.oldValue);

  // Handle removed value
  if (
    update.newValue === null ||
    update.newValue === undefined ||
    update.newValue === ''
  ) {
    return `${fieldLabel}: ${oldFormatted} → (removed)`;
  }

  return `${fieldLabel}: ${oldFormatted} → ${newFormatted}`;
}

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

/**
 * Helper to check if an update has been modified since creation
 * (i.e., Canvas changed the value after we first detected it)
 */
function isUpdatedSinceCreation(update: SyncUpdate): boolean {
  if (!update.updatedAt || !update.createdAt) return false;
  return new Date(update.updatedAt).getTime() > new Date(update.createdAt).getTime();
}

// Updated badge component
function UpdatedBadge() {
  return (
    <span style={styles.updatedBadge}>
      <RefreshCcw size={10} />
      UPDATED
    </span>
  );
}

// Action-required item component
function ActionRequiredItem({
  update,
  onAccept,
  onReject,
  onNavigate,
}: {
  update: SyncUpdate;
  onAccept: () => void;
  onReject: () => void;
  onNavigate: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const wasUpdated = isUpdatedSinceCreation(update);

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await onAccept();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await onReject();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.actionItem} onClick={onNavigate}>
      <div style={styles.actionItemContent}>
        <div style={styles.actionItemTitleRow}>
          <span style={styles.actionItemTitle}>{update.title}</span>
          {wasUpdated && <UpdatedBadge />}
        </div>
        <div style={styles.actionItemSubtitle}>
          {update.subtitle || 'New task from Canvas'}
        </div>
      </div>
      <div style={styles.actionItemButtons}>
        <button
          style={{ ...styles.actionButton, ...styles.acceptButton }}
          onClick={handleAccept}
          disabled={isLoading}
          title="Accept"
        >
          <CheckSquare size={14} />
        </button>
        <button
          style={{ ...styles.actionButton, ...styles.rejectButton }}
          onClick={handleReject}
          disabled={isLoading}
          title="Dismiss"
        >
          <XSquare size={14} />
        </button>
        <button
          style={{ ...styles.actionButton, ...styles.viewButton }}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
          title="View in Course"
        >
          <ExternalLink size={14} />
        </button>
      </div>
    </div>
  );
}

// Expiration options for remember choice
const EXPIRATION_OPTIONS = [
  { value: 'week', label: '1 week', days: 7 },
  { value: 'month', label: '1 month', days: 30 },
  { value: 'semester', label: 'This semester', days: 120 },
  { value: 'forever', label: 'Forever', days: null },
];

// Conflict item component
function ConflictItem({
  conflict,
  onResolve,
}: {
  conflict: SyncUpdate;
  onResolve: (
    conflictId: string,
    useCanvasValue: boolean,
    rememberChoice: boolean,
    expiresAt: string | null
  ) => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [rememberChoice, setRememberChoice] = useState(false);
  const [expiration, setExpiration] = useState<string>('semester');
  const wasUpdated = isUpdatedSinceCreation(conflict);

  // Parse local and canvas values (safely handle invalid JSON)
  const localValue = useMemo(() => {
    if (!conflict.oldValue) return null;
    try {
      return JSON.parse(conflict.oldValue);
    } catch {
      return conflict.oldValue; // Return raw string if not valid JSON
    }
  }, [conflict.oldValue]);

  const canvasValue = useMemo(() => {
    if (!conflict.newValue) return null;
    try {
      return JSON.parse(conflict.newValue);
    } catch {
      return conflict.newValue; // Return raw string if not valid JSON
    }
  }, [conflict.newValue]);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'Not set';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (val === 0 || val === 1) return val === 1 ? 'Completed' : 'Not completed';
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '[Object]';
      }
    }
    // Use field-aware formatting (handles dates, weights, etc.)
    if (conflict.conflictField) {
      return formatFieldValue(conflict.conflictField, String(val));
    }
    return String(val);
  };

  const getExpirationDate = (): string | null => {
    const option = EXPIRATION_OPTIONS.find((o) => o.value === expiration);
    if (!option || option.days === null) return null;
    const date = new Date();
    date.setDate(date.getDate() + option.days);
    return date.toISOString();
  };

  const handleResolve = async (useCanvasValue: boolean) => {
    setIsLoading(true);
    try {
      // externalId contains the conflict ID from SyncConflictResolver
      const conflictId = conflict.externalId || '';
      if (!conflictId) {
        console.error('Conflict has no ID, cannot resolve');
        return;
      }
      const expiresAt = rememberChoice ? getExpirationDate() : null;
      await onResolve(conflictId, useCanvasValue, rememberChoice, expiresAt);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.conflictItem}>
      <div style={styles.conflictHeader}>
        <span style={styles.conflictTitle}>{conflict.title}</span>
        {wasUpdated && <UpdatedBadge />}
        <span style={styles.conflictField}>{conflict.conflictField}</span>
      </div>
      <div style={styles.conflictValues}>
        <div style={styles.conflictValueBox}>
          <div style={styles.conflictValueLabel}>Local Value</div>
          <div style={styles.conflictValueContent}>{formatValue(localValue)}</div>
          <button
            style={{ ...styles.conflictButton, ...styles.keepMineButton }}
            onClick={() => handleResolve(false)}
            disabled={isLoading}
          >
            Keep Local
          </button>
        </div>
        <div style={styles.conflictValueBox}>
          <div style={styles.conflictValueLabel}>Canvas Value</div>
          <div style={styles.conflictValueContent}>{formatValue(canvasValue)}</div>
          <button
            style={{ ...styles.conflictButton, ...styles.useCanvasButton }}
            onClick={() => handleResolve(true)}
            disabled={isLoading}
          >
            Use Canvas
          </button>
        </div>
      </div>
      <div style={styles.conflictOptions}>
        <label style={styles.conflictRemember}>
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
          />
          <span>Remember this choice for future syncs</span>
        </label>
        {rememberChoice && (
          <div style={styles.expirationSelect}>
            <span style={styles.expirationLabel}>For:</span>
            <select
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              style={styles.expirationDropdown}
              className="expiration-select"
            >
              {EXPIRATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// Informational item component
function InformationalItem({
  update,
  onMarkSeen,
  timeTick: _timeTick, // Used to trigger re-render for time updates
}: {
  update: SyncUpdate;
  onMarkSeen: () => void;
  timeTick: number;
}) {
  const Icon = UPDATE_ICONS[update.entityType] || Bell;

  // Use formatted subtitle for task/grade updates with field changes
  const subtitle =
    (update.entityType === 'task' || update.entityType === 'grade') && update.changedField
      ? formatChangeSubtitle(update)
      : update.subtitle || UPDATE_LABELS[update.entityType];

  return (
    <div style={styles.infoItem}>
      <div style={{ ...styles.infoIcon, ...getIconStyle(update.entityType) }}>
        <Icon size={14} />
      </div>
      <div style={styles.infoContent}>
        <div style={styles.infoTitle}>{update.title}</div>
        <div style={styles.infoSubtitle}>{subtitle}</div>
      </div>
      <div style={styles.infoMeta}>
        <span style={styles.infoTime}>{formatTimeAgo(update.createdAt)}</span>
        <button style={styles.markSeenButton} onClick={onMarkSeen} title="Mark as seen">
          <Check size={12} />
        </button>
      </div>
    </div>
  );
}

// Helper to get icon background color
function getIconStyle(entityType: string): React.CSSProperties {
  switch (entityType) {
    case 'task':
      return {
        backgroundColor: 'var(--color-primary-bg, #dbeafe)',
        color: 'var(--color-primary)',
      };
    case 'grade':
      return {
        backgroundColor: 'var(--color-success-bg, #dcfce7)',
        color: 'var(--color-success)',
      };
    case 'file':
      return {
        backgroundColor: 'var(--color-info-bg, #e0f2fe)',
        color: 'var(--color-info)',
      };
    case 'page':
      return {
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        color: '#a855f7',
      };
    case 'announcement':
      return {
        backgroundColor: 'var(--color-warning-bg, #fef3c7)',
        color: 'var(--color-warning)',
      };
    default:
      return { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };
  }
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  header: {
    padding: 'var(--space-4) var(--space-6)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  title: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    margin: 0,
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
    marginTop: 'var(--space-1)',
  },

  columnsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: 'var(--space-4)',
    padding: 'var(--space-4)',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },

  column: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-secondary)',
    flexShrink: 0,
  },

  columnTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  columnCount: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  markAllButton: {
    marginLeft: 'auto',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  filterRow: {
    display: 'flex',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--border-subtle)',
    flexWrap: 'wrap',
    flexShrink: 0,
  },

  filterTab: {
    padding: '6px 12px',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: '9999px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    outline: 'none',
    fontWeight: 'var(--font-medium)',
    transition: 'all 0.15s ease',
  },

  filterTabActive: {
    backgroundColor: 'var(--color-primary-dark, #1e3a5f)',
    borderColor: 'var(--color-primary-dark, #1e3a5f)',
    color: 'white',
  },

  columnContent: {
    flex: 1,
    overflowY: 'scroll',
    overflowX: 'hidden',
    padding: 'var(--space-2)',
  },

  columnEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-8)',
    color: 'var(--text-tertiary)',
    fontSize: 'var(--text-sm)',
  },

  courseSection: {
    marginBottom: 'var(--space-3)',
  },

  courseSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2)',
    marginBottom: 'var(--space-1)',
  },

  courseColor: {
    width: '3px',
    height: '16px',
    borderRadius: '2px',
  },

  courseLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  resourceCount: {
    marginLeft: 'auto',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    fontWeight: 'var(--font-normal)',
  },

  courseSeparator: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: 'var(--space-2) 0',
  },

  actionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    marginBottom: 'var(--space-1)',
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  actionItemContent: {
    flex: 1,
    minWidth: 0,
  },

  actionItemTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  actionItemTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  actionItemSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  updatedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'var(--color-info, #0ea5e9)',
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },

  actionItemButtons: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexShrink: 0,
  },

  actionButton: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  acceptButton: {
    backgroundColor: 'var(--color-success)',
    color: 'white',
  },

  rejectButton: {
    backgroundColor: 'var(--color-error)',
    color: 'white',
  },

  viewButton: {
    backgroundColor: 'var(--color-primary)',
    color: 'white',
  },

  infoItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    marginBottom: 'var(--space-1)',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-subtle)',
  },

  infoIcon: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
  },

  infoContent: {
    flex: 1,
    minWidth: 0,
  },

  infoTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  infoSubtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  infoMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexShrink: 0,
  },

  infoTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
  },

  markSeenButton: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 'var(--space-8)',
  },

  emptyIcon: {
    width: '80px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-success-bg, #dcfce7)',
    color: 'var(--color-success)',
    marginBottom: 'var(--space-4)',
  },

  emptyTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
    marginBottom: 'var(--space-2)',
  },

  emptySubtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
    marginBottom: 'var(--space-4)',
  },

  // Conflict item styles
  conflictItem: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(251, 191, 36, 0.4)',
    padding: 'var(--space-3)',
    marginBottom: 'var(--space-2)',
  },

  conflictHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-2)',
  },

  conflictTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  conflictField: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-tertiary)',
    backgroundColor: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: 'var(--radius-sm)',
  },

  conflictValues: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
  },

  conflictValueBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
  },

  conflictValueLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'center' as const,
  },

  conflictValueContent: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    fontWeight: 'var(--font-medium)',
    minHeight: '20px',
    textAlign: 'center' as const,
  },

  conflictButton: {
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: 'pointer',
    marginTop: 'var(--space-1)',
    width: '100%',
  },

  keepMineButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },

  useCanvasButton: {
    backgroundColor: '#6366f1',
    color: 'white',
  },

  conflictRemember: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  conflictOptions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-subtle)',
    marginTop: 'var(--space-2)',
  },

  expirationSelect: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  expirationLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  expirationDropdown: {
    padding: '4px 8px',
    fontSize: 'var(--text-xs)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  },
};

// Add CSS for select option styling and filter tab focus in dark mode
const selectStyleId = 'updates-page-styles';
if (typeof document !== 'undefined' && !document.getElementById(selectStyleId)) {
  const style = document.createElement('style');
  style.id = selectStyleId;
  style.textContent = `
    .expiration-select {
      background-color: var(--bg-card);
      color: var(--text-primary);
    }
    .expiration-select option {
      background-color: var(--bg-card, #1f2937);
      color: var(--text-primary, #f3f4f6);
      padding: 8px;
    }
    .expiration-select option:hover,
    .expiration-select option:focus,
    .expiration-select option:checked {
      background-color: var(--bg-secondary, #374151);
    }
    .updates-filter-tab:focus,
    .updates-filter-tab:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

export default UpdatesPage;
