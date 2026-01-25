/**
 * useSettings - React hooks for accessing settings
 *
 * Provides:
 * - useSetting<K>(key) - Single setting with reactive updates
 * - useTheme() - Theme management with DOM side-effects
 * - useSettings() - Access to SettingsManager instance
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { settingsManager, SettingChangeEvent } from './SettingsManager';
import {
  STORAGE_KEYS,
  SettingsTypeMap,
  AppearanceSettings,
  DEFAULT_APPEARANCE_SETTINGS,
} from './settingsSchema';

// =============================================================================
// useSetting - Single setting hook with reactive updates
// =============================================================================

/**
 * Hook for reading and writing a single setting with automatic updates.
 *
 * @example
 * const [theme, setTheme] = useSetting(STORAGE_KEYS.APPEARANCE);
 * setTheme({ ...theme, theme: 'dark' });
 */
export function useSetting<K extends keyof SettingsTypeMap>(
  key: K
): [SettingsTypeMap[K], (value: SettingsTypeMap[K]) => void] {
  const [value, setValue] = useState<SettingsTypeMap[K]>(() =>
    settingsManager.get(key)
  );

  // Subscribe to changes
  useEffect(() => {
    const unsubscribe = settingsManager.onChange(key, (event: SettingChangeEvent<K>) => {
      setValue(event.value);
    });

    // Re-sync on mount (in case value changed while unmounted)
    setValue(settingsManager.get(key));

    return unsubscribe;
  }, [key]);

  // Memoized setter
  const set = useCallback(
    (newValue: SettingsTypeMap[K]) => {
      settingsManager.set(key, newValue);
    },
    [key]
  );

  return [value, set];
}

/**
 * Hook for partially updating a settings object.
 *
 * @example
 * const [sync, updateSync] = useSettingUpdate(STORAGE_KEYS.SYNC_PREFS);
 * updateSync({ autoSyncEnabled: false }); // Merges with existing
 */
export function useSettingUpdate<K extends keyof SettingsTypeMap>(
  key: K
): [SettingsTypeMap[K], (updates: Partial<SettingsTypeMap[K]>) => void] {
  const [value, setValue] = useSetting(key);

  const update = useCallback(
    (updates: Partial<SettingsTypeMap[K]>) => {
      settingsManager.update(key, updates);
    },
    [key]
  );

  return [value, update];
}

// =============================================================================
// useTheme - Theme management hook with DOM side-effects
// =============================================================================

export type Theme = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

interface UseThemeResult {
  /** Current theme setting ('light', 'dark', or 'system') */
  theme: Theme;
  /** Set the theme */
  setTheme: (theme: Theme) => void;
  /** Resolved theme after applying system preference */
  effectiveTheme: EffectiveTheme;
  /** Whether system prefers dark mode */
  systemPrefersDark: boolean;
}

/**
 * Hook for managing theme with automatic DOM updates.
 *
 * @example
 * const { theme, setTheme, effectiveTheme } = useTheme();
 * setTheme('dark'); // Automatically updates document class
 */
export function useTheme(): UseThemeResult {
  const [appearance, setAppearance] = useSetting(STORAGE_KEYS.APPEARANCE);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  // Get current theme with fallback
  const theme: Theme = appearance?.theme ?? DEFAULT_APPEARANCE_SETTINGS.theme;

  // Calculate effective theme
  const effectiveTheme = useMemo<EffectiveTheme>(() => {
    if (theme === 'system') {
      return systemPrefersDark ? 'dark' : 'light';
    }
    return theme;
  }, [theme, systemPrefersDark]);

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(effectiveTheme);
  }, [effectiveTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Theme setter that preserves other appearance settings
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setAppearance({
        ...appearance,
        theme: newTheme,
      } as AppearanceSettings);
    },
    [appearance, setAppearance]
  );

  return {
    theme,
    setTheme,
    effectiveTheme,
    systemPrefersDark,
  };
}

// =============================================================================
// useSidebarState - Sidebar collapsed state hook
// =============================================================================

interface UseSidebarResult {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
}

/**
 * Hook for managing sidebar collapsed state.
 *
 * @example
 * const { collapsed, toggle } = useSidebarState();
 * <button onClick={toggle}>Toggle Sidebar</button>
 */
export function useSidebarState(): UseSidebarResult {
  const [collapsed, setCollapsedValue] = useSetting(STORAGE_KEYS.SIDEBAR_COLLAPSED);

  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapsedValue(value);
    },
    [setCollapsedValue]
  );

  const toggle = useCallback(() => {
    setCollapsedValue(!collapsed);
  }, [collapsed, setCollapsedValue]);

  return {
    collapsed: collapsed ?? false,
    setCollapsed,
    toggle,
  };
}

// =============================================================================
// useNavOrder - Navigation order hook
// =============================================================================

interface UseNavOrderResult {
  order: string[];
  setOrder: (order: string[]) => void;
  resetOrder: () => void;
}

/**
 * Hook for managing navigation item order.
 */
export function useNavOrder(): UseNavOrderResult {
  const [order, setOrderValue] = useSetting(STORAGE_KEYS.NAV_ORDER);

  const setOrder = useCallback(
    (newOrder: string[]) => {
      setOrderValue(newOrder);
    },
    [setOrderValue]
  );

  const resetOrder = useCallback(() => {
    settingsManager.remove(STORAGE_KEYS.NAV_ORDER);
  }, []);

  return {
    order: order ?? [],
    setOrder,
    resetOrder,
  };
}

// =============================================================================
// useDashboardOrder - Dashboard section order hook
// =============================================================================

interface UseDashboardOrderResult {
  order: string[];
  setOrder: (order: string[]) => void;
  resetOrder: () => void;
}

/**
 * Hook for managing dashboard section order.
 */
export function useDashboardOrder(): UseDashboardOrderResult {
  const [order, setOrderValue] = useSetting(STORAGE_KEYS.DASHBOARD_SECTION_ORDER);

  const setOrder = useCallback(
    (newOrder: string[]) => {
      setOrderValue(newOrder);
    },
    [setOrderValue]
  );

  const resetOrder = useCallback(() => {
    settingsManager.remove(STORAGE_KEYS.DASHBOARD_SECTION_ORDER);
  }, []);

  return {
    order: order ?? [],
    setOrder,
    resetOrder,
  };
}

// =============================================================================
// useLandingPage - Landing page hook
// =============================================================================

interface UseLandingPageResult {
  landingPage: string;
  setLandingPage: (path: string) => void;
}

/**
 * Hook for managing landing page preference.
 */
export function useLandingPage(): UseLandingPageResult {
  const [landingPage, setLandingPageValue] = useSetting(STORAGE_KEYS.LANDING_PAGE);

  const setLandingPage = useCallback(
    (path: string) => {
      setLandingPageValue(path);
    },
    [setLandingPageValue]
  );

  return {
    landingPage: landingPage ?? '/',
    setLandingPage,
  };
}

// =============================================================================
// useSettings - Direct access to SettingsManager
// =============================================================================

/**
 * Hook for direct access to SettingsManager instance.
 * Use sparingly - prefer specific hooks above.
 */
export function useSettingsManager() {
  return settingsManager;
}
