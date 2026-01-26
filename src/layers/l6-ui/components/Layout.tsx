/**
 * Layout Component
 * Application shell with collapsible sidebar navigation
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  User,
  Settings,
  LogOut,
  ChevronDown,
  GripVertical,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../l5-presentation/store';
import type { EnrollmentTerm } from '../../../shared/ipc-contract';
import {
  useSidebarState,
  useNavOrder,
  useLandingPage,
} from '../../l5-presentation/settings';
import { formatTimeAgo } from '../constants';
import { TitleBar } from './TitleBar';
import { SyncResultToast, SyncConflictModal } from './shared';
import { useScrollbarVisibility } from '../hooks/useScrollbarVisibility';

// Debug flag - set to true only when debugging layout issues
const DEBUG_LAYOUT = false;

/** Navigation item configuration */
interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
}

const defaultNavItems: NavItem[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'calendar', path: '/calendar', label: 'Calendar', icon: Calendar },
  { id: 'courses', path: '/courses', label: 'Courses', icon: BookOpen },
  { id: 'files', path: '/files', label: 'Files', icon: FolderOpen },
  { id: 'settings', path: '/settings', label: 'Settings', icon: Settings },
];

// Get ordered nav items based on saved order
function getOrderedNavItems(savedOrder: string[]): NavItem[] {
  if (!savedOrder || savedOrder.length === 0) return defaultNavItems;

  const itemMap = new Map(defaultNavItems.map((item) => [item.id, item]));
  const ordered: NavItem[] = [];

  // Add items in saved order
  for (const id of savedOrder) {
    const item = itemMap.get(id);
    if (item) {
      ordered.push(item);
      itemMap.delete(id);
    }
  }

  // Add any remaining items (new items not in saved order)
  for (const item of itemMap.values()) {
    ordered.push(item);
  }

  return ordered;
}

