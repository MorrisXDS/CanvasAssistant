/**
 * TargetBar Component
 * Single progress bar showing grade earned vs assessed percentage
 *
 * Visual: [████████████▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░]
 *          └─ earned ─┘└─ assessed ─┘└─ remaining ─┘
 */

import React, { useState } from 'react';

export interface TargetBarProps {
  /** Percentage earned (0-100) - course-colored segment */
  currentGrade: number;
  /** Total assessed percentage (0-100) - grey extends from earned to here */
  assessedPercent: number;
  /** Target grade for celebration comparison (0-100) */
  targetGrade: number;
  /** Course theme color (hex or CSS variable) */
  courseColor: string;
  /** Optional height in pixels (default: 8) */
  height?: number;
  /** Show inline label instead of tooltip */
  showLabel?: boolean;
}

export function TargetBar({
  currentGrade,
  assessedPercent,
  targetGrade,
  courseColor,
  height = 8,
  showLabel = false,
}: TargetBarProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Clamp visual widths to 100% but allow display values to exceed for bonus grades
  const earnedDisplay = Math.max(0, currentGrade);
  const assessedDisplay = Math.max(earnedDisplay, assessedPercent);
  const earnedWidth = Math.min(100, earnedDisplay);
  const assessedWidth = Math.min(100, assessedDisplay) - earnedWidth;
  const hasMetTarget = earnedDisplay >= targetGrade && targetGrade > 0;

  // Calculate segment widths as percentages
  const earnedWidthStr = `${earnedWidth}%`;
  const assessedWidthStr = `${assessedWidth}%`;

  const tooltipText = `${earnedDisplay.toFixed(1)}% earned, ${assessedDisplay.toFixed(1)}% assessed`;

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.track,
          height: `${height}px`,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={tooltipText}
      >
        {/* Earned segment (course color) */}
        <div
          style={{
            ...styles.segment,
            width: earnedWidthStr,
            backgroundColor: courseColor,
            borderRadius: assessedDisplay <= earnedDisplay
              ? `${height / 2}px`
              : `${height / 2}px 0 0 ${height / 2}px`,
          }}
        />
        {/* Assessed segment (grey) */}
        {assessedDisplay > earnedDisplay && (
          <div
            style={{
              ...styles.segment,
              width: assessedWidthStr,
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: `0 ${height / 2}px ${height / 2}px 0`,
            }}
          />
        )}

        {/* Hover tooltip */}
        {isHovered && !showLabel && (
          <div style={styles.tooltip}>
            {tooltipText}
          </div>
        )}
      </div>

      {/* Celebration emoji and/or label */}
      <div style={styles.labelRow}>
        {showLabel && (
          <span style={styles.label}>
            {earnedDisplay.toFixed(0)}% earned
          </span>
        )}
        {hasMetTarget && (
          <span style={styles.celebration} title="Target reached!">
            🎉
          </span>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    width: '100%',
  },

  track: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '4px',
    overflow: 'hidden',
  },

  segment: {
    height: '100%',
    transition: 'width 300ms ease',
  },

  tooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 4px)',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    zIndex: 10,
  },

  labelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: '16px',
  },

  label: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },

  celebration: {
    fontSize: '14px',
    marginLeft: 'auto',
  },
};

export default TargetBar;
