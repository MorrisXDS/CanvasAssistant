/**
 * Accordion Component
 * Collapsible sections for organizing content
 */

import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface AccordionItemProps {
  id: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItemProps[];
  allowMultiple?: boolean;
  defaultExpandedIds?: string[];
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  item: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: 'var(--space-3)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
    textAlign: 'left',
  },
  headerContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },
  titleWrapper: {
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  chevron: {
    color: 'var(--text-muted)',
    transition: 'transform var(--transition-fast)',
    flexShrink: 0,
  },
  chevronExpanded: {
    transform: 'rotate(0deg)',
  },
  chevronCollapsed: {
    transform: 'rotate(-90deg)',
  },
  content: {
    padding: 'var(--space-3)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-light)',
  },
  contentHidden: {
    display: 'none',
  },
};

export function AccordionItem({
  id,
  title,
  subtitle,
  badge,
  defaultExpanded = false,
  isExpanded,
  onToggle,
  children,
}: AccordionItemProps & {
  isExpanded: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={styles.item}>
      <button
        style={styles.header}
        onClick={() => onToggle(id)}
        aria-expanded={isExpanded}
        aria-controls={`accordion-content-${id}`}
      >
        <ChevronDown
          size={16}
          style={{
            ...styles.chevron,
            ...(isExpanded ? styles.chevronExpanded : styles.chevronCollapsed),
          }}
        />
        <div style={styles.headerContent}>
          <div style={styles.titleWrapper}>
            <span style={styles.title}>{title}</span>
            {subtitle && <span style={styles.subtitle}>{subtitle}</span>}
          </div>
          {badge}
        </div>
      </button>
      <div
        id={`accordion-content-${id}`}
        style={{
          ...styles.content,
          ...(isExpanded ? {} : styles.contentHidden),
        }}
        role="region"
        aria-labelledby={`accordion-header-${id}`}
      >
        {children}
      </div>
    </div>
  );
}

export function Accordion({
  items,
  allowMultiple = true,
  defaultExpandedIds = [],
}: AccordionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>(defaultExpandedIds);
    items.forEach((item) => {
      if (item.defaultExpanded) {
        initial.add(item.id);
      }
    });
    return initial;
  });

  const handleToggle = useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (!allowMultiple) {
            next.clear();
          }
          next.add(id);
        }
        return next;
      });
    },
    [allowMultiple]
  );

  return (
    <div style={styles.container}>
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          {...item}
          isExpanded={expandedIds.has(item.id)}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

// Simple single accordion section (standalone)
export interface AccordionSectionProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function AccordionSection({
  title,
  subtitle,
  badge,
  defaultExpanded = false,
  children,
}: AccordionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div style={styles.item}>
      <button
        style={styles.header}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <ChevronDown
          size={16}
          style={{
            ...styles.chevron,
            ...(isExpanded ? styles.chevronExpanded : styles.chevronCollapsed),
          }}
        />
        <div style={styles.headerContent}>
          <div style={styles.titleWrapper}>
            <span style={styles.title}>{title}</span>
            {subtitle && <span style={styles.subtitle}>{subtitle}</span>}
          </div>
          {badge}
        </div>
      </button>
      <div
        style={{
          ...styles.content,
          ...(isExpanded ? {} : styles.contentHidden),
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default Accordion;
