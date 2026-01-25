/**
 * SettingsModal Component
 * Modal overlay for application settings
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Link,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  Sun,
  Moon,
  Monitor,
  GraduationCap,
  FolderOpen,
  BookOpen,
  Eye,
  EyeOff,
  Calendar,
  Home,
  LayoutDashboard,
  Paintbrush,
  Bell,
  Database,
  GripVertical,
  RotateCcw,
  LayoutGrid,
  Upload,
  Download,
  ShieldCheck,
  Key,
} from 'lucide-react';
import { useStore } from '../../l5-presentation/store';
import type { Course } from '../../l5-presentation/types';
import { ConfirmDialog } from './shared/ConfirmDialog';

// Settings sections
type SettingsSection = 'general' | 'dashboard' | 'canvas' | 'sync' | 'academic' | 'courses' | 'calendar' | 'files' | 'appearance' | 'notifications';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFullPage?: boolean;
}

interface SyncPreferences {
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  syncFiles: boolean;
  syncAnnouncements: boolean;
  // Task defaults
  autoAssignDueDate: boolean; // Auto-assign today 23:59 for tasks without due date
  // HTML content sync
  saveHtmlContent: boolean;
  htmlUrlRewriting: 'local' | 'original';
  downloadImages: boolean;
  downloadLinkedFiles: boolean;
}

interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
}

interface NotificationSettings {
  enabled: boolean;
  priorityAlerts: boolean;
  syncStatus: boolean;
  dueDateReminders: boolean;
  gradeAlerts: boolean;
  // Intelligence
  workloadPredictions: boolean;
  riskWarnings: boolean;
  // Smart quiet mode
  quietWhenUnplugged: boolean;
  quietWhenFullscreen: boolean;
  quietWhenBusy: boolean;
}

interface AcademicSettings {
  defaultTargetGrade: number;
  termSelection: 'auto' | 'all' | string; // 'auto', 'all', or term external_id
}

interface EnrollmentTerm {
  id: number;
  externalId: string;
  name: string;
  startAt: string | null;
  endAt: string | null;
}

interface FileExplorerSettings {
  defaultState: 'collapsed' | 'expanded' | 'remember';
  defaultViewMode: 'list' | 'grid';
  downloadLocation: string | null; // null = use default
}

interface CourseSettings {
  defaultViewMode: 'grid' | 'list';
  showHiddenByDefault: boolean;
}

interface CalendarSettings {
  defaultViewMode: 'month' | 'week';
}

interface GeneralSettings {
  landingPage: string;
}

interface ContentSettings {
  linkBehavior: 'always-external' | 'prefer-local';
}

const LANDING_PAGE_OPTIONS = [
  { value: '/', label: 'Dashboard', icon: LayoutDashboard },
  { value: '/calendar', label: 'Calendar', icon: Calendar },
  { value: '/courses', label: 'Courses', icon: BookOpen },
  { value: '/files', label: 'Files', icon: FolderOpen },
];

const STORAGE_KEYS = {
  SYNC_PREFS: 'syncPreferences',
  APPEARANCE: 'appearanceSettings',
  NOTIFICATIONS: 'notificationSettings',
  ACADEMIC: 'academicSettings',
  FILE_EXPLORER: 'fileExplorerSettings',
  COURSES: 'courseSettings',
  CALENDAR: 'calendarSettings',
  CONTENT: 'contentSettings',
  CANVAS_URL: 'canvasUrl',
  LANDING_PAGE: 'landingPage',
};

function loadSettings<T extends object>(key: string, defaults: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults, but only use stored values that are defined
      // This ensures new default fields are applied to old stored settings
      const result = { ...defaults };
      for (const k of Object.keys(parsed)) {
        if (parsed[k] !== undefined) {
          (result as Record<string, unknown>)[k] = parsed[k];
        }
      }
      return result;
    }
  } catch (e) {
    console.error(`Failed to load ${key}:`, e);
  }
  return defaults;
}

function saveSettings<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key}:`, e);
  }
}

// Apply theme to document and listen for system changes
function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

// Dashboard layout settings constants
const DASHBOARD_STORAGE_KEYS = {
  SECTION_ORDER: 'dashboardSectionOrder',
};

const DEFAULT_DASHBOARD_ORDER = ['priority', 'notifications', 'recommendations', 'insights'];

const DASHBOARD_SECTION_LABELS: Record<string, string> = {
  priority: 'Upcoming Assignments',
  notifications: 'Recent Updates',
  recommendations: 'Recommendations',
  insights: 'Insights',
};

/**
 * Dashboard Settings Section - Interactive layout configuration
 */
function DashboardSettingsSection() {
  const [sectionOrder, setSectionOrder] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(DASHBOARD_STORAGE_KEYS.SECTION_ORDER);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [...DEFAULT_DASHBOARD_ORDER];
  });

  const [draggedItem, setDraggedItem] = React.useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = React.useState<string | null>(null);

  const isCustomized = React.useMemo(() => {
    return sectionOrder.some((id, i) => id !== DEFAULT_DASHBOARD_ORDER[i]);
  }, [sectionOrder]);

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedItem(sectionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    if (draggedItem && sectionId !== draggedItem) {
      setDragOverItem(sectionId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetId) return;

    const newOrder = [...sectionOrder];
    const draggedIndex = newOrder.indexOf(draggedItem);
    const targetIndex = newOrder.indexOf(targetId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Swap positions
      newOrder[draggedIndex] = targetId;
      newOrder[targetIndex] = draggedItem;
      setSectionOrder(newOrder);
      localStorage.setItem(DASHBOARD_STORAGE_KEYS.SECTION_ORDER, JSON.stringify(newOrder));
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleReset = () => {
    setSectionOrder([...DEFAULT_DASHBOARD_ORDER]);
    localStorage.removeItem(DASHBOARD_STORAGE_KEYS.SECTION_ORDER);
  };

  return (
    <div style={dashboardStyles.section}>
      <h3 style={dashboardStyles.sectionTitle}>Dashboard Layout</h3>
      <p style={dashboardStyles.sectionDesc}>
        Customize the arrangement of dashboard sections. Drag items to reorder.
      </p>

      <div style={dashboardStyles.gridPreview}>
        {sectionOrder.map((sectionId, index) => (
          <div
            key={sectionId}
            draggable
            onDragStart={(e) => handleDragStart(e, sectionId)}
            onDragOver={(e) => handleDragOver(e, sectionId)}
            onDrop={(e) => handleDrop(e, sectionId)}
            onDragEnd={handleDragEnd}
            style={{
              ...dashboardStyles.gridItem,
              opacity: draggedItem === sectionId ? 0.5 : 1,
              borderColor: dragOverItem === sectionId ? 'var(--color-blue)' : 'var(--border-default)',
              borderWidth: dragOverItem === sectionId ? '2px' : '1px',
            }}
          >
            <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={dashboardStyles.gridItemLabel}>
              {DASHBOARD_SECTION_LABELS[sectionId]}
            </span>
            <span style={dashboardStyles.gridItemPosition}>
              {index + 1}
            </span>
          </div>
        ))}
      </div>

      <div style={dashboardStyles.gridLegend}>
        <div style={dashboardStyles.legendItem}>
          <div style={{ ...dashboardStyles.legendBox, backgroundColor: 'var(--color-blue-50)' }}>1</div>
          <span>Top Left</span>
        </div>
        <div style={dashboardStyles.legendItem}>
          <div style={{ ...dashboardStyles.legendBox, backgroundColor: 'var(--color-blue-50)' }}>2</div>
          <span>Top Right</span>
        </div>
        <div style={dashboardStyles.legendItem}>
          <div style={{ ...dashboardStyles.legendBox, backgroundColor: 'var(--color-blue-50)' }}>3</div>
          <span>Bottom Left</span>
        </div>
        <div style={dashboardStyles.legendItem}>
          <div style={{ ...dashboardStyles.legendBox, backgroundColor: 'var(--color-blue-50)' }}>4</div>
          <span>Bottom Right</span>
        </div>
      </div>

      {isCustomized && (
        <button style={dashboardStyles.resetButton} onClick={handleReset}>
          <RotateCcw size={14} />
          Reset to Default Layout
        </button>
      )}

      <div style={dashboardStyles.divider} />

      <div style={dashboardStyles.field}>
        <label style={dashboardStyles.label}>Interaction Tips</label>
        <ul style={dashboardStyles.tipsList}>
          <li>Hover over any section to reveal the drag handle</li>
          <li>Drag sections by their grip handle to reorder</li>
          <li>Your layout preferences are saved automatically</li>
        </ul>
      </div>
    </div>
  );
}

const dashboardStyles: Record<string, React.CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-4)',
  },
  sectionTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
    margin: 0,
  },
  sectionDesc: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  gridPreview: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
  },
  gridItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: 'grab',
    transition: 'all var(--transition-fast)',
  },
  gridItemLabel: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },
  gridItemPosition: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 'var(--font-semibold)',
    backgroundColor: 'var(--color-blue-50)',
    color: 'var(--color-navy)',
    borderRadius: 'var(--radius-full)',
  },
  gridLegend: {
    display: 'flex',
    gap: 'var(--space-4)',
    justifyContent: 'center',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
  },
  legendBox: {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: 'var(--font-semibold)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-navy)',
  },
  resetButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    alignSelf: 'center',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--border-light)',
    margin: 'var(--space-2) 0',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },
  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },
  tipsList: {
    margin: 0,
    paddingLeft: 'var(--space-4)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },
};

