/**
 * useScrollbarVisibility Hook
 * Shows scrollbar on scroll activity, hides after a configurable timeout
 */

import { useEffect, RefObject } from 'react';

/**
 * Hook that adds auto-hiding scrollbar behavior to an element.
 * Shows scrollbar when scrolling starts, hides after inactivity.
 *
 * @param ref - Reference to the scrollable element
 * @param timeout - Milliseconds to wait before hiding scrollbar (default: 1500)
 */
export function useScrollbarVisibility(
  ref: RefObject<HTMLElement | null>,
  timeout = 1500
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    let fadeOutTimer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      // Show scrollbar
      el.classList.add('scrolling');
      el.classList.remove('scroll-fade-out');

      // Clear existing timers
      clearTimeout(timer);
      clearTimeout(fadeOutTimer);

      // Set timer to hide scrollbar after timeout
      timer = setTimeout(() => {
        el.classList.remove('scrolling');
        el.classList.add('scroll-fade-out');

        // Remove fade-out class after animation completes
        fadeOutTimer = setTimeout(() => {
          el.classList.remove('scroll-fade-out');
        }, 300); // Match CSS transition duration
      }, timeout);
    };

    // Use passive listener for better scroll performance
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
      clearTimeout(fadeOutTimer);
    };
  }, [ref, timeout]);
}

export default useScrollbarVisibility;
