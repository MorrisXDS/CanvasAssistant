/**
 * TaskCheckIcon Component
 * Shared toggle icon for task completion status
 * Displays CheckCircle when complete, Circle when incomplete
 * Clickable to toggle completion status
 */

import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';

export interface TaskCheckIconProps {
  /** Whether the task is completed */
  isCompleted: boolean;
  /** Whether the task is submitted (shows different tooltip) */
  isSubmitted?: boolean;
  /** Callback when clicked to toggle completion */
  onToggle: () => void;
  /** Icon size in pixels */
  size?: number;
  /** Whether to disable interaction */
  disabled?: boolean;
}

const buttonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const disabledStyle: React.CSSProperties = {
  ...buttonStyle,
  cursor: 'default',
  opacity: 0.6,
};

export function TaskCheckIcon({
  isCompleted,
  isSubmitted = false,
  onToggle,
  size = 18,
  disabled = false,
}: TaskCheckIconProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onToggle();
    }
  };

  const title = isCompleted
    ? isSubmitted
      ? 'Submitted'
      : 'Mark as incomplete'
    : 'Mark as complete';

  return (
    <button
      onClick={handleClick}
      title={title}
      style={disabled ? disabledStyle : buttonStyle}
      disabled={disabled}
    >
      {isCompleted ? (
        <CheckCircle
          size={size}
          color="var(--color-success)"
          style={{
            animation: 'fadeIn 0.3s ease-out',
          }}
        />
      ) : (
        <Circle size={size} color="var(--text-muted)" />
      )}
    </button>
  );
}

export default TaskCheckIcon;
