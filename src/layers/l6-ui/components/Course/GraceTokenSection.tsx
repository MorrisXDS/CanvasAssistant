/**
 * GraceTokenSection - Course settings section for grace token management
 *
 * Displays:
 * - Token availability (remaining/total)
 * - Usage history
 * - Form to use tokens on a task
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Clock,
  History,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Coins,
} from 'lucide-react';
import { Button } from '../primitives/Button';
import { formatTimeAgo } from '../../constants';

export interface TokenUsageHistory {
  id: number;
  taskId: number;
  taskTitle: string;
  tokensUsed: number;
  hoursExtended: number;
  usedAt: string;
  notes: string | null;
}

export interface GraceTokenSummary {
  policyId: number;
  courseId: number;
  totalTokens: number;
  usedTokens: number;
  remainingTokens: number;
  hoursPerToken: number;
  maxTokensPerTask: number;
  usageHistory: TokenUsageHistory[];
  warnings: string[];
}

export interface UpcomingTask {
  id: number;
  title: string;
  dueAt: string | null;
  taskType: string | null;
}

export interface GraceTokenSectionProps {
  /** Course ID */
  courseId: number;
  /** Course code for display */
  courseCode: string;
  /** Token summary (null if no policy exists) */
  tokenSummary: GraceTokenSummary | null;
  /** Available tasks for token use */
  upcomingTasks: UpcomingTask[];
  /** Handler for using tokens */
  onUseToken: (taskId: number, tokensToUse: number, notes?: string) => void;
  /** Whether an operation is in progress */
  isLoading?: boolean;
}

/**
 * GraceTokenSection Component
 */
