/**
 * SettingRow - Individual setting display component
 *
 * A consistent row component for displaying individual settings with
 * label, description, control, tooltip, and change indicator.
 *
 * @example
 * <SettingRow
 *   label="Auto-sync"
 *   description="Automatically sync data in the background"
 *   isModified={true}
 * >
 *   <Toggle checked={enabled} onChange={setEnabled} />
 * </SettingRow>
 */

import React, { useState } from 'react';
import { Info, RotateCcw } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface SettingRowProps {
  /** Setting label */
  label: string;
  /** Optional description */
  description?: string;
  /** Tooltip help text */
  tooltip?: string;
  /** Control element (toggle, select, input, etc.) */
  children: React.ReactNode;
  /** Whether the setting differs from default */
  isModified?: boolean;
  /** Callback to reset to default */
  onReset?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Additional styles for the row */
  style?: React.CSSProperties;
  /** Vertical layout (control below label) */
  vertical?: boolean;
}

// =============================================================================
// SETTING ROW COMPONENT
// =============================================================================

export function SettingRow({
  label,
  description,
  tooltip,
  children,
  isModified = false,
  onReset,
  disabled = false,
  style,
  vertical = false,
}: SettingRowProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      style={{
        ...styles.row,
        ...(vertical ? styles.rowVertical : {}),
        ...(disabled ? styles.rowDisabled : {}),
        ...style,
      }}
    >
      <div style={styles.labelSection}>
        <div style={styles.labelRow}>
          <span style={styles.label}>{label}</span>
          {isModified && (
            <span style={styles.modifiedDot} title="Modified from default" />
          )}
          {tooltip && (
            <div
              style={styles.tooltipWrapper}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <Info size={14} style={styles.tooltipIcon} />
              {showTooltip && <div style={styles.tooltip}>{tooltip}</div>}
            </div>
          )}
          {isModified && onReset && (
            <button
              onClick={onReset}
              style={styles.resetButton}
              title="Reset to default"
              aria-label="Reset to default"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
        {description && <p style={styles.description}>{description}</p>}
      </div>
      <div style={vertical ? styles.controlVertical : styles.control}>{children}</div>
    </div>
  );
}

// =============================================================================
// TOGGLE SWITCH SUB-COMPONENT
// =============================================================================

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = 'md',
}: ToggleSwitchProps) {
  const dimensions =
    size === 'sm'
      ? { width: 36, height: 20, knob: 16 }
      : { width: 44, height: 24, knob: 20 };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggle,
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: checked ? 'var(--color-blue)' : 'var(--bg-tertiary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div
        style={{
          ...styles.toggleKnob,
          width: dimensions.knob,
          height: dimensions.knob,
          transform: checked
            ? `translateX(${dimensions.width - dimensions.knob - 4}px)`
            : 'translateX(0)',
        }}
      />
    </button>
  );
}

// =============================================================================
// SELECT SUB-COMPONENT
// =============================================================================

interface SettingSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function SettingSelect({
  value,
  onChange,
  options,
  disabled = false,
  style,
}: SettingSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ ...styles.select, ...style }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// =============================================================================
// INPUT SUB-COMPONENT
// =============================================================================

interface SettingInputProps {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'password';
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function SettingInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
  style,
}: SettingInputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{ ...styles.input, ...style }}
    />
  );
}

// =============================================================================
// SLIDER SUB-COMPONENT
// =============================================================================

interface SettingSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  style?: React.CSSProperties;
}

export function SettingSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  showValue = true,
  formatValue = (v) => String(v),
  style,
}: SettingSliderProps) {
  return (
    <div style={{ ...styles.sliderContainer, ...style }}>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        style={styles.slider}
      />
      {showValue && <span style={styles.sliderValue}>{formatValue(value)}</span>}
    </div>
  );
}

// =============================================================================
// BUTTON GROUP SUB-COMPONENT
// =============================================================================

interface SettingButtonGroupProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  disabled?: boolean;
}

export function SettingButtonGroup({
  value,
  onChange,
  options,
  disabled = false,
}: SettingButtonGroupProps) {
  return (
    <div style={styles.buttonGroup}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          style={{
            ...styles.buttonGroupItem,
            backgroundColor: value === opt.value ? 'var(--color-navy)' : 'transparent',
            color: value === opt.value ? 'white' : 'var(--text-secondary)',
          }}
        >
          {opt.icon && <span style={styles.buttonGroupIcon}>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-4)',
    padding: 'var(--space-3) 0',
  },

  rowVertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },

  rowDisabled: {
    opacity: 0.5,
    pointerEvents: 'none',
  },

  labelSection: {
    flex: 1,
    minWidth: 0,
  },

  labelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  modifiedDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-blue)',
  },

  description: {
    margin: 0,
    marginTop: '2px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },

  tooltipWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },

  tooltipIcon: {
    color: 'var(--text-tertiary)',
    cursor: 'help',
  },

  tooltip: {
    position: 'absolute',
    left: '100%',
    top: '50%',
    transform: 'translateY(-50%)',
    marginLeft: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    zIndex: 100,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },

  resetButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    padding: 0,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'transparent',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    transition: 'color 150ms ease',
  },

  control: {
    flexShrink: 0,
  },

  controlVertical: {
    marginTop: 'var(--space-2)',
  },

  // Toggle
  toggle: {
    position: 'relative',
    border: 'none',
    borderRadius: 'var(--radius-full)',
    padding: '2px',
    transition: 'background-color 150ms ease',
  },

  toggleKnob: {
    backgroundColor: 'white',
    borderRadius: '50%',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
    transition: 'transform 150ms ease',
  },

  // Select
  select: {
    padding: 'var(--space-2) var(--space-3)',
    paddingRight: 'var(--space-8)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
    minWidth: '120px',
  },

  // Input
  input: {
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
    minWidth: '160px',
  },

  // Slider
  sliderContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    minWidth: '160px',
  },

  slider: {
    flex: 1,
    height: '6px',
    WebkitAppearance: 'none',
    appearance: 'none',
    borderRadius: '3px',
    backgroundColor: 'var(--border-default)',
    cursor: 'pointer',
  },

  sliderValue: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-blue)',
    minWidth: '45px',
    textAlign: 'right',
  },

  // Button Group
  buttonGroup: {
    display: 'flex',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
  },

  buttonGroupItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  buttonGroupIcon: {
    display: 'flex',
    alignItems: 'center',
  },
};

export default SettingRow;
