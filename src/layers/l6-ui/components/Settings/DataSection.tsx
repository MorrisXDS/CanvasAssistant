/**
 * DataSection - Data Management settings
 *
 * Contains:
 * - Export options (database backup, CSV export)
 * - Import options (restore backup, import settings)
 * - Danger zone (reset all data, uninstall app)
 */

import React, { useState } from 'react';
import {
  HardDrive,
  Database,
  FileSpreadsheet,
  ChevronDown,
  Settings2,
  Download,
  Trash2,
} from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion } from '../primitives';
import { UninstallModal } from './UninstallModal';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS, MENU_LABELS } from '../../constants';

// Category icon
const DATA_ICON = <HardDrive size={18} />;

interface DataSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function DataSection({ sectionRef }: DataSectionProps) {
  // Uninstall modal state (self-contained, not in context)
  const [showUninstallModal, setShowUninstallModal] = useState(false);

  const {
    // Search
    isSearching,

    // Drag and drop
    sectionOrder,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDragWrapperStyle,

    // Export/Import
    isExporting,
    setExportMessage,
    showCsvDropdown,
    setShowCsvDropdown,
    setShowExportDialog,
    handleExportDatabase,
    handleImportDatabase,
    handleImportSettings,

    // Confirmation
    setShowClearDataConfirm,
  } = useSettings();

  return (
    <div
      ref={sectionRef}
      draggable
      onDragStart={(e) => handleDragStart(e, 'data')}
      onDragEnd={handleDragEnd}
      onDragOver={(e) => handleDragOver(e, 'data')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'data')}
      style={{
        ...getDragWrapperStyle('data'),
        order: sectionOrder.indexOf('data'),
      }}
    >
      <Accordion.Item value="data">
        <Accordion.Trigger icon={DATA_ICON}>Data Management</Accordion.Trigger>
        <Accordion.Content>
          <div style={styles.sectionContent}>
            {/* Export Section */}
            <div style={styles.subsectionTitle}>{SETTINGS_LABELS.sections.export}</div>
            <div style={styles.exportButtonRow}>
              <button
                style={styles.exportActionButton}
                onClick={handleExportDatabase}
                disabled={isExporting}
              >
                <Database size={16} />
                {SETTINGS_LABELS.buttons.quickBackup}
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  style={styles.exportActionButton}
                  onClick={() => setShowCsvDropdown(!showCsvDropdown)}
                >
                  <FileSpreadsheet size={16} />
                  {SETTINGS_LABELS.buttons.exportCsv}
                  <ChevronDown size={14} />
                </button>
                {showCsvDropdown && (
                  <div style={styles.dropdownMenu}>
                    <button
                      style={styles.dropdownItem}
                      onClick={async () => {
                        setShowCsvDropdown(false);
                        try {
                          const result = await window.api.exportTasksCsv({});
                          if (result.success) {
                            setExportMessage({
                              type: 'success',
                              text: 'Tasks exported successfully',
                            });
                          } else {
                            setExportMessage({
                              type: 'error',
                              text: result.error || 'Export failed',
                            });
                          }
                        } catch (error) {
                          setExportMessage({
                            type: 'error',
                            text: String(error),
                          });
                        }
                      }}
                    >
                      {SETTINGS_LABELS.data.exportTasks}
                    </button>
                    <button
                      style={styles.dropdownItem}
                      onClick={async () => {
                        setShowCsvDropdown(false);
                        try {
                          const result = await window.api.exportGradesCsv({});
                          if (result.success) {
                            setExportMessage({
                              type: 'success',
                              text: 'Grades exported successfully',
                            });
                          } else {
                            setExportMessage({
                              type: 'error',
                              text: result.error || 'Export failed',
                            });
                          }
                        } catch (error) {
                          setExportMessage({
                            type: 'error',
                            text: String(error),
                          });
                        }
                      }}
                    >
                      {SETTINGS_LABELS.data.exportGrades}
                    </button>
                  </div>
                )}
              </div>

              <button
                style={styles.exportActionButton}
                onClick={() => setShowExportDialog(true)}
              >
                <Settings2 size={16} />
                {SETTINGS_LABELS.buttons.customExport}
              </button>
            </div>

            {!isSearching && <div style={styles.divider} />}

            {/* Import Section */}
            <div style={styles.subsectionTitle}>{SETTINGS_LABELS.sections.import}</div>
            <div style={styles.exportButtonRow}>
              <button style={styles.exportActionButton} onClick={handleImportDatabase}>
                <Download size={16} />
                {SETTINGS_LABELS.buttons.importBackup}
              </button>
              <button style={styles.exportActionButton} onClick={handleImportSettings}>
                <Download size={16} />
                {SETTINGS_LABELS.buttons.importSettings}
              </button>
            </div>

            {!isSearching && <div style={styles.divider} />}

            {/* Danger Zone */}
            <div style={{ ...styles.subsectionTitle, color: 'var(--color-error)' }}>
              {SETTINGS_LABELS.sections.dangerZone}
            </div>
            <div style={styles.dangerZoneBox}>
              <div style={styles.dangerZoneContent}>
                <div>
                  <strong>{SETTINGS_LABELS.data.resetAllData}</strong>
                  <p style={styles.dangerZoneDesc}>
                    {SETTINGS_LABELS.data.resetAllDescription}
                  </p>
                </div>
                <button
                  style={styles.dangerZoneButton}
                  onClick={() => setShowClearDataConfirm(true)}
                >
                  <Trash2 size={14} />
                  {MENU_LABELS.common.reset}
                </button>
              </div>
            </div>

            {/* Uninstall App */}
            <div style={{ ...styles.dangerZoneBox, marginTop: 'var(--space-3)' }}>
              <div style={styles.dangerZoneContent}>
                <div>
                  <strong>Uninstall Canvas Assistant</strong>
                  <p style={styles.dangerZoneDesc}>
                    Remove app data and uninstall the application
                  </p>
                </div>
                <button
                  style={styles.dangerZoneButton}
                  onClick={() => setShowUninstallModal(true)}
                >
                  <Trash2 size={14} />
                  Uninstall
                </button>
              </div>
            </div>
          </div>
        </Accordion.Content>
      </Accordion.Item>

      {/* Uninstall Modal */}
      <UninstallModal
        isOpen={showUninstallModal}
        onClose={() => setShowUninstallModal(false)}
      />
    </div>
  );
}
