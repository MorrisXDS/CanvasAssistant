/**
 * Layout Component
 * Application shell with collapsible sidebar navigation
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../l5-presentation/store';
import type { EnrollmentTerm } from '../../../shared/ipc-contract';
import { useSidebarState, useLandingPage } from '../../l5-presentation/settings';
import { TitleBar } from './TitleBar';
import {
  SyncResultToast,
  CloseBehaviorDialog,
  SyncUpdatesFAB,
  KeyboardShortcutsModal,
} from './shared';
import { useScrollbarVisibility } from '../hooks/useScrollbarVisibility';
import { useAppShortcuts } from '../hooks/useAppShortcuts';
import { Sidebar } from './Sidebar';
import { layoutStyles as styles } from './layoutStyles';
import { createLogger } from '../utils/rendererLogger';

const logger = createLogger('Layout');

// Debug flag - set to true only when debugging layout issues
const DEBUG_LAYOUT = false;

export function Layout() {
  const { lastSyncResult, clearSyncResult, syncConflicts } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Scroll position restoration across route changes
  // Track scroll continuously so we always have the latest position before route swap
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const currentScrollRef = useRef(0);
  const prevPathname = useRef(location.pathname);

  // Continuously track scroll position of <main>
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => {
      currentScrollRef.current = main.scrollTop;
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  // On route change: save previous scroll, restore new scroll
  useEffect(() => {
    if (prevPathname.current !== location.pathname) {
      // Save the continuously-tracked scroll position for the page we're leaving
      scrollPositions.current.set(prevPathname.current, currentScrollRef.current);
      prevPathname.current = location.pathname;
    }

    // Restore scroll position for the page we're entering
    const saved = scrollPositions.current.get(location.pathname);
    requestAnimationFrame(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = saved ?? 0;
      }
    });
  }, [location.pathname]);

  // Auto-hide scrollbar on main content area (show on scroll, hide after 1.5s)
  useScrollbarVisibility(mainRef, 1500);

  // Global keyboard shortcuts (Mod+1-5 nav)
  useAppShortcuts();

  // Mod+F — focus search input on current page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'f' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('[data-search-input]');
      if (input) {
        input.focus();
        input.select();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ? — show global shortcuts help
  // Ctrl/Cmd+? — show page-specific shortcuts help
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        setForceGlobalTab(true);
      } else {
        setForceGlobalTab(false);
      }
      setShowKeyboardShortcuts(true);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Escape — navigate back from sub-pages (course detail, announcement, etc.)
  // Skips when a modal is open so ESC closes the modal instead.
  // "Landing" routes reachable from the sidebar — Escape only backs out if we
  // arrived here via in-app navigation (history.state has our pushed state).
  const SIDEBAR_ROUTES = [
    '/',
    '/calendar',
    '/courses',
    '/files',
    '/settings',
    '/updates',
  ];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"], [data-modal]')) return;
      // Never back out from a sidebar-accessible top-level page
      if (SIDEBAR_ROUTES.includes(location.pathname)) return;
      navigate(-1);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [location.pathname, navigate]);

  // Sidebar collapse state from settings
  const { collapsed: isCollapsed } = useSidebarState();

  // Term end date for sync conflict expiration default
  const [termEndDate, setTermEndDate] = useState<string | null>(null);

  // Close behavior dialog state (shown on first close when preference not set)
  const [showCloseBehaviorDialog, setShowCloseBehaviorDialog] = useState(false);

  // Keyboard shortcuts help modal (unified — forceGlobalTab = Ctrl+?)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [forceGlobalTab, setForceGlobalTab] = useState(false);

  // Listen for close behavior prompt from main process
  useEffect(() => {
    const unsubscribe = window.api?.onPromptCloseBehavior?.(() => {
      setShowCloseBehaviorDialog(true);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  // Handle close behavior choice
  const handleCloseBehaviorChoice = async (choice: 'minimize-to-tray' | 'quit') => {
    setShowCloseBehaviorDialog(false);
    await window.api?.setCloseBehaviorAndApply?.(choice);
  };

  // Fetch term end date when sync conflicts modal opens
  useEffect(() => {
    if (syncConflicts.length > 0 && !termEndDate) {
      // Get current term end date from enrollment terms
      window.api
        ?.getEnrollmentTerms?.()
        .then((terms: EnrollmentTerm[]) => {
          if (terms && terms.length > 0) {
            const now = new Date();

            // Find currently active terms (started and not yet ended)
            const activeTerms = terms.filter((t: EnrollmentTerm) => {
              if (!t.endAt) return false;
              const endDate = new Date(t.endAt);
              if (endDate <= now) return false;
              if (t.startAt) {
                const startDate = new Date(t.startAt);
                if (startDate > now) return false;
              }
              return true;
            });

            // Sort by latest end date
            const sortedTerms = activeTerms.sort(
              (a: EnrollmentTerm, b: EnrollmentTerm) => {
                if (!a.endAt || !b.endAt) return 0;
                return new Date(b.endAt).getTime() - new Date(a.endAt).getTime();
              }
            );

            if (sortedTerms.length > 0 && sortedTerms[0].endAt) {
              setTermEndDate(sortedTerms[0].endAt);
            } else {
              // Fallback: find any term ending in the future
              const futureTerms = terms
                .filter((t: EnrollmentTerm) => t.endAt && new Date(t.endAt) > now)
                .sort((a: EnrollmentTerm, b: EnrollmentTerm) => {
                  if (!a.endAt || !b.endAt) return 0;
                  return new Date(b.endAt).getTime() - new Date(a.endAt).getTime();
                });
              if (futureTerms.length > 0 && futureTerms[0].endAt) {
                setTermEndDate(futureTerms[0].endAt);
              }
            }
          }
        })
        .catch(() => {
          // Ignore errors - term end date is optional
        });
    }
  }, [syncConflicts.length, termEndDate]);

  // Landing page from settings
  const { landingPage } = useLandingPage();

  // Redirect to landing page on initial mount
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!hasRedirected.current && location.pathname === '/') {
      if (landingPage !== '/') {
        navigate(landingPage, { replace: true });
      }
      hasRedirected.current = true;
    }
  }, [location.pathname, navigate, landingPage]);

  // Debug: Log when route changes to analyze gap on each page
  useEffect(() => {
    if (!DEBUG_LAYOUT) return;

    const timer = setTimeout(() => {
      logger.debug(`Route changed to: ${location.pathname}`);
      if (mainRef.current) {
        const mainRect = mainRef.current.getBoundingClientRect();
        const mainStyle = getComputedStyle(mainRef.current);
        const firstChild = mainRef.current.firstElementChild;

        logger.debug(`Page: ${location.pathname}`);
        logger.debug(`  Main top: ${mainRect.top}px`);
        logger.debug(`  Main paddingTop: ${mainStyle.paddingTop}`);

        if (firstChild) {
          const childRect = firstChild.getBoundingClientRect();
          const childStyle = getComputedStyle(firstChild);
          logger.debug(`  Page content top: ${childRect.top}px`);
          logger.debug(`  Page content marginTop: ${childStyle.marginTop}`);
          logger.debug(
            `  GAP (content top - main top): ${childRect.top - mainRect.top}px`
          );
        }
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Force layout recalculation on mount to prevent gap/bar issues
  useEffect(() => {
    if (DEBUG_LAYOUT) return;

    const forceLayoutRecalc = () => {
      if (containerRef.current) {
        void containerRef.current.getBoundingClientRect();
      }
      if (mainRef.current) {
        void mainRef.current.getBoundingClientRect();
        const currentScroll = mainRef.current.scrollTop;
        mainRef.current.scrollTop = 1;
        requestAnimationFrame(() => {
          if (mainRef.current) {
            mainRef.current.scrollTop = currentScroll;
          }
        });
      }
    };

    const timer = setTimeout(forceLayoutRecalc, 100);

    const resizeObserver = new ResizeObserver(forceLayoutRecalc);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, []);

  const sidebarWidth = isCollapsed ? 64 : 220;

  // Handle sidebar toggle (for TitleBar coordination)
  const handleSidebarToggle = () => {
    // Sidebar handles its own state, this is just for coordination if needed
  };

  return (
    <>
      <TitleBar sidebarWidth={sidebarWidth} onSidebarToggle={handleSidebarToggle} />
      <div ref={containerRef} style={styles.container}>
        {/* Sidebar */}
        <Sidebar onToggle={handleSidebarToggle} />

        {/* Main Content Area */}
        <main
          ref={mainRef}
          style={{
            ...styles.main,
            marginLeft: `${sidebarWidth}px`,
          }}
        >
          <Suspense
            fallback={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '200px',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid var(--border-default)',
                    borderTopColor: 'var(--color-navy)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Sync Result Toast */}
      <SyncResultToast
        result={lastSyncResult}
        onClose={clearSyncResult}
        autoHideDuration={6000}
      />

      {/* Sync Conflict Modal - DISABLED: conflicts now handled in Updates page */}
      {/* <SyncConflictModal
        isOpen={syncConflicts.length > 0}
        conflicts={syncConflicts}
        termEndDate={termEndDate}
        onResolve={(resolution) => {
          resolveSyncConflict(
            resolution.conflictId,
            resolution.useCanvasValue,
            resolution.rememberChoice,
            resolution.rememberForAll,
            resolution.expiresAt
          );
        }}
        onResolveAll={(useCanvasValues) => {
          resolveAllSyncConflicts(useCanvasValues);
        }}
        onClose={clearSyncConflicts}
      /> */}

      {/* Close Behavior Dialog */}
      <CloseBehaviorDialog
        isOpen={showCloseBehaviorDialog}
        onChoice={handleCloseBehaviorChoice}
      />

      {/* Keyboard Shortcuts Help (? = active scope tab, Ctrl+? = global tab) */}
      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
        forceGlobal={forceGlobalTab}
      />

      {/* Sync Updates Floating Action Button */}
      <SyncUpdatesFAB />
    </>
  );
}

export default Layout;
