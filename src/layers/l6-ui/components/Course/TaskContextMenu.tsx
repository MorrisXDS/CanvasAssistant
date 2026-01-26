/**
 * TaskContextMenu Component
 * Right-click context menu for task operations
 */

import React, { useEffect, useRef } from 'react';
import {
  Edit3,
  Copy,
  CheckCircle,
  Circle,
  Globe,
  Trash2,
  EyeOff,
  Eye,
} from 'lucide-react';

export interface TaskContextMenuProps {
  task: {
    id: number;
    title: string;
    isCompleted: boolean;
    isOptional?: boolean;
  };
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleComplete: () => void;
  onOpenInCanvas: () => void;
  onDelete: () => void;
  onToggleOptional?: () => void;
}

// Inline styles matching FilesPage.module.css contextMenu classes
const styles = {
  contextMenu: {
    position: 'fixed' as const,
    zIndex: 1000,
    minWidth: '180px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    padding: 'var(--space-1) 0',
    animation: 'contextMenuFadeIn 0.15s ease-out',
  },
  contextMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: 'none',
    textAlign: 'left' as const,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },
  contextMenuItemHover: {
    backgroundColor: 'var(--bg-card-hover)',
  },
  contextMenuItemDanger: {
    color: 'var(--color-error)',
  },
  contextMenuDivider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: 'var(--space-1) 0',
  },
};

export function TaskContextMenu({
  task,
  position,
  onClose,
  onEdit,
  onDuplicate,
  onToggleComplete,
  onOpenInCanvas,
  onDelete,
  onToggleOptional,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Add listeners with a small delay to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // Adjust if menu would go off right edge
    if (position.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    // Adjust if menu would go off bottom edge
    if (position.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menuRef.current.style.left = `${adjustedX}px`;
    menuRef.current.style.top = `${adjustedY}px`;
  }, [position]);

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const getItemStyle = (itemKey: string, isDanger = false) => ({
    ...styles.contextMenuItem,
    ...(hoveredItem === itemKey ? styles.contextMenuItemHover : {}),
    ...(isDanger ? styles.contextMenuItemDanger : {}),
    ...(isDanger && hoveredItem === itemKey
      ? { backgroundColor: 'rgba(220, 38, 38, 0.1)' }
      : {}),
  });

  return (
    <div
      ref={menuRef}
      style={{ ...styles.contextMenu, left: position.x, top: position.y }}
      role="menu"
    >
      {/* Edit */}
      <button
        style={getItemStyle('edit')}
        onClick={() => handleAction(onEdit)}
        onMouseEnter={() => setHoveredItem('edit')}
        onMouseLeave={() => setHoveredItem(null)}
        role="menuitem"
      >
        <Edit3 size={14} />
        <span>Edit</span>
      </button>

      {/* Duplicate */}
      <button
        style={getItemStyle('duplicate')}
        onClick={() => handleAction(onDuplicate)}
        onMouseEnter={() => setHoveredItem('duplicate')}
        onMouseLeave={() => setHoveredItem(null)}
        role="menuitem"
      >
        <Copy size={14} />
        <span>Duplicate</span>
      </button>

      {/* Mark Complete / Incomplete */}
      <button
        style={getItemStyle('complete')}
        onClick={() => handleAction(onToggleComplete)}
        onMouseEnter={() => setHoveredItem('complete')}
        onMouseLeave={() => setHoveredItem(null)}
        role="menuitem"
      >
        {task.isCompleted ? (
          <>
            <Circle size={14} />
            <span>Mark Incomplete</span>
          </>
        ) : (
          <>
            <CheckCircle size={14} />
            <span>Mark Complete</span>
          </>
        )}
      </button>

      {/* Mark as Optional / Required */}
      {onToggleOptional && (
        <button
          style={getItemStyle('optional')}
          onClick={() => handleAction(onToggleOptional)}
          onMouseEnter={() => setHoveredItem('optional')}
          onMouseLeave={() => setHoveredItem(null)}
          role="menuitem"
        >
          {task.isOptional ? (
            <>
              <Eye size={14} />
              <span>Mark as Required</span>
            </>
          ) : (
            <>
              <EyeOff size={14} />
              <span>Mark as Optional</span>
            </>
          )}
        </button>
      )}

      {/* Divider */}
      <div style={styles.contextMenuDivider} />

      {/* Open in Canvas */}
      <button
        style={getItemStyle('canvas')}
        onClick={() => handleAction(onOpenInCanvas)}
        onMouseEnter={() => setHoveredItem('canvas')}
        onMouseLeave={() => setHoveredItem(null)}
        role="menuitem"
      >
        <Globe size={14} />
        <span>Open in Canvas</span>
      </button>

      {/* Divider */}
      <div style={styles.contextMenuDivider} />

      {/* Delete */}
      <button
        style={getItemStyle('delete', true)}
        onClick={() => handleAction(onDelete)}
        onMouseEnter={() => setHoveredItem('delete')}
        onMouseLeave={() => setHoveredItem(null)}
        role="menuitem"
      >
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
}

export default TaskContextMenu;
