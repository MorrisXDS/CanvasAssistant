/**
 * AnnouncementsPage - Full page view for all announcements
 * Accessible from dashboard "View all" link
 * Supports filtering by course, intent, and read status
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  Megaphone,
  Bell,
  BellOff,
  Clock,
  Paperclip,
  ChevronRight,
  AlertTriangle,
  Info,
  Calendar,
  GraduationCap,
  X,
  Search,
} from 'lucide-react';
import { Card } from '../shared';
import { useStore } from '../../../l5-presentation/store';

type ReadFilter = 'all' | 'unread' | 'dismissed';
type IntentType = 'all' | 'urgent' | 'deadline' | 'grade' | 'informational';

// Classify announcement intent based on keywords
function classifyIntent(title: string, message: string): IntentType {
  const text = `${title} ${message}`.toLowerCase();

  // Urgent: important, urgent, required, mandatory, action needed
  if (
    /urgent|important|required|mandatory|action\s+needed|immediate|critical/i.test(text)
  ) {
    return 'urgent';
  }

  // Deadline: due, deadline, submit, submission, by end of
  if (
    /due\s+(date|by|on)|deadline|submit|submission|by\s+end\s+of|must\s+be\s+completed/i.test(
      text
    )
  ) {
    return 'deadline';
  }

  // Grade: grade, score, mark, feedback, graded
  if (
    /\bgrade[ds]?\b|\bscore[ds]?\b|\bmark[s]?\b|feedback|results?\s+(posted|available)/i.test(
      text
    )
  ) {
    return 'grade';
  }

  // Default: informational
  return 'informational';
}

const INTENT_CONFIG: Record<
  IntentType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  all: { label: 'All Types', icon: <Megaphone size={14} />, color: 'var(--color-navy)' },
  urgent: {
    label: 'Urgent',
    icon: <AlertTriangle size={14} />,
    color: 'var(--color-high)',
  },
  deadline: {
    label: 'Deadline',
    icon: <Calendar size={14} />,
    color: 'var(--color-medium)',
  },
  grade: {
    label: 'Grade',
    icon: <GraduationCap size={14} />,
    color: 'var(--color-success)',
  },
  informational: { label: 'Info', icon: <Info size={14} />, color: 'var(--color-blue)' },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

function stripHtml(html: string | null): string {
  if (!html) return '';
  // Sanitize HTML first to prevent XSS, then extract text content
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
  return sanitized;
}

export function AnnouncementsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { notifications, courses, dismissNotification } = useStore();

  // Filter state - read initial course from URL
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [intentFilter, setIntentFilter] = useState<IntentType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState<number | null>(() => {
    const courseParam = searchParams.get('course');
    return courseParam ? parseInt(courseParam, 10) : null;
  });

  // Sync course filter to URL
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    if (courseFilter !== null) {
      newParams.set('course', String(courseFilter));
    } else {
      newParams.delete('course');
    }
    setSearchParams(newParams, { replace: true });
  }, [courseFilter, searchParams, setSearchParams]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  // Get visible courses (non-hidden) that have announcements
  const coursesWithAnnouncements = useMemo(() => {
    const courseIds = new Set(notifications.map((n) => n.courseId).filter(Boolean));
    return courses.filter((c) => !c.isHidden && courseIds.has(c.id));
  }, [notifications, courses]);

  // Get set of visible course IDs (non-hidden courses that appear in dashboard)
  const visibleCourseIds = useMemo(() => {
    return new Set(courses.filter((c) => !c.isHidden).map((c) => c.id));
  }, [courses]);

  // Process announcements - only from visible (dashboard) courses
  const allAnnouncements = useMemo(() => {
    return notifications
      .filter((n) => !n.courseId || visibleCourseIds.has(n.courseId)) // Include if no course or course is visible
      .map((notification) => ({
        notification,
        course: notification.courseId
          ? courseMap.get(notification.courseId) || null
          : null,
        intent: classifyIntent(notification.title, notification.message),
      }))
      .sort(
        (a, b) =>
          new Date(b.notification.publishedAt).getTime() -
          new Date(a.notification.publishedAt).getTime()
      );
  }, [notifications, courseMap, visibleCourseIds]);

  // Apply all filters (intersection mode)
  const filteredAnnouncements = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return allAnnouncements.filter((a) => {
      // Read status filter
      if (readFilter === 'unread' && a.notification.dismissedAt) return false;
      if (readFilter === 'dismissed' && !a.notification.dismissedAt) return false;

      // Intent filter
      if (intentFilter !== 'all' && a.intent !== intentFilter) return false;

      // Course filter
      if (courseFilter !== null && a.notification.courseId !== courseFilter) return false;

      // Search filter - search in title, message, and course name
      if (query) {
        const title = a.notification.title.toLowerCase();
        const message = a.notification.message.toLowerCase();
        const courseName = a.course?.name?.toLowerCase() || '';
        const courseCode = a.course?.code?.toLowerCase() || '';
        if (
          !title.includes(query) &&
          !message.includes(query) &&
          !courseName.includes(query) &&
          !courseCode.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allAnnouncements, readFilter, intentFilter, courseFilter, searchQuery]);

  // Stats for filter badges
  const stats = useMemo(
    () => ({
      all: allAnnouncements.length,
      unread: allAnnouncements.filter((a) => !a.notification.dismissedAt).length,
      dismissed: allAnnouncements.filter((a) => a.notification.dismissedAt).length,
    }),
    [allAnnouncements]
  );

  // Intent counts (for current read + course filters)
  const intentCounts = useMemo(() => {
    const filtered = allAnnouncements.filter((a) => {
      if (readFilter === 'unread' && a.notification.dismissedAt) return false;
      if (readFilter === 'dismissed' && !a.notification.dismissedAt) return false;
      if (courseFilter !== null && a.notification.courseId !== courseFilter) return false;
      return true;
    });
    return {
      all: filtered.length,
      urgent: filtered.filter((a) => a.intent === 'urgent').length,
      deadline: filtered.filter((a) => a.intent === 'deadline').length,
      grade: filtered.filter((a) => a.intent === 'grade').length,
      informational: filtered.filter((a) => a.intent === 'informational').length,
    };
  }, [allAnnouncements, readFilter, courseFilter]);

  const handleDismiss = async (e: React.MouseEvent, notificationId: number) => {
    e.stopPropagation();
    e.preventDefault();
    await dismissNotification(notificationId);
  };

  const clearFilters = () => {
    setReadFilter('all');
    setIntentFilter('all');
    setCourseFilter(null);
    setSearchQuery('');
  };

  const hasActiveFilters =
    readFilter !== 'all' ||
    intentFilter !== 'all' ||
    courseFilter !== null ||
    searchQuery.trim() !== '';

  const readOptions: {
    value: ReadFilter;
    label: string;
    count: number;
    icon: React.ReactNode;
  }[] = [
    { value: 'all', label: 'All', count: stats.all, icon: <Megaphone size={14} /> },
    { value: 'unread', label: 'Unread', count: stats.unread, icon: <Bell size={14} /> },
    {
      value: 'dismissed',
      label: 'Read',
      count: stats.dismissed,
      icon: <BellOff size={14} />,
    },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate('/')} style={styles.backButton}>
          <ArrowLeft size={16} />
          <span>Dashboard</span>
        </button>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>All Announcements</h1>
          <p style={styles.subtitle}>
            {filteredAnnouncements.length} of {allAnnouncements.length} announcements
            {hasActiveFilters && ' (filtered)'}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div style={styles.searchContainer}>
        <Search size={18} style={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search announcements..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        {searchQuery && (
          <button style={styles.searchClear} onClick={() => setSearchQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filters Panel */}
      <div style={styles.filtersPanel}>
        {/* Read Status Filter */}
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Status</span>
          <div style={styles.filterChips}>
            {readOptions.map((option) => (
              <button
                key={option.value}
                style={{
                  ...styles.filterChip,
                  ...(readFilter === option.value ? styles.filterChipActive : {}),
                }}
                onClick={() => setReadFilter(option.value)}
              >
                {option.icon}
                {option.label}
                <span style={styles.filterCount}>({option.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Intent Filter */}
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Type</span>
          <div style={styles.filterChips}>
            {(Object.keys(INTENT_CONFIG) as IntentType[]).map((intent) => (
              <button
                key={intent}
                style={{
                  ...styles.filterChip,
                  ...(intentFilter === intent
                    ? {
                        ...styles.filterChipActive,
                        backgroundColor: INTENT_CONFIG[intent].color,
                        borderColor: INTENT_CONFIG[intent].color,
                      }
                    : {}),
                }}
                onClick={() => setIntentFilter(intent)}
              >
                {INTENT_CONFIG[intent].icon}
                {INTENT_CONFIG[intent].label}
                {intentCounts[intent] > 0 && (
                  <span style={styles.filterCount}>({intentCounts[intent]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Course Filter */}
        {coursesWithAnnouncements.length > 0 && (
          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Course</span>
            <div style={styles.filterChips}>
              <button
                style={{
                  ...styles.filterChip,
                  ...(courseFilter === null ? styles.filterChipActive : {}),
                }}
                onClick={() => setCourseFilter(null)}
              >
                All Courses
              </button>
              {coursesWithAnnouncements.map((course) => (
                <button
                  key={course.id}
                  style={{
                    ...styles.filterChip,
                    ...(courseFilter === course.id
                      ? {
                          ...styles.filterChipActive,
                          backgroundColor: course.color || 'var(--color-navy)',
                          borderColor: course.color || 'var(--color-navy)',
                        }
                      : {}),
                  }}
                  onClick={() => setCourseFilter(course.id)}
                >
                  {course.code.split(/\s/)[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button style={styles.clearFiltersBtn} onClick={clearFilters}>
            <X size={14} />
            Clear Filters
          </button>
        )}
      </div>

      {/* Announcements List */}
      <Card padding="none">
        {filteredAnnouncements.length === 0 ? (
          <div style={styles.emptyState}>
            <Megaphone size={32} color="var(--text-muted)" />
            <span style={styles.emptyText}>
              No announcements match your filters
              {hasActiveFilters && (
                <button style={styles.clearInlineBtn} onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </span>
          </div>
        ) : (
          <div style={styles.announcementList}>
            {filteredAnnouncements.map((item, index) => (
              <Link
                key={item.notification.id}
                to={`/announcement/${item.notification.id}`}
                style={{
                  ...styles.announcementItem,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  opacity: item.notification.dismissedAt ? 0.7 : 1,
                }}
              >
                {/* Course color indicator */}
                <div
                  style={{
                    ...styles.colorBar,
                    backgroundColor: item.course?.color || 'var(--color-navy)',
                  }}
                />

                {/* Content */}
                <div style={styles.announcementContent}>
                  <div style={styles.announcementTopRow}>
                    {item.course && (
                      <button
                        style={{
                          ...styles.courseCode,
                          backgroundColor: item.course.color || 'var(--color-navy)',
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCourseFilter(item.course!.id);
                        }}
                        title={`Filter by ${item.course.code}`}
                      >
                        {item.course.code.split(/\s/)[0]}
                      </button>
                    )}
                    {/* Intent badge */}
                    {item.intent !== 'informational' && (
                      <span
                        style={{
                          ...styles.intentBadge,
                          backgroundColor: INTENT_CONFIG[item.intent].color,
                        }}
                      >
                        {INTENT_CONFIG[item.intent].icon}
                        {INTENT_CONFIG[item.intent].label}
                      </span>
                    )}
                    <span style={styles.date}>
                      <Clock size={12} />
                      {formatDate(item.notification.publishedAt)}
                    </span>
                    {item.notification.attachments &&
                      item.notification.attachments.length > 0 && (
                        <span style={styles.attachmentBadge}>
                          <Paperclip size={12} />
                          {item.notification.attachments.length}
                        </span>
                      )}
                  </div>
                  <div style={styles.announcementTitle}>{item.notification.title}</div>
                  <div style={styles.announcementPreview}>
                    {stripHtml(item.notification.message).slice(0, 150)}
                    {stripHtml(item.notification.message).length > 150 ? '...' : ''}
                  </div>
                </div>

                {/* Actions */}
                <div style={styles.actions}>
                  {!item.notification.dismissedAt && (
                    <button
                      style={styles.dismissButton}
                      onClick={(e) => handleDismiss(e, item.notification.id)}
                      title="Mark as read"
                    >
                      <BellOff size={16} />
                    </button>
                  )}
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 'min(1000px, 100%)',
    margin: '0 auto',
    padding: '0',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },

  header: {
    marginBottom: 'var(--space-4)',
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },

  headerContent: {},

  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
  },

  subtitle: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  searchContainer: {
    position: 'relative',
    marginBottom: 'var(--space-4)',
  },

  searchIcon: {
    position: 'absolute',
    left: 'var(--space-3)',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-muted)',
    pointerEvents: 'none',
  },

  searchInput: {
    width: '100%',
    padding: 'var(--space-3) var(--space-10)',
    fontSize: 'var(--text-base)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--text-primary)',
    outline: 'none',
  },

  searchClear: {
    position: 'absolute',
    right: 'var(--space-3)',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 'var(--space-1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  filtersPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    marginBottom: 'var(--space-4)',
    boxShadow: 'var(--shadow-card)',
  },

  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flexWrap: 'wrap',
  },

  filterLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    minWidth: '50px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  filterChips: {
    display: 'flex',
    gap: 'var(--space-1)',
    flexWrap: 'wrap',
  },

  filterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
  },

  filterChipActive: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
    color: 'white',
  },

  filterCount: {
    opacity: 0.7,
    fontSize: 'var(--text-xs)',
  },

  clearFiltersBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-error)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-full)',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },

  announcementList: {
    display: 'flex',
    flexDirection: 'column',
  },

  announcementItem: {
    display: 'flex',
    alignItems: 'stretch',
    padding: 'var(--space-4) var(--space-5)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    textDecoration: 'none',
    color: 'inherit',
  },

  colorBar: {
    width: '4px',
    borderRadius: '2px',
    marginRight: 'var(--space-3)',
    flexShrink: 0,
  },

  announcementContent: {
    flex: 1,
    minWidth: 0,
  },

  announcementTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  courseCode: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
  },

  intentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    color: 'white',
    padding: '2px 6px',
    borderRadius: '4px',
  },

  date: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  attachmentBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    padding: '2px 6px',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-sm)',
  },

  announcementTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  announcementPreview: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },

  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginLeft: 'var(--space-3)',
    flexShrink: 0,
  },

  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    background: 'none',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'all var(--transition-fast)',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-12)',
    gap: 'var(--space-3)',
  },

  emptyText: {
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  clearInlineBtn: {
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-navy)',
    backgroundColor: 'transparent',
    border: '1px solid var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
};

export default AnnouncementsPage;
