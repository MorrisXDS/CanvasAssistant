/**
 * SectionBar — presentational pill-chip row for in-page section navigation.
 *
 * Renders one chip per AVAILABLE section (unavailable sections are omitted, per
 * ADR-0010 B1). The active chip is accented (`--color-navy` / white) and marked
 * `aria-current`. Each chip shows its `Alt+<index1>` slot badge. Clicking a chip
 * calls `onSelect(id)`.
 *
 * Pure presentational — no hooks, no store, no keyboard handling. The keyboard
 * behavior + which section is active live in `useSectionScope`; this component
 * just reflects that state and forwards clicks. Styling copies the
 * `SettingButtonGroup` accent idiom (`primitives/SettingRow.tsx`) and the `kbd`
 * badge idiom from `KeyboardShortcutsModal`.
 */

import React from 'react';

export interface SectionBarItem {
  id: string;
  label: string;
  isAvailable: boolean;
  /** 1-based `Alt+<index1>` slot, or `null` when unavailable. */
  index1: number | null;
}

export interface SectionBarProps {
  sections: SectionBarItem[];
  /** The currently-active section id. */
  active: string;
  onSelect: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function SectionBar({
  sections,
  active,
  onSelect,
  className,
  style,
}: SectionBarProps) {
  const available = sections.filter((s) => s.isAvailable);

  return (
    <div className={className} style={{ ...styles.bar, ...style }} role="group">
      {available.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={isActive ? 'true' : undefined}
            style={{
              ...styles.chip,
              backgroundColor: isActive ? 'var(--color-navy)' : 'transparent',
              color: isActive ? 'white' : 'var(--text-secondary)',
            }}
          >
            <span>{section.label}</span>
            {section.index1 !== null && (
              <kbd
                style={{
                  ...styles.kbd,
                  // Keep the badge legible against the navy active background.
                  color: isActive ? 'white' : 'var(--text-secondary)',
                  borderColor: isActive
                    ? 'rgba(255,255,255,0.5)'
                    : 'var(--border-default)',
                }}
              >
                Alt+{section.index1}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-2)',
    alignItems: 'center',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-3)',
    fontSize: '13px',
    fontWeight: 500,
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-full, 9999px)',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '18px',
    padding: '0 5px',
    fontSize: '10px',
    fontFamily: 'inherit',
    fontWeight: 500,
    border: '1px solid var(--border-default)',
    borderRadius: '4px',
  },
};

export default SectionBar;
