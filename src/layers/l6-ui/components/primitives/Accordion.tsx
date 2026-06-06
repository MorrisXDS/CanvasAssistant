/**
 * Accordion - Collapsible section component
 *
 * A flexible accordion component for creating expandable/collapsible sections.
 * Supports single or multiple open sections, custom triggers, and smooth animations.
 *
 * @example
 * <Accordion>
 *   <Accordion.Item value="section-1">
 *     <Accordion.Trigger>Section 1</Accordion.Trigger>
 *     <Accordion.Content>Content for section 1</Accordion.Content>
 *   </Accordion.Item>
 * </Accordion>
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { ChevronDown } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type AccordionType = 'single' | 'multiple';

interface AccordionContextValue {
  type: AccordionType;
  openItems: string[];
  toggle: (value: string) => void;
}

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
}

interface AccordionProps {
  /** Accordion type - single allows only one open, multiple allows many */
  type?: AccordionType;
  /** Default open items */
  defaultOpen?: string[];
  /** Controlled open items */
  value?: string[];
  /** Callback when items change */
  onChange?: (value: string[]) => void;
  /** Children (Accordion.Item components) */
  children: React.ReactNode;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Additional className */
  className?: string;
}

interface AccordionItemProps {
  /** Unique identifier for this item */
  value: string;
  /** Children (Trigger and Content) */
  children: React.ReactNode;
  /** Additional styles */
  style?: React.CSSProperties;
  /** Disabled state */
  disabled?: boolean;
}

interface AccordionTriggerProps {
  /** Trigger content */
  children: React.ReactNode;
  /** Left icon */
  icon?: React.ReactNode;
  /** Badge or indicator on the right (before chevron) */
  badge?: React.ReactNode;
  /** Additional styles */
  style?: React.CSSProperties;
}

interface AccordionContentProps {
  /** Content children */
  children: React.ReactNode;
  /** Additional styles */
  style?: React.CSSProperties;
}

// =============================================================================
// CONTEXT
// =============================================================================

const AccordionContext = createContext<AccordionContextValue | null>(null);
const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);

function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion components must be used within an Accordion');
  }
  return context;
}

function useAccordionItemContext() {
  const context = useContext(AccordionItemContext);
  if (!context) {
    throw new Error('Accordion.Trigger/Content must be used within an Accordion.Item');
  }
  return context;
}

// =============================================================================
// ACCORDION ROOT
// =============================================================================

export function Accordion({
  type = 'multiple',
  defaultOpen = [],
  value,
  onChange,
  children,
  style,
  className,
}: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState<string[]>(defaultOpen);

  // Use controlled or uncontrolled
  const openItems = value !== undefined ? value : internalOpen;

  const toggle = useCallback(
    (itemValue: string) => {
      const newItems =
        type === 'single'
          ? openItems.includes(itemValue)
            ? []
            : [itemValue]
          : openItems.includes(itemValue)
            ? openItems.filter((v) => v !== itemValue)
            : [...openItems, itemValue];

      if (value === undefined) {
        setInternalOpen(newItems);
      }
      onChange?.(newItems);
    },
    [type, openItems, value, onChange]
  );

  return (
    <AccordionContext.Provider value={{ type, openItems, toggle }}>
      <div style={{ ...styles.root, ...style }} className={className}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

// =============================================================================
// ACCORDION ITEM
// =============================================================================

function AccordionItem({ value, children, style, disabled }: AccordionItemProps) {
  const { openItems } = useAccordionContext();
  const isOpen = openItems.includes(value);

  return (
    <AccordionItemContext.Provider value={{ value, isOpen }}>
      <div
        style={{
          ...styles.item,
          ...(disabled ? styles.itemDisabled : {}),
          ...style,
        }}
        data-state={isOpen ? 'open' : 'closed'}
        data-disabled={disabled || undefined}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

// =============================================================================
// ACCORDION TRIGGER
// =============================================================================

function AccordionTrigger({ children, icon, badge, style }: AccordionTriggerProps) {
  const { toggle } = useAccordionContext();
  const { value, isOpen } = useAccordionItemContext();

  return (
    <button
      type="button"
      style={{ ...styles.trigger, ...style }}
      onClick={() => toggle(value)}
      aria-expanded={isOpen}
    >
      <div style={styles.triggerContent}>
        {icon && <span style={styles.triggerIcon}>{icon}</span>}
        <span style={styles.triggerText}>{children}</span>
        {badge && <span style={styles.triggerBadge}>{badge}</span>}
      </div>
      <ChevronDown
        size={18}
        style={{
          ...styles.chevron,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      />
    </button>
  );
}

// =============================================================================
// ACCORDION CONTENT
// =============================================================================

function AccordionContent({ children, style }: AccordionContentProps) {
  const { isOpen } = useAccordionItemContext();
  // innerRef wraps the natural-height content; the outer div's height is the
  // animated value we control. We measure the INNER (its size is not driven by
  // our height style), so re-measuring can't feed back into a ResizeObserver loop.
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measure = () => setHeight(isOpen ? inner.scrollHeight : 0);
    measure();

    // Re-measure when the content's own size changes AFTER mount — e.g. a
    // section that loads data asynchronously (UpdatesSection) and grows from a
    // short loading state to its full height. Without this the pinned pixel
    // height stays at the first measurement and `overflow: hidden` clips the
    // grown content (the cut-off "Check now" button bug).
    if (!isOpen || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [isOpen, children]);

  return (
    <div
      style={{
        ...styles.content,
        height: height !== undefined ? height : isOpen ? 'auto' : 0,
        opacity: isOpen ? 1 : 0,
        ...style,
      }}
      aria-hidden={!isOpen}
    >
      <div ref={innerRef} style={styles.contentInner}>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// COMPOUND EXPORTS
// =============================================================================

Accordion.Item = AccordionItem;
Accordion.Trigger = AccordionTrigger;
Accordion.Content = AccordionContent;

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  item: {
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-default)',
    backgroundColor: 'var(--bg-card)',
    overflow: 'hidden',
  },

  itemDisabled: {
    opacity: 0.5,
    pointerEvents: 'none',
  },

  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 'var(--space-4)',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 150ms ease',
  },

  triggerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    flex: 1,
    minWidth: 0,
  },

  triggerIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--color-navy)',
    flexShrink: 0,
  },

  triggerText: {
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  triggerBadge: {
    display: 'flex',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingRight: 'var(--space-2)',
  },

  chevron: {
    color: 'var(--text-secondary)',
    transition: 'transform 200ms ease',
    flexShrink: 0,
  },

  content: {
    overflow: 'hidden',
    transition: 'height 200ms ease, opacity 150ms ease',
  },

  contentInner: {
    padding: '0 var(--space-4) var(--space-4)',
  },
};

export default Accordion;
