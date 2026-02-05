/**
 * Sidebar Component
 * Collapsible navigation sidebar with profile, drag-to-reorder nav items, and sync status
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
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
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../l5-presentation/store';
import {
  useSidebarState,
  useNavOrder,
  STORAGE_KEYS,
  SETTINGS_DEFAULTS,
} from '../../l5-presentation/settings';
import { formatTimeAgo } from '../constants';
import { layoutStyles as styles } from './layoutStyles';
import { NotificationDotGroup } from './shared';
import { useSidebarDots, useFileUpdateDots } from '../hooks';

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
  { id: 'updates', path: '/updates', label: 'Updates', icon: Bell },
  { id: 'settings', path: '/settings', label: 'Settings', icon: Settings },
];

/** Get ordered nav items based on saved order */
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

interface SidebarProps {
  onToggle: () => void;
}

export function Sidebar({ onToggle }: SidebarProps) {
  const { syncStatus, courses, lastSyncedAt, syncUpdates } = useStore();
  const { totalUnseen: updatesBadgeCount } = syncUpdates;

  // Notification dots for sidebar nav items
  const sidebarDots = useSidebarDots();
  const fileUpdateDots = useFileUpdateDots();

  // Sidebar collapse state from settings
  const { collapsed: isCollapsed, setCollapsed } = useSidebarState();
  const [lockAnimation, setLockAnimation] = useState<'lock' | 'unlock' | null>(null);

  // Nav items with drag and drop - use settings hook
  const { order: savedNavOrder, setOrder: saveNavOrder } = useNavOrder();

  // Check if Updates should be shown in sidebar (default: hidden)
  const [showUpdatesInSidebar, setShowUpdatesInSidebar] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SHOW_UPDATES_IN_SIDEBAR);
      if (stored !== null) {
        return JSON.parse(stored) === true;
      }
    } catch {
      // Ignore parse errors
    }
    return SETTINGS_DEFAULTS[STORAGE_KEYS.SHOW_UPDATES_IN_SIDEBAR] ?? false;
  });

  // Listen for storage events to update showUpdatesInSidebar
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SHOW_UPDATES_IN_SIDEBAR) {
        try {
          setShowUpdatesInSidebar(e.newValue ? JSON.parse(e.newValue) === true : false);
        } catch {
          setShowUpdatesInSidebar(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Filter nav items - hide 'updates' if setting is false
  const navItems = useMemo(() => {
    const ordered = getOrderedNavItems(savedNavOrder);
    if (!showUpdatesInSidebar) {
      return ordered.filter((item) => item.id !== 'updates');
    }
    return ordered;
  }, [savedNavOrder, showUpdatesInSidebar]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  // User profile state
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

  const sidebarWidth = isCollapsed ? 64 : 220;

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
  const toggleSidebar = useCallback(() => {
    const newState = !isCollapsed;
    // Trigger animation: locking (expanded->collapsed) or unlocking (collapsed->expanded)
    setLockAnimation(newState ? 'unlock' : 'lock');
    // Update via settings hook
    setCollapsed(newState);
    // Clear animation after it completes
    setTimeout(() => setLockAnimation(null), 500);
    // Notify parent
    onToggle();
  }, [isCollapsed, setCollapsed, onToggle]);

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      const api = window.api;
      console.debug('[Sidebar] Fetching user profile, api available:', !!api);

      if (api?.getUserProfile) {
        try {
          const profile = await api.getUserProfile();
          if (profile) {
            setUserProfile(profile);
            console.debug('[Sidebar] User profile set:', profile.name);
          }
        } catch (error) {
          console.error('[Sidebar] Failed to fetch user profile:', error);
        }
      }
    };
    fetchUserProfile();
  }, []);

  // Drag handlers for nav items
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
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
      const [removed] = newItems.splice(draggedIndex, 1);
      newItems.splice(targetIndex, 0, removed);
      saveNavOrder(newItems.map((item) => item.id));
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

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
    const syncedCourses = courses.filter((c) => c.lastSyncedAt);
    if (syncedCourses.length === 0) {
      return {
        icon: <AlertCircle size={14} color="var(--color-warning)" />,
        text: 'Not Synced',
      };
    }
    // Use store's lastSyncedAt, or fall back to most recent course sync time
    const effectiveLastSync =
      lastSyncedAt ||
      syncedCourses.reduce(
        (latest, c) => {
          if (!c.lastSyncedAt) return latest;
          if (!latest) return c.lastSyncedAt;
          return c.lastSyncedAt > latest ? c.lastSyncedAt : latest;
        },
        null as string | null
      );

    return {
      icon: <CheckCircle size={14} color="var(--color-success)" />,
      text: formatTimeAgo(effectiveLastSync),
    };
  };

  const syncDisplay = getSyncDisplay();

  return (
    <>
      <aside
        style={{
          ...styles.sidebar,
          width: `${sidebarWidth}px`,
        }}
        onDoubleClick={toggleSidebar}
      >
        {/* User Profile - clickable for dropdown */}
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
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isDragging = draggedItem === item.id;
            const isDragOver = dragOverItem === item.id;
            const isLastItem = index === navItems.length - 1;
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
                  borderBottom: isLastItem
                    ? 'none'
                    : '1px solid rgba(255, 255, 255, 0.1)',
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
                  <div
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    {item.id === 'updates' && updatesBadgeCount > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-8px',
                          minWidth: '16px',
                          height: '16px',
                          padding: '0 4px',
                          backgroundColor: 'var(--color-primary)',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: 600,
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        }}
                      >
                        {updatesBadgeCount > 99 ? '99+' : updatesBadgeCount}
                      </span>
                    )}
                  </div>
                  {!isCollapsed && (
                    <span style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                      {item.label}
                      {/* Notification dots for nav items with updates */}
                      {item.id === 'dashboard' && sidebarDots.length > 0 && (
                        <NotificationDotGroup dots={sidebarDots} maxDots={5} size="sm" />
                      )}
                      {item.id === 'courses' && sidebarDots.length > 0 && (
                        <NotificationDotGroup dots={sidebarDots} maxDots={5} size="sm" />
                      )}
                      {item.id === 'files' && fileUpdateDots.length > 0 && (
                        <NotificationDotGroup
                          dots={fileUpdateDots}
                          maxDots={3}
                          size="sm"
                        />
                      )}
                    </span>
                  )}
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

        {/* Footer - Sync Status */}
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
            {!isCollapsed && <span style={styles.syncText}>{syncDisplay.text}</span>}
          </div>
        </div>
      </aside>

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

export { type NavItem };
