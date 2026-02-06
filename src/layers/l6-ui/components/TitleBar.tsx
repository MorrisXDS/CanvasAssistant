/**
 * TitleBar Component
 * Custom title bar for frameless window
 *
 * macOS: Native traffic light buttons via titleBarStyle:'hidden' — no custom controls rendered.
 * Windows/Linux: Fully custom min/max/close buttons (Windows-native style).
 */

import React from 'react';
import { Minus, Square, X } from 'lucide-react';

const isMac = window.api?.platform === 'darwin';
const MAC_TRAFFIC_LIGHT_WIDTH = 70; // px clearance for native close/minimize/fullscreen buttons

interface TitleBarProps {
  sidebarWidth?: number;
  onSidebarToggle?: () => void;
}

export function TitleBar({ sidebarWidth = 220, onSidebarToggle }: TitleBarProps) {
  const handleMinimize = () => window.api.windowMinimize();
  const handleMaximize = () => window.api.windowMaximize();
  const handleClose = () => window.api.windowClose();

  const [hovered, setHovered] = React.useState<string | null>(null);

  return (
    <div style={styles.titleBar}>
      {/* Empty drag region over sidebar area - width synced with sidebar, double-click to toggle */}
      <div
        style={{
          ...styles.sidebarSpacer,
          width: `${sidebarWidth}px`,
          ...(isMac ? { paddingLeft: `${MAC_TRAFFIC_LIGHT_WIDTH}px` } : {}),
        }}
        onDoubleClick={onSidebarToggle}
      />
      {/* Main drag region */}
      <div style={styles.dragRegion} />
      {!isMac && (
        <div style={styles.controls}>
          <button
            style={{
              ...styles.controlButton,
              backgroundColor: hovered === 'min' ? 'rgba(0,0,0,0.05)' : 'transparent',
            }}
            onClick={handleMinimize}
            onMouseEnter={() => setHovered('min')}
            onMouseLeave={() => setHovered(null)}
            aria-label="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            style={{
              ...styles.controlButton,
              backgroundColor: hovered === 'max' ? 'rgba(0,0,0,0.05)' : 'transparent',
            }}
            onClick={handleMaximize}
            onMouseEnter={() => setHovered('max')}
            onMouseLeave={() => setHovered(null)}
            aria-label="Maximize"
          >
            <Square size={14} />
          </button>
          <button
            style={{
              ...styles.controlButton,
              backgroundColor: hovered === 'close' ? '#e81123' : 'transparent',
              color: hovered === 'close' ? '#fff' : 'var(--text-secondary)',
            }}
            onClick={handleClose}
            onMouseEnter={() => setHovered('close')}
            onMouseLeave={() => setHovered(null)}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    height: '32px',
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },

  sidebarSpacer: {
    height: '100%',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-default)',
    transition: 'width 250ms cubic-bezier(0.33, 1, 0.68, 1)',
    // @ts-expect-error - webkit property for electron
    WebkitAppRegion: 'drag',
  },

  dragRegion: {
    flex: 1,
    height: '100%',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-default)',
    // @ts-expect-error - webkit property for electron
    WebkitAppRegion: 'drag',
    WebkitUserSelect: 'none',
  },

  controls: {
    display: 'flex',
    height: '100%',
    backgroundColor: 'var(--bg-app)',
    borderBottom: '1px solid var(--border-default)',
    // @ts-expect-error - webkit property for electron
    WebkitAppRegion: 'no-drag',
  },

  controlButton: {
    width: '46px',
    height: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
};

export default TitleBar;
