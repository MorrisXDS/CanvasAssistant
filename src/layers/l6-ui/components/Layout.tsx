/**
 * Layout Component
 * Application shell with collapsible sidebar navigation
 */

import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../../l5-presentation/store';
import type { EnrollmentTerm } from '../../../shared/ipc-contract';
import { useSidebarState, useLandingPage } from '../../l5-presentation/settings';
import { TitleBar } from './TitleBar';
import { SyncResultToast, CloseBehaviorDialog, SyncUpdatesFAB } from './shared';
import { useScrollbarVisibility } from '../hooks/useScrollbarVisibility';
import { Sidebar } from './Sidebar';
import { layoutStyles as styles } from './layoutStyles';

// Debug flag - set to true only when debugging layout issues
const DEBUG_LAYOUT = false;

export function Layout() {
  const { lastSyncResult, clearSyncResult, syncConflicts } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-hide scrollbar on main content area (show on scroll, hide after 1.5s)
  useScrollbarVisibility(mainRef, 1500);

  // Sidebar collapse state from settings
  const { collapsed: isCollapsed } = useSidebarState();

  // Term end date for sync conflict expiration default
  const [termEndDate, setTermEndDate] = useState<string | null>(null);

  // Close behavior dialog state (shown on first close when preference not set)
  const [showCloseBehaviorDialog, setShowCloseBehaviorDialog] = useState(false);

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
      console.log(`[Layout Debug] Route changed to: ${location.pathname}`);
      if (mainRef.current) {
        const mainRect = mainRef.current.getBoundingClientRect();
        const mainStyle = getComputedStyle(mainRef.current);
        const firstChild = mainRef.current.firstElementChild;

        console.log(`[Layout Debug] Page: ${location.pathname}`);
        console.log(`[Layout Debug]   Main top: ${mainRect.top}px`);
        console.log(`[Layout Debug]   Main paddingTop: ${mainStyle.paddingTop}`);

        if (firstChild) {
          const childRect = firstChild.getBoundingClientRect();
          const childStyle = getComputedStyle(firstChild);
          console.log(`[Layout Debug]   Page content top: ${childRect.top}px`);
          console.log(`[Layout Debug]   Page content marginTop: ${childStyle.marginTop}`);
          console.log(
            `[Layout Debug]   GAP (content top - main top): ${childRect.top - mainRect.top}px`
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
          <Outlet />
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

      {/* Sync Updates Floating Action Button */}
      <SyncUpdatesFAB />
    </>
  );
}

export default Layout;
