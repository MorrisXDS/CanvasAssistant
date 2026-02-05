/**
 * FilesContentSection - Files & Content settings
 *
 * Contains:
 * - Download location
 * - Link click behavior
 * - Download for offline toggle
 * - Skip external link warning toggle
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion, SettingRow, ToggleSwitch, SettingSelect } from '../primitives';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS, MENU_LABELS } from '../../constants';
import {
  SETTINGS_CATEGORIES,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
  DEFAULT_LOCAL_HTML_PATHS_SETTINGS,
  LINK_BEHAVIOR,
  type ContentSettings,
} from '../../../l5-presentation/settings';

// Category icon
const FILES_ICON = <FolderOpen size={18} />;

interface FilesContentSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function FilesContentSection({ sectionRef }: FilesContentSectionProps) {
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

    // File explorer
    fileExplorer,
    updateFileExplorer,
    currentDownloadPath,
    handleChangeDownloadLocation,

    // Content settings
    contentSettings,
    updateContentSettings,

    // Local HTML paths
    localHtmlPathsSettings,
    updateLocalHtmlPathsSettings,

    // Modified count
    filesModifiedCount,
  } = useSettings();

  const ModifiedBadge = ({ count }: { count: number }) =>
    count > 0 ? <span style={styles.modifiedBadge}>{count} modified</span> : null;

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
      onDragStart={(e) => handleDragStart(e, 'files')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'files')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'files')}
      style={{
        ...getDragWrapperStyle('files'),
        order: sectionOrder.indexOf('files'),
      }}
    >
      <Accordion.Item value="files">
        <Accordion.Trigger
          icon={FILES_ICON}
          badge={<ModifiedBadge count={filesModifiedCount} />}
        >
          {SETTINGS_CATEGORIES.files.label}
        </Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.section}>
            {!isSearching && (
              <p style={styles.sectionDesc}>{SETTINGS_CATEGORIES.files.description}</p>
            )}

            {/* Download Location */}
            {shouldShowSetting('fileExplorer.downloadLocation') && (
              <SettingRow
                settingKey="fileExplorer.downloadLocation"
                label="Download location"
                description="Where downloaded files are stored on your computer"
                vertical
              >
                <div style={styles.downloadLocationRow}>
                  <div style={styles.downloadLocationPath}>
                    {currentDownloadPath || 'Loading...'}
                  </div>
                  <button
                    style={styles.changeLocationBtn}
                    onClick={handleChangeDownloadLocation}
                  >
                    <FolderOpen size={14} /> {MENU_LABELS.common.change}
                  </button>
                </div>
              </SettingRow>
            )}

            {/* Link Behavior */}
            {shouldShowSetting('content.linkBehavior') && (
              <SettingRow
                settingKey="content.linkBehavior"
                label="Link click behavior"
                description="How to handle clicks on links in course content"
                isModified={
                  contentSettings.linkBehavior !== DEFAULT_CONTENT_SETTINGS.linkBehavior
                }
                onReset={() =>
                  updateContentSettings({
                    linkBehavior: DEFAULT_CONTENT_SETTINGS.linkBehavior,
                  })
                }
              >
                <SettingSelect
                  value={contentSettings.linkBehavior}
                  onChange={(v) =>
                    updateContentSettings({
                      linkBehavior: v as ContentSettings['linkBehavior'],
                    })
                  }
                  options={[
                    {
                      value: LINK_BEHAVIOR.ALWAYS_EXTERNAL,
                      label: SETTINGS_LABELS.options.linkBehavior.browser,
                    },
                    {
                      value: LINK_BEHAVIOR.PREFER_LOCAL,
                      label: SETTINGS_LABELS.options.linkBehavior.local,
                    },
                  ]}
                />
              </SettingRow>
            )}

            {/* Download for Offline */}
            {shouldShowSetting('localHtmlPathsSettings.enabled') && (
              <SettingRow
                settingKey="localHtmlPathsSettings.enabled"
                label="Download for offline"
                description="Download linked images when viewing HTML content offline"
                isModified={
                  localHtmlPathsSettings.enabled !==
                  DEFAULT_LOCAL_HTML_PATHS_SETTINGS.enabled
                }
                onReset={() =>
                  updateLocalHtmlPathsSettings({
                    enabled: DEFAULT_LOCAL_HTML_PATHS_SETTINGS.enabled,
                  })
                }
              >
                <ToggleSwitch
                  checked={localHtmlPathsSettings.enabled}
                  onChange={(checked) =>
                    updateLocalHtmlPathsSettings({ enabled: checked })
                  }
                />
              </SettingRow>
            )}

            {/* Skip External Link Warning */}
            {shouldShowSetting('fileExplorer.skipExternalLinkWarning') && (
              <SettingRow
                settingKey="fileExplorer.skipExternalLinkWarning"
                label="Skip external link warning"
                description="Open external links from modules without showing a confirmation dialog"
                isModified={
                  fileExplorer.skipExternalLinkWarning !==
                  DEFAULT_FILE_EXPLORER_SETTINGS.skipExternalLinkWarning
                }
                onReset={() =>
                  updateFileExplorer({
                    skipExternalLinkWarning:
                      DEFAULT_FILE_EXPLORER_SETTINGS.skipExternalLinkWarning,
                  })
                }
              >
                <ToggleSwitch
                  checked={fileExplorer.skipExternalLinkWarning}
                  onChange={(checked) =>
                    updateFileExplorer({ skipExternalLinkWarning: checked })
                  }
                />
              </SettingRow>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </div>
  );
}
