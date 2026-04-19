/**
 * useFocusedItem - Keyboard-driven list focus navigation
 *
 * Provides Left/Right arrow + J/K navigation for ordered lists.
 * Tracks a focused index, scrolls the focused element into view,
 * and applies a CSS class for visual indication.
 *
 * Up/Down arrows are reserved for scrolling (browser default).
 * Left/J = move to previous item, Right/K = move to next item.
 *
 * @param items - ordered array of items (must match render order)
 * @param options - optional config
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

export interface UseFocusedItemOptions {
  /** CSS selector to find focusable item elements (default: '[data-focus-index]') */
  itemSelector?: string;
  /** Whether the focus navigation is enabled (default: true) */
  enabled?: boolean;
  /** Key for persisting focus position in sessionStorage (survives navigation) */
  persistKey?: string;
  /**
   * When true, bind Up/↑ + W for prev and Down/↓ + S for next, freeing
   * Left/Right/J/K. Use on list pages where vertical movement maps to the
   * visual layout (Dashboard, Tasks, Announcements). Default: false —
   * Left/J = prev, Right/K = next.
   */
  verticalNav?: boolean;
}

export interface UseFocusedItemResult<T> {
  /** Currently focused index, or -1 if none */
  focusedIndex: number;
  /** Currently focused item, or null */
  focusedItem: T | null;
  /** Set focus to a specific index */
  setFocusedIndex: (index: number) => void;
  /** Clear focus */
  clearFocus: () => void;
  /** Get data attribute props for a list item at a given index */
  getFocusProps: (index: number) => {
    'data-focus-index': number;
    'data-focus-scope'?: string;
    className?: string;
  };
}

const FOCUS_CLASS = 'keyboard-focused';

export function useFocusedItem<T>(
  items: T[],
  options?: UseFocusedItemOptions
): UseFocusedItemResult<T> {
  const persistKey = options?.persistKey;
  const [focusedIndex, setFocusedIndexRaw] = useState(() => {
    if (persistKey) {
      const saved = sessionStorage.getItem(`focus:${persistKey}`);
      if (saved !== null) {
        const idx = parseInt(saved, 10);
        if (!isNaN(idx) && idx >= 0) return idx;
      }
    }
    return -1;
  });
  const enabled = options?.enabled ?? true;
  const itemSelector = options?.itemSelector ?? '[data-focus-index]';
  const verticalNav = options?.verticalNav ?? false;
  const itemsLengthRef = useRef(items.length);

  // Wrap setter to also persist
  const setFocusedIndex = useCallback(
    (indexOrUpdater: number | ((prev: number) => number)) => {
      setFocusedIndexRaw((prev) => {
        const next =
          typeof indexOrUpdater === 'function' ? indexOrUpdater(prev) : indexOrUpdater;
        if (persistKey) {
          sessionStorage.setItem(`focus:${persistKey}`, String(next));
        }
        return next;
      });
    },
    [persistKey]
  );

  // Reset focus when items change significantly
  useEffect(() => {
    if (items.length !== itemsLengthRef.current) {
      itemsLengthRef.current = items.length;
      if (focusedIndex >= items.length) {
        setFocusedIndex(items.length > 0 ? items.length - 1 : -1);
      }
    }
  }, [items.length, focusedIndex]);

  // Only scroll into view on user-initiated focus changes, not on restore.
  // Scope the query by persistKey so multiple lists on the same page don't collide.
  const shouldScroll = useRef(false);
  useEffect(() => {
    if (focusedIndex < 0 || !shouldScroll.current) return;
    shouldScroll.current = false;
    const scopeSelector = persistKey ? `[data-focus-scope="${persistKey}"]` : '';
    const el = document.querySelector(
      `${itemSelector}${scopeSelector}[data-focus-index="${focusedIndex}"]`
    );
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [focusedIndex, itemSelector, persistKey]);

  // Blur any native DOM focus so the browser's :focus ring doesn't compete with our highlight
  const blurNative = () => {
    const active = document.activeElement;
    if (active && active instanceof HTMLElement && active !== document.body) {
      active.blur();
    }
  };

  const movePrev = useCallback(() => {
    if (items.length === 0) return;
    shouldScroll.current = true;
    blurNative();
    setFocusedIndex((prev) => {
      if (prev <= 0) return items.length - 1; // wrap to end
      return prev - 1;
    });
  }, [items.length, setFocusedIndex]);

  const moveNext = useCallback(() => {
    if (items.length === 0) return;
    shouldScroll.current = true;
    blurNative();
    setFocusedIndex((prev) => {
      if (prev >= items.length - 1) return 0; // wrap to start
      return prev + 1;
    });
  }, [items.length, setFocusedIndex]);

  const clearFocus = useCallback(() => {
    setFocusedIndex(-1);
    if (persistKey) {
      sessionStorage.removeItem(`focus:${persistKey}`);
    }
  }, [setFocusedIndex, persistKey]);

  // Bind prev/next keys. verticalNav swaps Left/Right/J/K for Up/Down/W/S.
  const prevKeys = verticalNav ? 'up, w' : 'left, j';
  const nextKeys = verticalNav ? 'down, s' : 'right, k';

  useHotkeys(
    prevKeys,
    (e) => {
      e.preventDefault();
      movePrev();
    },
    { enabled }
  );

  useHotkeys(
    nextKeys,
    (e) => {
      e.preventDefault();
      moveNext();
    },
    { enabled }
  );

  const focusedItem =
    focusedIndex >= 0 && focusedIndex < items.length ? items[focusedIndex] : null;

  const getFocusProps = useCallback(
    (index: number) => ({
      'data-focus-index': index,
      'data-focus-scope': persistKey,
      className: index === focusedIndex ? FOCUS_CLASS : undefined,
    }),
    [focusedIndex, persistKey]
  );

  return {
    focusedIndex,
    focusedItem,
    setFocusedIndex,
    clearFocus,
    getFocusProps,
  };
}
