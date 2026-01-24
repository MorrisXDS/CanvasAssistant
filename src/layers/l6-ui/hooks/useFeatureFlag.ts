/**
 * useFeatureFlag - React Hook for Feature Flags
 *
 * Provides reactive access to feature flags in React components.
 */

import { useState, useEffect, useCallback } from 'react';
import type { FlagKey, FlagValue } from '../../l0-utilities/FeatureFlags';

/**
 * Hook to check if a feature flag is enabled.
 *
 * @example
 * ```tsx
 * const isEnabled = useFeatureFlag('experimental.smart_priority_v2');
 *
 * if (isEnabled) {
 *   return <SmartPriorityV2 />;
 * }
 * ```
 */
export function useFeatureFlag(key: FlagKey): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    // Get initial value from main process
    const checkFlag = async () => {
      try {
        const api = (window as unknown as { api?: {
          getFeatureFlag?: (key: string) => Promise<unknown>;
        } }).api;

        if (api?.getFeatureFlag) {
          const value = await api.getFeatureFlag(key);
          setEnabled(Boolean(value));
        }
      } catch (error) {
        console.error(`[useFeatureFlag] Failed to get flag '${key}':`, error);
      }
    };

    checkFlag();

    // Subscribe to flag changes (if available)
    const api = (window as unknown as { api?: {
      onFeatureFlagChanged?: (callback: (data: { key: string; value: unknown }) => void) => () => void;
    } }).api;

    if (api?.onFeatureFlagChanged) {
      const unsubscribe = api.onFeatureFlagChanged((data) => {
        if (data.key === key) {
          setEnabled(Boolean(data.value));
        }
      });
      return unsubscribe;
    }
  }, [key]);

  return enabled;
}

/**
 * Hook to get a feature flag value of any type.
 *
 * @example
 * ```tsx
 * const ttl = useFeatureFlagValue('performance.cache_ttl_seconds');
 * ```
 */
export function useFeatureFlagValue<K extends FlagKey>(key: K): FlagValue<K> | null {
  const [value, setValue] = useState<FlagValue<K> | null>(null);

  useEffect(() => {
    const checkFlag = async () => {
      try {
        const api = (window as unknown as { api?: {
          getFeatureFlag?: (key: string) => Promise<unknown>;
        } }).api;

        if (api?.getFeatureFlag) {
          const result = await api.getFeatureFlag(key);
          setValue(result as FlagValue<K>);
        }
      } catch (error) {
        console.error(`[useFeatureFlagValue] Failed to get flag '${key}':`, error);
      }
    };

    checkFlag();

    // Subscribe to flag changes
    const api = (window as unknown as { api?: {
      onFeatureFlagChanged?: (callback: (data: { key: string; value: unknown }) => void) => () => void;
    } }).api;

    if (api?.onFeatureFlagChanged) {
      const unsubscribe = api.onFeatureFlagChanged((data) => {
        if (data.key === key) {
          setValue(data.value as FlagValue<K>);
        }
      });
      return unsubscribe;
    }
  }, [key]);

  return value;
}

/**
 * Hook to get all feature flags for a category.
 *
 * @example
 * ```tsx
 * const experimentalFlags = useFeatureFlagsByCategory('experimental');
 * ```
 */
export function useFeatureFlagsByCategory(category: string): Array<{
  key: string;
  description: string;
  currentValue: unknown;
  type: string;
}> {
  const [flags, setFlags] = useState<Array<{
    key: string;
    description: string;
    currentValue: unknown;
    type: string;
  }>>([]);

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const api = (window as unknown as { api?: {
          getFeatureFlagsByCategory?: (category: string) => Promise<Array<{
            key: string;
            description: string;
            currentValue: unknown;
            type: string;
          }>>;
        } }).api;

        if (api?.getFeatureFlagsByCategory) {
          const result = await api.getFeatureFlagsByCategory(category);
          setFlags(result);
        }
      } catch (error) {
        console.error(`[useFeatureFlagsByCategory] Failed to get flags:`, error);
      }
    };

    fetchFlags();
  }, [category]);

  return flags;
}

/**
 * Hook to set a feature flag value.
 *
 * @example
 * ```tsx
 * const setFlag = useSetFeatureFlag();
 * setFlag('ui.dark_mode', true);
 * ```
 */
export function useSetFeatureFlag(): (key: FlagKey, value: unknown) => Promise<boolean> {
  const setFlag = useCallback(async (key: FlagKey, value: unknown): Promise<boolean> => {
    try {
      const api = (window as unknown as { api?: {
        setFeatureFlag?: (key: string, value: unknown) => Promise<{ success: boolean }>;
      } }).api;

      if (api?.setFeatureFlag) {
        const result = await api.setFeatureFlag(key, value);
        return result.success;
      }
      return false;
    } catch (error) {
      console.error(`[useSetFeatureFlag] Failed to set flag '${key}':`, error);
      return false;
    }
  }, []);

  return setFlag;
}

/**
 * Hook to reset a feature flag to its default value.
 */
export function useResetFeatureFlag(): (key: FlagKey) => Promise<boolean> {
  const resetFlag = useCallback(async (key: FlagKey): Promise<boolean> => {
    try {
      const api = (window as unknown as { api?: {
        resetFeatureFlag?: (key: string) => Promise<{ success: boolean }>;
      } }).api;

      if (api?.resetFeatureFlag) {
        const result = await api.resetFeatureFlag(key);
        return result.success;
      }
      return false;
    } catch (error) {
      console.error(`[useResetFeatureFlag] Failed to reset flag '${key}':`, error);
      return false;
    }
  }, []);

  return resetFlag;
}
