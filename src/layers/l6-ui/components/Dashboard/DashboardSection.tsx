/**
 * DashboardSection Component
 * Wrapper component for each draggable/collapsible dashboard section
 */

import React from 'react';
import { GripVertical } from 'lucide-react';

export interface DashboardSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export function DashboardSection({
  id,
  children,
  isDragging,
  isDragOver,
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
      {/* Drag handle - top left, visible on hover */}
      <div style={styles.dragHandle} data-toolbar title="Drag to reorder">
        <GripVertical size={14} />
      </div>

      {/* Content */}
      <div style={styles.content}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ style?: React.CSSProperties }>,
                {
                  style: {
                    ...(child.props as { style?: React.CSSProperties }).style,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column' as const,
                    height: '100%',
                  },
                }
              )
            : child
        )}
      </div>
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
  },

  dragHandle: {
    position: 'absolute',
    top: 'var(--space-2)',
    left: 'var(--space-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    zIndex: 10,
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'grab',
    opacity: 0,
    transition: 'opacity var(--transition-fast)',
  },

  content: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
};

// Inject hover styles for toolbar visibility
if (typeof document !== 'undefined') {
  const styleId = 'dashboard-section-hover-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      [data-section-id]:hover [data-toolbar] {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }
}

export default DashboardSection;
