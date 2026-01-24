/**
 * DashboardSection Component
 * Wrapper component for each draggable/collapsible dashboard section
 */

import React from 'react';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';

export interface DashboardSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isCollapsed: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onToggleCollapse: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export function DashboardSection({
  id,
  title,
  children,
  isCollapsed,
  isDragging,
  isDragOver,
  onToggleCollapse,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: DashboardSectionProps) {
  return (
    <div
      data-section-id={id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        ...styles.container,
        opacity: isDragging ? 0.5 : 1,
        boxShadow: isDragOver ? '0 0 0 2px var(--color-blue)' : 'none',
        transition: 'box-shadow 150ms ease, opacity 150ms ease',
      }}
    >
      {/* Minimal toolbar - drag handle and collapse only */}
      <div style={styles.toolbar}>
        <div style={styles.dragHandle} title="Drag to reorder">
          <GripVertical size={14} />
        </div>
        {isCollapsed && <span style={styles.collapsedTitle}>{title}</span>}
        <button
          style={styles.collapseButton}
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Content - hidden when collapsed */}
      {!isCollapsed && (
        <div style={styles.content}>
          {React.Children.map(children, child =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
                  style: {
                    ...(child.props as { style?: React.CSSProperties }).style,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column' as const,
                    height: '100%',
                  }
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    height: '100%',
    minHeight: '250px',
  },

  toolbar: {
    position: 'absolute',
    top: 'var(--space-2)',
    right: 'var(--space-2)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    zIndex: 10,
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px',
    opacity: 0.6,
    transition: 'opacity var(--transition-fast)',
  },

  dragHandle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    color: 'var(--text-muted)',
    cursor: 'grab',
  },

  collapsedTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-secondary)',
    padding: '0 var(--space-2)',
  },

  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    padding: 0,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
  },

  content: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
};

export default DashboardSection;
