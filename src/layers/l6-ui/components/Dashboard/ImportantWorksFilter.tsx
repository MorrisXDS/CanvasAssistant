/**
 * ImportantWorksFilter - Popover filter for Important Works section
 * Edge-aware popover that adjusts position to stay within viewport
 * Shows all available coursework types in a scrollable list
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, RotateCcw, Check } from 'lucide-react';
import {
  DEFAULT_IMPORTANT_WORKS_FILTER,
  type ImportantWorksFilter as FilterType,
} from '../../../l5-presentation/settings';
import { TASK_TYPES } from '../../constants';

interface ImportantWorksFilterProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const POPOVER_WIDTH = 340;
const POPOVER_HEIGHT = 420; // Height with scrollable types list
const MARGIN = 12;

/**
 * Check if filter differs from defaults
 */
function isFilterActive(filter: FilterType): boolean {
  const defaults = DEFAULT_IMPORTANT_WORKS_FILTER;

  if (filter.globalThreshold !== defaults.globalThreshold) return true;
  if (filter.perTypeEnabled !== defaults.perTypeEnabled) return true;

  const defaultTypesSet = new Set(defaults.enabledTypes);
  const currentTypesSet = new Set(filter.enabledTypes);
  if (defaultTypesSet.size !== currentTypesSet.size) return true;
  for (const type of defaultTypesSet) {
    if (!currentTypesSet.has(type)) return true;
  }

  if (filter.perTypeEnabled) {
    const hasCustomThresholds = Object.keys(filter.perTypeThresholds).length > 0;
    if (hasCustomThresholds) return true;
  }

  return false;
}

/**
 * Calculate optimal popover position to stay within viewport
 */
function calculatePosition(triggerRect: DOMRect): PopoverPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let top: number;
  let left: number;

  // Horizontal positioning: prefer right-aligned to trigger, but stay in viewport
  const rightAlignedLeft = triggerRect.right - POPOVER_WIDTH;
  const leftAlignedLeft = triggerRect.left;

  if (rightAlignedLeft >= MARGIN) {
    // Right-aligned fits
    left = rightAlignedLeft;
  } else if (leftAlignedLeft + POPOVER_WIDTH <= viewportWidth - MARGIN) {
    // Left-aligned fits
    left = leftAlignedLeft;
  } else {
    // Center in viewport as fallback
    left = Math.max(MARGIN, (viewportWidth - POPOVER_WIDTH) / 2);
  }

  // Vertical positioning: prefer below trigger, but go above if needed
  const spaceBelow = viewportHeight - triggerRect.bottom - MARGIN;
  const spaceAbove = triggerRect.top - MARGIN;

  if (spaceBelow >= POPOVER_HEIGHT) {
    // Fits below
    top = triggerRect.bottom + MARGIN;
  } else if (spaceAbove >= POPOVER_HEIGHT) {
    // Fits above
    top = triggerRect.top - POPOVER_HEIGHT - MARGIN;
  } else {
    // Not enough space either way - position to maximize visible area
    if (spaceBelow > spaceAbove) {
      top = triggerRect.bottom + MARGIN;
    } else {
      top = Math.max(MARGIN, triggerRect.top - POPOVER_HEIGHT - MARGIN);
    }
  }

  // Final bounds check
  top = Math.max(MARGIN, Math.min(top, viewportHeight - POPOVER_HEIGHT - MARGIN));
  left = Math.max(MARGIN, Math.min(left, viewportWidth - POPOVER_WIDTH - MARGIN));

  return { top, left };
}

