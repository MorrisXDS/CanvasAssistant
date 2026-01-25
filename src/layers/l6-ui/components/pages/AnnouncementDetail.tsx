/**
 * AnnouncementDetail Page
 * Full-page view for reading announcements with attachments
 * File references are detected at L2 (sync) and stored in database
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
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
import type { NotificationAttachment, AnnouncementFileReference } from '../../../l5-presentation/types';

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
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
 * Get the user's link behavior preference from localStorage
 */
function getLinkBehaviorPreference(): 'always-external' | 'prefer-local' {
  try {
    const stored = localStorage.getItem('contentSettings');
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.linkBehavior ?? 'always-external';
    }
  } catch {
    // Ignore parse errors
  }
  return 'always-external';
}

/**
 * Extract Canvas file ID from a URL if possible
 * Returns null if not a Canvas file URL
 */
function extractCanvasFileId(url: string): string | null {
  // Match patterns like /files/12345 or /files/12345/download
  const match = url.match(/\/files\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract short course code (e.g., "ECE568H1 LEC0101" -> "ECE568")
 */
function getShortCode(code: string): string {
  return code.split(/[HY]\d|\s/)[0];
}

/**
 * Component to render message with clickable file links
 * Uses pre-computed file references from L2 (stored in database)
 */
interface MessageWithFileLinksProps {
  message: string;
  fileReferences: AnnouncementFileReference[];
  onFileClick: (ref: AnnouncementFileReference) => void;
  loadingAttachment: number | null;
}

function MessageWithFileLinks({ message, fileReferences, onFileClick, loadingAttachment }: MessageWithFileLinksProps) {
  if (fileReferences.length === 0) {
    return <>{message}</>;
  }

  // Build segments with file links based on positions from database
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort by start position
  const sortedRefs = [...fileReferences].sort((a, b) => a.startPosition - b.startPosition);

  sortedRefs.forEach((ref, i) => {
    // Add text before this reference
    if (ref.startPosition > lastIndex) {
      segments.push(
        <span key={`text-${i}`}>{message.slice(lastIndex, ref.startPosition)}</span>
      );
    }

    // Add the file link
    const hasAttachment = ref.attachment != null;
    const isDownloaded = ref.attachment?.downloadStatus === 'completed';
    const isLoading = loadingAttachment === ref.attachment?.id;

    segments.push(
      <span
        key={`file-${i}`}
        style={{
          ...inlineStyles.fileLink,
          ...(hasAttachment
            ? (isDownloaded ? inlineStyles.fileLinkDownloaded : inlineStyles.fileLinkPending)
            : inlineStyles.fileLinkExternal),
          cursor: isLoading ? 'wait' : 'pointer',
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFileClick(ref);
        }}
        title={
          hasAttachment
            ? (isDownloaded
                ? `Open ${ref.matchedText} (downloaded locally)`
                : `Download ${ref.matchedText}`)
            : (ref.originalUrl
                ? `Open ${ref.matchedText} on Canvas`
                : ref.matchedText)
        }
      >
        {isLoading ? (
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', marginRight: 4 }} />
        ) : hasAttachment ? (
          isDownloaded ? (
            <CheckCircle size={12} style={{ marginRight: 4 }} />
          ) : (
            <Download size={12} style={{ marginRight: 4 }} />
          )
        ) : ref.originalUrl ? (
          <ExternalLink size={12} style={{ marginRight: 4 }} />
        ) : null}
        {ref.matchedText}
      </span>
    );

    lastIndex = ref.endPosition;
  });

  // Add remaining text
  if (lastIndex < message.length) {
    segments.push(<span key="text-end">{message.slice(lastIndex)}</span>);
  }

  return <>{segments}</>;
}

const inlineStyles: Record<string, React.CSSProperties> = {
  fileLink: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: 'inherit',
    fontWeight: 500,
    textDecoration: 'none',
    transition: 'all 0.15s ease',
    verticalAlign: 'baseline',
  },
  fileLinkDownloaded: {
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: '1px solid var(--color-success)',
  },
  fileLinkPending: {
    backgroundColor: 'var(--color-info-bg)',
    color: 'var(--color-info)',
    border: '1px solid var(--color-info)',
  },
  fileLinkExternal: {
    backgroundColor: 'var(--bg-app)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)',
  },
};

export function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notifications, courses } = useStore();
  const [attachments, setAttachments] = useState<NotificationAttachment[]>([]);
  const [fileReferences, setFileReferences] = useState<AnnouncementFileReference[]>([]);
  const [loadingAttachment, setLoadingAttachment] = useState<number | null>(null);
  const [fetchedNotification, setFetchedNotification] = useState<typeof notifications[0] | null>(null);
  const [loading, setLoading] = useState(true);

  // Try to find notification in store first, otherwise fetch it
  const storeNotification = notifications.find((n) => n.id === Number(id));
  const notification = storeNotification || fetchedNotification;

  // Fetch notification if not in store
  useEffect(() => {
    const fetchNotification = async () => {
      const notificationId = Number(id);
      if (storeNotification) {
        setLoading(false);
        return;
      }

      const api = window.api;
      if (!api?.getNotification) {
        setLoading(false);
        return;
      }

      try {
        const result = await api.getNotification(notificationId);
        if (result) {
          setFetchedNotification(result);
        }
      } catch (error) {
        console.error('Failed to fetch notification:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchNotification();
  }, [id, storeNotification]);

  // Fetch attachments and file references
  useEffect(() => {
    const fetchData = async () => {
      if (!notification) return;
      const api = window.api;
      if (!api) return;

      try {
        // Fetch both attachments and file references
        const [attachmentsResult, refsResult] = await Promise.all([
          api.getAttachments(notification.id),
          api.getFileReferences?.(notification.id) || Promise.resolve([]),
        ]);

        setAttachments(attachmentsResult);
        setFileReferences(refsResult);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };
    fetchData();
  }, [notification]);

  if (loading) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.page}>
          <div style={styles.notFound}>
            <p style={styles.notFoundText}>Loading announcement...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!notification) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.page}>
          <div style={styles.notFound}>
            <h2 style={styles.notFoundTitle}>Announcement Not Found</h2>
            <p style={styles.notFoundText}>
              This announcement may have been removed or doesn't exist.
            </p>
            <Link to="/" style={styles.backLinkNotFound}>
              <ArrowLeft size={16} />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const course = notification.courseId
    ? courses.find((c) => c.id === notification.courseId)
    : null;

  const handleDownload = async (attachment: NotificationAttachment) => {
    const api = window.api;
    if (!api) return;
    setLoadingAttachment(attachment.id);
    try {
      const result = await api.downloadAttachment(attachment.id);
      if (result.success) {
        // Refresh attachments and file references to get updated download status
        const [updatedAttachments, updatedRefs] = await Promise.all([
          api.getAttachments(notification.id),
          api.getFileReferences?.(notification.id) || Promise.resolve([]),
        ]);
        setAttachments(updatedAttachments);
        setFileReferences(updatedRefs);
      }
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setLoadingAttachment(null);
    }
  };

  const handleOpen = (attachment: NotificationAttachment) => {
    const api = window.api;
    if (!api) return;
    // Fire-and-forget: don't block UI while file opens in external app
    api.openAttachment(attachment.id).catch((error) => {
      console.error('Failed to open file:', error);
    });
  };

  const handleShowInFolder = (attachment: NotificationAttachment) => {
    const api = window.api;
    if (!api) return;
    // Fire-and-forget: don't block UI
    api.showAttachmentInFolder(attachment.id).catch((error) => {
      console.error('Failed to show in folder:', error);
    });
  };

  // Handle clicking on inline file links (from file references)
  const handleFileReferenceClick = (ref: AnnouncementFileReference) => {
    if (ref.attachment) {
      // Has linked attachment
      if (ref.attachment.downloadStatus === 'completed') {
        // Open the downloaded file
        handleOpen(ref.attachment);
      } else {
        // Download the file (this one needs await for UI feedback)
        handleDownload(ref.attachment);
      }
    } else if (ref.originalUrl) {
      // No local attachment, open original URL in browser
      window.api?.openExternal(ref.originalUrl);
    }
  };

  return (
    <div style={styles.pageWrapper}>
      <div style={styles.page}>
        {/* Back Navigation */}
        <button onClick={() => navigate(-1)} style={styles.backButton}>
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        {/* Main Content Card */}
        <div style={styles.mainCard}>
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
                {course && (
                  <>
                    <span style={styles.courseCode}>{getShortCode(course.code)}</span>
                    <span style={styles.metaDot}>•</span>
                  </>
                )}
                <span style={styles.dateText}>{formatDate(notification.publishedAt)}</span>
              </div>
            </div>
          </header>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Message Content - render HTML if available, otherwise plain text with file links */}
          {notification.messageHtml ? (
            <div
              className="announcement-content"
              style={styles.htmlContent}
              dangerouslySetInnerHTML={{ __html: notification.messageHtml }}
              onClick={async (e) => {
                // Intercept link clicks and handle based on user preference
                const target = e.target as HTMLElement;
                if (target.tagName === 'A') {
                  e.preventDefault();
                  const href = (target as HTMLAnchorElement).href;
                  if (!href) return;

                  const linkBehavior = getLinkBehaviorPreference();

                  if (linkBehavior === 'prefer-local') {
                    // Check if this is a Canvas file link and try to open locally
                    const fileId = extractCanvasFileId(href);
                    if (fileId && window.api) {
                      try {
                        // Try to find this file in our downloaded resources
                        const files = await window.api.getFiles();
                        const file = files.find((f: { externalId: string }) => f.externalId === fileId);
                        if (file?.localPath) {
                          // File is downloaded, open it locally
                          await window.api.openResource(file.id);
                          return;
                        }
                      } catch {
                        // Fall through to open externally
                      }
                    }
                  }

                  // Default: open in browser
                  window.api?.openExternal(href);
                }
              }}
            />
          ) : (
            <div style={styles.content}>
              <MessageWithFileLinks
                message={notification.message}
                fileReferences={fileReferences}
                onFileClick={handleFileReferenceClick}
                loadingAttachment={loadingAttachment}
              />
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={styles.attachmentsSection}>
              <h3 style={styles.attachmentsTitle}>Attachments</h3>
              <div style={styles.attachmentsList}>
                {attachments.map((attachment) => (
                  <div key={attachment.id} style={styles.attachmentItem}>
                    <div style={styles.attachmentIcon}>
                      <FileText size={18} />
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
            </div>
          )}

          {/* Footer with CTA */}
          {notification.url && (
            <div style={styles.footer}>
              <button
                onClick={() => window.api?.openExternal(notification.url!)}
                style={styles.primaryButton}
              >
                <ExternalLink size={16} />
                View on Canvas
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    flex: 1,
  },

  page: {
    width: '100%',
    maxWidth: 'min(800px, calc(100vw - var(--sidebar-width) - var(--space-8)))',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
    paddingBottom: 'var(--space-8)',
    flex: 1,
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    background: 'none',
    border: '1px solid var(--border-default)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'all var(--transition-fast)',
  },

  mainCard: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-4)',
    padding: 'var(--space-6)',
  },

  sourceIcon: {
    width: '44px',
    height: '44px',
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
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
    lineHeight: 'var(--leading-snug)',
  },

  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flexWrap: 'wrap',
  },

  courseCode: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
  },

  metaDot: {
    color: 'var(--text-muted)',
  },

  dateText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: '0 var(--space-6)',
  },

  content: {
    padding: 'var(--space-6)',
    fontSize: 'var(--text-base)',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-line', // Preserves newlines but collapses spaces
  },

  htmlContent: {
    padding: 'var(--space-6)',
    fontSize: 'var(--text-base)',
    lineHeight: '1.6',
    color: 'var(--text-primary)',
  },

  attachmentsSection: {
    padding: 'var(--space-5) var(--space-6)',
    borderTop: '1px solid var(--border-light)',
  },

  attachmentsTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 'var(--space-3)',
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
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-light)',
  },

  attachmentIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
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
    gap: 'var(--space-1)',
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

  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: 'var(--space-4) var(--space-6)',
    borderTop: '1px solid var(--border-light)',
  },

  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  notFound: {
    textAlign: 'center',
    padding: 'var(--space-12)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
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

  backLinkNotFound: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--color-navy)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    textDecoration: 'none',
  },
};

export default AnnouncementDetail;
