/**
 * NotificationsSection - Notification settings
 *
 * Contains:
 * - Enable/disable notifications
 * - Alert types (priority, sync, due dates, grades)
 * - Intelligence alerts (workload, risk)
 * - Smart quiet mode settings
 */

import React from 'react';
import { Bell } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion, SettingRow, ToggleSwitch } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../../../l5-presentation/settings';

// Category icon
const NOTIFICATIONS_ICON = <Bell size={18} />;

interface NotificationsSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function NotificationsSection({ sectionRef }: NotificationsSectionProps) {
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

    // Notifications
    notifications,
    updateNotifications,

    // Modified count
    notificationsModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
      onDragStart={(e) => handleDragStart(e, 'notifications')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'notifications')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'notifications')}
      style={{
        ...getDragWrapperStyle('notifications'),
        order: sectionOrder.indexOf('notifications'),
      }}
    >
      <Accordion.Item value="notifications">
        <Accordion.Trigger
          icon={NOTIFICATIONS_ICON}
          badge={<ModifiedBadge count={notificationsModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.notifications.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>
                {SETTINGS_CATEGORIES.notifications.description}
              </p>
            )}

            {shouldShowSetting('notifications.enabled') && (
              <SettingRow
                settingKey="notifications.enabled"
                label="Enable notifications"
                description="Show desktop notifications"
                isModified={
                  notifications.enabled !== DEFAULT_NOTIFICATION_SETTINGS.enabled
                }
                onReset={() =>
                  updateNotifications({
                    enabled: DEFAULT_NOTIFICATION_SETTINGS.enabled,
                  })
                }
              >
                <ToggleSwitch
                  checked={notifications.enabled}
                  onChange={(checked) => updateNotifications({ enabled: checked })}
                />
              </SettingRow>
            )}

            {notifications.enabled && (
              <>
                {!isSearching && <div style={styles.divider} />}
                {!isSearching && (
                  <div style={styles.subsectionTitle}>
                    {SETTINGS_LABELS.sections.alertTypes}
                  </div>
                )}

                {shouldShowSetting('notifications.syncStatus') && (
                  <SettingRow
                    settingKey="notifications.syncStatus"
                    label="Sync status"
                    description="Notify on sync success or failure"
                    isModified={
                      notifications.syncStatus !==
                      DEFAULT_NOTIFICATION_SETTINGS.syncStatus
                    }
                    onReset={() =>
                      updateNotifications({
                        syncStatus: DEFAULT_NOTIFICATION_SETTINGS.syncStatus,
                      })
                    }
                  >
                    <ToggleSwitch
                      checked={notifications.syncStatus}
                      onChange={(checked) => updateNotifications({ syncStatus: checked })}
                    />
                  </SettingRow>
                )}

                {shouldShowSetting('notifications.dueDateReminders') && (
                  <SettingRow
                    settingKey="notifications.dueDateReminders"
                    label="Due date reminders"
                    description="Smart reminders before assignments are due"
                    isModified={
                      notifications.dueDateReminders !==
                      DEFAULT_NOTIFICATION_SETTINGS.dueDateReminders
                    }
                    onReset={() =>
                      updateNotifications({
                        dueDateReminders: DEFAULT_NOTIFICATION_SETTINGS.dueDateReminders,
                      })
                    }
                  >
                    <ToggleSwitch
                      checked={notifications.dueDateReminders}
                      onChange={(checked) =>
                        updateNotifications({ dueDateReminders: checked })
                      }
                    />
                  </SettingRow>
                )}

                {shouldShowSetting('notifications.gradeAlerts') && (
                  <SettingRow
                    settingKey="notifications.gradeAlerts"
                    label="Grade alerts"
                    description="Notify when new grades are posted"
                    isModified={
                      notifications.gradeAlerts !==
                      DEFAULT_NOTIFICATION_SETTINGS.gradeAlerts
                    }
                    onReset={() =>
                      updateNotifications({
                        gradeAlerts: DEFAULT_NOTIFICATION_SETTINGS.gradeAlerts,
                      })
                    }
                  >
                    <ToggleSwitch
                      checked={notifications.gradeAlerts}
                      onChange={(checked) =>
                        updateNotifications({ gradeAlerts: checked })
                      }
                    />
                  </SettingRow>
                )}

                {!isSearching && <div style={styles.divider} />}
                {!isSearching && (
                  <>
                    <div style={styles.subsectionTitle}>
                      {SETTINGS_LABELS.sections.smartQuietMode}
                    </div>
                    <p style={styles.quietModeDesc}>
                      {SETTINGS_LABELS.quietMode.description}
                    </p>
                  </>
                )}

                {shouldShowSetting('notifications.quietWhenFullscreen') && (
                  <SettingRow
                    settingKey="notifications.quietWhenFullscreen"
                    label="Fullscreen mode"
                    description="Pause during presentations or focus sessions"
                    isModified={
                      notifications.quietWhenFullscreen !==
                      DEFAULT_NOTIFICATION_SETTINGS.quietWhenFullscreen
                    }
                    onReset={() =>
                      updateNotifications({
                        quietWhenFullscreen:
                          DEFAULT_NOTIFICATION_SETTINGS.quietWhenFullscreen,
                      })
                    }
                  >
                    <ToggleSwitch
                      checked={notifications.quietWhenFullscreen}
                      onChange={(checked) =>
                        updateNotifications({ quietWhenFullscreen: checked })
                      }
                    />
                  </SettingRow>
                )}

                {shouldShowSetting('notifications.quietWhenUnplugged') && (
                  <SettingRow
                    settingKey="notifications.quietWhenUnplugged"
                    label="On battery power"
                    description="Pause when device is unplugged"
                    isModified={
                      notifications.quietWhenUnplugged !==
                      DEFAULT_NOTIFICATION_SETTINGS.quietWhenUnplugged
                    }
                    onReset={() =>
                      updateNotifications({
                        quietWhenUnplugged:
                          DEFAULT_NOTIFICATION_SETTINGS.quietWhenUnplugged,
                      })
                    }
                  >
                    <ToggleSwitch
                      checked={notifications.quietWhenUnplugged}
                      onChange={(checked) =>
                        updateNotifications({ quietWhenUnplugged: checked })
                      }
                    />
                  </SettingRow>
                )}

                {shouldShowSetting('notifications.quietWhenBusy') && (
                  <SettingRow
                    settingKey="notifications.quietWhenBusy"
                    label="Busy or Exam status"
                    description="Pause when inferred status is Busy or Exam"
                    isModified={
                      notifications.quietWhenBusy !==
                      DEFAULT_NOTIFICATION_SETTINGS.quietWhenBusy
                    }
                    onReset={() =>
                      updateNotifications({
                        quietWhenBusy: DEFAULT_NOTIFICATION_SETTINGS.quietWhenBusy,
                      })
                    }
                  >
                    <ToggleSwitch
                      checked={notifications.quietWhenBusy}
                      onChange={(checked) =>
                        updateNotifications({ quietWhenBusy: checked })
                      }
                    />
                  </SettingRow>
                )}
              </>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
