/**
 * SyncUpdatesFAB - Floating Action Button for Sync Updates
 *
 * A persistent floating button that shows the count of unseen sync updates.
 * Features:
 * - Appears only when there are unseen updates (hidden on /updates page)
 * - Shows separate counts for action-required vs informational
 * - Perfect circle with eye-catching design
 * - Draggable with position persistence
 * - Configurable opacity (30-100%)
 * - Auto-hides at window edges, slides out on hover
 * - Click navigates to /updates page
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, AlertTriangle } from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import {
  STORAGE_KEYS,
  DEFAULT_SYNC_UPDATES_FAB_SETTINGS,
  type SyncUpdatesFabSettings,
  settingsManager,
} from '../../../l5-presentation/settings';

// FAB dimensions - larger for better visibility
const FAB_SIZE = 56;
const DEFAULT_MARGIN = 24;

// Drag threshold (pixels) - movement less than this is considered a click
const DRAG_THRESHOLD = 5;

// Hold duration (ms) before drag starts
const HOLD_DURATION = 150;

// Edge detection threshold - if within this many pixels of edge, auto-hide
const EDGE_THRESHOLD = 20;

// How much of the FAB to show when hidden at edge
const VISIBLE_SLIVER = 28;

export interface SyncUpdatesFABProps {
  /** Optional class name for styling */
  className?: string;
}

/**
 * Hook for FAB settings (position and opacity)
 * Wrapped in try-catch to prevent initialization errors from breaking hooks
 */
function useFabSettings(): [
  SyncUpdatesFabSettings,
  (settings: SyncUpdatesFabSettings) => void,
] {
  const [settings, setSettingsState] = useState<SyncUpdatesFabSettings>(() => {
    try {
      const stored = settingsManager.get(STORAGE_KEYS.SYNC_UPDATES_FAB) as
        | SyncUpdatesFabSettings
        | undefined;
      if (stored?.position) {
        // Migrate old absolute pixel values to ratios (0-1)
        if (stored.position.x > 1 || stored.position.y > 1) {
          const maxX = window.innerWidth - FAB_SIZE;
          const maxY = window.innerHeight - FAB_SIZE;
          const migrated: SyncUpdatesFabSettings = {
            ...stored,
            position: {
              x: maxX > 0 ? Math.max(0, Math.min(1, stored.position.x / maxX)) : 0,
              y: maxY > 0 ? Math.max(0, Math.min(1, stored.position.y / maxY)) : 1,
            },
          };
          settingsManager.set(STORAGE_KEYS.SYNC_UPDATES_FAB, migrated);
          return migrated;
        }
      }
      return stored ?? DEFAULT_SYNC_UPDATES_FAB_SETTINGS;
    } catch {
      return DEFAULT_SYNC_UPDATES_FAB_SETTINGS;
    }
  });

  const setSettings = useCallback((newSettings: SyncUpdatesFabSettings) => {
    try {
      settingsManager.set(STORAGE_KEYS.SYNC_UPDATES_FAB, newSettings);
      setSettingsState(newSettings);
    } catch {
      // Silently fail if settings can't be saved
    }
  }, []);

  return [settings, setSettings];
}