export function Layout() {
  const {
    syncStatus,
    courses,
    lastSyncResult,
    lastSyncedAt,
    clearSyncResult,
    syncConflicts,
    resolveSyncConflict,
    resolveAllSyncConflicts,
    clearSyncConflicts,
  } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-hide scrollbar on main content area (show on scroll, hide after 1.5s)
  useScrollbarVisibility(mainRef, 1500);

  // Sidebar collapse state from settings
  const { collapsed: isCollapsed, setCollapsed } = useSidebarState();
  const [lockAnimation, setLockAnimation] = useState<'lock' | 'unlock' | null>(null);

  // Term end date for sync conflict expiration default
  const [termEndDate, setTermEndDate] = useState<string | null>(null);

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
              // Term must end in the future
              if (endDate <= now) return false;
              // If term has a start date, it must have started already
              if (t.startAt) {
                const startDate = new Date(t.startAt);
                if (startDate > now) return false;
              }
              return true;
            });

            // Sort by latest end date (prefer the term that ends furthest in the future)
            // This handles cases where multiple terms overlap - pick the main/longer one
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

  // Nav items with drag and drop - use settings hook
  const { order: savedNavOrder, setOrder: saveNavOrder } = useNavOrder();
  const navItems = useMemo(() => getOrderedNavItems(savedNavOrder), [savedNavOrder]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

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

  // Drag handlers for nav items
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
    // Add drag image styling
    const target = e.target as HTMLElement;
    target.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    target.style.opacity = '1';
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedItem && itemId !== draggedItem) {
      setDragOverItem(itemId);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const newItems = [...navItems];
    const draggedIndex = newItems.findIndex((item) => item.id === draggedItem);
    const targetIndex = newItems.findIndex((item) => item.id === targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item and insert at target position
      const [removed] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, removed);
      // Save new order via settings hook
      saveNavOrder(newItems.map((item) => item.id));
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

  // User profile state (will be populated from Canvas API)
  const [userProfile, setUserProfile] = useState<{
    name: string;
    email: string | null;
    avatarUrl: string | null;
  } | null>(null);

  // Profile dropdown state
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideButton =
        profileButtonRef.current && !profileButtonRef.current.contains(target);
      const isOutsideDropdown =
        profileDropdownRef.current && !profileDropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle profile button click - calculate position and toggle dropdown
  const handleProfileClick = useCallback(() => {
    if (!isProfileDropdownOpen && profileButtonRef.current) {
      const rect = profileButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // 4px gap
        left: rect.left + 8, // Small inset from left edge
        width: Math.max(rect.width - 16, 120), // Min width 120px
      });
    }
    setIsProfileDropdownOpen(!isProfileDropdownOpen);
  }, [isProfileDropdownOpen]);

  // Toggle sidebar with animation
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    // Trigger animation: locking (expanded->collapsed) or unlocking (collapsed->expanded)
    setLockAnimation(newState ? 'unlock' : 'lock');
    // Update via settings hook
    setCollapsed(newState);
    // Clear animation after it completes
    setTimeout(() => setLockAnimation(null), 500);
  };

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      const api = window.api;
      console.debug('[Layout] Fetching user profile, api available:', !!api);
      console.debug('[Layout] getUserProfile method available:', !!api?.getUserProfile);

      if (api?.getUserProfile) {
        try {
          const profile = await api.getUserProfile();
          console.debug('[Layout] User profile response:', profile);
          if (profile) {
            setUserProfile(profile);
            console.debug(
              '[Layout] User profile set:',
              profile.name,
              'avatar:',
              profile.avatarUrl ? 'yes' : 'no'
            );
          } else {
            console.warn(
              '[Layout] User profile returned null - Canvas client may not be connected'
            );
          }
        } catch (error) {
          console.error('[Layout] Failed to fetch user profile:', error);
        }
      } else {
        console.warn('[Layout] getUserProfile API not available');
      }
    };
    fetchUserProfile();
  }, []);

  // Debug: Log layout dimensions using ResizeObserver for reliable detection
  useEffect(() => {
    if (!DEBUG_LAYOUT) return;

    const logDimensions = () => {
      console.debug('[Layout] Window:', {
        width: window.innerWidth,
        height: window.innerHeight,
      });

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        console.debug('[Layout] Container:', { width: rect.width, height: rect.height });
      }

      if (mainRef.current) {
        const rect = mainRef.current.getBoundingClientRect();
        const style = getComputedStyle(mainRef.current);
        console.debug('[Layout] Main:', {
          width: rect.width,
          height: rect.height,
          marginLeft: style.marginLeft,
          padding: style.padding,
        });
      }
    };

    // Initial log
    logDimensions();

    // Use ResizeObserver for reliable resize detection (including maximize)
    const resizeObserver = new ResizeObserver(() => {
      logDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen to window resize as backup
    window.addEventListener('resize', logDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', logDimensions);
    };
  }, []);

  // Determine sync display based on actual state
  const getSyncDisplay = () => {
    if (syncStatus === 'syncing') {
      return {
        icon: (
          <Loader2
            size={14}
            color="var(--color-info)"
            style={{ animation: 'spin 1s linear infinite' }}
          />
        ),
        text: 'Syncing...',
      };
    }
    if (syncStatus === 'error') {
      return {
        icon: <AlertCircle size={14} color="var(--color-error)" />,
        text: 'Sync Error',
      };
    }
    // Check if we have any synced data
    const hasData = courses.some((c) => c.lastSyncedAt);
    if (!hasData) {
      return {
        icon: <AlertCircle size={14} color="var(--color-warning)" />,
        text: 'Not Synced',
      };
    }
    return {
      icon: <CheckCircle size={14} color="var(--color-success)" />,
      text: formatTimeAgo(lastSyncedAt),
    };
  };

  const syncDisplay = getSyncDisplay();
  const sidebarWidth = isCollapsed ? 64 : 220;

  // Debug: Log sidebar state changes
  useEffect(() => {
    console.debug('[Layout] Sidebar state:', {
      isCollapsed,
      sidebarWidth,
      userProfile: userProfile?.name,
    });
  }, [isCollapsed, sidebarWidth, userProfile]);

  return (
    <>
      <TitleBar sidebarWidth={sidebarWidth} onSidebarToggle={toggleSidebar} />
      <div ref={containerRef} style={styles.container}>
        {/* Sidebar - double-click to toggle */}
        <aside
          style={{
            ...styles.sidebar,
            width: `${sidebarWidth}px`,
          }}
          onDoubleClick={toggleSidebar}
        >
          {/* User Profile / Logo - clickable for dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              ref={profileButtonRef}
              style={{
                ...styles.profileSection,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                width: '100%',
              }}
              onClick={handleProfileClick}
              title={isCollapsed ? 'Profile menu' : undefined}
            >
              {userProfile?.avatarUrl ? (
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.name}
                  style={styles.avatar}
                />
              ) : (
                <div style={styles.avatarPlaceholder}>
                  <User size={20} />
                </div>
              )}
              {!isCollapsed && (
                <>
                  <div style={styles.profileInfo}>
                    <span style={styles.userName}>
                      {userProfile?.name || 'Canvas Student'}
                    </span>
                    <span style={styles.userEmail}>{userProfile?.email || ''}</span>
                  </div>
                  <ChevronDown
                    size={16}
                    style={{
                      marginLeft: 'auto',
                      opacity: 0.6,
                      transition: 'transform var(--transition-fast)',
                      transform: isProfileDropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                  />
                </>
              )}
            </button>
          </div>

          {/* Navigation - drag to reorder */}
          <nav style={styles.nav}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isDragging = draggedItem === item.id;
              const isDragOver = dragOverItem === item.id;
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, item.id)}
                  style={{
                    position: 'relative',
                    borderTop: isDragOver
                      ? '2px solid var(--color-blue)'
                      : '2px solid transparent',
                    transition: 'border-color 150ms ease',
                  }}
                >
                  <NavLink
                    to={item.path}
                    style={({ isActive }) => ({
                      ...styles.navLink,
                      ...(isActive ? styles.navLinkActive : {}),
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      paddingLeft: isCollapsed ? 0 : 'var(--space-3)',
                      paddingRight: isCollapsed ? 0 : 'var(--space-5)',
                      opacity: isDragging ? 0.5 : 1,
                    })}
                    title={isCollapsed ? item.label : undefined}
                  >
                    {!isCollapsed && (
                      <GripVertical
                        size={14}
                        style={{
                          ...styles.dragHandle,
                          cursor: 'grab',
                        }}
                      />
                    )}
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </NavLink>
                </div>
              );
            })}
          </nav>

          {/* Collapse Toggle - Lock/Unlock */}
          <button
            style={{
              ...styles.collapseButton,
              backgroundColor: isCollapsed
                ? 'rgba(255, 255, 255, 0.1)'
                : 'rgba(59, 130, 246, 0.35)',
              color: isCollapsed ? 'rgba(255, 255, 255, 0.6)' : '#60a5fa',
              boxShadow: isCollapsed ? 'none' : '0 0 8px rgba(96, 165, 250, 0.4)',
              transition: 'all 300ms ease',
            }}
            onClick={toggleSidebar}
            title={isCollapsed ? 'Lock sidebar expanded' : 'Unlock sidebar'}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation:
                  lockAnimation === 'lock'
                    ? 'lockShake 400ms ease-out'
                    : lockAnimation === 'unlock'
                      ? 'unlockWiggle 400ms ease-out'
                      : 'none',
              }}
            >
              {isCollapsed ? <Unlock size={16} /> : <Lock size={16} />}
            </span>
          </button>

          {/* Footer - Sync Status Always Centered */}
          <div
            style={{
              ...styles.sidebarFooter,
              justifyContent: 'center',
              padding: isCollapsed ? 'var(--space-3) 0' : 'var(--space-3) var(--space-4)',
            }}
          >
            <div
              style={{
                ...styles.syncStatusCentered,
                gap: isCollapsed ? 0 : 'var(--space-2)',
              }}
              title={syncDisplay.text}
            >
              {syncDisplay.icon}
              {!isCollapsed && (
                <span style={styles.syncText}>
                  {syncDisplay.text}
                </span>
              )}
            </div>
          </div>
        </aside>

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

      {/* Sync Conflict Modal */}
      <SyncConflictModal
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
      />

      {/* Profile Dropdown - rendered via portal to escape sidebar overflow */}
      {isProfileDropdownOpen &&
        createPortal(
          <div
            ref={profileDropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              backgroundColor: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              padding: 'var(--space-2)',
              zIndex: 1000,
            }}
          >
            <button
              style={{ ...styles.dropdownItem, color: 'var(--color-error)' }}
              onClick={async () => {
                setIsProfileDropdownOpen(false);
                await window.api.deleteCredential();
                window.location.reload();
              }}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

/** Component styles */
const TITLE_BAR_HEIGHT = 32;

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
    height: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
    marginTop: `${TITLE_BAR_HEIGHT}px`,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-app)',
  },

  // Sidebar - extends full height, title bar overlays the top portion
  sidebar: {
    backgroundColor: 'var(--bg-sidebar)',
    color: 'var(--text-inverse)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    paddingTop: `${TITLE_BAR_HEIGHT}px`,
    zIndex: 100,
    transition: 'width 250ms cubic-bezier(0.33, 1, 0.68, 1)',
    overflow: 'hidden',
    minWidth: 64, // Prevent sidebar from shrinking below minimum
    userSelect: 'none', // Prevent text selection on double-click
  },

  profileSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
    paddingLeft: '12px', // Fixed left padding to keep avatar position stable
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    minHeight: '72px',
    overflow: 'hidden',
  },

  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    border: '2px solid rgba(255, 255, 255, 0.2)',
  },

  avatarPlaceholder: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'rgba(255, 255, 255, 0.6)',
  },

  profileInfo: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  userName: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-inverse)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  userEmail: {
    fontSize: 'var(--text-xs)',
    color: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  profileDropdown: {
    position: 'absolute',
    top: '100%',
    left: 'var(--space-2)',
    right: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    padding: 'var(--space-2)',
    zIndex: 500,
    marginTop: 'var(--space-1)',
  },

  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-2) var(--space-3)',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-sm)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  },

  nav: {
    flex: 1,
    padding: 'var(--space-4) 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    overflow: 'hidden',
  },

  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-3) var(--space-5)',
    color: 'rgba(255, 255, 255, 0.7)',
    textDecoration: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    transition: 'all var(--transition-fast)',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },

  navLinkActive: {
    color: 'var(--text-inverse)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderLeftColor: 'var(--color-blue)',
  },

  dragHandle: {
    color: 'rgba(255, 255, 255, 0.3)',
    flexShrink: 0,
    marginRight: 'var(--space-1)',
    transition: 'color var(--transition-fast)',
  },

  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    margin: '0 auto var(--space-2)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  sidebarFooter: {
    padding: 'var(--space-3) var(--space-4)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  syncStatusCentered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
  },

  syncText: {
    fontSize: 'var(--text-xs)',
    color: 'rgba(255, 255, 255, 0.6)',
  },

  // Main content - fills available space and scales with viewport
  main: {
    flex: 1,
    backgroundColor: 'var(--bg-app)',
    height: `calc(100vh - ${TITLE_BAR_HEIGHT}px)`,
    padding: 'var(--space-6)',
    overflowY: 'auto',
    overflowX: 'hidden',
    transition: 'margin-left 250ms cubic-bezier(0.33, 1, 0.68, 1)',
    display: 'flex',
    flexDirection: 'column',
  },
};

export default Layout;
