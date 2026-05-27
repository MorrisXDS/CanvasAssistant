/**
 * useMultiSelect - Reusable multi-select with keyboard shortcuts
 *
 * Provides Ctrl+A (select all), Escape (deselect/exit), Shift+Click (range),
 * and Ctrl/Cmd+Click (toggle) support. Used by FilesPage and CoursesPage.
 *
 * @param items - ordered array of selectable items (must match render order)
 * @param getKey - function to derive a unique string key per item
 * @param options - optional config (filter for selectAll, etc.)
 */

import { useState, useRef, useMemo, useCallback } from 'react';
import { useStackAwareHotkeys } from './useStackAwareHotkeys';

export interface UseMultiSelectOptions<T> {
  /** Filter predicate for selectAll (e.g., only undownloaded files) */
  selectAllFilter?: (item: T) => boolean;
  /** Custom handler for Mod+A. When provided, overrides the default selectAll behavior. */
  onSelectAll?: () => void;
}

export interface UseMultiSelectState {
  selectMode: boolean;
  selectedKeys: Set<string>;
  selectedCount: number;
}

export interface UseMultiSelectActions<T> {
  /** Enter/exit select mode (clears selection on exit) */
  setSelectMode: (on: boolean) => void;
  /** Call from container onClick — handles Shift/Ctrl/plain click */
  handleItemClick: (item: T, e: React.MouseEvent) => void;
  /** Select all (respects selectAllFilter) */
  selectAll: () => void;
  /** Directly set the selected keys (for scoped selection) */
  setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Clear selection */
  deselectAll: () => void;
  /** Check if a specific item is selected */
  isSelected: (item: T) => boolean;
  /** Reset everything (mode off, selection cleared) */
  reset: () => void;
}

export function useMultiSelect<T>(
  items: T[],
  getKey: (item: T) => string,
  options?: UseMultiSelectOptions<T>
): UseMultiSelectState & UseMultiSelectActions<T> {
  const [selectMode, setSelectModeState] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);

  // O(1) lookup from key → index
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(getKey(item), i));
    return map;
  }, [items, getKey]);

  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeState(on);
    if (!on) {
      setSelectedKeys(new Set());
      lastSelectedIndexRef.current = null;
    }
  }, []);

  const selectAll = useCallback(() => {
    const filter = options?.selectAllFilter;
    const keys = new Set(
      items.filter((item) => !filter || filter(item)).map((item) => getKey(item))
    );
    setSelectedKeys(keys);
  }, [items, getKey, options?.selectAllFilter]);

  const deselectAll = useCallback(() => {
    setSelectedKeys(new Set());
    lastSelectedIndexRef.current = null;
  }, []);

  const isSelected = useCallback(
    (item: T): boolean => {
      return selectedKeys.has(getKey(item));
    },
    [selectedKeys, getKey]
  );

  const reset = useCallback(() => {
    setSelectModeState(false);
    setSelectedKeys(new Set());
    lastSelectedIndexRef.current = null;
  }, []);

  const handleItemClick = useCallback(
    (item: T, e: React.MouseEvent) => {
      const key = getKey(item);
      const currentIndex = itemIndexMap.get(key);
      if (currentIndex === undefined) return;

      // Auto-enter select mode
      if (!selectMode) {
        setSelectModeState(true);
      }

      if (e.shiftKey && lastSelectedIndexRef.current !== null) {
        // Range select between last and current
        const start = Math.min(lastSelectedIndexRef.current, currentIndex);
        const end = Math.max(lastSelectedIndexRef.current, currentIndex);
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            if (i < items.length) {
              next.add(getKey(items[i]));
            }
          }
          return next;
        });
      } else if (e.metaKey || e.ctrlKey) {
        // Toggle individual
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      } else {
        // Plain click — toggle individual
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) {
            next.delete(key);
          } else {
            next.add(key);
          }
          return next;
        });
      }

      lastSelectedIndexRef.current = currentIndex;
    },
    [getKey, itemIndexMap, items, selectMode]
  );

  // Mod+A — enter select mode + select all (or custom handler)
  useStackAwareHotkeys(
    'mod+a',
    (e) => {
      e.preventDefault();
      setSelectModeState(true);
      if (options?.onSelectAll) {
        options.onSelectAll();
      } else {
        selectAll();
      }
    },
    { enableOnFormTags: false }
  );

  // Escape — deselect, then exit select mode
  useStackAwareHotkeys(
    'escape',
    () => {
      // Don't fire if a dialog/modal is open
      const dialog = document.querySelector('[role="dialog"], [data-modal]');
      if (dialog) return;

      if (selectedKeys.size > 0) {
        deselectAll();
      } else if (selectMode) {
        setSelectModeState(false);
      }
    },
    { enableOnFormTags: true }
  );

  return {
    selectMode,
    selectedKeys,
    selectedCount: selectedKeys.size,
    setSelectMode,
    handleItemClick,
    selectAll,
    setSelectedKeys,
    deselectAll,
    isSelected,
    reset,
  };
}
