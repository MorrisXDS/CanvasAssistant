/**
 * NotificationsFeed Component
 * Recent notifications/announcements widget
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Bell, Inbox, X } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Card } from '../shared';
import { useStore } from '../../../l5-presentation/store';
import {
  formatTimeAgo,
  truncateText,
  getCourseColor,
  CARD_TITLES,
  MENU_LABELS,
} from '../../constants';
import { useFocusedItem } from '../../hooks/useFocusedItem';
import type { Notification } from '../../../l5-presentation/types';

function getShortCode(code: string): string {
  // Split on course level suffix (H1, H5, Y1, etc.) or whitespace
  return code.split(/[HY]\d|\s/)[0];
}

export interface NotificationsFeedProps {
  notifications: Notification[];
  onDismiss?: (id: number) => void;
  onNotificationClick?: (notification: Notification) => void;
  maxItems?: number;
  /** Whether keyboard focus navigation is active for this list */
  isKeyboardActive?: boolean;
}

export function NotificationsFeed({
  notifications,
  onDismiss,
  onNotificationClick,
  maxItems = 5,
  isKeyboardActive = false,
}: NotificationsFeedProps) {
  const navigate = useNavigate();
  const { courses } = useStore();

  // Build course map for quick lookup
  const courseMap = React.useMemo(() => {
    return new Map(courses.map((c) => [c.id, c]));
  }, [courses]);

  // Filter to show only non-dismissed notifications
  const activeNotifications = notifications
    .filter((n) => !n.dismissedAt)
    .slice(0, maxItems);

  // Navigate to detail page
  const handleNotificationClick = (notification: Notification) => {
    if (onNotificationClick) {
      onNotificationClick(notification);
    } else {
      navigate(`/announcement/${notification.id}`);
    }
  };

  // Focused item navigation (Up/Down + W/S)
  const { focusedIndex, focusedItem, getFocusProps } = useFocusedItem(
    activeNotifications,
    {
      persistKey: 'dashboard-notifications',
      enabled: isKeyboardActive,
      verticalNav: true,
    }
  );

  // Enter: open focused notification
  useHotkeys(
    'enter',
    (e) => {
      if (focusedItem) {
        e.preventDefault();
        handleNotificationClick(focusedItem);
      }
    },
    { enabled: isKeyboardActive }
  );

  // D: dismiss focused notification
  useHotkeys(
    'd',
    () => {
      if (focusedItem && onDismiss) {
        onDismiss(focusedItem.id);
      }
    },
    { enabled: isKeyboardActive }
  );

  // V: navigate to the full Announcements page (View all)
  useHotkeys('v', () => navigate('/announcements'), { enabled: isKeyboardActive });

  return (
    <Card
      title={CARD_TITLES.dashboard.announcements}
      headerAction={
        notifications.length > maxItems && (
          <button style={styles.viewAll} onClick={() => navigate('/announcements')}>
            {MENU_LABELS.common.viewAll}
          </button>
        )
      }
      padding="md"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {activeNotifications.length === 0 ? (
        <div style={styles.emptyState}>
          <Inbox
            size={28}
            color="var(--text-muted)"
            style={{ marginBottom: 'var(--space-2)' }}
          />
          <span style={styles.emptyText}>No new announcements</span>
        </div>
      ) : (
        <div style={styles.list}>
          {activeNotifications.map((notification, index) => (
            <div
              key={notification.id}
              {...getFocusProps(index)}
              style={{
                ...styles.item,
                borderTop: index === 0 ? 'none' : '1px solid var(--border-light)',
                ...(focusedIndex === index && isKeyboardActive
                  ? {
                      outline: '2px solid var(--color-navy)',
                      outlineOffset: '-2px',
                      borderRadius: 'var(--radius-md)',
                    }
                  : {}),
              }}
            >
              <div
                style={styles.itemContent}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNotificationClick(notification);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div style={styles.itemHeader}>
                  <div style={styles.itemSourceRow}>
                    {notification.courseId != null &&
                      courseMap.has(notification.courseId) && (
                        <button
                          style={{
                            ...styles.courseCode,
                            backgroundColor: getCourseColor(
                              notification.courseId,
                              courseMap.get(notification.courseId)!.color
                            ),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/announcements?course=${notification.courseId}`);
                          }}
                          title={`View all ${courseMap.get(notification.courseId)!.code} announcements`}
                        >
                          {getShortCode(courseMap.get(notification.courseId)!.code)}
                        </button>
                      )}
                    <span style={styles.itemSource}>
                      {notification.sourceType === 'canvas' ? (
                        <Megaphone size={12} />
                      ) : (
                        <Bell size={12} />
                      )}
                    </span>
                  </div>
                  <span style={styles.itemTime}>
                    {formatTimeAgo(notification.publishedAt)}
                  </span>
                </div>
                <div style={styles.itemTitle}>{notification.title}</div>
                <div style={styles.itemMessage}>
                  {truncateText(notification.message, 80)}
                </div>
              </div>
              {onDismiss && (
                <button
                  style={styles.dismissButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notification.id);
                  }}
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    margin: '0 calc(-1 * var(--space-5))',
    marginBottom: 'calc(-1 * var(--space-5))',
  },

  item: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: 'var(--space-3) var(--space-5)',
    position: 'relative',
  },

  itemContent: {
    flex: 1,
    cursor: 'pointer',
    minWidth: 0,
  },

  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-1)',
  },

  itemSourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  itemSource: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
  },

  courseCode: {
    fontSize: '10px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
    flexShrink: 0,
  },

  itemTime: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  itemTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  itemMessage: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },

  dismissButton: {
    width: '24px',
    height: '24px',
    border: 'none',
    background: 'none',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-lg)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    transition: 'all var(--transition-fast)',
    marginLeft: 'var(--space-2)',
    flexShrink: 0,
  },

  viewAll: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-blue)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    fontFamily: 'inherit',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-6)',
    textAlign: 'center',
    flex: 1,
    minHeight: '150px',
  },

  emptyIcon: {
    fontSize: '2rem',
    marginBottom: 'var(--space-2)',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },
};

export default NotificationsFeed;