export function SyncUpdatesFAB({ className = '' }: SyncUpdatesFABProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const syncUpdates = useStore((state) => state.syncUpdates);
  const { totalUnseen, conflictCount, actionRequiredCount, informationalCount } =
    syncUpdates;

  // Settings
  const [settings, setSettings] = useFabSettings();

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; startTime: number } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const hasDraggedRef = useRef(false);

  // Hover state for edge auto-hide
  const [isHovered, setIsHovered] = useState(false);

  // Re-render on window resize so ratio→pixel conversion stays current
  const [, setResizeTick] = useState(0);
  useEffect(() => {
    const handleResize = () => setResizeTick((t) => t + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Convert stored ratio (0-1) to pixel position
  const ratioToPixels = useCallback((rx: number, ry: number) => {
    const maxX = window.innerWidth - FAB_SIZE;
    const maxY = window.innerHeight - FAB_SIZE;
    return {
      x: Math.max(8, Math.min(maxX - 8, rx * maxX)),
      y: Math.max(8, Math.min(maxY - 8, ry * maxY)),
    };
  }, []);

  // Convert pixel position to ratio (0-1) for storage
  const pixelsToRatio = useCallback((px: number, py: number) => {
    const maxX = window.innerWidth - FAB_SIZE;
    const maxY = window.innerHeight - FAB_SIZE;
    return {
      x: maxX > 0 ? Math.max(0, Math.min(1, px / maxX)) : 0,
      y: maxY > 0 ? Math.max(0, Math.min(1, py / maxY)) : 1,
    };
  }, []);

  // Calculate default position (bottom-left)
  const getDefaultPosition = useCallback(() => {
    return {
      x: DEFAULT_MARGIN,
      y: window.innerHeight - FAB_SIZE - DEFAULT_MARGIN,
    };
  }, []);

  // Clamp position to viewport bounds (used during drag)
  const clampPosition = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - FAB_SIZE - 8;
    const maxY = window.innerHeight - FAB_SIZE - 8;
    return {
      x: Math.max(8, Math.min(x, maxX)),
      y: Math.max(8, Math.min(y, maxY)),
    };
  }, []);

  // Get current position: convert stored ratios to pixels, or use default
  const position = settings.position
    ? ratioToPixels(settings.position.x, settings.position.y)
    : getDefaultPosition();
  const currentPos = dragPos ?? position;

  // Detect which edges the FAB is near and calculate hide transform
  const getEdgeState = useCallback((pos: { x: number; y: number }) => {
    const isNearLeft = pos.x <= EDGE_THRESHOLD;
    const isNearRight = pos.x >= window.innerWidth - FAB_SIZE - EDGE_THRESHOLD;
    const isNearTop = pos.y <= EDGE_THRESHOLD;
    const isNearBottom = pos.y >= window.innerHeight - FAB_SIZE - EDGE_THRESHOLD;

    // Calculate how much to hide (FAB_SIZE - VISIBLE_SLIVER)
    const hideAmount = FAB_SIZE - VISIBLE_SLIVER;

    let translateX = 0;
    let translateY = 0;

    // Prioritize horizontal edges (left/right) for corner cases
    if (isNearLeft) {
      translateX = -hideAmount;
    } else if (isNearRight) {
      translateX = hideAmount;
    }

    if (isNearTop) {
      translateY = -hideAmount;
    } else if (isNearBottom) {
      translateY = hideAmount;
    }

    const isAtEdge = isNearLeft || isNearRight || isNearTop || isNearBottom;

    return { isAtEdge, translateX, translateY };
  }, []);

  // Handle mouse/touch down - start potential drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click

    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startTime: Date.now(),
    };
    hasDraggedRef.current = false;

    // Capture pointer for drag
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  // Handle pointer move during drag
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const holdTime = Date.now() - dragStartRef.current.startTime;

      // Start dragging if moved past threshold or held long enough
      if (distance > DRAG_THRESHOLD || holdTime > HOLD_DURATION) {
        if (!isDragging) {
          setIsDragging(true);
        }
        hasDraggedRef.current = true;

        // Center the FAB on the cursor for precise positioning
        const halfSize = FAB_SIZE / 2;
        const newPos = clampPosition(e.clientX - halfSize, e.clientY - halfSize);
        setDragPos(newPos);
      }
    },
    [isDragging, clampPosition]
  );

  // Handle pointer up - end drag or click
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      if (isDragging && dragPos) {
        // Save position as ratio for window-size-independent storage
        setSettings({
          ...settings,
          position: pixelsToRatio(dragPos.x, dragPos.y),
        });
      }

      // Reset drag state
      setIsDragging(false);
      setDragPos(null);

      // If we didn't drag, treat as a click
      if (!hasDraggedRef.current) {
        navigate('/updates');
      }

      dragStartRef.current = null;
    },
    [isDragging, dragPos, settings, setSettings, navigate, pixelsToRatio]
  );

  // Handle hover for edge auto-show (MUST be before any early return)
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Check if we should render
  const isOnUpdatesPage = location.pathname === '/updates';
  const shouldRender = totalUnseen > 0 && !isOnUpdatesPage;

  // Early return AFTER all hooks are called
  if (!shouldRender) {
    return null;
  }

  // Determine counts - conflicts are also action-required
  const totalActionRequired = actionRequiredCount + conflictCount;
  const hasActionRequired = totalActionRequired > 0;
  const infoCount = informationalCount;

  // Calculate opacity (100% when hovering or dragging)
  const baseOpacity = settings.opacity ?? 0.85;

  // Calculate edge state for auto-hide
  const edgeState = getEdgeState(currentPos);
  const shouldHide = edgeState.isAtEdge && !isHovered && !isDragging;

  // Calculate transform - combine scale and edge hiding
  const getTransform = () => {
    if (isDragging) return 'scale(1)';
    if (shouldHide) {
      return `translate(${edgeState.translateX}px, ${edgeState.translateY}px) scale(1)`;
    }
    return 'scale(1)';
  };

  // Calculate wrapper style that expands to cover translated area for proper hover detection
  const getWrapperStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 1000,
    };

    if (shouldHide) {
      // When hidden, the wrapper needs to cover both the original position
      // AND the translated (visible sliver) position
      const offsetX = edgeState.translateX;
      const offsetY = edgeState.translateY;

      // Calculate wrapper position and size to cover entire area
      style.left = `${currentPos.x + Math.min(0, offsetX)}px`;
      style.top = `${currentPos.y + Math.min(0, offsetY)}px`;
      style.width = `${FAB_SIZE + Math.abs(offsetX)}px`;
      style.height = `${FAB_SIZE + Math.abs(offsetY)}px`;
    } else {
      style.left = `${currentPos.x}px`;
      style.top = `${currentPos.y}px`;
      style.width = `${FAB_SIZE}px`;
      style.height = `${FAB_SIZE}px`;
    }

    return style;
  };

  // Calculate button position within wrapper
  const getButtonOffset = (): React.CSSProperties => {
    if (!shouldHide) return {};

    const offsetX = edgeState.translateX;
    const offsetY = edgeState.translateY;

    return {
      position: 'absolute' as const,
      left: offsetX < 0 ? Math.abs(offsetX) : 0,
      top: offsetY < 0 ? Math.abs(offsetY) : 0,
    };
  };

  const buttonOffset = getButtonOffset();

  const fabStyle: React.CSSProperties = {
    ...buttonOffset,
    width: `${FAB_SIZE}px`,
    height: `${FAB_SIZE}px`,
    borderRadius: '50%',
    border: hasActionRequired
      ? '3px solid var(--color-warning)'
      : '2px solid rgba(0, 0, 0, 0.15)',
    backgroundColor: '#3b82f6', // Fixed blue color for visibility in all themes
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1px',
    cursor: isDragging ? 'grabbing' : 'pointer',
    boxShadow: hasActionRequired
      ? '0 4px 16px rgba(251, 191, 36, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.1)'
      : '0 4px 16px rgba(59, 130, 246, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.1)',
    transition: isDragging
      ? 'none'
      : 'opacity 0.2s ease, box-shadow 0.2s ease, transform 0.25s ease',
    opacity: isDragging ? 0.95 : shouldHide ? 0.9 : baseOpacity,
    userSelect: 'none',
    touchAction: 'none',
    outline: 'none',
    transform: getTransform(),
  };

  const countStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  };

  const actionCountStyle: React.CSSProperties = {
    ...countStyle,
    color: 'var(--color-warning)',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  };

  const infoCountStyle: React.CSSProperties = {
    ...countStyle,
    fontSize: '10px',
    opacity: 0.9,
  };

  const fab = (
    <div
      style={getWrapperStyle()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* FAB button */}
      <button
        ref={fabRef}
        className={`sync-updates-fab ${className}`.trim()}
        style={fabStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={`${totalUnseen} sync update${totalUnseen !== 1 ? 's' : ''} available`}
      >
        {/* Action required count (top) - includes conflicts */}
        {hasActionRequired && (
          <span style={actionCountStyle}>
            <AlertTriangle size={10} />
            {totalActionRequired}
          </span>
        )}

        {/* Informational count or total */}
        {hasActionRequired ? (
          infoCount > 0 && <span style={infoCountStyle}>+{infoCount}</span>
        ) : (
          <span style={countStyle}>{totalUnseen > 99 ? '99+' : totalUnseen}</span>
        )}

        {/* Bell icon */}
        <Bell size={hasActionRequired ? 14 : 18} />
      </button>
    </div>
  );

  // Render via portal to ensure it's above all content
  return createPortal(fab, document.body);
}

// Add CSS for hover effect and animations
const styleElement = document.createElement('style');
styleElement.textContent = `
  .sync-updates-fab:hover {
    opacity: 1 !important;
    transform: translate(0, 0) scale(1.05) !important;
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5), 0 3px 10px rgba(0, 0, 0, 0.2) !important;
  }

  .sync-updates-fab:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
`;
if (!document.getElementById('sync-updates-fab-styles')) {
  styleElement.id = 'sync-updates-fab-styles';
  document.head.appendChild(styleElement);
}

export default SyncUpdatesFAB;
