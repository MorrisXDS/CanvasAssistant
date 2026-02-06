/**
 * DataSection - Data Management settings
 *
 * Contains:
 * - Backup & Restore (database backup and restore)
 * - Data Export (CSV exports for external tools)
 * - Scheduled Backups (automatic backup configuration)
 * - Danger zone (reset all data, uninstall app)
 */

import React, { useState, useMemo } from 'react';
import {
  HardDrive,
  Database,
  FileSpreadsheet,
  ChevronDown,
  Settings2,
  Upload,
  Trash2,
} from 'lucide-react';
import { useSettings } from './SettingsContext';
import { Accordion } from '../primitives';
import { UninstallModal } from './UninstallModal';
import { BackupScheduleSection } from './BackupScheduleSection';
import { styles } from '../SettingsModalStyles';
import { SETTINGS_LABELS, MENU_LABELS } from '../../constants';

// Category icon
const DATA_ICON = <HardDrive size={18} />;

// Setting keys grouped by subsection (must match settingsMetadata.ts)
const SUBSECTION_KEYS = {
  backupRestore: ['data.backup', 'data.restore'],
  scheduledBackups: [
    'exportSchedule.enabled',
    'exportSchedule.frequency',
    'exportSchedule.time',
    'exportSchedule.maxBackups',
    'exportSchedule.encrypt',
  ],
  dataExport: ['data.csvExport'],
  dangerZone: ['data.reset'],
};

interface DataSectionProps {
  sectionRef: React.RefObject<HTMLDivElement>;
}

export function DataSection({ sectionRef }: DataSectionProps) {
  // Uninstall modal state (self-contained, not in context)
  const [showUninstallModal, setShowUninstallModal] = useState(false);

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

    // Export/Import
    isExporting,
    setExportMessage,
    showCsvDropdown,
    setShowCsvDropdown,
    setShowExportDialog,
    handleExportDatabase,
    handleImportDatabase,

    // Confirmation
    setShowClearDataConfirm,
  } = useSettings();

  // Helper to check if any setting in a subsection should be shown
  const shouldShowSubsection = useMemo(() => {
    return (subsection: keyof typeof SUBSECTION_KEYS): boolean => {
      if (!isSearching) return true;
      return SUBSECTION_KEYS[subsection].some((key) => shouldShowSetting(key));
    };
  }, [isSearching, shouldShowSetting]);

  return (
    <div
      ref={sectionRef}
      draggable
      onMouseDown={handleMouseDown}
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
            {/* Backup & Restore Section */}
            {shouldShowSubsection('backupRestore') && (
              <>
                <div style={styles.subsectionTitle}>
                  {SETTINGS_LABELS.sections.backupRestore}
                </div>
                <p
                  style={{
                    margin: '0 0 var(--space-3) 0',
                    color: 'var(--color-text-secondary)',
                    fontSize: '13px',
                  }}
                >
                  Create and restore full database backups. Use this for app recovery or
                  transferring data.
                </p>
                <div style={styles.exportButtonRow}>
                  <button
                    style={styles.exportActionButton}
                    onClick={handleExportDatabase}
                    disabled={isExporting}
                  >
                    <Database size={16} />
                    {SETTINGS_LABELS.buttons.backupDatabase}
                  </button>

                  <button
                    style={styles.exportActionButton}
                    onClick={handleImportDatabase}
                  >
                    <Upload size={16} />
                    {SETTINGS_LABELS.buttons.restoreBackup}
                  </button>
                </div>
                {!isSearching && <div style={styles.divider} />}
              </>
            )}

            {/* Scheduled Backups Section */}
            {shouldShowSubsection('scheduledBackups') && (
              <>
                <div style={styles.subsectionTitle}>
                  {SETTINGS_LABELS.sections.scheduledBackups}
                </div>
                <BackupScheduleSection />
                {!isSearching && <div style={styles.divider} />}
              </>
            )}

            {/* Data Export Section */}
            {shouldShowSubsection('dataExport') && (
              <>
                <div style={styles.subsectionTitle}>
                  {SETTINGS_LABELS.sections.dataExport}
                </div>
                <p
                  style={{
                    margin: '0 0 var(--space-3) 0',
                    color: 'var(--color-text-secondary)',
                    fontSize: '13px',
                  }}
                >
                  Export your data for use in spreadsheets or other tools. These exports
                  cannot be imported back.
                </p>
                <div style={styles.exportButtonRow}>
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
                    {SETTINGS_LABELS.buttons.exportWithOptions}
                  </button>
                </div>
                {!isSearching && <div style={styles.divider} />}
              </>
            )}

            {/* Danger Zone */}
            {shouldShowSubsection('dangerZone') && (
              <>
                <div style={{ ...styles.subsectionTitle, color: 'var(--color-error)' }}>
                  {SETTINGS_LABELS.sections.dangerZone}
                </div>
                <div style={styles.dangerZoneBox}>
                  <div style={styles.dangerZoneContent}>
                    <div>
                      <strong>{SETTINGS_LABELS.data.resetAllData}</strong>
                      <p style={styles.dangerZoneDesc}>
                        Deletes all courses, tasks, grades, and settings. Your Canvas
                        account is not affected.
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
                        Removes all app data, downloaded files, settings, and the
                        application itself
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
              </>
            )}
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
