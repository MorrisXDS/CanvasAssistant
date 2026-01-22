/**
 * AnnouncementDetail Page
 * Full-page view for reading announcements with attachments
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Megaphone,
  Bell,
  FileText,
  Download,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { Card } from '../shared';
import type { NotificationAttachment } from '../../../l5-presentation/types';

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file icon based on content type
 */
function getFileIcon(contentType: string | null): string {
  if (!contentType) return 'file';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('image')) return 'image';
  if (contentType.includes('video')) return 'video';
  if (contentType.includes('audio')) return 'audio';
  if (contentType.includes('zip') || contentType.includes('archive')) return 'archive';
  if (contentType.includes('word') || contentType.includes('document')) return 'doc';
  if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'spreadsheet';
  if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'presentation';
  return 'file';
}

export function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notifications, courses } = useStore();
  const [attachments, setAttachments] = useState<NotificationAttachment[]>([]);
  const [loadingAttachment, setLoadingAttachment] = useState<number | null>(null);

  // Find the notification
  const notification = notifications.find((n) => n.id === Number(id));

  // Fetch attachments when component mounts
  useEffect(() => {
    const fetchAttachments = async () => {
      if (!notification) return;

      const api = (window as Window & { api?: { getAttachments: (id: number) => Promise<NotificationAttachment[]> } }).api;
      if (!api) return;

      try {
        const result = await api.getAttachments(notification.id);
        setAttachments(result);
      } catch (error) {
        console.error('Failed to fetch attachments:', error);
      }
    };

    fetchAttachments();
  }, [notification]);

  if (!notification) {
    return (
      <div style={styles.page}>
        <div style={styles.notFound}>
          <h2 style={styles.notFoundTitle}>Announcement Not Found</h2>
          <p style={styles.notFoundText}>
            This announcement may have been removed or doesn't exist.
          </p>
          <Link to="/" style={styles.backLink}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Find related course if any
  const course = notification.courseId
    ? courses.find((c) => c.id === notification.courseId)
    : null;

  // Handle attachment download
  const handleDownload = async (attachment: NotificationAttachment) => {
    const api = (window as Window & { api?: { downloadAttachment: (id: number) => Promise<{ success: boolean; localPath?: string; error?: string }> } }).api;
    if (!api) return;

    setLoadingAttachment(attachment.id);
    try {
      const result = await api.downloadAttachment(attachment.id);
      if (result.success) {
        // Refresh attachments to get updated status
        const updatedAttachments = await (window as Window & { api?: { getAttachments: (id: number) => Promise<NotificationAttachment[]> } }).api?.getAttachments(notification.id);
        if (updatedAttachments) {
          setAttachments(updatedAttachments);
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setLoadingAttachment(null);
    }
  };

  // Handle open attachment
  const handleOpen = async (attachment: NotificationAttachment) => {
    const api = (window as Window & { api?: { openAttachment: (id: number) => Promise<{ success: boolean }> } }).api;
    if (!api) return;

    try {
      await api.openAttachment(attachment.id);
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  // Handle show in folder
  const handleShowInFolder = async (attachment: NotificationAttachment) => {
    const api = (window as Window & { api?: { showAttachmentInFolder: (id: number) => Promise<{ success: boolean }> } }).api;
    if (!api) return;

    try {
      await api.showAttachmentInFolder(attachment.id);
    } catch (error) {
      console.error('Failed to show in folder:', error);
    }
  };

  return (
    <div style={styles.page}>
      {/* Back Navigation */}
      <button onClick={() => navigate(-1)} style={styles.backButton}>
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.sourceIcon}>
          {notification.sourceType === 'canvas' ? (
            <Megaphone size={24} />
          ) : (
            <Bell size={24} />
          )}
        </div>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>{notification.title}</h1>
          <div style={styles.meta}>
            <div style={styles.metaItem}>
              <Calendar size={14} />
              <span>{formatDate(notification.publishedAt)}</span>
            </div>
            {course && (
              <div style={styles.metaItem}>
                <span style={styles.courseTag}>{course.code}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content Card */}
      <Card padding="lg">
        <div style={styles.content}>
          {notification.message}
        </div>
      </Card>

      {/* Attachments */}
      {attachments.length > 0 && (
        <Card padding="md" title="Attachments">
          <div style={styles.attachmentsList}>
            {attachments.map((attachment) => (
              <div key={attachment.id} style={styles.attachmentItem}>
                <div style={styles.attachmentIcon}>
                  <FileText size={20} />
                </div>
                <div style={styles.attachmentInfo}>
                  <div style={styles.attachmentName}>{attachment.displayName}</div>
                  <div style={styles.attachmentMeta}>
                    {formatFileSize(attachment.sizeBytes)}
                    {attachment.contentType && ` • ${attachment.contentType.split('/')[1]?.toUpperCase()}`}
                  </div>
                </div>
                <div style={styles.attachmentActions}>
                  {attachment.downloadStatus === 'completed' ? (
                    <>
                      <button
                        onClick={() => handleOpen(attachment)}
                        style={styles.attachmentButton}
                        title="Open file"
                      >
                        <CheckCircle size={16} color="var(--color-success)" />
                      </button>
                      <button
                        onClick={() => handleShowInFolder(attachment)}
                        style={styles.attachmentButton}
                        title="Show in folder"
                      >
                        <FolderOpen size={16} />
                      </button>
                    </>
                  ) : attachment.downloadStatus === 'failed' ? (
                    <button
                      onClick={() => handleDownload(attachment)}
                      style={styles.attachmentButton}
                      title="Retry download"
                    >
                      <AlertCircle size={16} color="var(--color-error)" />
                    </button>
                  ) : loadingAttachment === attachment.id ? (
                    <Loader2
                      size={16}
                      style={{ animation: 'spin 1s linear infinite' }}
                    />
                  ) : (
                    <button
                      onClick={() => handleDownload(attachment)}
                      style={styles.attachmentButton}
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* External Link */}
      {notification.url && (
        <a
          href={notification.url}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.externalLink}
        >
          <ExternalLink size={16} />
          View on Canvas
        </a>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '800px',
    margin: '0 auto',
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    marginBottom: 'var(--space-4)',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  },

  header: {
    display: 'flex',
    gap: 'var(--space-4)',
    marginBottom: 'var(--space-6)',
  },

  sourceIcon: {
    width: '48px',
    height: '48px',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-navy)',
    color: 'var(--text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  headerContent: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
    lineHeight: 'var(--leading-tight)',
  },

  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  courseTag: {
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--color-navy)',
    color: 'var(--text-inverse)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },

  content: {
    fontSize: 'var(--text-base)',
    lineHeight: 'var(--leading-relaxed)',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
  },

  attachmentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  attachmentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--color-gray-50)',
    borderRadius: 'var(--radius-md)',
  },

  attachmentIcon: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--color-gray-200)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },

  attachmentInfo: {
    flex: 1,
    minWidth: 0,
  },

  attachmentName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  attachmentMeta: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  attachmentActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  attachmentButton: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  externalLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-4)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-gray-100)',
    color: 'var(--color-navy)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    textDecoration: 'none',
    transition: 'all var(--transition-fast)',
  },

  notFound: {
    textAlign: 'center',
    padding: 'var(--space-12)',
  },

  notFoundTitle: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  notFoundText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-4)',
  },

  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--color-blue)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    textDecoration: 'none',
  },
};

export default AnnouncementDetail;
