/**
 * DisplaySection - Display & Layout settings
 *
 * Contains:
 * - Theme settings
 * - Landing page
 * - Dashboard settings
 * - View mode settings for various pages
 * - Settings page defaults
 */

import React from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Palette,
  LayoutDashboard,
  Calendar,
  BookOpen,
  FolderOpen,
} from 'lucide-react';
import { useSettings } from './SettingsContext';
import {
  Accordion,
  SettingRow,
  ToggleSwitch,
  SettingSelect,
  SettingButtonGroup,
  SettingSlider,
} from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_DASHBOARD_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_SETTINGS_PAGE_SETTINGS,
  type AppearanceSettings,
  type FileExplorerSettings,
  type SettingsPageSettings,
} from '../../../l5-presentation/settings';

// Category icon
const DISPLAY_ICON = <Palette size={18} />;

// Landing page options
const LANDING_PAGE_OPTIONS = [
  { value: '/', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { value: '/calendar', label: 'Calendar', icon: <Calendar size={14} /> },
  { value: '/courses', label: 'Courses', icon: <BookOpen size={14} /> },
  { value: '/files', label: 'Files', icon: <FolderOpen size={14} /> },
];

interface DisplaySectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function DisplaySection({ sectionRef }: DisplaySectionProps) {
  const {
    // Search
    isSearching,
    shouldShowSetting,

    // Drag and drop
    sectionOrder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,

    // Appearance
    appearance,
    updateAppearance,

    // Landing page
    landingPage,
    updateLandingPage,

    // Dashboard
    dashboardSettings,
    updateDashboardSettings,

    // Course settings
    courseSettings,
    updateCourseSettings,

    // Calendar
    calendarSettings,
    updateCalendarSettings,

    // File explorer
    fileExplorer,
    updateFileExplorer,

    // Settings page
    settingsPageSettings,
    updateSettingsPageSettings,

    // Dock
    dockAutoHide,
    updateDockAutoHide,

    // Modified count
    displayModifiedCount,
  } = useSettings();

  const isSettingsPageSettingsModified =
    settingsPageSettings.defaultState !== DEFAULT_SETTINGS_PAGE_SETTINGS.defaultState;

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
      onDragStart={(e) => handleDragStart(e, 'display')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'display')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'display')}
      style={{
        ...getDragWrapperStyle('display'),
        order: sectionOrder.indexOf('display'),
      }}
    >
      <Accordion.Item value="display">
        <Accordion.Trigger
          icon={DISPLAY_ICON}
          badge={<ModifiedBadge count={displayModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.display.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>
                {SETTINGS_CATEGORIES.display.description}
              </p>
            )}

            {/* Theme */}
            {shouldShowSetting('appearance.theme') && (
              <SettingRow
                settingKey="appearance.theme"
                label="Theme"
                description="Application color theme"
                isModified={appearance.theme !== DEFAULT_APPEARANCE_SETTINGS.theme}
                onReset={() => updateAppearance({ theme: DEFAULT_APPEARANCE_SETTINGS.theme })}
              >
                <SettingButtonGroup
                  value={appearance.theme}
                  onChange={(v) => updateAppearance({ theme: v as AppearanceSettings['theme'] })}
                  options={[
                    { value: 'light', label: SETTINGS_LABELS.options.theme.light, icon: <Sun size={14} /> },
                    { value: 'dark', label: SETTINGS_LABELS.options.theme.dark, icon: <Moon size={14} /> },
                    { value: 'system', label: SETTINGS_LABELS.options.theme.system, icon: <Monitor size={14} /> },
                  ]}
                />
              </SettingRow>
            )}

            {/* Landing Page */}
            {shouldShowSetting('landingPage') && (
              <SettingRow
                settingKey="landingPage"
                label="Landing page"
                description="The page shown when the app launches"
                isModified={landingPage !== '/'}
                onReset={() => updateLandingPage('/')}
              >
                <SettingButtonGroup
                  value={landingPage}
                  onChange={updateLandingPage}
                  options={LANDING_PAGE_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                    icon: opt.icon,
                  }))}
                />
              </SettingRow>
            )}

            {/* Sidebar */}
            {shouldShowSetting('appearance.sidebarCollapsed') && (
              <SettingRow
                settingKey="appearance.sidebarCollapsed"
                label="Collapsed sidebar"
                description="Start with sidebar collapsed on launch"
                isModified={appearance.sidebarCollapsed !== DEFAULT_APPEARANCE_SETTINGS.sidebarCollapsed}
                onReset={() => updateAppearance({ sidebarCollapsed: DEFAULT_APPEARANCE_SETTINGS.sidebarCollapsed })}
              >
                <ToggleSwitch
                  checked={appearance.sidebarCollapsed}
                  onChange={(checked) => updateAppearance({ sidebarCollapsed: checked })}
                />
              </SettingRow>
            )}

            {!isSearching && <div style={styles.divider} />}

            {/* Dashboard Settings */}
            {shouldShowSetting('dashboard.prioritySortingEnabled') && (
              <SettingRow
                settingKey="dashboard.prioritySortingEnabled"
                label="Priority sorting"
                description="Sort tasks by urgency and priority score instead of due date only"
                isModified={dashboardSettings.prioritySortingEnabled !== DEFAULT_DASHBOARD_SETTINGS.prioritySortingEnabled}
                onReset={() => updateDashboardSettings({ prioritySortingEnabled: DEFAULT_DASHBOARD_SETTINGS.prioritySortingEnabled })}
              >
                <ToggleSwitch
                  checked={dashboardSettings.prioritySortingEnabled}
                  onChange={(checked) => updateDashboardSettings({ prioritySortingEnabled: checked })}
                />
              </SettingRow>
            )}

            {shouldShowSetting('dashboard.importantWorksThreshold') && (
              <SettingRow
                settingKey="dashboard.importantWorksThreshold"
                label="Important works threshold"
                description="Show tasks with grade weight above this percentage"
                isModified={dashboardSettings.importantWorksThreshold !== DEFAULT_DASHBOARD_SETTINGS.importantWorksThreshold}
                onReset={() => updateDashboardSettings({ importantWorksThreshold: DEFAULT_DASHBOARD_SETTINGS.importantWorksThreshold })}
              >
                <SettingSlider
                  value={dashboardSettings.importantWorksThreshold}
                  onChange={(v) => updateDashboardSettings({ importantWorksThreshold: v })}
                  min={0}
                  max={50}
                  step={5}
                  formatValue={(v) => `${v}%`}
                />
              </SettingRow>
            )}

            {!isSearching && <div style={styles.divider} />}

            {/* View Modes */}
            {shouldShowSetting('courses.defaultViewMode') && (
              <SettingRow
                settingKey="courses.defaultViewMode"
                label="Courses view"
                description="Default view mode for the courses page"
                isModified={courseSettings.defaultViewMode !== DEFAULT_COURSE_SETTINGS.defaultViewMode}
                onReset={() => updateCourseSettings({ defaultViewMode: DEFAULT_COURSE_SETTINGS.defaultViewMode })}
              >
                <SettingButtonGroup
                  value={courseSettings.defaultViewMode}
                  onChange={(v) => updateCourseSettings({ defaultViewMode: v as 'grid' | 'list' })}
                  options={[
                    { value: 'grid', label: SETTINGS_LABELS.options.viewMode.grid },
                    { value: 'list', label: SETTINGS_LABELS.options.viewMode.list },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('calendar.defaultViewMode') && (
              <SettingRow
                settingKey="calendar.defaultViewMode"
                label="Calendar view"
                description="Default view when opening the calendar"
                isModified={calendarSettings.defaultViewMode !== DEFAULT_CALENDAR_SETTINGS.defaultViewMode}
                onReset={() => updateCalendarSettings({ defaultViewMode: DEFAULT_CALENDAR_SETTINGS.defaultViewMode })}
              >
                <SettingButtonGroup
                  value={calendarSettings.defaultViewMode}
                  onChange={(v) => updateCalendarSettings({ defaultViewMode: v as 'month' | 'week' })}
                  options={[
                    { value: 'month', label: SETTINGS_LABELS.options.viewMode.month },
                    { value: 'week', label: SETTINGS_LABELS.options.viewMode.week },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('fileExplorer.defaultViewMode') && (
              <SettingRow
                settingKey="fileExplorer.defaultViewMode"
                label="Files view"
                description="Default view mode for the files page"
                isModified={fileExplorer.defaultViewMode !== DEFAULT_FILE_EXPLORER_SETTINGS.defaultViewMode}
                onReset={() => updateFileExplorer({ defaultViewMode: DEFAULT_FILE_EXPLORER_SETTINGS.defaultViewMode })}
              >
                <SettingButtonGroup
                  value={fileExplorer.defaultViewMode}
                  onChange={(v) => updateFileExplorer({ defaultViewMode: v as 'list' | 'grid' })}
                  options={[
                    { value: 'list', label: SETTINGS_LABELS.options.viewMode.list },
                    { value: 'grid', label: SETTINGS_LABELS.options.viewMode.grid },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('fileExplorer.defaultState') && (
              <SettingRow
                settingKey="fileExplorer.defaultState"
                label="Folder default state"
                description="How folders appear when opening the Files page"
                isModified={fileExplorer.defaultState !== DEFAULT_FILE_EXPLORER_SETTINGS.defaultState}
                onReset={() => updateFileExplorer({ defaultState: DEFAULT_FILE_EXPLORER_SETTINGS.defaultState })}
              >
                <SettingSelect
                  value={fileExplorer.defaultState}
                  onChange={(v) => updateFileExplorer({ defaultState: v as FileExplorerSettings['defaultState'] })}
                  options={[
                    { value: 'collapsed', label: SETTINGS_LABELS.options.folderState.collapsed },
                    { value: 'expanded', label: SETTINGS_LABELS.options.folderState.expanded },
                    { value: 'remember', label: SETTINGS_LABELS.options.folderState.remember },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('settingsPage.defaultState') && (
              <SettingRow
                settingKey="settingsPage.defaultState"
                label="Settings default state"
                description="How settings sections appear when opening this page"
                isModified={isSettingsPageSettingsModified}
                onReset={() => updateSettingsPageSettings({ defaultState: DEFAULT_SETTINGS_PAGE_SETTINGS.defaultState })}
              >
                <SettingSelect
                  value={settingsPageSettings.defaultState}
                  onChange={(v) => updateSettingsPageSettings({ defaultState: v as SettingsPageSettings['defaultState'] })}
                  options={[
                    { value: 'collapsed', label: SETTINGS_LABELS.options.folderState.collapsed },
                    { value: 'expanded', label: SETTINGS_LABELS.options.folderState.expanded },
                    { value: 'remember', label: SETTINGS_LABELS.options.folderState.remember },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('settingsDockAutoHide') && (
              <SettingRow
                settingKey="settingsDockAutoHide"
                label="Dock auto-hide"
                description="Hide the section navigation dock until mouse is near bottom"
                isModified={!dockAutoHide}
                onReset={() => updateDockAutoHide(true)}
              >
                <ToggleSwitch
                  checked={dockAutoHide}
                  onChange={(checked) => updateDockAutoHide(checked)}
                />
              </SettingRow>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
