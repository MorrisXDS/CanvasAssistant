/**
 * AppBehaviorSection - App Behavior settings
 *
 * Contains:
 * - Close button behavior (quit vs minimize to tray)
 */

import React from 'react';
import { AppWindow } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion, SettingRow, SettingSelect } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS } from '../../constants';
import { SETTINGS_CATEGORIES } from '../../../l5-presentation/settings';

// Category icon
const BEHAVIOR_ICON = <AppWindow size={18} />;

interface AppBehaviorSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function AppBehaviorSection({ sectionRef }: AppBehaviorSectionProps) {
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

    // Window behavior
    windowBehavior,
    updateWindowBehavior,

    // Modified count
    behaviorModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={(e) => handleDragStart(e, 'behavior')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'behavior')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'behavior')}
      style={{
        ...getDragWrapperStyle('behavior'),
        order: sectionOrder.indexOf('behavior'),
      }}
    >
      <Accordion.Item value="behavior">
        <Accordion.Trigger
          icon={BEHAVIOR_ICON}
          badge={<ModifiedBadge count={behaviorModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.behavior.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>{SETTINGS_CATEGORIES.behavior.description}</p>
            )}

            {/* Close button behavior */}
            {shouldShowSetting('windowBehavior.closeAction') && (
              <SettingRow
                settingKey="windowBehavior.closeAction"
                label="Close button behavior"
                description="What happens when you click the close button"
                isModified={windowBehavior.closeAction !== null}
                onReset={() => updateWindowBehavior({ closeAction: null })}
              >
                <SettingSelect
                  value={windowBehavior.closeAction ?? ''}
                  onChange={(v) =>
                    updateWindowBehavior({
                      closeAction: v === '' ? null : (v as 'quit' | 'minimize-to-tray'),
                    })
                  }
                  options={[
                    { value: '', label: SETTINGS_LABELS.options.closeAction.ask },
                    {
                      value: 'minimize-to-tray',
                      label: SETTINGS_LABELS.options.closeAction.minimize,
                    },
                    { value: 'quit', label: SETTINGS_LABELS.options.closeAction.quit },
                  ]}
                />
              </SettingRow>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