export function SettingsModal({ isOpen, onClose, isFullPage = false }: SettingsModalProps) {
  const { courses, fetchCourses } = useStore();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  // Canvas connection state
  const [canvasUrl, setCanvasUrl] = useState('');
  const canvasUrlInitializedRef = React.useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Token validation state
  const [isValidatingToken, setIsValidatingToken] = useState(false);
  const [tokenValidationResult, setTokenValidationResult] = useState<{
    status: 'success' | 'error' | null;
    message: string | null;
  }>({ status: null, message: null });

  // Token replacement modal state
  const [showTokenReplaceModal, setShowTokenReplaceModal] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [isValidatingNewToken, setIsValidatingNewToken] = useState(false);
  const [newTokenValidation, setNewTokenValidation] = useState<{
    valid: boolean | null;
    userName: string | null;
    error: string | null;
  }>({ valid: null, userName: null, error: null });
  const [isReplacingToken, setIsReplacingToken] = useState(false);

  // Sync preferences
  const [syncPrefs, setSyncPrefs] = useState<SyncPreferences>(() =>
    loadSettings(STORAGE_KEYS.SYNC_PREFS, {
      autoSyncEnabled: true,
      autoSyncInterval: 30,
      syncFiles: true,
      syncAnnouncements: true,
      autoAssignDueDate: false,
      saveHtmlContent: true,
      htmlUrlRewriting: 'local' as const,
      downloadImages: true,
      downloadLinkedFiles: true,
    })
  );

  // Appearance settings
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    loadSettings(STORAGE_KEYS.APPEARANCE, {
      theme: 'system' as const,
      sidebarCollapsed: false,
    })
  );

  // Notification settings
  const [notifications, setNotifications] = useState<NotificationSettings>(() =>
    loadSettings(STORAGE_KEYS.NOTIFICATIONS, {
      enabled: true,
      priorityAlerts: true,
      syncStatus: true,
      dueDateReminders: true,
      gradeAlerts: true,
      workloadPredictions: true,
      riskWarnings: true,
      quietWhenUnplugged: true,
      quietWhenFullscreen: true,
      quietWhenBusy: true,
    })
  );

  // Academic settings
  const [academic, setAcademic] = useState<AcademicSettings>(() =>
    loadSettings(STORAGE_KEYS.ACADEMIC, {
      defaultTargetGrade: 85,
      termSelection: 'auto',
    })
  );

  // Course-specific sync settings
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [perCourseSyncSettings, setPerCourseSyncSettings] = useState<{
    autoAssignDueDate: number | null; // null = inherit, 0 = off, 1 = on
    allowGuessedOverride: number;
  }>({ autoAssignDueDate: null, allowGuessedOverride: 1 });
  const [isLoadingCourseSettings, setIsLoadingCourseSettings] = useState(false);

  // Enrollment terms loaded from database
  const [enrollmentTerms, setEnrollmentTerms] = useState<EnrollmentTerm[]>([]);

  // File explorer settings
  const [fileExplorer, setFileExplorer] = useState<FileExplorerSettings>(() =>
    loadSettings(STORAGE_KEYS.FILE_EXPLORER, {
      defaultState: 'remember',
      defaultViewMode: 'list',
      downloadLocation: null,
    })
  );

  // Current download directory (fetched from main process)
  const [currentDownloadPath, setCurrentDownloadPath] = useState<string>('');

  // Course settings
  const [courseSettings, setCourseSettings] = useState<CourseSettings>(() =>
    loadSettings(STORAGE_KEYS.COURSES, {
      defaultViewMode: 'grid',
      showHiddenByDefault: false,
    })
  );

  // Calendar settings
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(() =>
    loadSettings(STORAGE_KEYS.CALENDAR, {
      defaultViewMode: 'month',
    })
  );

  // Content settings (link behavior)
  const [contentSettings, setContentSettings] = useState<ContentSettings>(() =>
    loadSettings(STORAGE_KEYS.CONTENT, {
      linkBehavior: 'always-external',
    })
  );

  // Landing page setting
  const [landingPage, setLandingPage] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.LANDING_PAGE) || '/';
    } catch {
      return '/';
    }
  });

  // Clear data confirmation dialog
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [deleteTokenOnClear, setDeleteTokenOnClear] = useState(false);

  // Apply theme on mount and listen for system preference changes
  useEffect(() => {
    applyTheme(appearance.theme);

    if (appearance.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [appearance.theme]);

  // Check canvas connection on mount
  useEffect(() => {
    if (isOpen) {
      checkCanvasConnection();
      fetchEnrollmentTerms();
      fetchDownloadDirectory();
    } else {
      // Reset initialization flag when modal closes so URL loads fresh on next open
      canvasUrlInitializedRef.current = false;
    }
  }, [isOpen]);

  // Fetch current download directory
  const fetchDownloadDirectory = async () => {
    try {
      const result = await window.api.getFilesDirectory();
      setCurrentDownloadPath(result.path);
    } catch (error) {
      console.error('[Settings] Failed to fetch download directory:', error);
    }
  };

  // Handle changing download directory
  const handleChangeDownloadLocation = async () => {
    try {
      const result = await window.api.selectFilesDirectory();
      if (result.success && result.data?.path) {
        const newPath = result.data.path;
        // Set the directory in the main process
        const setResult = await window.api.setFilesDirectory(newPath);
        if (setResult.success) {
          setCurrentDownloadPath(newPath);
          updateFileExplorer({ downloadLocation: newPath });
        } else {
          console.error('[Settings] Failed to set download directory:', setResult.error);
        }
      }
    } catch (error) {
      console.error('[Settings] Failed to change download location:', error);
    }
  };

  // Fetch enrollment terms from database
  const fetchEnrollmentTerms = async () => {
    try {
      const terms = await window.api.getEnrollmentTerms();
      console.debug('[Settings] Fetched enrollment terms:', terms);
      setEnrollmentTerms(terms);
    } catch (error) {
      console.error('[Settings] Failed to fetch enrollment terms:', error);
    }
  };

  const checkCanvasConnection = async () => {
    try {
      const hasCredential = await window.api.hasCredential();
      const savedUrl = localStorage.getItem(STORAGE_KEYS.CANVAS_URL) || '';
      // Only set URL on first initialization - don't overwrite user input
      if (!canvasUrlInitializedRef.current) {
        setCanvasUrl(savedUrl);
        canvasUrlInitializedRef.current = true;
      }
      setIsConnected(hasCredential && !!savedUrl);
    } catch {
      setIsConnected(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await window.api.deleteCredential();
      setIsConnected(false);
      localStorage.removeItem(STORAGE_KEYS.CANVAS_URL);
      setCanvasUrl('');
    } catch (e) {
      console.error('Failed to disconnect:', e);
    }
  };

  // Normalize Canvas URL (add https:// if missing, remove trailing slashes)
  const normalizeUrl = (url: string): string => {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized.replace(/\/+$/, '');
  };

  const handleReconnect = async () => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.connectCanvas(normalizedUrl);
      if (result.success) {
        setIsConnected(true);
        setCanvasUrl(normalizedUrl);
        localStorage.setItem(STORAGE_KEYS.CANVAS_URL, normalizedUrl);
      } else {
        setConnectionError(result.error || 'Failed to connect');
      }
    } catch (e) {
      setConnectionError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  // Validate the current token
  const handleValidateToken = async () => {
    if (!canvasUrl) return;
    setIsValidatingToken(true);
    setTokenValidationResult({ status: null, message: null });
    try {
      // Get the stored token and validate it
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.connectCanvas(normalizedUrl);
      if (result.success) {
        setTokenValidationResult({
          status: 'success',
          message: 'Token is valid and working',
        });
      } else {
        setTokenValidationResult({
          status: 'error',
          message: result.error || 'Token validation failed',
        });
      }
    } catch (e) {
      setTokenValidationResult({
        status: 'error',
        message: e instanceof Error ? e.message : 'Validation failed',
      });
    } finally {
      setIsValidatingToken(false);
    }
  };

  // Open token replacement modal
  const handleOpenTokenReplace = () => {
    setNewToken('');
    setNewTokenValidation({ valid: null, userName: null, error: null });
    setShowTokenReplaceModal(true);
  };

  // Validate new token before replacement
  const handleValidateNewToken = async () => {
    if (!newToken || !canvasUrl) return;
    setIsValidatingNewToken(true);
    setNewTokenValidation({ valid: null, userName: null, error: null });
    try {
      const normalizedUrl = normalizeUrl(canvasUrl);
      const result = await window.api.validateToken(newToken, normalizedUrl);
      if (result.valid) {
        setNewTokenValidation({
          valid: true,
          userName: result.user?.name || null,
          error: null,
        });
      } else {
        setNewTokenValidation({
          valid: false,
          userName: null,
          error: result.error || 'Invalid token',
        });
      }
    } catch (e) {
      setNewTokenValidation({
        valid: false,
        userName: null,
        error: e instanceof Error ? e.message : 'Validation failed',
      });
    } finally {
      setIsValidatingNewToken(false);
    }
  };

  // Replace the token
  const handleReplaceToken = async () => {
    if (!newTokenValidation.valid || !newToken) return;
    setIsReplacingToken(true);
    try {
      // Store the new token
      const storeResult = await window.api.storeCredential(newToken);
      if (storeResult.success) {
        // Reinitialize the connection with the new token
        const normalizedUrl = normalizeUrl(canvasUrl);
        const connectResult = await window.api.connectCanvas(normalizedUrl);
        if (connectResult.success) {
          setShowTokenReplaceModal(false);
          setNewToken('');
          setNewTokenValidation({ valid: null, userName: null, error: null });
          setTokenValidationResult({
            status: 'success',
            message: 'Token replaced successfully',
          });
        } else {
          setNewTokenValidation({
            valid: false,
            userName: null,
            error: connectResult.error || 'Failed to reconnect with new token',
          });
        }
      } else {
        setNewTokenValidation({
          valid: false,
          userName: null,
          error: 'Failed to store new token',
        });
      }
    } catch (e) {
      setNewTokenValidation({
        valid: false,
        userName: null,
        error: e instanceof Error ? e.message : 'Replacement failed',
      });
    } finally {
      setIsReplacingToken(false);
    }
  };

  const updateSyncPrefs = async (updates: Partial<SyncPreferences>) => {
    const newPrefs = { ...syncPrefs, ...updates };
    setSyncPrefs(newPrefs);
    saveSettings(STORAGE_KEYS.SYNC_PREFS, newPrefs);

    // Sync settings to backend that affect sync behavior
    if ('autoSyncEnabled' in updates || 'autoSyncInterval' in updates || 'autoAssignDueDate' in updates) {
      try {
        await window.api.setAutoSyncPreferences({
          autoSyncEnabled: newPrefs.autoSyncEnabled,
          autoSyncInterval: newPrefs.autoSyncInterval,
          autoAssignDueDate: newPrefs.autoAssignDueDate,
        });
      } catch (e) {
        console.error('Failed to sync preferences:', e);
      }
    }
  };

  // Data export/import handlers
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExportDatabase = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.exportDatabase();
      if (result.success) {
        setExportMessage({ type: 'success', text: `Database exported to ${result.data?.filePath}` });
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Export failed' });
      }
    } catch (e) {
      setExportMessage({ type: 'error', text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportDatabase = async () => {
    setIsImporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.importDatabase();
      if (result.success) {
        setExportMessage({
          type: 'success',
          text: `Database imported successfully. Please restart the app to apply changes. Previous database backed up.`,
        });
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (e) {
      setExportMessage({ type: 'error', text: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportCourseData = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.exportCourseData();
      if (result.success) {
        setExportMessage({
          type: 'success',
          text: `Exported ${result.data?.courseCount} courses, ${result.data?.taskCount} tasks to ${result.data?.filePath}`,
        });
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Export failed' });
      }
    } catch (e) {
      setExportMessage({ type: 'error', text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportCourseData = async () => {
    setIsImporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.importCourseData();
      if (result.success) {
        const d = result.data;
        setExportMessage({
          type: 'success',
          text: `Imported ${d?.coursesImported} courses, ${d?.tasksImported} tasks, ${d?.notificationsImported} notifications`,
        });
        // Refresh data after import
        fetchCourses();
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (e) {
      setExportMessage({ type: 'error', text: e instanceof Error ? e.message : 'Import failed' });
    } finally {
      setIsImporting(false);
    }
  };

  const updateAppearance = (updates: Partial<AppearanceSettings>) => {
    const newSettings = { ...appearance, ...updates };
    setAppearance(newSettings);
    saveSettings(STORAGE_KEYS.APPEARANCE, newSettings);
    if (updates.theme) {
      applyTheme(updates.theme);
    }
  };

  const updateNotifications = (updates: Partial<NotificationSettings>) => {
    const newSettings = { ...notifications, ...updates };
    setNotifications(newSettings);
    saveSettings(STORAGE_KEYS.NOTIFICATIONS, newSettings);
  };

  const updateAcademic = async (updates: Partial<AcademicSettings>) => {
    const newSettings = { ...academic, ...updates };
    setAcademic(newSettings);
    saveSettings(STORAGE_KEYS.ACADEMIC, newSettings);

    // If defaultTargetGrade changed, propagate to courses via IPC
    if (updates.defaultTargetGrade !== undefined) {
      try {
        const result = await window.api?.setDefaultTargetGrade(updates.defaultTargetGrade);
        if (result?.success) {
          console.debug(`[Settings] Default target grade propagated to ${result.data?.updatedCourses ?? 0} courses`);
        }
      } catch (error) {
        console.error('[Settings] Failed to propagate default target grade:', error);
      }
    }
  };

  // Load course-specific settings when a course is selected
  const loadCourseSpecificSettings = async (courseId: number) => {
    setIsLoadingCourseSettings(true);
    try {
      const result = await window.api?.getCourseSettings(courseId);
      if (result?.success) {
        setPerCourseSyncSettings({
          autoAssignDueDate: result.data.autoAssignDueDate,
          allowGuessedOverride: result.data.allowGuessedOverride,
        });
      }
    } catch (error) {
      console.error('[Settings] Failed to load course settings:', error);
    } finally {
      setIsLoadingCourseSettings(false);
    }
  };

  // Update course-specific settings
  const updateCourseSpecificSettings = async (updates: Partial<{
    autoAssignDueDate: number | null;
    allowGuessedOverride: number;
  }>) => {
    if (!selectedCourseId) return;

    const newSettings = { ...perCourseSyncSettings, ...updates };
    setPerCourseSyncSettings(newSettings);

    try {
      await window.api?.updateCourseSettings(selectedCourseId, updates);
    } catch (error) {
      console.error('[Settings] Failed to update course settings:', error);
    }
  };

  // Handle course selection change
  const handleCourseSelect = (courseId: number | null) => {
    setSelectedCourseId(courseId);
    if (courseId) {
      loadCourseSpecificSettings(courseId);
    } else {
      setPerCourseSyncSettings({ autoAssignDueDate: null, allowGuessedOverride: 1 });
    }
  };

  const updateFileExplorer = (updates: Partial<FileExplorerSettings>) => {
    const newSettings = { ...fileExplorer, ...updates };
    setFileExplorer(newSettings);
    saveSettings(STORAGE_KEYS.FILE_EXPLORER, newSettings);
  };

  const updateCourseSettings = (updates: Partial<CourseSettings>) => {
    const newSettings = { ...courseSettings, ...updates };
    setCourseSettings(newSettings);
    saveSettings(STORAGE_KEYS.COURSES, newSettings);
  };

  const updateCalendarSettings = (updates: Partial<CalendarSettings>) => {
    console.log('[SettingsModal] updateCalendarSettings called with:', updates);
    const newSettings = { ...calendarSettings, ...updates };
    console.log('[SettingsModal] New calendarSettings:', newSettings);
    setCalendarSettings(newSettings);
    saveSettings(STORAGE_KEYS.CALENDAR, newSettings);
    // Also clear the user's view mode preference so next time they open calendar, it uses the new default
    if (updates.defaultViewMode) {
      console.log('[SettingsModal] Clearing viewMode:calendar to apply new default');
      localStorage.removeItem('viewMode:calendar');
    }
    // Verify it was saved
    const verify = localStorage.getItem(STORAGE_KEYS.CALENDAR);
    console.log('[SettingsModal] Verified calendarSettings in localStorage:', verify);
  };

  const updateContentSettings = (updates: Partial<ContentSettings>) => {
    const newSettings = { ...contentSettings, ...updates };
    setContentSettings(newSettings);
    saveSettings(STORAGE_KEYS.CONTENT, newSettings);
  };

  const updateLandingPage = (path: string) => {
    setLandingPage(path);
    try {
      localStorage.setItem(STORAGE_KEYS.LANDING_PAGE, path);
    } catch (e) {
      console.error('Failed to save landing page:', e);
    }
  };

  const handleToggleCourseVisibility = async (courseId: number, currentlyHidden: boolean) => {
    await window.api.dispatch('UpdateCoursePreferences', {
      courseId,
      preferences: { isHidden: !currentlyHidden },
    });
    await fetchCourses();
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Settings tab drag-and-drop state
  const [draggedTab, setDraggedTab] = useState<SettingsSection | null>(null);
  const [dragOverTab, setDragOverTab] = useState<SettingsSection | null>(null);
  const [tabOrder, setTabOrder] = useState<SettingsSection[]>(() => {
    try {
      const stored = localStorage.getItem('settingsTabOrder');
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return ['general', 'dashboard', 'canvas', 'sync', 'academic', 'courses', 'calendar', 'files', 'appearance', 'notifications'];
  });

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: SettingsSection) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTab(tabId);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: SettingsSection) => {
    e.preventDefault();
    if (tabId !== draggedTab) setDragOverTab(tabId);
  }, [draggedTab]);

  const handleTabDrop = useCallback((e: React.DragEvent, targetTab: SettingsSection) => {
    e.preventDefault();
    if (!draggedTab || draggedTab === targetTab) {
      setDraggedTab(null);
      setDragOverTab(null);
      return;
    }
    const newOrder = [...tabOrder];
    const draggedIdx = newOrder.indexOf(draggedTab);
    const targetIdx = newOrder.indexOf(targetTab);
    newOrder[draggedIdx] = targetTab;
    newOrder[targetIdx] = draggedTab;
    setTabOrder(newOrder);
    localStorage.setItem('settingsTabOrder', JSON.stringify(newOrder));
    setDraggedTab(null);
    setDragOverTab(null);
  }, [draggedTab, tabOrder]);

  if (!isOpen) return null;

  const allSections = [
    { id: 'general' as const, label: 'General', icon: Home },
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutGrid },
    { id: 'canvas' as const, label: 'Canvas', icon: Link },
    { id: 'sync' as const, label: 'Sync', icon: RefreshCw },
    { id: 'academic' as const, label: 'Academic', icon: GraduationCap },
    { id: 'courses' as const, label: 'Courses', icon: BookOpen },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
    { id: 'files' as const, label: 'Files', icon: FolderOpen },
    { id: 'appearance' as const, label: 'Appearance', icon: Paintbrush },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

  // Sort sections by custom order
  const sections = tabOrder
    .map((id) => allSections.find((s) => s.id === id))
    .filter(Boolean) as typeof allSections;

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ];

  // Content shared between full page and modal modes
  const content = (
    <>
      {/* Header */}
      <div style={isFullPage ? styles.pageHeader : styles.header}>
        <h2 style={isFullPage ? styles.pageTitle : styles.title}>Settings</h2>
        {!isFullPage && (
          <button style={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        )}
      </div>

        <div style={styles.content}>
          {/* Sidebar */}
          <nav style={styles.sidebar}>
            {sections.map((section) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              const isDragging = draggedTab === section.id;
              const isDragOver = dragOverTab === section.id;
              return (
                <button
                  key={section.id}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, section.id)}
                  onDragEnd={() => { setDraggedTab(null); setDragOverTab(null); }}
                  onDragOver={(e) => handleTabDragOver(e, section.id)}
                  onDragLeave={() => setDragOverTab(null)}
                  onDrop={(e) => handleTabDrop(e, section.id)}
                  style={{
                    ...styles.sidebarItem,
                    ...(isActive ? styles.sidebarItemActive : {}),
                    opacity: isDragging ? 0.5 : 1,
                    boxShadow: isDragOver ? 'inset 0 0 0 2px var(--color-blue)' : 'none',
                    transition: 'opacity 150ms ease, box-shadow 150ms ease, background-color var(--transition-fast)',
                  }}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span style={styles.sidebarIcon}>
                    <Icon size={18} />
                  </span>
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Main content - fixed height */}
          <div style={styles.main}>
            {activeSection === 'general' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>General Settings</h3>
                <p style={styles.sectionDesc}>
                  Configure general application behavior.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Landing page</label>
                  <p style={styles.fieldDesc}>
                    The page shown when the app launches.
                  </p>
                  <div style={styles.landingPageOptions}>
                    {LANDING_PAGE_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = landingPage === option.value;
                      return (
                        <button
                          key={option.value}
                          style={{
                            ...styles.landingPageOption,
                            ...(isActive ? styles.landingPageOptionActive : {}),
                          }}
                          onClick={() => updateLandingPage(option.value)}
                        >
                          <Icon size={18} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>Reset to Default Order</label>
                  <p style={styles.fieldDesc}>
                    Reset custom ordering for various UI elements. Drag-and-drop ordering is saved automatically.
                  </p>
                  <div style={styles.resetOrderGrid}>
                    <button
                      style={styles.resetOrderButton}
                      onClick={() => {
                        localStorage.removeItem('navItemOrder');
                        window.location.reload();
                      }}
                    >
                      <RotateCcw size={14} />
                      Sidebar
                    </button>
                    <button
                      style={styles.resetOrderButton}
                      onClick={() => {
                        localStorage.removeItem('dashboardSectionOrder');
                        window.location.reload();
                      }}
                    >
                      <RotateCcw size={14} />
                      Dashboard
                    </button>
                    <button
                      style={styles.resetOrderButton}
                      onClick={() => {
                        localStorage.removeItem('courseOrder');
                        window.location.reload();
                      }}
                    >
                      <RotateCcw size={14} />
                      Courses
                    </button>
                    <button
                      style={styles.resetOrderButton}
                      onClick={() => {
                        localStorage.removeItem('filesCourseOrder');
                        localStorage.removeItem('folderOrder');
                        window.location.reload();
                      }}
                    >
                      <RotateCcw size={14} />
                      Files
                    </button>
                    <button
                      style={styles.resetOrderButton}
                      onClick={() => {
                        localStorage.removeItem('settingsTabOrder');
                        window.location.reload();
                      }}
                    >
                      <RotateCcw size={14} />
                      Settings Tabs
                    </button>
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>
                    <Database size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    Data Export & Import
                  </label>
                  <p style={styles.fieldDesc}>
                    Export your data for backup or import previously exported data.
                  </p>
                  <div style={styles.exportButtons}>
                    <button
                      style={styles.secondaryButton}
                      onClick={handleExportDatabase}
                      disabled={isExporting || isImporting}
                    >
                      {isExporting ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                      Export Database
                    </button>
                    <button
                      style={styles.secondaryButton}
                      onClick={handleImportDatabase}
                      disabled={isExporting || isImporting}
                    >
                      {isImporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                      Import Database
                    </button>
                    <button
                      style={styles.secondaryButton}
                      onClick={handleExportCourseData}
                      disabled={isExporting || isImporting}
                    >
                      {isExporting ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                      Export Course Data (JSON)
                    </button>
                    <button
                      style={styles.secondaryButton}
                      onClick={handleImportCourseData}
                      disabled={isExporting || isImporting}
                    >
                      {isImporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                      Import Course Data (JSON)
                    </button>
                  </div>
                  {exportMessage && (
                    <div style={{
                      ...styles.exportMessage,
                      backgroundColor: exportMessage.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                      color: exportMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                    }}>
                      {exportMessage.text}
                    </div>
                  )}
                </div>

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>Clear app data</label>
                  <p style={styles.fieldDesc}>
                    Delete all synced data (courses, tasks, files, announcements) and reset settings.
                  </p>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={deleteTokenOnClear}
                      onChange={(e) => setDeleteTokenOnClear(e.target.checked)}
                      style={styles.checkbox}
                    />
                    Also delete Canvas API token (requires re-authentication)
                  </label>
                  <button
                    style={styles.dangerButton}
                    onClick={() => setShowClearDataConfirm(true)}
                  >
                    Clear All Data
                  </button>
                </div>

                <ConfirmDialog
                  isOpen={showClearDataConfirm}
                  type="danger"
                  title="Clear All App Data"
                  message={deleteTokenOnClear
                    ? "This will delete all synced data including courses, tasks, files, announcements, AND your Canvas API token. You will need to re-authenticate after this action. This action cannot be undone."
                    : "This will delete all synced data including courses, tasks, files, and announcements. This action cannot be undone. Your Canvas connection will be preserved."}
                  confirmText="Clear All Data"
                  cancelText="Cancel"
                  onCancel={() => {
                    setShowClearDataConfirm(false);
                    setDeleteTokenOnClear(false);
                  }}
                  onConfirm={async () => {
                    setShowClearDataConfirm(false);
                    try {
                      // Clear database via IPC (optionally including token)
                      // If deleteToken is true, main process sends app:reset event
                      // which the store handles (clears localStorage + reloads)
                      await window.api.clearAllData({ deleteToken: deleteTokenOnClear });

                      if (!deleteTokenOnClear) {
                        // Token preserved - manually clear localStorage but keep Canvas URL, then reload
                        const savedCanvasUrl = localStorage.getItem('canvasUrl');
                        localStorage.clear();
                        if (savedCanvasUrl) {
                          localStorage.setItem('canvasUrl', savedCanvasUrl);
                        }
                        window.location.reload();
                      }
                      // If deleteToken was true, the app:reset event handler will reload automatically
                      setDeleteTokenOnClear(false);
                    } catch (error) {
                      console.error('Failed to clear data:', error);
                    }
                  }}
                />
              </div>
            )}

            {activeSection === 'dashboard' && (
              <DashboardSettingsSection />
            )}

            {activeSection === 'canvas' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Canvas Connection</h3>
                <p style={styles.sectionDesc}>
                  Connect to your institution's Canvas LMS.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Canvas URL</label>
                  <input
                    type="text"
                    value={canvasUrl}
                    onChange={(e) => setCanvasUrl(e.target.value)}
                    placeholder="https://your-institution.instructure.com"
                    style={styles.input}
                    disabled={isConnected}
                  />
                </div>

                <div style={styles.statusRow}>
                  <span style={styles.statusLabel}>Status:</span>
                  {isConnected ? (
                    <span style={styles.statusConnected}>
                      <Check size={14} /> Connected
                    </span>
                  ) : (
                    <span style={styles.statusDisconnected}>
                      <AlertCircle size={14} /> Not Connected
                    </span>
                  )}
                </div>

                {connectionError && (
                  <div style={styles.error}>{connectionError}</div>
                )}

                {tokenValidationResult.status && (
                  <div style={{
                    ...styles.validationResult,
                    backgroundColor: tokenValidationResult.status === 'success'
                      ? 'var(--color-success-bg)'
                      : 'var(--color-error-bg)',
                    color: tokenValidationResult.status === 'success'
                      ? 'var(--color-success)'
                      : 'var(--color-error)',
                  }}>
                    {tokenValidationResult.status === 'success' ? (
                      <Check size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                    {tokenValidationResult.message}
                  </div>
                )}

                <div style={styles.buttonRow}>
                  {isConnected ? (
                    <>
                      <button
                        style={{
                          ...styles.secondaryButton,
                          opacity: isValidatingToken ? 0.6 : 1,
                        }}
                        onClick={handleValidateToken}
                        disabled={isValidatingToken}
                      >
                        {isValidatingToken ? (
                          <>
                            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            Validating...
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} />
                            Validate Token
                          </>
                        )}
                      </button>
                      <button
                        style={styles.secondaryButton}
                        onClick={handleOpenTokenReplace}
                      >
                        <Key size={14} />
                        Replace Token
                      </button>
                      <button style={styles.dangerButton} onClick={handleDisconnect}>
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      style={{
                        ...styles.primaryButton,
                        opacity: isConnecting || !canvasUrl ? 0.6 : 1,
                      }}
                      onClick={handleReconnect}
                      disabled={isConnecting || !canvasUrl}
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </button>
                  )}
                </div>

                {/* Token Replacement Modal */}
                {showTokenReplaceModal && (
                  <div style={styles.tokenModalOverlay} onClick={() => setShowTokenReplaceModal(false)}>
                    <div style={styles.tokenModal} onClick={(e) => e.stopPropagation()}>
                      <div style={styles.tokenModalHeader}>
                        <h4 style={styles.tokenModalTitle}>Replace Canvas Token</h4>
                        <button
                          style={styles.tokenModalClose}
                          onClick={() => setShowTokenReplaceModal(false)}
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <p style={styles.tokenModalDesc}>
                        Enter your new Canvas API token. You can generate one from your Canvas account settings.
                      </p>

                      <div style={styles.field}>
                        <label style={styles.label}>New Access Token</label>
                        <input
                          type="password"
                          value={newToken}
                          onChange={(e) => {
                            setNewToken(e.target.value);
                            setNewTokenValidation({ valid: null, userName: null, error: null });
                          }}
                          placeholder="Enter your new Canvas access token"
                          style={styles.input}
                          autoFocus
                        />
                      </div>

                      {newTokenValidation.error && (
                        <div style={styles.error}>
                          <AlertCircle size={14} /> {newTokenValidation.error}
                        </div>
                      )}

                      {newTokenValidation.valid && (
                        <div style={styles.tokenSuccess}>
                          <Check size={14} />
                          Token valid{newTokenValidation.userName && ` for ${newTokenValidation.userName}`}
                        </div>
                      )}

                      <div style={styles.tokenModalButtons}>
                        {!newTokenValidation.valid ? (
                          <button
                            style={{
                              ...styles.primaryButton,
                              opacity: isValidatingNewToken || !newToken ? 0.6 : 1,
                            }}
                            onClick={handleValidateNewToken}
                            disabled={isValidatingNewToken || !newToken}
                          >
                            {isValidatingNewToken ? (
                              <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Validating...
                              </>
                            ) : (
                              <>
                                <ShieldCheck size={14} />
                                Validate Token
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            style={{
                              ...styles.primaryButton,
                              opacity: isReplacingToken ? 0.6 : 1,
                            }}
                            onClick={handleReplaceToken}
                            disabled={isReplacingToken}
                          >
                            {isReplacingToken ? (
                              <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Replacing...
                              </>
                            ) : (
                              <>
                                <Key size={14} />
                                Replace Token
                              </>
                            )}
                          </button>
                        )}
                        <button
                          style={styles.cancelButton}
                          onClick={() => setShowTokenReplaceModal(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'sync' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Sync Preferences</h3>
                <p style={styles.sectionDesc}>
                  Configure automatic data synchronization.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Auto-sync interval</label>
                  <p style={styles.fieldDescription}>
                    How often to automatically sync data from Canvas in the background
                  </p>
                  <select
                    value={syncPrefs.autoSyncInterval}
                    onChange={(e) => {
                      const interval = Number(e.target.value);
                      updateSyncPrefs({
                        autoSyncInterval: interval,
                        autoSyncEnabled: interval > 0,
                      });
                    }}
                    style={styles.select}
                  >
                    <option value={0}>Never (manual sync only)</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                    <option value={120}>Every 2 hours</option>
                  </select>
                </div>

                <div style={styles.divider} />
                <div style={styles.subsectionTitle}>Data to sync</div>

                <ToggleRow
                  label="Files"
                  description="Course files and folders"
                  checked={syncPrefs.syncFiles}
                  onChange={() => updateSyncPrefs({ syncFiles: !syncPrefs.syncFiles })}
                />

                <ToggleRow
                  label="Announcements"
                  description="Course announcements"
                  checked={syncPrefs.syncAnnouncements}
                  onChange={() => updateSyncPrefs({ syncAnnouncements: !syncPrefs.syncAnnouncements })}
                />

                <div style={styles.divider} />
                <div style={styles.subsectionTitle}>Task defaults</div>

                <ToggleRow
                  label="Auto-assign due date"
                  description="Set today 23:59 as due date for coursework without one. You can override this per task."
                  checked={syncPrefs.autoAssignDueDate}
                  onChange={() => updateSyncPrefs({ autoAssignDueDate: !syncPrefs.autoAssignDueDate })}
                />

                <div style={styles.divider} />
                <div style={styles.subsectionTitle}>Offline content</div>

                <ToggleRow
                  label="Save HTML content"
                  description="Download pages, assignments, and announcements as HTML files for offline viewing"
                  checked={syncPrefs.saveHtmlContent}
                  onChange={() => updateSyncPrefs({ saveHtmlContent: !syncPrefs.saveHtmlContent })}
                />

                {syncPrefs.saveHtmlContent && (
                  <>
                    <div style={styles.field}>
                      <label style={styles.label}>URL handling</label>
                      <p style={styles.fieldDesc}>
                        How to handle links to images and files in HTML content.
                      </p>
                      <select
                        value={syncPrefs.htmlUrlRewriting}
                        onChange={(e) => updateSyncPrefs({ htmlUrlRewriting: e.target.value as 'local' | 'original' })}
                        style={styles.select}
                      >
                        <option value="local">Rewrite for offline use (recommended)</option>
                        <option value="original">Keep original Canvas URLs</option>
                      </select>
                    </div>

                    <ToggleRow
                      label="Download images"
                      description="Download embedded images for offline access"
                      checked={syncPrefs.downloadImages}
                      onChange={() => updateSyncPrefs({ downloadImages: !syncPrefs.downloadImages })}
                    />

                    <ToggleRow
                      label="Download linked files"
                      description="Download files linked in content"
                      checked={syncPrefs.downloadLinkedFiles}
                      onChange={() => updateSyncPrefs({ downloadLinkedFiles: !syncPrefs.downloadLinkedFiles })}
                    />
                  </>
                )}

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>Link click behavior</label>
                  <p style={styles.fieldDesc}>
                    How to handle clicks on links in announcements and course content.
                  </p>
                  <select
                    value={contentSettings.linkBehavior}
                    onChange={(e) => updateContentSettings({ linkBehavior: e.target.value as 'always-external' | 'prefer-local' })}
                    style={styles.select}
                  >
                    <option value="always-external">Always open in browser</option>
                    <option value="prefer-local">Open locally if downloaded, otherwise browser</option>
                  </select>
                </div>
              </div>
            )}

            {activeSection === 'academic' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Academic Settings</h3>
                <p style={styles.sectionDesc}>
                  Configure grade targets and term preferences.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Default target grade</label>
                  <p style={styles.fieldDesc}>
                    Applied to new courses. Individual course targets can be overridden.
                  </p>
                  <div style={styles.gradeInputRow}>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      step="1"
                      value={academic.defaultTargetGrade}
                      onChange={(e) => updateAcademic({ defaultTargetGrade: Number(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          updateAcademic({ defaultTargetGrade: Math.min(100, academic.defaultTargetGrade + 1) });
                        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                          e.preventDefault();
                          updateAcademic({ defaultTargetGrade: Math.max(50, academic.defaultTargetGrade - 1) });
                        }
                      }}
                      style={styles.slider}
                    />
                    <span style={styles.gradeValue}>{academic.defaultTargetGrade}%</span>
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>Semester selection</label>
                  <p style={styles.fieldDesc}>
                    Choose which semester's courses to display.
                  </p>
                  <select
                    value={academic.termSelection}
                    onChange={(e) => {
                      console.debug('[Settings] Semester selection changed:', e.target.value);
                      updateAcademic({ termSelection: e.target.value });
                    }}
                    style={styles.select}
                  >
                    <option value="auto">Auto-detect current semester</option>
                    <option value="all">Show all semesters</option>
                    {enrollmentTerms.length > 0 && (
                      <optgroup label="Available Semesters">
                        {enrollmentTerms.map((term) => (
                          <option key={term.externalId} value={term.externalId}>
                            {term.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {enrollmentTerms.length === 0 && (
                    <p style={{ ...styles.fieldDesc, marginTop: 'var(--space-2)', color: 'var(--color-warning)' }}>
                      No semesters found. Sync courses to load available semesters.
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'courses' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Course Settings</h3>
                <p style={styles.sectionDesc}>
                  Configure course display, visibility, and per-course sync behavior.
                </p>

                {/* Display Settings */}
                <div style={styles.settingsCard}>
                  <div style={styles.subsectionTitle}>Display</div>
                  <div style={styles.settingsCardContent}>
                    <div style={styles.field}>
                      <label style={styles.label}>Default view mode</label>
                      <div style={styles.viewModeToggle}>
                        <button
                          style={{
                            ...styles.viewModeBtn,
                            backgroundColor: courseSettings.defaultViewMode === 'grid' ? 'var(--color-navy)' : 'transparent',
                            color: courseSettings.defaultViewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                          }}
                          onClick={() => updateCourseSettings({ defaultViewMode: 'grid' })}
                        >
                          Grid
                        </button>
                        <button
                          style={{
                            ...styles.viewModeBtn,
                            backgroundColor: courseSettings.defaultViewMode === 'list' ? 'var(--color-navy)' : 'transparent',
                            color: courseSettings.defaultViewMode === 'list' ? 'white' : 'var(--text-secondary)',
                          }}
                          onClick={() => updateCourseSettings({ defaultViewMode: 'list' })}
                        >
                          List
                        </button>
                      </div>
                    </div>

                    <ToggleRow
                      label="Show hidden courses by default"
                      description="Display hidden courses in the courses list"
                      checked={courseSettings.showHiddenByDefault}
                      onChange={() => updateCourseSettings({ showHiddenByDefault: !courseSettings.showHiddenByDefault })}
                    />
                  </div>
                </div>

                {/* Per-Course Sync Settings */}
                <div style={styles.settingsCard}>
                  <div style={styles.subsectionTitle}>Per-Course Sync</div>
                  <div style={styles.settingsCardContent}>
                    <div style={styles.field}>
                      <label style={styles.label}>Select course to configure</label>
                      <select
                        style={styles.select}
                        value={selectedCourseId || ''}
                        onChange={(e) => handleCourseSelect(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">-- Select a course --</option>
                        {courses
                          .filter(c => !c.isHidden)
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(course => (
                            <option key={course.id} value={course.id}>
                              {course.code} - {course.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {selectedCourseId && !isLoadingCourseSettings && (
                      <>
                        <div style={styles.inlineSettingsDivider} />

                        <div style={styles.field}>
                          <label style={styles.label}>Auto-fill due dates</label>
                          <p style={styles.fieldDesc}>
                            Assign today 23:59 to tasks without due dates
                          </p>
                          <div style={styles.inlineRadioGroup}>
                            <label style={styles.inlineRadioLabel}>
                              <input
                                type="radio"
                                name="autoAssignDueDate"
                                checked={perCourseSyncSettings.autoAssignDueDate === null}
                                onChange={() => updateCourseSpecificSettings({ autoAssignDueDate: null })}
                                style={styles.radio}
                              />
                              <span>Use default</span>
                            </label>
                            <label style={styles.inlineRadioLabel}>
                              <input
                                type="radio"
                                name="autoAssignDueDate"
                                checked={perCourseSyncSettings.autoAssignDueDate === 1}
                                onChange={() => updateCourseSpecificSettings({ autoAssignDueDate: 1 })}
                                style={styles.radio}
                              />
                              <span>Enabled</span>
                            </label>
                            <label style={styles.inlineRadioLabel}>
                              <input
                                type="radio"
                                name="autoAssignDueDate"
                                checked={perCourseSyncSettings.autoAssignDueDate === 0}
                                onChange={() => updateCourseSpecificSettings({ autoAssignDueDate: 0 })}
                                style={styles.radio}
                              />
                              <span>Disabled</span>
                            </label>
                          </div>
                        </div>

                        <div style={styles.inlineSettingsDivider} />

                        <div style={styles.inlineToggle}>
                          <div style={styles.inlineToggleText}>
                            <span style={styles.inlineToggleLabel}>Allow Canvas to override auto-filled values</span>
                            <span style={styles.inlineToggleDesc}>Canvas updates will replace estimated values silently</span>
                          </div>
                          <button
                            style={{
                              ...styles.toggleSwitch,
                              backgroundColor: perCourseSyncSettings.allowGuessedOverride === 1 ? 'var(--color-blue)' : 'var(--bg-tertiary)',
                            }}
                            onClick={() => updateCourseSpecificSettings({
                              allowGuessedOverride: perCourseSyncSettings.allowGuessedOverride === 1 ? 0 : 1
                            })}
                          >
                            <div style={{
                              ...styles.toggleKnob,
                              transform: perCourseSyncSettings.allowGuessedOverride === 1 ? 'translateX(20px)' : 'translateX(0)',
                            }} />
                          </button>
                        </div>
                      </>
                    )}

                    {selectedCourseId && isLoadingCourseSettings && (
                      <div style={styles.loadingRow}>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Loading course settings...
                      </div>
                    )}

                    {!selectedCourseId && (
                      <p style={styles.fieldDesc}>
                        Select a course above to configure its sync settings
                      </p>
                    )}
                  </div>
                </div>

                {/* Course Visibility */}
                <div style={styles.settingsCard}>
                  <div style={styles.subsectionTitle}>Visibility</div>
                  <p style={styles.fieldDesc}>
                    Hidden courses won't appear in Dashboard, Tasks, or Announcements.
                  </p>
                  <div style={styles.courseList}>
                    {courses.length === 0 ? (
                      <p style={styles.emptyText}>No courses synced yet.</p>
                    ) : (
                      courses.map((course: Course) => (
                        <div key={course.id} style={styles.courseRow}>
                          <div style={styles.courseInfo}>
                            <span
                              style={{
                                ...styles.courseDot,
                                backgroundColor: course.color || 'var(--color-navy)',
                              }}
                            />
                            <div style={styles.courseText}>
                              <span style={styles.courseCode}>{course.code}</span>
                              <span style={styles.courseName}>{course.name}</span>
                            </div>
                          </div>
                          <button
                            style={{
                              ...styles.visibilityBtn,
                              color: course.isHidden ? 'var(--text-muted)' : 'var(--color-success)',
                            }}
                            onClick={() => handleToggleCourseVisibility(course.id, course.isHidden)}
                            title={course.isHidden ? 'Show course' : 'Hide course'}
                          >
                            {course.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'calendar' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Calendar Settings</h3>
                <p style={styles.sectionDesc}>
                  Configure calendar display preferences.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Default view</label>
                  <p style={styles.fieldDesc}>
                    The view shown when opening the calendar page.
                  </p>
                  <div style={styles.viewModeToggle}>
                    <button
                      style={{
                        ...styles.viewModeBtn,
                        backgroundColor: calendarSettings.defaultViewMode === 'month' ? 'var(--color-navy)' : 'transparent',
                        color: calendarSettings.defaultViewMode === 'month' ? 'white' : 'var(--text-secondary)',
                      }}
                      onClick={() => updateCalendarSettings({ defaultViewMode: 'month' })}
                    >
                      Month
                    </button>
                    <button
                      style={{
                        ...styles.viewModeBtn,
                        backgroundColor: calendarSettings.defaultViewMode === 'week' ? 'var(--color-navy)' : 'transparent',
                        color: calendarSettings.defaultViewMode === 'week' ? 'white' : 'var(--text-secondary)',
                      }}
                      onClick={() => updateCalendarSettings({ defaultViewMode: 'week' })}
                    >
                      Week
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'files' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>File Explorer</h3>
                <p style={styles.sectionDesc}>
                  Configure file browser behavior and defaults.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Download location</label>
                  <p style={styles.fieldDesc}>
                    Where downloaded files are stored on your computer.
                  </p>
                  <div style={styles.downloadLocationRow}>
                    <div style={styles.downloadLocationPath}>
                      {currentDownloadPath || 'Loading...'}
                    </div>
                    <button
                      style={styles.changeLocationBtn}
                      onClick={handleChangeDownloadLocation}
                    >
                      <FolderOpen size={14} />
                      Change
                    </button>
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>Default folder state</label>
                  <p style={styles.fieldDesc}>
                    How folders appear when opening the Files page.
                  </p>
                  <div style={styles.radioGroup}>
                    {[
                      { value: 'collapsed', label: 'All Collapsed', desc: 'Start with all folders closed' },
                      { value: 'expanded', label: 'All Expanded', desc: 'Start with all folders open' },
                      { value: 'remember', label: 'Remember State', desc: 'Restore last session\'s state' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        style={{
                          ...styles.radioOption,
                          borderColor: fileExplorer.defaultState === option.value ? 'var(--color-blue)' : 'var(--border-default)',
                          backgroundColor: fileExplorer.defaultState === option.value ? 'rgba(0, 127, 163, 0.1)' : 'transparent',
                        }}
                      >
                        <input
                          type="radio"
                          name="defaultState"
                          value={option.value}
                          checked={fileExplorer.defaultState === option.value}
                          onChange={() => updateFileExplorer({ defaultState: option.value as FileExplorerSettings['defaultState'] })}
                          style={styles.radioInput}
                        />
                        <div>
                          <div style={styles.radioLabel}>{option.label}</div>
                          <div style={styles.radioDesc}>{option.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={styles.divider} />

                <div style={styles.field}>
                  <label style={styles.label}>Default view mode</label>
                  <div style={styles.viewModeToggle}>
                    <button
                      style={{
                        ...styles.viewModeBtn,
                        backgroundColor: fileExplorer.defaultViewMode === 'list' ? 'var(--color-navy)' : 'transparent',
                        color: fileExplorer.defaultViewMode === 'list' ? 'white' : 'var(--text-secondary)',
                      }}
                      onClick={() => updateFileExplorer({ defaultViewMode: 'list' })}
                    >
                      List
                    </button>
                    <button
                      style={{
                        ...styles.viewModeBtn,
                        backgroundColor: fileExplorer.defaultViewMode === 'grid' ? 'var(--color-navy)' : 'transparent',
                        color: fileExplorer.defaultViewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                      }}
                      onClick={() => updateFileExplorer({ defaultViewMode: 'grid' })}
                    >
                      Grid
                    </button>
                  </div>
                </div>
              </div>
            )}


            {activeSection === 'appearance' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Appearance</h3>
                <p style={styles.sectionDesc}>
                  Customize the look and feel.
                </p>

                <div style={styles.field}>
                  <label style={styles.label}>Theme</label>
                  <div style={styles.themeOptions}>
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = appearance.theme === option.value;
                      return (
                        <button
                          key={option.value}
                          style={{
                            ...styles.themeOption,
                            ...(isActive ? styles.themeOptionActive : {}),
                          }}
                          onClick={() => updateAppearance({ theme: option.value })}
                        >
                          <Icon size={18} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <ToggleRow
                  label="Collapsed sidebar by default"
                  description="Start with sidebar collapsed on launch"
                  checked={appearance.sidebarCollapsed}
                  onChange={() => updateAppearance({ sidebarCollapsed: !appearance.sidebarCollapsed })}
                />
              </div>
            )}

            {activeSection === 'notifications' && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Notifications</h3>
                <p style={styles.sectionDesc}>
                  Configure alerts and smart notifications.
                </p>

                <ToggleRow
                  label="Enable notifications"
                  description="Show desktop notifications"
                  checked={notifications.enabled}
                  onChange={() => updateNotifications({ enabled: !notifications.enabled })}
                />

                {notifications.enabled && (
                  <>
                    <div style={styles.divider} />
                    <div style={styles.subsectionTitle}>Alert types</div>

                    <ToggleRow
                      label="Priority alerts"
                      description="Intelligence flags high-priority or at-risk tasks"
                      checked={notifications.priorityAlerts}
                      onChange={() => updateNotifications({ priorityAlerts: !notifications.priorityAlerts })}
                    />

                    <ToggleRow
                      label="Sync status"
                      description="Notify on sync success or failure"
                      checked={notifications.syncStatus}
                      onChange={() => updateNotifications({ syncStatus: !notifications.syncStatus })}
                    />

                    <ToggleRow
                      label="Due date reminders"
                      description="Smart reminders before assignments are due"
                      checked={notifications.dueDateReminders}
                      onChange={() => updateNotifications({ dueDateReminders: !notifications.dueDateReminders })}
                    />

                    <ToggleRow
                      label="Grade alerts"
                      description="Notify when new grades are posted"
                      checked={notifications.gradeAlerts}
                      onChange={() => updateNotifications({ gradeAlerts: !notifications.gradeAlerts })}
                    />

                    <div style={styles.divider} />
                    <div style={styles.subsectionTitle}>Intelligence alerts</div>

                    <ToggleRow
                      label="Workload predictions"
                      description="AI predicts busy periods and suggests planning"
                      checked={notifications.workloadPredictions}
                      onChange={() => updateNotifications({ workloadPredictions: !notifications.workloadPredictions })}
                    />

                    <ToggleRow
                      label="Risk warnings"
                      description="Alert when predicted time exceeds remaining time"
                      checked={notifications.riskWarnings}
                      onChange={() => updateNotifications({ riskWarnings: !notifications.riskWarnings })}
                    />

                    <div style={styles.divider} />
                    <div style={styles.subsectionTitle}>Smart quiet mode</div>
                    <p style={styles.quietModeDesc}>
                      Automatically suppress notifications when:
                    </p>

                    <ToggleRow
                      label="Device unplugged"
                      description="Pause when on battery power"
                      checked={notifications.quietWhenUnplugged}
                      onChange={() => updateNotifications({ quietWhenUnplugged: !notifications.quietWhenUnplugged })}
                    />

                    <ToggleRow
                      label="Fullscreen mode"
                      description="Pause during presentations or focus sessions"
                      checked={notifications.quietWhenFullscreen}
                      onChange={() => updateNotifications({ quietWhenFullscreen: !notifications.quietWhenFullscreen })}
                    />

                    <ToggleRow
                      label="Busy or Exam status"
                      description="Pause when inferred status is Busy or Exam"
                      checked={notifications.quietWhenBusy}
                      onChange={() => updateNotifications({ quietWhenBusy: !notifications.quietWhenBusy })}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
    </>
  );

  // Render with appropriate wrapper based on mode
  if (isFullPage) {
    return <div style={styles.fullPage}>{content}</div>;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

// Toggle row component
interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div style={styles.toggle}>
      <div style={styles.toggleText}>
        <div style={styles.toggleLabel}>{label}</div>
        <div style={styles.toggleDesc}>{description}</div>
      </div>
      <button
        style={{
          ...styles.toggleSwitch,
          backgroundColor: checked ? 'var(--color-blue)' : 'var(--color-gray-300)',
        }}
        onClick={onChange}
      >
        <div
          style={{
            ...styles.toggleKnob,
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },

  modal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-xl)',
    width: 'min(700px, 90vw)',
    height: 'min(600px, 80vh)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },

  fullPage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },

  pageHeader: {
    marginBottom: 'var(--space-4)',
    flexShrink: 0,
  },

  pageTitle: {
    margin: 0,
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--text-primary)',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-4) var(--space-5)',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },

  title: {
    margin: 0,
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  closeButton: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-2)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },

  sidebar: {
    width: '160px',
    flexShrink: 0,
    borderRight: '1px solid var(--border-default)',
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
  },

  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
    outline: 'none',
  },

  sidebarItemActive: {
    backgroundColor: 'var(--color-blue)',
    color: 'white',
  },

  sidebarIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    flexShrink: 0,
  },

  main: {
    flex: 1,
    padding: 'var(--space-4)',
    overflowY: 'auto',
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  },

  sectionTitle: {
    margin: 0,
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  sectionDesc: {
    margin: 0,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  subsectionTitle: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
    marginTop: 'var(--space-2)',
  },

  quietModeDesc: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  input: {
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    outline: 'none',
  },

  select: {
    padding: 'var(--space-2) var(--space-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  },

  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
  },

  statusLabel: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
  },

  statusConnected: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-success)',
  },

  statusDisconnected: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
  },

  error: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-error)',
  },

  buttonRow: {
    display: 'flex',
    gap: 'var(--space-3)',
  },

  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-blue)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  dangerButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'var(--color-error)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
  },

  toggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2) 0',
  },

  toggleText: {
    flex: 1,
    marginRight: 'var(--space-3)',
  },

  toggleLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  toggleDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },

  toggleSwitch: {
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color var(--transition-fast)',
    flexShrink: 0,
  },

  toggleKnob: {
    width: '20px',
    height: '20px',
    backgroundColor: 'white',
    borderRadius: '50%',
    position: 'absolute',
    top: '2px',
    left: '2px',
    transition: 'transform var(--transition-fast)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
  },

  divider: {
    height: '1px',
    backgroundColor: 'var(--border-default)',
    margin: 'var(--space-2) 0',
  },

  themeOptions: {
    display: 'flex',
    gap: 'var(--space-2)',
  },

  themeOption: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-3)',
    border: '2px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  themeOptionActive: {
    borderColor: 'var(--color-blue)',
    backgroundColor: 'rgba(0, 127, 163, 0.1)',
    color: 'var(--color-blue)',
  },

  fieldDesc: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-2)',
  },

  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    marginBottom: 'var(--space-3)',
  },

  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  gradeInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
  },

  slider: {
    flex: 1,
    height: '6px',
    WebkitAppearance: 'none',
    appearance: 'none',
    borderRadius: '3px',
    backgroundColor: 'var(--border-default)',
    cursor: 'pointer',
  },

  gradeValue: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-bold)',
    color: 'var(--color-blue)',
    minWidth: '50px',
    textAlign: 'right',
  },

  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  radioOption: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    border: '1px solid',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  radioInput: {
    marginTop: '2px',
    accentColor: 'var(--color-blue)',
  },

  radioLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  radioDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },

  viewModeToggle: {
    display: 'flex',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    overflow: 'hidden',
    width: 'fit-content',
  },

  viewModeBtn: {
    padding: 'var(--space-2) var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    border: 'none',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  // Course settings styles
  settingsCard: {
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
    padding: 'var(--space-3)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
  },

  settingsCardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    paddingLeft: 'var(--space-1)',
  },

  inlineSettingsDivider: {
    height: '1px',
    backgroundColor: 'var(--border-muted)',
    margin: '0',
  },

  inlineRadioGroup: {
    display: 'flex',
    gap: 'var(--space-4)',
    flexWrap: 'wrap',
  },

  inlineRadioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },

  inlineToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
  },

  inlineToggleText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },

  inlineToggleLabel: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  inlineToggleDesc: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
  },

  courseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    maxHeight: '200px',
    overflowY: 'auto',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2)',
    backgroundColor: 'var(--bg-card)',
  },

  courseRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    transition: 'background-color var(--transition-fast)',
  },

  courseInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    flex: 1,
    minWidth: 0,
  },

  courseDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  courseText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },

  courseCode: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--text-primary)',
  },

  courseName: {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  visibilityBtn: {
    padding: 'var(--space-1)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color var(--transition-fast)',
  },

  emptyText: {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    textAlign: 'center',
    padding: 'var(--space-4)',
  },

  // Landing page options
  landingPageOptions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--space-2)',
  },

  landingPageOption: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)',
    border: '2px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  landingPageOptionActive: {
    borderColor: 'var(--color-blue)',
    backgroundColor: 'rgba(0, 127, 163, 0.1)',
    color: 'var(--color-blue)',
  },

  resetButton: {
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    marginTop: 'var(--space-2)',
  },

  resetOrderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-2)',
  },

  resetOrderButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  // Data export styles
  exportButtons: {
    display: 'flex',
    gap: 'var(--space-2)',
    flexWrap: 'wrap' as const,
  },

  secondaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
  },

  exportMessage: {
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginTop: 'var(--space-2)',
  },

  // Download location styles
  downloadLocationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-default)',
  },

  downloadLocationPath: {
    flex: 1,
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  changeLocationBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    padding: 'var(--space-1) var(--space-2)',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    flexShrink: 0,
  },

  // Token validation and replacement styles
  validationResult: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
  },

  tokenModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },

  tokenModal: {
    backgroundColor: 'var(--bg-card)',
    borderRadius: 'var(--radius-lg)',
    width: 'min(450px, 90vw)',
    padding: 'var(--space-5)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },

  tokenModalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--space-3)',
  },

  tokenModalTitle: {
    margin: 0,
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--text-primary)',
  },

  tokenModalClose: {
    background: 'none',
    border: 'none',
    padding: 'var(--space-1)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tokenModalDesc: {
    margin: '0 0 var(--space-4) 0',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    lineHeight: 'var(--leading-relaxed)',
  },

  tokenSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3)',
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    marginBottom: 'var(--space-3)',
  },

  tokenModalButtons: {
    display: 'flex',
    gap: 'var(--space-2)',
    marginTop: 'var(--space-4)',
  },

  cancelButton: {
    padding: 'var(--space-2) var(--space-4)',
    backgroundColor: 'transparent',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },

  // Course settings specific styles (radioGroup and radioLabel already defined above)
  radio: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    padding: 'var(--space-4) 0',
  },

  emptyState: {
    padding: 'var(--space-6)',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-sm)',
    backgroundColor: 'var(--bg-app)',
    borderRadius: 'var(--radius-md)',
    marginTop: 'var(--space-4)',
  },
};

export default SettingsModal;
