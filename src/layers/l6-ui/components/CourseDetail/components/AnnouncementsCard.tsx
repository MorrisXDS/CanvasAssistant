/**
 * AnnouncementsCard Component
 * Displays recent course announcements with links
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, ChevronRight, GripVertical } from 'lucide-react';
import { Card } from '../../shared';
import type { Notification } from '../../../../l5-presentation/types';
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
}: AnnouncementsCardProps) {
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
            {announcements.slice(0, 8).map((ann) => (
              <Link
                key={ann.id}
                to={`/announcement/${ann.id}`}
                style={styles.announcementItem}
              >
                <div style={styles.announcementTitle}>{ann.title}</div>
                <div style={styles.announcementDate}>
                  {formatShortDate(ann.publishedAt)}
                </div>
              </Link>
            ))}
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
