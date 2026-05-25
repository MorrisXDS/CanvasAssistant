/**
 * AnnouncementsCard Component
 * Displays recent course announcements with links
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Megaphone, ChevronRight, GripVertical } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Card } from '../../shared';
import type { Notification } from '../../../../l5-presentation/types';
import { useStore } from '../../../../l5-presentation/store';
import { useFocusedItem } from '../../../hooks/useFocusedItem';
import { courseDetailStyles as styles } from '../../pages/CourseDetail.styles';

export interface AnnouncementsCardProps {
  announcements: Notification[];
  courseId: number;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  /** Keyboard active — when true, W/S/↑/↓ walks entries and Enter/D/V fire. */
  keyboardEnabled?: boolean;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AnnouncementsCard({
  announcements,
  courseId,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  keyboardEnabled = false,
}: AnnouncementsCardProps) {
  const navigate = useNavigate();
  const dismissNotification = useStore((s) => s.dismissNotification);
  const visible = announcements.slice(0, 8);
  const { focusedIndex, focusedItem, getFocusProps } = useFocusedItem(visible, {
    persistKey: `course-${courseId}-announcements`,
    enabled: keyboardEnabled,
    verticalNav: true,
  });

  useHotkeys(
    'enter',
    (e) => {
      if (!focusedItem) return;
      e.preventDefault();
      navigate(`/announcement/${focusedItem.id}`);
    },
    { enabled: keyboardEnabled },
    [focusedItem, navigate, keyboardEnabled]
  );
  useHotkeys(
    'd',
    (e) => {
      if (!focusedItem) return;
      e.preventDefault();
      dismissNotification(focusedItem.id);
    },
    { enabled: keyboardEnabled },
    [focusedItem, dismissNotification, keyboardEnabled]
  );
  useHotkeys(
    'v',
    (e) => {
      e.preventDefault();
      navigate(`/announcements?course=${courseId}`);
    },
    { enabled: keyboardEnabled },
    [navigate, courseId, keyboardEnabled]
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        ...styles.sidebarCardWrapper,
        opacity: isDragging ? 0.5 : 1,
        borderTop: isDragOver ? '2px solid var(--color-blue)' : '2px solid transparent',
        transition: 'opacity 0.2s, border-color 0.2s',
      }}
    >
      <Card padding="none" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={styles.cardHeader}>
          <div style={styles.cardHeaderLeft}>
            <GripVertical size={14} style={styles.sectionDragHandle} />
            <h3 style={styles.cardTitle}>Recent Announcements</h3>
          </div>
        </div>
        {announcements.length === 0 ? (
          <div style={styles.emptySideSection}>
            <Megaphone size={20} color="var(--text-muted)" />
            <span style={styles.emptySideText}>No announcements</span>
          </div>
        ) : (
          <div style={styles.announcementList}>
            {visible.map((ann, i) => {
              const isFocused = focusedIndex === i;
              const { 'data-focus-index': fIdx, 'data-focus-scope': fScope } =
                getFocusProps(i);
              return (
                <Link
                  key={ann.id}
                  to={`/announcement/${ann.id}`}
                  data-focus-index={fIdx}
                  data-focus-scope={fScope}
                  style={{
                    ...styles.announcementItem,
                    ...(isFocused
                      ? {
                          outline: '2px solid var(--color-navy)',
                          outlineOffset: '-2px',
                          borderRadius: '4px',
                        }
                      : {}),
                  }}
                >
                  <div style={styles.announcementTitle}>{ann.title}</div>
                  <div style={styles.announcementDate}>
                    {formatShortDate(ann.publishedAt)}
                  </div>
                </Link>
              );
            })}
            {announcements.length > 8 && (
              <Link to={`/announcements?course=${courseId}`} style={styles.viewAllLink}>
                View all {announcements.length} announcements
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default AnnouncementsCard;
