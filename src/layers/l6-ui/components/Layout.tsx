/**
 * Layout Component
 * Application shell with collapsible sidebar navigation
 */

import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  FolderOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Settings,
  LogOut,
  ChevronDown,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { useStore, SyncResultSummary } from '../../l5-presentation/store';
import { TitleBar } from './TitleBar';
import { SettingsModal } from './SettingsModal';
import { SyncResultToast } from './shared';

// Debug flag - set to true for debugging
const DEBUG_LAYOUT = true;

// Sidebar state storage key
const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

/** Navigation item configuration */
interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/calendar', label: 'Calendar', icon: Calendar },
  { path: '/courses', label: 'Courses', icon: BookOpen },
  { path: '/files', label: 'Files', icon: FolderOpen },
];

// Load sidebar state from localStorage
function loadSidebarState(): boolean {
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

// Save sidebar state to localStorage
function saveSidebarState(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch (e) {
    console.error('Failed to save sidebar state:', e);
  }
}

export function Layout() {
  const { syncStatus, courses, lastSyncResult, clearSyncResult } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Sidebar collapse state
  const [isCollapsed, setIsCollapsed] = useState(() => loadSidebarState());

  // User profile state (will be populated from Canvas API)
  const [userProfile, setUserProfile] = useState<{
    name: string;
    email: string | null;
    avatarUrl: string | null;
  } | null>(null);

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // About modal state
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Profile dropdown state
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle sidebar
  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    saveSidebarState(newState);
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
            console.debug('[Layout] User profile set:', profile.name, 'avatar:', profile.avatarUrl ? 'yes' : 'no');
          } else {
            console.warn('[Layout] User profile returned null - Canvas client may not be connected');
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
      console.debug('[Layout] Window:', { width: window.innerWidth, height: window.innerHeight });

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
        icon: <Loader2 size={12} color="var(--color-info)" style={{ animation: 'spin 1s linear infinite' }} />,
        text: 'Syncing...',
      };
    }
    if (syncStatus === 'error') {
      return {
        icon: <AlertCircle size={12} color="var(--color-error)" />,
        text: 'Sync Error',
      };
    }
    // Check if we have any synced data
    const hasData = courses.some(c => c.lastSyncedAt);
    if (!hasData) {
      return {
        icon: <AlertCircle size={12} color="var(--color-warning)" />,
        text: 'Not Synced',
      };
    }
    return {
      icon: <CheckCircle size={12} color="var(--color-success)" />,
      text: 'Synced',
    };
  };

  const syncDisplay = getSyncDisplay();
  const sidebarWidth = isCollapsed ? 64 : 220;

  // Debug: Log sidebar state changes
  useEffect(() => {
    console.debug('[Layout] Sidebar state:', { isCollapsed, sidebarWidth, userProfile: userProfile?.name });
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
          <div ref={profileDropdownRef} style={{ position: 'relative' }}>
            <button
              style={{
                ...styles.profileSection,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? 'var(--space-4) var(--space-2)' : 'var(--space-4)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                width: '100%',
              }}
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
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
                    <span style={styles.userEmail}>
                      {userProfile?.email || ''}
                    </span>
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

            {/* Profile Dropdown */}
            {isProfileDropdownOpen && (
              <div style={styles.profileDropdown}>
                <button
                  style={styles.dropdownItem}
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    setIsAboutOpen(true);
                  }}
                >
                  <Info size={16} />
                  <span>About</span>
                </button>
                <button
                  style={{ ...styles.dropdownItem, color: 'var(--color-error)' }}
                  onClick={async () => {
                    setIsProfileDropdownOpen(false);
                    await window.api.deleteCredential();
                    window.location.reload();
                  }}
                >
                  <LogOut size={16} />
                  <span>Exit</span>
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav style={styles.nav}>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  style={({ isActive }) => ({
                    ...styles.navLink,
                    ...(isActive ? styles.navLinkActive : {}),
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    paddingLeft: isCollapsed ? 0 : 'var(--space-5)',
                    paddingRight: isCollapsed ? 0 : 'var(--space-5)',
                  })}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon size={18} style={{ flexShrink: 0 }} />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}

          </nav>

          {/* Collapse Toggle */}
          <button
            style={styles.collapseButton}
            onClick={toggleSidebar}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Footer */}
          <div
            style={{
              ...styles.sidebarFooter,
              justifyContent: isCollapsed ? 'center' : 'space-between',
              padding: isCollapsed ? 'var(--space-4) var(--space-2)' : 'var(--space-4) var(--space-5)',
            }}
          >
            {/* Left: Settings button */}
            <button
              style={styles.settingsButton}
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
            >
              <Settings size={16} />
            </button>
            {/* Center: Version */}
            {!isCollapsed && <div style={styles.version}>v0.1.0</div>}
            {/* Right: Sync status */}
            <div
              style={styles.syncStatusDisplay}
              title={isCollapsed ? syncDisplay.text : undefined}
            >
              {syncDisplay.icon}
              {!isCollapsed && <span style={styles.syncText}>{syncDisplay.text}</span>}
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

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* About Modal */}
      {isAboutOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsAboutOpen(false)}>
          <div style={styles.aboutModal} onClick={(e) => e.stopPropagation()}>
            <h2 style={styles.aboutTitle}>Canvas Assistant</h2>
            <p style={styles.aboutVersion}>Version 0.1.0</p>
            <p style={styles.aboutDescription}>
              An offline-first academic command center for Canvas LMS.
              Track assignments, manage deadlines, and stay on top of your courses.
            </p>
            <div style={styles.aboutFooter}>
              <button
                style={styles.aboutCloseBtn}
                onClick={() => setIsAboutOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Result Toast */}
      <SyncResultToast
        result={lastSyncResult}
        onClose={clearSyncResult}
        autoHideDuration={6000}
      />
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
    transition: 'width 200ms ease',
    overflow: 'hidden',
    minWidth: 64, // Prevent sidebar from shrinking below minimum
    userSelect: 'none', // Prevent text selection on double-click
  },

  profileSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-4)',
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
    borderLeft: '3px solid transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },

  navLinkActive: {
    color: 'var(--text-inverse)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderLeftColor: 'var(--color-blue)',
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
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-2)',
  },

  settingsButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  syncStatusDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  syncText: {
    fontSize: 'var(--text-xs)',
    color: 'rgba(255, 255, 255, 0.6)',
  },

  version: {
    fontSize: 'var(--text-xs)',
    color: 'rgba(255, 255, 255, 0.4)',
  },

  // Main content
  main: {
    flex: 1,
    backgroundColor: 'var(--bg-app)',
    minHeight: '100vh',
    padding: 'var(--space-6)',
    overflowY: 'auto',
    transition: 'margin-left 200ms ease',
  },

  // About Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  aboutModal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-6)',
    maxWidth: '400px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },

  aboutTitle: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--space-2)',
  },

  aboutVersion: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-4)',
  },

  aboutDescription: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
    marginBottom: 'var(--space-6)',
  },

  aboutFooter: {
    display: 'flex',
    justifyContent: 'center',
  },

  aboutCloseBtn: {
    padding: 'var(--space-2) var(--space-6)',
    backgroundColor: 'var(--color-navy)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },
};

export default Layout;
