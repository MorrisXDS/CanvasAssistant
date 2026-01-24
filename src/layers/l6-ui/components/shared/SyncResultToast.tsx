/**
 * Sync Result Toast
 * Shows a popup notification with sync results summary
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle, X, RefreshCw, AlertCircle, BookOpen, ClipboardList, Bell, FolderOpen } from 'lucide-react';

export interface SyncResultData {
  courses?: { synced: number; new: number };
  tasks?: { synced: number; new: number };
  announcements?: { synced: number; new: number };
  files?: { synced: number; new: number };
  errors?: string[];
  timestamp: string;
}

interface SyncResultToastProps {
  result: SyncResultData | null;
  onClose: () => void;
  autoHideDuration?: number;
}

export function SyncResultToast({ result, onClose, autoHideDuration = 5000 }: SyncResultToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (result) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade animation
      }, autoHideDuration);
      return () => clearTimeout(timer);
    }
  }, [result, autoHideDuration, onClose]);

  if (!result) return null;

  const hasErrors = result.errors && result.errors.length > 0;
  const hasNewItems = (result.courses?.new || 0) + (result.tasks?.new || 0) +
                      (result.announcements?.new || 0) + (result.files?.new || 0) > 0;

  const formatCount = (data: { synced: number; new: number } | undefined, label: string) => {
    if (!data || data.synced === 0) return null;
    if (data.new > 0) {
      return `${data.synced} ${label} (${data.new} new)`;
    }
    return `${data.synced} ${label}`;
  };

  const items: Array<{ icon: React.ReactNode; text: string }> = [];

  if (result.courses && result.courses.synced > 0) {
    items.push({
      icon: <BookOpen size={14} />,
      text: formatCount(result.courses, 'courses') || '',
    });
  }

  if (result.tasks && result.tasks.synced > 0) {
    items.push({
      icon: <ClipboardList size={14} />,
      text: formatCount(result.tasks, 'tasks') || '',
    });
  }

  if (result.announcements && result.announcements.synced > 0) {
    items.push({
      icon: <Bell size={14} />,
      text: formatCount(result.announcements, 'announcements') || '',
    });
  }

  if (result.files && result.files.synced > 0) {
    items.push({
      icon: <FolderOpen size={14} />,
      text: formatCount(result.files, 'files') || '',
    });
  }

  return (
    <div
      style={{
        ...styles.toast,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
      }}
    >
      <div style={styles.header}>
        {hasErrors ? (
          <AlertCircle size={18} color="var(--color-warning)" />
        ) : (
          <CheckCircle size={18} color="var(--color-success)" />
        )}
        <span style={styles.title}>
          {hasErrors ? 'Sync Completed with Warnings' : 'Sync Successful'}
        </span>
        <button style={styles.closeButton} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {items.length > 0 ? (
        <div style={styles.content}>
          {items.map((item, index) => (
            <div key={index} style={styles.item}>
              {item.icon}
              <span style={styles.itemText}>{item.text}</span>
              {hasNewItems && item.text.includes('new') && (
                <span style={styles.newBadge}>NEW</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.content}>
          <div style={styles.item}>
            <RefreshCw size={14} />
            <span style={styles.itemText}>Everything is up to date</span>
          </div>
        </div>
      )}

      {hasErrors && (
        <div style={styles.errors}>
          {result.errors!.slice(0, 3).map((error, index) => (
            <div key={index} style={styles.errorItem}>
              {error}
            </div>
          ))}
          {result.errors!.length > 3 && (
            <div style={styles.moreErrors}>
              +{result.errors!.length - 3} more warnings
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: 'fixed',
    top: '60px',
    right: '20px',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border-default)',
    minWidth: '280px',
    maxWidth: '380px',
    zIndex: 1000,
    transition: 'all 0.3s ease',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)',
    borderBottom: '1px solid var(--border-light)',
  },

  title: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },

  content: {
    padding: 'var(--space-3) var(--space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    color: 'var(--text-secondary)',
  },

  itemText: {
    flex: 1,
    fontSize: 'var(--text-sm)',
  },

  newBadge: {
    fontSize: '9px',
    fontWeight: 'var(--font-bold)',
    color: 'white',
    backgroundColor: 'var(--color-success)',
    padding: '1px 4px',
    borderRadius: '2px',
  },

  errors: {
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  errorItem: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-warning)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 'var(--radius-sm)',
  },

  moreErrors: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
};

export default SyncResultToast;
