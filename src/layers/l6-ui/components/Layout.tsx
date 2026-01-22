/**
 * Layout Component
 * Application shell with sidebar navigation
 */

import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  FolderOpen,
  GraduationCap,
  CheckCircle,
  AlertCircle,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../l5-presentation/store';

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

export function Layout() {
  const { syncStatus, courses } = useStore();

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

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* Drag Region - allows window dragging */}
        <div style={styles.dragRegion} />

        {/* Logo / Title */}
        <div style={styles.logo}>
          <GraduationCap size={28} style={{ flexShrink: 0 }} />
          <span style={styles.logoText}>Quercus Desktop</span>
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
                })}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={styles.sidebarFooter}>
          <div style={styles.syncStatusDisplay}>
            {syncDisplay.icon}
            <span style={styles.syncText}>{syncDisplay.text}</span>
          </div>
          <div style={styles.version}>v0.1.0</div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

/** Component styles */
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-app)',
  },

  // Sidebar
  sidebar: {
    width: 'var(--sidebar-width)',
    backgroundColor: 'var(--bg-sidebar)',
    color: 'var(--text-inverse)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 'var(--z-sticky)',
  },

  // Drag region for frameless window
  dragRegion: {
    height: '40px',
    // @ts-expect-error - webkit property for electron
    WebkitAppRegion: 'drag',
    flexShrink: 0,
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-5)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },

  logoText: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    letterSpacing: '-0.01em',
  },

  nav: {
    flex: 1,
    padding: 'var(--space-4) 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
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
  },

  navLinkActive: {
    color: 'var(--text-inverse)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderLeftColor: 'var(--color-blue)',
  },

  navIcon: {
    fontSize: 'var(--text-base)',
    width: '24px',
    textAlign: 'center',
  },

  sidebarFooter: {
    padding: 'var(--space-4) var(--space-5)',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  syncStatusDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  syncDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-success)',
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
    marginLeft: 'var(--sidebar-width)',
    backgroundColor: 'var(--bg-app)',
    minHeight: '100vh',
    padding: 'var(--space-6)',
    overflowY: 'auto',
  },
};

export default Layout;
