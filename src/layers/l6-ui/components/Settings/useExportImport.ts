/**
 * useExportImport - Export/import state and handlers
 *
 * Manages database export/import, settings export/import,
 * encrypted backup password modal, and restart modal flows.
 */

import { useState } from 'react';
import { STORAGE_KEYS } from '../../../l5-presentation/settings';
import type { ExportMessage } from './settingsContextTypes';

export function useExportImport() {
  // Export/Import
  const [isExporting, setIsExporting] = useState(false);
  const [, setIsImporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<ExportMessage | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showCsvDropdown, setShowCsvDropdown] = useState(false);

  // Password modal for encrypted imports
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Restart modal for database import
  const [showRestartModal, setShowRestartModal] = useState(false);

  // Confirmation dialogs
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [deleteTokenOnClear, setDeleteTokenOnClear] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // =========================================================================
  // HANDLERS
  // =========================================================================

  const handleExportDatabase = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const result = await window.api.exportDatabase();
      if (result.success) {
        setExportMessage({
          type: 'success',
          text: `Database exported to ${result.data?.filePath}`,
        });
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Export failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Export failed',
      });
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
        setShowRestartModal(true);
      } else if (result.error === 'PASSWORD_REQUIRED' && result.data?.filePath) {
        setPendingImportPath(result.data.filePath);
        setImportPassword('');
        setShowPasswordModal(true);
      } else {
        setExportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Import failed',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleRestartApp = async () => {
    await window.api.restartApp();
  };

  const handleDecryptImport = async () => {
    if (!pendingImportPath || !importPassword) {
      setExportMessage({ type: 'error', text: 'Password is required' });
      return;
    }

    setIsDecrypting(true);
    try {
      const encryptedResult = await window.api.importEncryptedBackup({
        filePath: pendingImportPath,
        password: importPassword,
      });

      if (encryptedResult.success) {
        setExportMessage({
          type: 'success',
          text: 'Encrypted backup decrypted successfully. Data has been loaded.',
        });
        setShowPasswordModal(false);
        setPendingImportPath(null);
        setImportPassword('');
      } else {
        setExportMessage({
          type: 'error',
          text: encryptedResult.error || 'Failed to decrypt backup - wrong password?',
        });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Decryption failed',
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCancelPasswordModal = () => {
    setShowPasswordModal(false);
    setPendingImportPath(null);
    setImportPassword('');
    setExportMessage({ type: 'error', text: 'Import cancelled' });
  };

  const handleExportSettings = async () => {
    try {
      const settings: Record<string, unknown> = {};
      const keys = Object.values(STORAGE_KEYS);
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          try {
            settings[key] = JSON.parse(value);
          } catch {
            settings[key] = value;
          }
        }
      }

      const result = await window.api.exportSettingsToFile(settings);
      if (result.success) {
        setExportMessage({ type: 'success', text: 'Settings exported successfully' });
      } else if (result.error !== 'Export cancelled') {
        setExportMessage({ type: 'error', text: result.error || 'Export failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Export failed',
      });
    }
  };

  const handleImportSettings = async () => {
    try {
      const result = await window.api.importSettingsFromFile();
      if (result.success && result.data?.settings) {
        const settings = result.data.settings;

        for (const [key, value] of Object.entries(settings)) {
          if (typeof value === 'string') {
            localStorage.setItem(key, value);
          } else {
            localStorage.setItem(key, JSON.stringify(value));
          }
        }

        setExportMessage({ type: 'success', text: 'Settings imported. Reloading...' });
        setTimeout(() => window.location.reload(), 1000);
      } else if (result.error && result.error !== 'Import cancelled') {
        setExportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (e) {
      setExportMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Import failed',
      });
    }
  };

  return {
    // Export/Import state
    isExporting,
    exportMessage,
    setExportMessage,
    showExportDialog,
    setShowExportDialog,
    showCsvDropdown,
    setShowCsvDropdown,
    handleExportDatabase,
    handleImportDatabase,
    handleExportSettings,
    handleImportSettings,

    // Password modal
    showPasswordModal,
    importPassword,
    setImportPassword,
    isDecrypting,
    handleDecryptImport,
    handleCancelPasswordModal,

    // Restart modal
    showRestartModal,
    handleRestartApp,

    // Confirmation dialogs
    showClearDataConfirm,
    setShowClearDataConfirm,
    deleteTokenOnClear,
    setDeleteTokenOnClear,
    showDisconnectConfirm,
    setShowDisconnectConfirm,
  };
}
