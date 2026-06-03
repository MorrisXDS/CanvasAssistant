/**
 * AnnouncementDetail Page
 * Full-page view for reading announcements with attachments
 * File references are detected at L2 (sync) and stored in database
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { HtmlContent, extractCanvasFileId } from '../shared';
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
import {
  STORAGE_KEYS,
  LINK_BEHAVIOR,
  type LinkBehavior,
} from '../../../l5-presentation/settings';
import { formatFileSize } from '../../constants';
import { useKeymap } from '../../hooks/useKeymap';
import { styles } from './AnnouncementDetail.styles';
import { createLogger } from '../../utils/rendererLogger';
import type {
  NotificationAttachment,
  AnnouncementFileReference,
} from '../../../l5-presentation/types';

const log = createLogger('AnnouncementDetail');

/**
 * Format date for display (with weekday)
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
 * Get the user's link behavior preference from localStorage
 */
function getLinkBehaviorPreference(): LinkBehavior {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CONTENT);
    if (stored) {
      const settings = JSON.parse(stored);
      return settings.linkBehavior ?? LINK_BEHAVIOR.ALWAYS_EXTERNAL;
    }
  } catch {
    // Ignore parse errors
  }
  return LINK_BEHAVIOR.ALWAYS_EXTERNAL;
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
  /** Secondary action: jump to this file's entry on the Files page. */
  onRevealInFiles: (ref: AnnouncementFileReference) => void;
  loadingAttachment: number | null;
}

function MessageWithFileLinks({
  message,
  fileReferences,
  onFileClick,
  onRevealInFiles,
  loadingAttachment,
}: MessageWithFileLinksProps) {
  if (fileReferences.length === 0) {
    return <>{message}</>;
  }

  // Build segments with file links based on positions from database
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort by start position
  const sortedRefs = [...fileReferences].sort(
    (a, b) => a.startPosition - b.startPosition
  );

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
            ? isDownloaded
              ? inlineStyles.fileLinkDownloaded
              : inlineStyles.fileLinkPending
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
            ? isDownloaded
              ? `Open ${ref.matchedText} (downloaded locally)`
              : `Download ${ref.matchedText}`
            : ref.originalUrl
              ? `Open ${ref.matchedText} on Canvas`
              : ref.matchedText
        }
      >
        {isLoading ? (
          <Loader2
            size={12}
            style={{ animation: 'spin 1s linear infinite', marginRight: 4 }}
          />
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

    // Resolved refs (linked to a real attachment) get a secondary "reveal in
    // Files" affordance — left-click still downloads/opens inline; this jumps
    // to the file's entry on the Files page (symlink-style, per issue #29).
    if (hasAttachment) {
      segments.push(
        <button
          key={`reveal-${i}`}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRevealInFiles(ref);
          }}
          title={`Show ${ref.matchedText} in the Files page`}
          aria-label={`Show ${ref.matchedText} in the Files page`}
          style={inlineStyles.revealInFiles}
        >
          <FolderOpen size={11} />
        </button>
      );
    }

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
  revealInFiles: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
    marginRight: 2,
    padding: 2,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-tertiary, var(--text-secondary))',
    cursor: 'pointer',
    borderRadius: 4,
    verticalAlign: 'baseline',
  },
};

