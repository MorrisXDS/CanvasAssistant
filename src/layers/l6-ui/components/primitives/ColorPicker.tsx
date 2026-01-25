/**
 * ColorPicker - Centralized color selection component
 *
 * A reusable color picker with preset colors, custom hex input, and native color palette.
 * Used for course colors, calendar colors, and other color selections.
 *
 * Features:
 * - Preset color swatches for quick selection
 * - Custom hex color input with validation
 * - Native system color picker for full color palette access
 * - Visual preview of selected color
 *
 * Usage:
 * import { ColorPicker } from '@/layers/l6-ui/components/primitives';
 *
 * <ColorPicker
 *   value={selectedColor}
 *   onChange={setSelectedColor}
 *   presets={COURSE_COLORS}
 * />
 */

import React, { useState, useRef, useEffect, CSSProperties } from 'react';
import { Check, Pipette, Palette } from 'lucide-react';
import { COURSE_COLORS, getContrastTextColor } from '../../constants/colors';

export interface ColorPickerProps {
  /** Currently selected color */
  value: string;
  /** Callback when color changes */
  onChange: (color: string) => void;
  /** Preset colors to show (defaults to COURSE_COLORS) */
  presets?: readonly string[];
  /** Whether to show the native color picker for custom colors */
  allowCustom?: boolean;
  /** Size of color swatches */
  swatchSize?: number;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Show a compact version without labels */
  compact?: boolean;
  /** Additional class name */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
}

/**
 * Validate hex color format
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Normalize hex color to uppercase
 */
function normalizeHex(color: string): string {
  return color.toUpperCase();
}

/**
 * Inline color picker showing preset swatches with custom color support
 */
export function ColorPicker({
  value,
  onChange,
  presets = COURSE_COLORS,
  allowCustom = true,
  swatchSize = 24,
  disabled = false,
  compact = false,
  className,
  style,
}: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);
  const [hexError, setHexError] = useState(false);
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const [isPickerHovered, setIsPickerHovered] = useState(false);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const styles = getStyles(swatchSize, compact);

  // Sync hex input with value prop
  useEffect(() => {
    setHexInput(value);
    setHexError(false);
  }, [value]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;

    // Auto-add # if missing
    if (newValue && !newValue.startsWith('#')) {
      newValue = '#' + newValue;
    }

    // Only allow valid hex characters
    if (/^#?[0-9A-Fa-f]{0,6}$/.test(newValue.replace('#', ''))) {
      setHexInput(newValue);

      // Only call onChange if it's a complete valid hex
      if (isValidHexColor(newValue)) {
        setHexError(false);
        onChange(normalizeHex(newValue));
      } else {
        setHexError(newValue.length > 1); // Show error only if user has typed something
      }
    }
  };

  const handleHexBlur = () => {
    // On blur, if invalid, revert to current value
    if (!isValidHexColor(hexInput)) {
      setHexInput(value);
      setHexError(false);
    }
  };

  const openNativePicker = () => {
    nativeInputRef.current?.click();
  };

  const isCustomColor = !presets.includes(value as (typeof presets)[number]);

  return (
    <div
      className={className}
      style={{ ...styles.container, ...style, opacity: disabled ? 0.5 : 1 }}
    >
      {/* Preset Colors Section */}
      {!compact && <div style={styles.sectionLabel}>Preset Colors</div>}
      <div style={styles.swatchGrid}>
        {presets.map((color) => (
          <button
            key={color}
            type="button"
            disabled={disabled}
            onClick={() => onChange(color)}
            style={{
              ...styles.swatch,
              backgroundColor: color,
              borderColor: value === color ? 'white' : 'transparent',
              boxShadow: value === color ? `0 0 0 2px ${color}` : 'none',
            }}
            title={color}
            aria-label={`Select color ${color}`}
          >
            {value === color && (
              <Check size={14} color={getContrastTextColor(color)} strokeWidth={3} />
            )}
          </button>
        ))}
      </div>

      {allowCustom && (
        <>
          {/* Custom Color Section */}
          {!compact && <div style={styles.sectionLabel}>Custom Color</div>}
          <div style={styles.customSection}>
            {/* Large clickable color preview that opens native picker */}
            <button
              type="button"
              onClick={openNativePicker}
              onMouseEnter={() => setIsPreviewHovered(true)}
              onMouseLeave={() => setIsPreviewHovered(false)}
              disabled={disabled}
              style={{
                ...styles.largePreview,
                backgroundColor: value,
                borderColor: isPreviewHovered ? 'var(--color-blue)' : 'var(--border-default)',
                transform: isPreviewHovered ? 'scale(1.02)' : 'scale(1)',
              }}
              title="Click to open color palette"
              aria-label="Open color palette"
            >
              <div style={{
                ...styles.previewOverlay,
                opacity: isPreviewHovered ? 1 : 0,
              }}>
                <Palette size={20} color={getContrastTextColor(value)} />
              </div>
              {isCustomColor && (
                <div style={styles.customBadge}>
                  <Check size={12} color="white" strokeWidth={3} />
                </div>
              )}
            </button>

            {/* Hex input and native picker */}
            <div style={styles.inputColumn}>
              <div style={styles.hexInputRow}>
                <input
                  type="text"
                  value={hexInput}
                  onChange={handleHexChange}
                  onBlur={handleHexBlur}
                  disabled={disabled}
                  style={{
                    ...styles.hexInput,
                    borderColor: hexError ? 'var(--color-error)' : 'var(--border-default)',
                  }}
                  placeholder="#000000"
                  maxLength={7}
                  aria-label="Hex color code"
                />
                <button
                  type="button"
                  onClick={openNativePicker}
                  onMouseEnter={() => setIsPickerHovered(true)}
                  onMouseLeave={() => setIsPickerHovered(false)}
                  disabled={disabled}
                  style={{
                    ...styles.pickerButton,
                    backgroundColor: isPickerHovered ? 'var(--bg-hover)' : 'var(--bg-input)',
                    color: isPickerHovered ? 'var(--color-blue)' : 'var(--text-secondary)',
                  }}
                  title="Open color palette"
                  aria-label="Open color palette"
                >
                  <Pipette size={16} />
                </button>
              </div>
              {!compact && (
                <div style={styles.hexHint}>
                  Enter hex code or click <Palette size={12} style={{ verticalAlign: 'middle' }} /> to pick
                </div>
              )}
            </div>

            {/* Hidden native color input */}
            <input
              ref={nativeInputRef}
              type="color"
              value={isValidHexColor(value) ? value : '#000000'}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              disabled={disabled}
              style={styles.nativeInput}
              aria-hidden="true"
            />
          </div>
        </>
      )}
    </div>
  );
}

