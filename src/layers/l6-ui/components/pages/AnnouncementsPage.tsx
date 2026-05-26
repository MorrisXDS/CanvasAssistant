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
import { styles } from './AnnouncementsPage.styles';
import { useKeymap } from '../../hooks/useKeymap';
import { useFocusedItem } from '../../hooks/useFocusedItem';
import { getCourseColor } from '../../constants';

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

  // Keyboard shortcuts — wired via useKeymap after focusedItem is declared below

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

  // Build courseMap with resolved colors so course badges render consistently
  // across the page regardless of whether the course row has a stored color.
  const courseMap = useMemo(
    () =>
      new Map(courses.map((c) => [c.id, { ...c, color: getCourseColor(c.id, c.color) }])),
    [courses]
  );

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

  // Focused item navigation (Up/Down + W/S)
  const { focusedIndex, focusedItem, getFocusProps } = useFocusedItem(
    filteredAnnouncements,
    { persistKey: 'announcements-page', verticalNav: true }
  );

  // All keyboard shortcuts in one place
  useKeymap<'main'>(
    {
      main: {
        '1': () => setReadFilter('all'),
        '2': () => setReadFilter('unread'),
        '3': () => setReadFilter('dismissed'),
        Enter: (e) => {
          if (focusedItem) {
            e.preventDefault();
            navigate(`/announcement/${focusedItem.notification.id}`);
          }
        },
        d: async () => {
          if (focusedItem && !focusedItem.notification.dismissedAt)
            await dismissNotification(focusedItem.notification.id);
        },
      },
    },
    { initialScope: 'main' }
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
        <button onClick={() => navigate(-1)} style={styles.backButton}>
          <ArrowLeft size={16} />
          <span>Back</span>
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
          data-search-input
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
              {coursesWithAnnouncements.map((course) => {
                const color = getCourseColor(course.id, course.color);
                const isActive = courseFilter === course.id;
                return (
                  <button
                    key={course.id}
                    style={{
                      ...styles.filterChip,
                      // Always color the chip by course so users can tell
                      // them apart; when active, fill with the color; when
                      // inactive, tint the border + text so identity is still
                      // obvious.
                      ...(isActive
                        ? {
                            ...styles.filterChipActive,
                            backgroundColor: color,
                            borderColor: color,
                          }
                        : {
                            borderColor: color,
                            color,
                          }),
                    }}
                    onClick={() => setCourseFilter(course.id)}
                  >
                    {course.code.split(/\s/)[0]}
                  </button>
                );
              })}
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
                {...getFocusProps(index)}
                to={`/announcement/${item.notification.id}`}
                style={{
                  ...styles.announcementItem,
                  borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                  opacity: item.notification.dismissedAt ? 0.7 : 1,
                  ...(focusedIndex === index
                    ? {
                        outline: '2px solid var(--color-navy)',
                        outlineOffset: '-2px',
                        borderRadius: 'var(--radius-md)',
                      }
                    : {}),
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

export default AnnouncementsPage;
