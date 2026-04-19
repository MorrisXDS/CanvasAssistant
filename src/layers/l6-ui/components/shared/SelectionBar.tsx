/**
 * SelectionBar Component
 * Generic selection bar reusable by any page. Renders selected count + action buttons.
 */

import React from 'react';
import { CheckSquare, X } from 'lucide-react';

export interface SelectionBarAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export interface SelectionBarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onCancel: () => void;
  actions?: SelectionBarAction[];
}

export function SelectionBar({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onCancel,
  actions,
}: SelectionBarProps) {
  return (
    <div style={styles.bar}>
      <div style={styles.info}>
        <CheckSquare size={16} />
        <span>{selectedCount} selected</span>
      </div>
      <div style={styles.actions}>
        <button style={styles.button} onClick={onSelectAll}>
          Select all
        </button>
        <button style={styles.button} onClick={onDeselectAll}>
          Deselect all
        </button>
        {actions?.map((action) => (
          <button key={action.label} style={styles.button} onClick={action.onClick}>
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
        <button style={styles.cancelButton} onClick={onCancel}>
          <X size={14} />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
}

// The bar has a solid navy background in both light and dark themes; use
// white foreground + translucent-white borders for guaranteed contrast.
const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-3) var(--space-4)',
    backgroundColor: 'var(--color-navy-light)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
    border: '1px solid var(--color-navy)',
  },
  info: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: '#ffffff',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: '#ffffff',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },
  cancelButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-3)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    color: '#ffffff',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.5)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },
};