export interface ColorPickerPopupProps extends ColorPickerProps {
  /** Whether the popup is visible */
  isOpen: boolean;
  /** Callback to close the popup */
  onClose: () => void;
  /** Position relative to trigger */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
}

/**
 * Popup version of color picker with click-outside handling
 */
export function ColorPickerPopup({
  isOpen,
  onClose,
  position = 'bottom-left',
  ...pickerProps
}: ColorPickerPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const positionStyles = getPositionStyles(position);

  return (
    <div ref={popupRef} style={{ ...popupStyles.popup, ...positionStyles }}>
      <ColorPicker {...pickerProps} />
    </div>
  );
}

export interface ColorSwatchProps {
  /** Color to display */
  color: string;
  /** Size of the swatch */
  size?: number;
  /** Whether the swatch is selected */
  selected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional inline styles */
  style?: CSSProperties;
}

/**
 * Single color swatch button
 */
export function ColorSwatch({
  color,
  size = 24,
  selected = false,
  onClick,
  style,
}: ColorSwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        border: `2px solid ${selected ? 'white' : 'transparent'}`,
        boxShadow: selected ? `0 0 0 2px ${color}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        ...style,
      }}
      title={color}
      aria-label={`Color ${color}${selected ? ' (selected)' : ''}`}
    >
      {selected && (
        <Check size={size * 0.6} color={getContrastTextColor(color)} strokeWidth={3} />
      )}
    </button>
  );
}

// Styles
function getStyles(swatchSize: number, compact: boolean) {
  return {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: compact ? '8px' : '12px',
    },
    sectionLabel: {
      fontSize: '11px',
      fontWeight: 600,
      color: 'var(--text-muted)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      marginBottom: '-4px',
    },
    swatchGrid: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '6px',
    },
    swatch: {
      width: swatchSize,
      height: swatchSize,
      borderRadius: '50%',
      border: '2px solid transparent',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      transition: 'transform 0.1s ease, box-shadow 0.1s ease',
    },
    customSection: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      paddingTop: compact ? '8px' : '12px',
      borderTop: '1px solid var(--border-default)',
    },
    largePreview: {
      width: compact ? 48 : 64,
      height: compact ? 48 : 64,
      borderRadius: '8px',
      border: '2px solid var(--border-default)',
      cursor: 'pointer',
      position: 'relative' as const,
      overflow: 'hidden',
      flexShrink: 0,
      padding: 0,
      transition: 'border-color 0.15s ease, transform 0.1s ease',
    },
    previewOverlay: {
      position: 'absolute' as const,
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
      opacity: 0,
      transition: 'opacity 0.15s ease',
    },
    customBadge: {
      position: 'absolute' as const,
      bottom: 2,
      right: 2,
      width: 16,
      height: 16,
      borderRadius: '50%',
      backgroundColor: 'var(--color-success)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputColumn: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '4px',
      flex: 1,
      minWidth: 0,
    },
    hexInputRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    hexInput: {
      flex: 1,
      padding: '8px 10px',
      fontSize: '13px',
      fontFamily: 'monospace',
      border: '1px solid var(--border-default)',
      borderRadius: '6px',
      backgroundColor: 'var(--bg-input)',
      color: 'var(--text-primary)',
      minWidth: 0,
      transition: 'border-color 0.15s ease',
    },
    pickerButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 36,
      borderRadius: '6px',
      border: '1px solid var(--border-default)',
      backgroundColor: 'var(--bg-input)',
      cursor: 'pointer',
      color: 'var(--text-secondary)',
      padding: 0,
      flexShrink: 0,
      transition: 'background-color 0.15s ease, color 0.15s ease',
    },
    hexHint: {
      fontSize: '11px',
      color: 'var(--text-muted)',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    nativeInput: {
      position: 'absolute' as const,
      width: 0,
      height: 0,
      opacity: 0,
      pointerEvents: 'none' as const,
    },
  };
}

const popupStyles: Record<string, CSSProperties> = {
  popup: {
    position: 'absolute',
    zIndex: 1000,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: '200px',
  },
};

function getPositionStyles(position: string): CSSProperties {
  switch (position) {
    case 'bottom-right':
      return { top: '100%', right: 0, marginTop: '4px' };
    case 'top-left':
      return { bottom: '100%', left: 0, marginBottom: '4px' };
    case 'top-right':
      return { bottom: '100%', right: 0, marginBottom: '4px' };
    case 'bottom-left':
    default:
      return { top: '100%', left: 0, marginTop: '4px' };
  }
}
