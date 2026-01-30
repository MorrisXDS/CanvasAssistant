/**
 * SettingsDock - macOS-style dock navigation for settings sections
 *
 * Features:
 * - Positioned at bottom of content area (above footer)
 * - Magnification effect on hover (cosine falloff)
 * - Auto-hide with trigger zone: thin hint line that reveals dock on hover
 * - Click to navigate to section
 */

import React, { useState, useRef, useCallback } from 'react';
import { Link, Palette, GraduationCap, Bell, HardDrive } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SettingsDockProps {
  /** Currently open accordion sections */
  openSections: string[];
  /** Callback to change open sections */
  onSectionChange: (sections: string[]) => void;
  /** Refs to section DOM elements for scrolling */
  sectionRefs: Record<string, React.RefObject<HTMLDivElement>>;
  /** Callback to clear search when navigating */
  onClearSearch: () => void;
  /** Whether dock should auto-hide */
  autoHide?: boolean;
  /** Order of sections */
  sectionOrder: string[];
}

interface DockItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const BASE_SIZE = 40;
const MAX_SIZE = 48;
const MAGNIFICATION_RANGE = 80;
const HINT_LINE_HEIGHT = 3;

const SECTION_ITEMS: DockItem[] = [
  { id: 'account', label: 'Account', icon: <Link size={18} /> },
  { id: 'display', label: 'Display', icon: <Palette size={18} /> },
  { id: 'academic', label: 'Academic', icon: <GraduationCap size={18} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
  { id: 'data', label: 'Data', icon: <HardDrive size={18} /> },
];

// =============================================================================
// MAGNIFICATION ALGORITHM
// =============================================================================

function calculateScale(mouseX: number, itemCenterX: number, isHovered: boolean): number {
  if (!isHovered) return 1;

  const distance = Math.abs(mouseX - itemCenterX);
  if (distance >= MAGNIFICATION_RANGE) return 1;

  const normalized = distance / MAGNIFICATION_RANGE;
  const scale = 1 + (MAX_SIZE / BASE_SIZE - 1) * Math.cos((normalized * Math.PI) / 2);
  return scale;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SettingsDock({
  openSections,
  onSectionChange,
  sectionRefs,
  onClearSearch,
  autoHide = false,
  sectionOrder,
}: SettingsDockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [isDockHovered, setIsDockHovered] = useState(false);
  const [isWrapperHovered, setIsWrapperHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [itemCenters, setItemCenters] = useState<Record<string, number>>({});

  // Dock is visible when: auto-hide is off, OR wrapper is hovered
  const isVisible = !autoHide || isWrapperHovered;

  // Sort items by section order
  const sortedItems = [...SECTION_ITEMS].sort((a, b) => {
    const aIndex = sectionOrder.indexOf(a.id);
    const bIndex = sectionOrder.indexOf(b.id);
    return aIndex - bIndex;
  });

  // Update item centers when dock renders
  const updateItemCenters = useCallback(() => {
    if (!dockRef.current) return;

    const dockRect = dockRef.current.getBoundingClientRect();
    const newCenters: Record<string, number> = {};

    sortedItems.forEach((item) => {
      const itemElement = dockRef.current?.querySelector(
        `[data-dock-item="${item.id}"]`
      ) as HTMLElement;
      if (itemElement) {
        const itemRect = itemElement.getBoundingClientRect();
        newCenters[item.id] = itemRect.left + itemRect.width / 2 - dockRect.left;
      }
    });

    setItemCenters(newCenters);
  }, [sortedItems]);

  // Handle mouse move for magnification
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dockRef.current) return;
    const rect = dockRef.current.getBoundingClientRect();
    setMouseX(e.clientX - rect.left);
  }, []);

  // Handle dock mouse enter/leave (for magnification)
  const handleDockMouseEnter = useCallback(() => {
    setIsDockHovered(true);
    updateItemCenters();
  }, [updateItemCenters]);

  const handleDockMouseLeave = useCallback(() => {
    setIsDockHovered(false);
    setMouseX(null);
    setHoveredItem(null);
  }, []);

  // Handle wrapper hover (controls visibility)
  const handleWrapperMouseEnter = useCallback(() => {
    setIsWrapperHovered(true);
  }, []);

  const handleWrapperMouseLeave = useCallback(() => {
    setIsWrapperHovered(false);
  }, []);

  // Handle click on dock item
  const handleItemClick = useCallback(
    (sectionId: string) => {
      onClearSearch();

      if (!openSections.includes(sectionId)) {
        onSectionChange([...openSections, sectionId]);
      }

      setTimeout(() => {
        const sectionRef = sectionRefs[sectionId];
        if (sectionRef?.current) {
          sectionRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }, 100);
    },
    [openSections, onSectionChange, sectionRefs, onClearSearch]
  );

  // Calculate scale for each item
  const getItemScale = useCallback(
    (itemId: string): number => {
      if (!isDockHovered || mouseX === null) return 1;
      const center = itemCenters[itemId];
      if (center === undefined) return 1;
      return calculateScale(mouseX, center, true);
    },
    [isDockHovered, mouseX, itemCenters]
  );

  return (
    <div
      style={styles.wrapper}
      onMouseEnter={handleWrapperMouseEnter}
      onMouseLeave={handleWrapperMouseLeave}
    >
      {/* Hint line - only visible when auto-hide is enabled and dock is hidden */}
      {autoHide && (
        <div
          style={{
            ...styles.hintLine,
            opacity: isVisible ? 0 : 1,
            pointerEvents: isVisible ? 'none' : 'auto',
          }}
        />
      )}

      {/* Dock Container */}
      <div
        style={{
          ...styles.dockContainer,
          maxHeight: isVisible ? 200 : 0,
          opacity: isVisible ? 1 : 0,
          marginTop: isVisible ? 'var(--space-2)' : 0,
          marginBottom: isVisible ? 'var(--space-3)' : 0,
        }}
      >
        <div
          ref={dockRef}
          style={styles.dock}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleDockMouseEnter}
          onMouseLeave={handleDockMouseLeave}
        >
          {sortedItems.map((item) => {
            const scale = getItemScale(item.id);
            const isOpen = openSections.includes(item.id);
            const isItemHovered = hoveredItem === item.id;

            return (
              <div
                key={item.id}
                data-dock-item={item.id}
                style={{
                  ...styles.dockItemWrapper,
                  padding: `0 ${(MAX_SIZE - BASE_SIZE) / 2}px`,
                }}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                {isItemHovered && <div style={styles.dockLabel}>{item.label}</div>}

                <button
                  style={{
                    ...styles.dockItem,
                    width: BASE_SIZE,
                    height: BASE_SIZE,
                    backgroundColor: isOpen ? 'var(--color-blue)' : 'var(--bg-elevated)',
                    color: isOpen ? 'white' : 'var(--text-secondary)',
                    transform: `scale(${scale})`,
                  }}
                  onClick={() => handleItemClick(item.id)}
                  title={item.label}
                >
                  {item.icon}
                </button>

                {isOpen && <div style={styles.activeDot} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'sticky',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 100,
    paddingTop: 'var(--space-1)',
    // Wrapper captures hover events - keep small for tight activation region
    minHeight: 12,
  },

  hintLine: {
    width: '100px',
    height: HINT_LINE_HEIGHT,
    backgroundColor: 'var(--border-default)',
    borderRadius: 'var(--radius-full)',
    transition: 'opacity 150ms ease',
    cursor: 'default',
  },

  dockContainer: {
    display: 'flex',
    justifyContent: 'center',
    overflow: 'visible',
    transition:
      'max-height 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 150ms ease, margin 200ms ease',
  },

  dock: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 'var(--space-1)',
    padding: 'var(--space-3) var(--space-4)',
    paddingTop: 'var(--space-6)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    border: '1px solid var(--border-default)',
  },

  dockItemWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
  },

  dockLabel: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    border: '1px solid var(--border-default)',
    zIndex: 10,
  },

  dockItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'background-color 100ms ease, color 100ms ease, transform 100ms ease',
    transformOrigin: 'bottom center',
  },

  activeDot: {
    width: '4px',
    height: '4px',
    backgroundColor: 'var(--color-blue)',
    borderRadius: '50%',
    marginTop: 'var(--space-1)',
  },
};

export default SettingsDock;