export function ImportantWorksFilter({
  filter,
  onFilterChange,
}: ImportantWorksFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0 });

  // Local state for threshold input to allow clearing while typing
  const [thresholdInput, setThresholdInput] = useState(String(filter.globalThreshold));

  const isActive = useMemo(() => isFilterActive(filter), [filter]);

  // All available task type values
  const allTypeValues = useMemo(() => TASK_TYPES.map((t) => t.value), []);

  // Calculate position when opening
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPosition(calculatePosition(rect));
      }
    };

    updatePosition();

    // Recalculate on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    // Use setTimeout to avoid immediate close from the click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Sync local threshold input with filter prop when it changes externally
  useEffect(() => {
    setThresholdInput(String(filter.globalThreshold));
  }, [filter.globalThreshold]);

  const handleThresholdInputChange = useCallback(
    (value: string) => {
      // Allow any input while typing (including empty)
      setThresholdInput(value);

      // If valid, update the filter immediately
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
        onFilterChange({ ...filter, globalThreshold: numValue });
      }
    },
    [filter, onFilterChange]
  );

  const handleThresholdBlur = useCallback(() => {
    // On blur, validate and reset to last valid value if invalid
    const numValue = parseInt(thresholdInput, 10);
    if (isNaN(numValue) || numValue < 0 || numValue > 100 || thresholdInput === '') {
      // Reset to current filter value
      setThresholdInput(String(filter.globalThreshold));
    }
  }, [thresholdInput, filter.globalThreshold]);

  const handleTypeToggle = useCallback(
    (type: string) => {
      const enabledSet = new Set(filter.enabledTypes);
      if (enabledSet.has(type)) {
        enabledSet.delete(type);
      } else {
        enabledSet.add(type);
      }
      onFilterChange({
        ...filter,
        enabledTypes: Array.from(enabledSet),
      });
    },
    [filter, onFilterChange]
  );

  const handlePerTypeToggle = useCallback(() => {
    onFilterChange({ ...filter, perTypeEnabled: !filter.perTypeEnabled });
  }, [filter, onFilterChange]);

  const handlePerTypeThresholdChange = useCallback(
    (type: string, value: string) => {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue < 0 || numValue > 100) return;
      onFilterChange({
        ...filter,
        perTypeThresholds: { ...filter.perTypeThresholds, [type]: numValue },
      });
    },
    [filter, onFilterChange]
  );

  const handleReset = useCallback(() => {
    // Reset with all types enabled
    onFilterChange({
      ...DEFAULT_IMPORTANT_WORKS_FILTER,
      enabledTypes: allTypeValues,
    });
  }, [onFilterChange, allTypeValues]);

  const handleSelectAll = useCallback(() => {
    onFilterChange({
      ...filter,
      enabledTypes: [...allTypeValues],
    });
  }, [filter, onFilterChange, allTypeValues]);

  const handleSelectNone = useCallback(() => {
    onFilterChange({
      ...filter,
      enabledTypes: [],
    });
  }, [filter, onFilterChange]);

  const getThresholdForType = useCallback(
    (type: string): number => {
      if (filter.perTypeEnabled && filter.perTypeThresholds[type] !== undefined) {
        return filter.perTypeThresholds[type];
      }
      return filter.globalThreshold;
    },
    [filter]
  );

  const enabledCount = filter.enabledTypes.filter((t) =>
    allTypeValues.includes(t)
  ).length;
  const totalCount = TASK_TYPES.length;

  const popoverContent = (
    <div
      ref={popoverRef}
      style={{
        ...styles.popover,
        top: position.top,
        left: position.left,
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Filter Important Works</span>
        <button
          style={styles.resetButton}
          onClick={handleReset}
          title="Reset to defaults"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Threshold Row */}
        <div style={styles.thresholdRow}>
          <span style={styles.thresholdLabel}>Min weight</span>
          <div style={styles.thresholdInputGroup}>
            <input
              type="number"
              min={0}
              max={100}
              value={thresholdInput}
              onChange={(e) => handleThresholdInputChange(e.target.value)}
              onBlur={handleThresholdBlur}
              style={{
                ...styles.thresholdInput,
                opacity: filter.perTypeEnabled ? 0.5 : 1,
              }}
              disabled={filter.perTypeEnabled}
            />
            <span style={styles.percentSign}>%</span>
          </div>
        </div>

        {/* Task Types List */}
        <div style={styles.typesSection}>
          <div style={styles.typesHeader}>
            <span style={styles.label}>
              Types ({enabledCount}/{totalCount})
            </span>
            <div style={styles.selectButtons}>
              <button style={styles.selectButton} onClick={handleSelectAll}>
                All
              </button>
              <button style={styles.selectButton} onClick={handleSelectNone}>
                None
              </button>
            </div>
          </div>
          <div style={styles.typeListScroll}>
            {TASK_TYPES.map((taskType) => {
              const isEnabled = filter.enabledTypes.includes(taskType.value);
              return (
                <button
                  key={taskType.value}
                  style={{
                    ...styles.typeRow,
                    ...(isEnabled ? styles.typeRowActive : styles.typeRowInactive),
                  }}
                  onClick={() => handleTypeToggle(taskType.value)}
                  aria-pressed={isEnabled}
                >
                  <div
                    style={{
                      ...styles.checkbox,
                      ...(isEnabled ? styles.checkboxChecked : {}),
                    }}
                  >
                    {isEnabled && <Check size={12} color="white" />}
                  </div>
                  <span style={styles.typeLabel}>{taskType.label}</span>
                  {filter.perTypeEnabled && (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={getThresholdForType(taskType.value)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handlePerTypeThresholdChange(taskType.value, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        ...styles.rowThresholdInput,
                        opacity: isEnabled ? 1 : 0.4,
                      }}
                      disabled={!isEnabled}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Per-type toggle */}
        <label style={styles.toggleRow}>
          <input
            type="checkbox"
            checked={filter.perTypeEnabled}
            onChange={handlePerTypeToggle}
            style={styles.toggleCheckbox}
          />
          <span style={styles.toggleLabel}>Set threshold per type</span>
        </label>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        style={{
          ...styles.filterButton,
          ...(isActive ? styles.filterButtonActive : {}),
        }}
        onClick={() => setIsOpen(!isOpen)}
        title="Filter Important Works"
        aria-label="Filter Important Works"
        aria-expanded={isOpen}
      >
        <SlidersHorizontal size={14} />
        {isActive && <span style={styles.activeIndicator} />}
      </button>

      {isOpen && createPortal(popoverContent, document.body)}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filterButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '28px',
    height: '28px',
    padding: 0,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  filterButtonActive: {
    color: 'var(--color-navy)',
    backgroundColor: 'var(--color-navy-50)',
  },

  activeIndicator: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-navy)',
  },

  popover: {
    position: 'fixed',
    width: `${POPOVER_WIDTH}px`,
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-xl, 12px)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)',
    zIndex: 10000,
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-light)',
    backgroundColor: 'var(--bg-app)',
  },

  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },

  resetButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: 'none',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },

  content: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },

  thresholdRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  thresholdLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },

  thresholdInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },

  thresholdInput: {
    width: '60px',
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
    textAlign: 'center',
  },

  percentSign: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },

  typesSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
    minHeight: 0,
  },

  typesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },

  selectButtons: {
    display: 'flex',
    gap: '8px',
  },

  selectButton: {
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },

  typeListScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '240px',
    overflowY: 'auto',
    overflowX: 'hidden',
    marginRight: '-12px',
    paddingRight: '12px',
  },

  typeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
    textAlign: 'left',
    backgroundColor: 'transparent',
    width: '100%',
  },

  typeRowActive: {
    color: 'var(--text-primary)',
  },

  typeRowInactive: {
    color: 'var(--text-secondary)',
  },

  checkbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '2px solid var(--border-default)',
    backgroundColor: 'transparent',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },

  checkboxChecked: {
    backgroundColor: 'var(--color-navy)',
    borderColor: 'var(--color-navy)',
  },

  typeLabel: {
    flex: 1,
    fontWeight: 500,
  },

  rowThresholdInput: {
    width: '50px',
    padding: '4px 8px',
    fontSize: '13px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-input)',
    color: 'var(--text-primary)',
    textAlign: 'center',
    flexShrink: 0,
  },

  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    paddingTop: '16px',
    borderTop: '1px solid var(--border-light)',
  },

  toggleCheckbox: {
    width: '18px',
    height: '18px',
    accentColor: 'var(--color-navy)',
    cursor: 'pointer',
  },

  toggleLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
};

export default ImportantWorksFilter;
