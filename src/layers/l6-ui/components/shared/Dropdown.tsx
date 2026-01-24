/**
 * Dropdown Component
 * Popover-style dropdown menu with optional submenus
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';

export interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  width?: number | string;
  maxHeight?: number | string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'inline-block',
  },
  trigger: {
    cursor: 'pointer',
  },
  menu: {
    position: 'absolute',
    top: '100%',
    marginTop: '4px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 100,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  menuLeft: {
    left: 0,
  },
  menuRight: {
    right: 0,
  },
};

export function Dropdown({
  trigger,
  children,
  align = 'left',
  width = 320,
  maxHeight = '70vh',
  isOpen: controlledIsOpen,
  onOpenChange,
}: DropdownProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setIsOpen = useCallback((open: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(open);
    } else {
      setInternalIsOpen(open);
    }
  }, [isControlled, onOpenChange]);

  const handleToggle = useCallback(() => {
    setIsOpen(!isOpen);
  }, [isOpen, setIsOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, setIsOpen]);

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.trigger} onClick={handleToggle}>
        {trigger}
      </div>
      {isOpen && (
        <div
          style={{
            ...styles.menu,
            ...(align === 'left' ? styles.menuLeft : styles.menuRight),
            width: typeof width === 'number' ? `${width}px` : width,
            maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Dropdown Section for grouping items
export interface DropdownSectionProps {
  title?: string;
  children: React.ReactNode;
}

const sectionStyles: Record<string, React.CSSProperties> = {
  section: {
    padding: 'var(--space-2) 0',
    borderBottom: '1px solid var(--border-light)',
  },
  sectionLast: {
    borderBottom: 'none',
  },
  sectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: 'var(--space-2) var(--space-3)',
  },
  sectionContent: {
    padding: '0 var(--space-2)',
  },
};

export function DropdownSection({ title, children }: DropdownSectionProps) {
  return (
    <div style={sectionStyles.section}>
      {title && <div style={sectionStyles.sectionTitle}>{title}</div>}
      <div style={sectionStyles.sectionContent}>{children}</div>
    </div>
  );
}

// Submenu item with expandable content
export interface DropdownSubmenuProps {
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const submenuStyles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'background-color var(--transition-fast)',
    width: '100%',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
  },
  label: {
    flex: 1,
    fontWeight: 'var(--font-medium)',
  },
  chevron: {
    color: 'var(--text-muted)',
    transition: 'transform var(--transition-fast)',
  },
  chevronExpanded: {
    transform: 'rotate(90deg)',
  },
  content: {
    padding: 'var(--space-2) var(--space-3)',
    paddingLeft: 'var(--space-5)',
  },
};

export function DropdownSubmenu({
  label,
  icon,
  badge,
  children,
  defaultExpanded = false,
}: DropdownSubmenuProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div>
      <button
        style={submenuStyles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-app)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
      >
        {icon}
        <span style={submenuStyles.label}>{label}</span>
        {badge}
        <ChevronRight
          size={14}
          style={{
            ...submenuStyles.chevron,
            ...(isExpanded ? submenuStyles.chevronExpanded : {}),
          }}
        />
      </button>
      {isExpanded && <div style={submenuStyles.content}>{children}</div>}
    </div>
  );
}

// Simple dropdown item
export interface DropdownItemProps {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}

const itemStyles: Record<string, React.CSSProperties> = {
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
    transition: 'background-color var(--transition-fast)',
    width: '100%',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
  },
  itemActive: {
    backgroundColor: 'var(--color-navy)',
    color: 'white',
  },
  itemDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

export function DropdownItem({ label, icon, onClick, active, disabled }: DropdownItemProps) {
  return (
    <button
      style={{
        ...itemStyles.item,
        ...(active ? itemStyles.itemActive : {}),
        ...(disabled ? itemStyles.itemDisabled : {}),
      }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-app)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default Dropdown;