export function GraceTokenSection({
  courseId,
  courseCode,
  tokenSummary,
  upcomingTasks,
  onUseToken,
  isLoading = false,
}: GraceTokenSectionProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [tokensToUse, setTokensToUse] = useState(1);
  const [notes, setNotes] = useState('');

  // Filter out tasks that already have tokens used
  const availableTasks = useMemo(() => {
    if (!tokenSummary) return upcomingTasks;
    const usedTaskIds = new Set(tokenSummary.usageHistory.map((u) => u.taskId));
    return upcomingTasks.filter((t) => !usedTaskIds.has(t.id));
  }, [upcomingTasks, tokenSummary]);

  const handleUseToken = useCallback(() => {
    if (selectedTaskId !== null && tokensToUse > 0) {
      onUseToken(selectedTaskId, tokensToUse, notes || undefined);
      // Reset form
      setSelectedTaskId(null);
      setTokensToUse(1);
      setNotes('');
    }
  }, [selectedTaskId, tokensToUse, notes, onUseToken]);

  if (!tokenSummary) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>Grace Tokens</h3>
        </div>
        <div style={styles.emptyState}>
          <Coins size={32} color="var(--text-tertiary)" />
          <p style={styles.emptyText}>No grace token policy for this course</p>
          <p style={styles.emptySubtext}>
            Add a grace token policy in the Policies section if your course offers
            deadline extensions
          </p>
        </div>
      </div>
    );
  }

  const hasWarnings = tokenSummary.warnings.length > 0;
  const canUseTokens = tokenSummary.remainingTokens > 0 && availableTasks.length > 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Grace Tokens</h3>
        <div style={styles.tokenBadge}>
          {tokenSummary.remainingTokens}/{tokenSummary.totalTokens} remaining
        </div>
      </div>

      <div style={styles.content}>
        {/* Token status */}
        <div style={styles.statusRow}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{tokenSummary.remainingTokens}</div>
            <div style={styles.statLabel}>Available</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{tokenSummary.usedTokens}</div>
            <div style={styles.statLabel}>Used</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{tokenSummary.hoursPerToken}h</div>
            <div style={styles.statLabel}>Per Token</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{tokenSummary.maxTokensPerTask}</div>
            <div style={styles.statLabel}>Max/Task</div>
          </div>
        </div>

        {/* Warnings */}
        {hasWarnings && (
          <div style={styles.warningBox}>
            <AlertTriangle size={16} color="var(--color-warning)" />
            <div>
              {tokenSummary.warnings.map((warning, i) => (
                <div key={i} style={styles.warningText}>
                  {warning}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Use token form */}
        {canUseTokens && (
          <div style={styles.useForm}>
            <div style={styles.formTitle}>Use Token</div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>Task:</label>
              <select
                value={selectedTaskId ?? ''}
                onChange={(e) =>
                  setSelectedTaskId(e.target.value ? Number(e.target.value) : null)
                }
                style={styles.select}
              >
                <option value="">Select a task...</option>
                {availableTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                    {task.dueAt && ` (due ${formatTimeAgo(task.dueAt)})`}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>Tokens:</label>
              <select
                value={tokensToUse}
                onChange={(e) => setTokensToUse(Number(e.target.value))}
                style={styles.selectSmall}
                disabled={!selectedTaskId}
              >
                {Array.from(
                  {
                    length: Math.min(
                      tokenSummary.remainingTokens,
                      tokenSummary.maxTokensPerTask
                    ),
                  },
                  (_, i) => i + 1
                ).map((num) => (
                  <option key={num} value={num}>
                    {num} ({num * tokenSummary.hoursPerToken}h extension)
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formRow}>
              <label style={styles.formLabel}>Notes:</label>
              <input
                type="text"
                placeholder="Optional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={styles.input}
                disabled={!selectedTaskId}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUseToken}
              disabled={isLoading || !selectedTaskId}
            >
              <Clock size={14} />
              Use Token
            </Button>
          </div>
        )}

        {/* Usage history */}
        {tokenSummary.usageHistory.length > 0 && (
          <div style={styles.historySection}>
            <button
              style={styles.historyToggle}
              onClick={() => setShowHistory(!showHistory)}
            >
              <History size={14} />
              Usage History ({tokenSummary.usageHistory.length})
              {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showHistory && (
              <div style={styles.historyList}>
                {tokenSummary.usageHistory.map((usage) => (
                  <div key={usage.id} style={styles.historyItem}>
                    <div style={styles.historyMain}>
                      <div style={styles.historyTask}>{usage.taskTitle}</div>
                      <div style={styles.historyMeta}>
                        {usage.tokensUsed} token{usage.tokensUsed !== 1 ? 's' : ''} • +
                        {usage.hoursExtended} hours • {formatTimeAgo(usage.usedAt)}
                      </div>
                    </div>
                    {usage.notes && <div style={styles.historyNotes}>{usage.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-default)',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  tokenBadge: {
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '500',
    color: 'var(--color-navy)',
    backgroundColor: 'rgba(var(--color-navy-rgb), 0.1)',
    borderRadius: 'var(--radius-sm)',
  },
  content: {
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  statusRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  statCard: {
    padding: '12px',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-md)',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  warningBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px',
    backgroundColor: 'rgba(var(--color-warning-rgb), 0.1)',
    borderRadius: 'var(--radius-md)',
  },
  warningText: {
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  useForm: {
    padding: '16px',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  formTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    marginBottom: '4px',
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  formLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    width: '60px',
    flexShrink: 0,
  },
  select: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-default)',
    color: 'var(--text-primary)',
  },
  selectSmall: {
    width: '180px',
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-default)',
    color: 'var(--text-primary)',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '13px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-default)',
    color: 'var(--text-primary)',
  },
  historySection: {
    borderTop: '1px solid var(--border-default)',
    paddingTop: '12px',
  },
  historyToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    width: '100%',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
  },
  historyList: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  historyItem: {
    padding: '10px 12px',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-md)',
  },
  historyMain: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  historyTask: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--text-primary)',
  },
  historyMeta: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  historyNotes: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
    fontStyle: 'italic',
    marginTop: '6px',
  },
  emptyState: {
    padding: '40px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    textAlign: 'center',
  },
  emptyText: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)',
  },
  emptySubtext: {
    margin: 0,
    fontSize: '13px',
    color: 'var(--text-secondary)',
    maxWidth: '280px',
  },
};

export default GraceTokenSection;
