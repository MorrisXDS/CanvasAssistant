/**
 * FeatureFlagRow - Settings UI Component for Feature Flags
 *
 * Displays a single feature flag with toggle or input control.
 */

import React, { useState, useCallback } from 'react';
import { FlagType } from '../../../l0-utilities/FeatureFlags';

export interface FeatureFlagRowProps {
  flagKey: string;
  type: string;
  description: string;
  currentValue: unknown;
  defaultValue?: unknown;
  onToggle?: (key: string, value: boolean) => Promise<void>;
  onChange?: (key: string, value: unknown) => Promise<void>;
  onReset?: (key: string) => Promise<void>;
}

/**
 * A row in the feature flags settings panel.
 */
export function FeatureFlagRow({
  flagKey,
  type,
  description,
  currentValue,
  defaultValue,
  onToggle,
  onChange,
  onReset,
}: FeatureFlagRowProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [localValue, setLocalValue] = useState(currentValue);

  const isModified = defaultValue !== undefined && localValue !== defaultValue;

  const handleToggle = useCallback(async () => {
    if (!onToggle || isLoading) return;

    setIsLoading(true);
    try {
      const newValue = !localValue;
      await onToggle(flagKey, newValue);
      setLocalValue(newValue);
    } finally {
      setIsLoading(false);
    }
  }, [flagKey, localValue, onToggle, isLoading]);

  const handleNumberChange = useCallback(
    async (value: number) => {
      if (!onChange || isLoading) return;

      setIsLoading(true);
      try {
        await onChange(flagKey, value);
        setLocalValue(value);
      } finally {
        setIsLoading(false);
      }
    },
    [flagKey, onChange, isLoading]
  );

  const handleStringChange = useCallback(
    async (value: string) => {
      if (!onChange || isLoading) return;

      setIsLoading(true);
      try {
        await onChange(flagKey, value);
        setLocalValue(value);
      } finally {
        setIsLoading(false);
      }
    },
    [flagKey, onChange, isLoading]
  );

  const handleReset = useCallback(async () => {
    if (!onReset || isLoading) return;

    setIsLoading(true);
    try {
      await onReset(flagKey);
      setLocalValue(defaultValue);
    } finally {
      setIsLoading(false);
    }
  }, [flagKey, defaultValue, onReset, isLoading]);

  const renderControl = () => {
    switch (type) {
      case FlagType.BOOLEAN:
        return (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(localValue)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              localValue ? 'bg-indigo-600' : 'bg-gray-200'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={handleToggle}
            disabled={isLoading}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                localValue ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        );

      case FlagType.NUMBER:
      case FlagType.PERCENTAGE:
        return (
          <input
            type="number"
            value={localValue as number}
            min={type === FlagType.PERCENTAGE ? 0 : undefined}
            max={type === FlagType.PERCENTAGE ? 100 : undefined}
            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                setLocalValue(val);
              }
            }}
            onBlur={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                handleNumberChange(val);
              }
            }}
            disabled={isLoading}
          />
        );

      case FlagType.STRING:
        return (
          <input
            type="text"
            value={localValue as string}
            className="w-48 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={(e) => handleStringChange(e.target.value)}
            disabled={isLoading}
          />
        );

      default:
        return <span className="text-gray-500 text-sm">{String(localValue)}</span>;
    }
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
      <div className="flex-1 mr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {formatFlagName(flagKey)}
          </span>
          {isModified && (
            <span className="px-1.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-100 rounded">
              Modified
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        <code className="text-xs text-gray-400 font-mono">{flagKey}</code>
      </div>

      <div className="flex items-center gap-2">
        {renderControl()}

        {isModified && onReset && (
          <button
            type="button"
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            onClick={handleReset}
            disabled={isLoading}
            title="Reset to default"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Format a flag key into a human-readable name.
 * e.g., 'experimental.smart_priority_v2' -> 'Smart Priority V2'
 */
function formatFlagName(key: string): string {
  // Get the last part after the dot
  const parts = key.split('.');
  const name = parts[parts.length - 1];

  // Convert snake_case to Title Case
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Feature flags section for settings.
 */
export interface FeatureFlagsSectionProps {
  title: string;
  flags: Array<{
    key: string;
    type: string;
    description: string;
    currentValue: unknown;
    defaultValue?: unknown;
  }>;
  onToggle: (key: string, value: boolean) => Promise<void>;
  onChange: (key: string, value: unknown) => Promise<void>;
  onReset: (key: string) => Promise<void>;
}

export function FeatureFlagsSection({
  title,
  flags,
  onToggle,
  onChange,
  onReset,
}: FeatureFlagsSectionProps): React.JSX.Element {
  if (flags.length === 0) {
    return <></>;
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="bg-gray-50 rounded-lg px-4">
        {flags.map((flag) => (
          <FeatureFlagRow
            key={flag.key}
            flagKey={flag.key}
            type={flag.type}
            description={flag.description}
            currentValue={flag.currentValue}
            defaultValue={flag.defaultValue}
            onToggle={onToggle}
            onChange={onChange}
            onReset={onReset}
          />
        ))}
      </div>
    </div>
  );
}
