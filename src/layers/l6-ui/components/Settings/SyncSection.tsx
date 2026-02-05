/**
 * SyncSection - Sync settings
 *
 * Contains:
 * - Auto-sync interval
 * - Sync files toggle
 * - Sync announcements toggle
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion, SettingRow, ToggleSwitch, SettingSelect } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_SYNC_PREFERENCES,
} from '../../../l5-presentation/settings';

// Category icon
const SYNC_ICON = <RefreshCw size={18} />;

interface SyncSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function SyncSection({ sectionRef }: SyncSectionProps) {
  const {
    // Search
    isSearching,
    shouldShowSetting,

    // Drag and drop
    sectionOrder,
    handleMouseDown,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,

    // Sync preferences
    syncPrefs,
    updateSyncPrefs,

    // Modified count
    syncModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={(e) => handleDragStart(e, 'sync')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'sync')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'sync')}
      style={{
        ...getDragWrapperStyle('sync'),
        order: sectionOrder.indexOf('sync'),
      }}
    >
      <Accordion.Item value="sync">
        <Accordion.Trigger
          icon={SYNC_ICON}
          badge={<ModifiedBadge count={syncModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.sync.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>{SETTINGS_CATEGORIES.sync.description}</p>
            )}

            {/* Auto-sync interval */}
            {shouldShowSetting('syncPrefs.autoSyncInterval') && (
              <SettingRow
                settingKey="syncPrefs.autoSyncInterval"
                label="Auto-sync interval"
                description="How often to automatically sync data from Canvas"
                isModified={
                  syncPrefs.autoSyncInterval !== DEFAULT_SYNC_PREFERENCES.autoSyncInterval
                }
                onReset={() =>
                  updateSyncPrefs({
                    autoSyncInterval: DEFAULT_SYNC_PREFERENCES.autoSyncInterval,
                    autoSyncEnabled: DEFAULT_SYNC_PREFERENCES.autoSyncEnabled,
                  })
                }
              >
                <SettingSelect
                  value={String(syncPrefs.autoSyncInterval)}
                  onChange={(v) => {
                    const interval = Number(v);
                    updateSyncPrefs({
                      autoSyncInterval: interval,
                      autoSyncEnabled: interval > 0,
                    });
                  }}
                  options={[
                    { value: '0', label: SETTINGS_LABELS.options.syncInterval.never },
                    {
                      value: '15',
                      label: SETTINGS_LABELS.options.syncInterval.minutes15,
                    },
                    {
                      value: '30',
                      label: SETTINGS_LABELS.options.syncInterval.minutes30,
                    },
                    { value: '60', label: SETTINGS_LABELS.options.syncInterval.hour1 },
                    { value: '120', label: SETTINGS_LABELS.options.syncInterval.hours2 },
                  ]}
                />
              </SettingRow>
            )}

            {shouldShowSetting('syncPrefs.syncFiles') && (
              <SettingRow
                settingKey="syncPrefs.syncFiles"
                label="Sync files"
                description="Download course files and folders (uses more storage)"
                isModified={syncPrefs.syncFiles !== DEFAULT_SYNC_PREFERENCES.syncFiles}
                onReset={() =>
                  updateSyncPrefs({ syncFiles: DEFAULT_SYNC_PREFERENCES.syncFiles })
                }
              >
                <ToggleSwitch
                  checked={syncPrefs.syncFiles}
                  onChange={(checked) => updateSyncPrefs({ syncFiles: checked })}
                />
              </SettingRow>
            )}

            {shouldShowSetting('syncPrefs.syncAnnouncements') && (
              <SettingRow
                settingKey="syncPrefs.syncAnnouncements"
                label="Sync announcements"
                description="Include course announcements in sync"
                isModified={
                  syncPrefs.syncAnnouncements !==
                  DEFAULT_SYNC_PREFERENCES.syncAnnouncements
                }
                onReset={() =>
                  updateSyncPrefs({
                    syncAnnouncements: DEFAULT_SYNC_PREFERENCES.syncAnnouncements,
                  })
                }
              >
                <ToggleSwitch
                  checked={syncPrefs.syncAnnouncements}
                  onChange={(checked) => updateSyncPrefs({ syncAnnouncements: checked })}
                />
              </SettingRow>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