export function AnnouncementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notifications, courses } = useStore();
  const [attachments, setAttachments] = useState<NotificationAttachment[]>([]);
  const [fileReferences, setFileReferences] = useState<AnnouncementFileReference[]>([]);
  const [loadingAttachment, setLoadingAttachment] = useState<number | null>(null);
  const [fetchedNotification, setFetchedNotification] = useState<
    (typeof notifications)[0] | null
  >(null);
  const [loading, setLoading] = useState(true);

  // Try to find notification in store first, otherwise fetch it
  const storeNotification = notifications.find((n) => n.id === Number(id));
  const notification = storeNotification || fetchedNotification;

  // Up/Down + W/S scroll the main content. We handle this explicitly because
  // the list page (AnnouncementsPage) uses the same keys for focused-item
  // navigation; inside a detail view those bindings are gone, but we want to
  // guarantee scrolling works regardless of where native focus lands.
  // V opens the announcement on Canvas (when a url is available).
  //
  // Routed through `useKeymap` (not a raw listener) so it inherits the ADR-0006
  // modal-stack gate (keys suppress while a modal is open over the page) and the
  // built-in form-tag / `e.key` normalisation. Esc is intentionally NOT bound
  // here — the global Layout handler already maps Esc → navigate(-1) for
  // non-sidebar routes; adding a second Esc would double-fire.
  useKeymap<'main'>(
    {
      main: {
        'w,ArrowUp': (e) => {
          e.preventDefault();
          document.querySelector('main')?.scrollBy({ top: -80, behavior: 'smooth' });
        },
        's,ArrowDown': (e) => {
          e.preventDefault();
          document.querySelector('main')?.scrollBy({ top: 80, behavior: 'smooth' });
        },
        v: (e) => {
          const url = notification?.url;
          if (url) {
            e.preventDefault();
            window.api?.openExternal(url);
          }
        },
      },
    },
    { initialScope: 'main' }
  );

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
        log.error(
          'Failed to fetch notification',
          error instanceof Error ? error : undefined
        );
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
        log.error('Failed to fetch data', error instanceof Error ? error : undefined);
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
      log.error('Download failed', error instanceof Error ? error : undefined);
    } finally {
      setLoadingAttachment(null);
    }
  };

  const handleOpen = (attachment: NotificationAttachment) => {
    const api = window.api;
    if (!api) return;
    // Fire-and-forget: don't block UI while file opens in external app
    api.openAttachment(attachment.id).catch((error: unknown) => {
      log.error('Failed to open file', error instanceof Error ? error : undefined);
    });
  };

  const handleShowInFolder = (attachment: NotificationAttachment) => {
    const api = window.api;
    if (!api) return;
    // Fire-and-forget: don't block UI
    api.showAttachmentInFolder(attachment.id).catch((error: unknown) => {
      log.error('Failed to show in folder', error instanceof Error ? error : undefined);
    });
  };

  // Handle link clicks in HTML content (for Canvas file links)
  const handleHtmlLinkClick = async (href: string, isCanvasFile: boolean) => {
    const linkBehavior = getLinkBehaviorPreference();

    if (linkBehavior === LINK_BEHAVIOR.PREFER_LOCAL && isCanvasFile) {
      // Check if this is a Canvas file link and try to open locally
      const fileId = extractCanvasFileId(href);
      if (fileId && window.api) {
        try {
          // Try to find this file in our downloaded resources
          const filesData = await window.api.getFiles();
          // getFiles returns { resources: [], attachments: [], pages: [] }
          const allFiles = [...filesData.resources, ...filesData.attachments];
          const file = allFiles.find(
            (f: { externalId: string }) => f.externalId === fileId
          );
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

  // Secondary action: jump to the file's entry on the Files page (issue #29).
  // The Files page keys every row by `getCanonicalFileId`, which for an
  // announcement attachment is `attachment:<externalId>`; we pass that key plus
  // the course id so the Files page can expand to + highlight the row.
  const handleRevealInFiles = (ref: AnnouncementFileReference) => {
    if (!ref.attachment) return;
    navigate('/files', {
      state: {
        revealFileKey: `attachment:${ref.attachment.externalId}`,
        revealCourseId: notification?.courseId ?? null,
      },
    });
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
                <span style={styles.dateText}>
                  {formatDate(notification.publishedAt)}
                </span>
              </div>
            </div>
          </header>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Message Content - render HTML if available, otherwise plain text with file links */}
          {notification.messageHtml ? (
            <HtmlContent
              html={notification.messageHtml}
              className="announcement-content"
              style={styles.htmlContent}
              onLinkClick={handleHtmlLinkClick}
            />
          ) : (
            <div style={styles.content}>
              <MessageWithFileLinks
                message={notification.message}
                fileReferences={fileReferences}
                onFileClick={handleFileReferenceClick}
                onRevealInFiles={handleRevealInFiles}
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
                        {/* eslint-disable cross-platform/no-hardcoded-path-separator -- MIME type separator, not path */}
                        {attachment.contentType &&
                          ` • ${attachment.contentType.split('/')[1]?.toUpperCase()}`}
                        {/* eslint-enable cross-platform/no-hardcoded-path-separator */}
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

export default AnnouncementDetail;
