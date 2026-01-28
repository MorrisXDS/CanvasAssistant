/**
 * DuplicateCourseworkBanner - Warning banner for duplicate coursework detection
 *
 * Shows warning banners when:
 * - 2+ tasks have task_type = 'final_exam' in the same course
 * - 2+ tasks have identical titles (case-insensitive)
 *
 * Dismissible per session (not persisted).
 */

import React, { useState, useMemo } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Task } from '../../../../shared/ipc-contract';

interface DuplicateCourseworkBannerProps {
  tasks: Task[];
}

interface DuplicateWarning {
  type: 'final_exam' | 'duplicate_title';
  message: string;
  details: string[];
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    marginBottom: 'var(--space-4)',
  },
  banner: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-warning-bg)',
    border: '1px solid var(--color-warning)',
    borderRadius: 'var(--radius-lg)',
  },
  content: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    flex: 1,
  },
  icon: {
    flexShrink: 0,
    color: 'var(--color-warning)',
    marginTop: '2px',
  },
  textContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },
  title: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
    margin: 0,
  },
  detailsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  detailItem: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-hover)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
  },
  moreItem: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },
  dismissButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-1)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },
};

export function DuplicateCourseworkBanner({ tasks }: DuplicateCourseworkBannerProps) {
  const [dismissedTypes, setDismissedTypes] = useState<Set<string>>(new Set());

  const warnings = useMemo(() => {
    const result: DuplicateWarning[] = [];

    // Check for multiple final exams
    const finalExams = tasks.filter(
      (t) => t.taskType === 'final_exam' || t.taskType === 'final'
    );
    if (finalExams.length >= 2) {
      result.push({
        type: 'final_exam',
        message: 'Multiple final exams detected',
        details: finalExams.map((t) => t.title),
      });
    }

    // Check for duplicate titles (case-insensitive)
    const titleMap = new Map<string, Task[]>();
    for (const task of tasks) {
      const normalizedTitle = task.title.toLowerCase().trim();
      const existing = titleMap.get(normalizedTitle) || [];
      existing.push(task);
      titleMap.set(normalizedTitle, existing);
    }

    for (const [_title, duplicates] of titleMap) {
      if (duplicates.length >= 2) {
        result.push({
          type: 'duplicate_title',
          message: 'Duplicate coursework names found',
          details: duplicates.map((t) => t.title),
        });
      }
    }

    return result;
  }, [tasks]);

  const visibleWarnings = warnings.filter((w) => !dismissedTypes.has(w.type));

  if (visibleWarnings.length === 0) {
    return null;
  }

  const handleDismiss = (type: string) => {
    setDismissedTypes((prev) => new Set([...prev, type]));
  };

  return (
    <div style={styles.container}>
      {visibleWarnings.map((warning, index) => (
        <div key={`${warning.type}-${index}`} style={styles.banner}>
          <div style={styles.content}>
            <AlertTriangle size={18} style={styles.icon} />
            <div style={styles.textContent}>
              <p style={styles.title}>{warning.message}</p>
              <ul style={styles.detailsList}>
                {warning.details.slice(0, 3).map((detail, i) => (
                  <li key={i} style={styles.detailItem}>
                    {detail}
                  </li>
                ))}
                {warning.details.length > 3 && (
                  <li style={styles.moreItem}>+{warning.details.length - 3} more</li>
                )}
              </ul>
            </div>
          </div>
          <button
            onClick={() => handleDismiss(warning.type)}
            style={styles.dismissButton}
            aria-label="Dismiss warning"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
