/**
 * SettingsModalContent - Main content component for Settings modal
 *
 * Uses the SettingsContext and renders:
 * - Header with search
 * - Accordion sections using section components
 * - Footer with export/import buttons
 * - Confirmation dialogs and modals
 */

import React from 'react';
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  Database,
  RotateCcw,
  Upload,
  ShieldCheck,
  Key,
  Settings2,
  Lock,
} from 'lucide-react';
import { useStore } from '../../../l5-presentation/store';
import { useSettings } from './SettingsContext';
import { DisplaySection } from './DisplaySection';
import { AcademicSection } from './AcademicSection';
import { FilesContentSection } from './FilesContentSection';
import { SyncSection } from './SyncSection';
import { AccountSection } from './AccountSection';
import { AppBehaviorSection } from './AppBehaviorSection';
import { NotificationsSection } from './NotificationsSection';
import { DataSection } from './DataSection';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ExportDialog } from '../shared/ExportDialog';
import { Accordion, SearchInput, SettingsDock } from '../primitives';
import { SETTINGS_LABELS, MENU_LABELS } from '../../constants';
import { styles } from '../SettingsModalStyles';
import { STORAGE_KEYS, SettingsCategory } from '../../../l5-presentation/settings';

export function SettingsModalContent() {
  const { setAuthenticated } = useStore();

  const {
    // Modal props
    isFullPage,
    onClose,

    // Search
    searchQuery,
    setSearchQuery,
    hasSearchResults,
    matchingCategories,
    isSearching,

    // Accordion
    openSections,
    setOpenSections,

    // Dock
    dockAutoHide,
    sectionOrder,
    sectionRefs,

    // Token replacement modal
    showTokenReplaceModal,
    setShowTokenReplaceModal,
    newToken,
    setNewToken,
    isValidatingNewToken,
    newTokenValidation,
    setNewTokenValidation,
    isReplacingToken,
    handleValidateNewToken,
    handleReplaceToken,

    // Confirmation dialogs
    showClearDataConfirm,
    setShowClearDataConfirm,
    deleteTokenOnClear,
    setDeleteTokenOnClear,
    showDisconnectConfirm,
    setShowDisconnectConfirm,
    handleDisconnect,

    // Export/Import
    isExporting,
    exportMessage,
    showExportDialog,
    setShowExportDialog,
    handleExportDatabase,
    handleExportSettings,

    // Password modal for encrypted imports
    showPasswordModal,
    importPassword,
    setImportPassword,
    isDecrypting,
    handleDecryptImport,
    handleCancelPasswordModal,

    // Restart modal for database import
    showRestartModal,
    handleRestartApp,

    // Filtered settings
    filteredSettings,
  } = useSettings();

  const shouldShowSection = (category: SettingsCategory): boolean => {
    if (!hasSearchResults) return true;
    return matchingCategories.has(category);
  };

  return (
    <>
      {/* Header */}
      <div style={isFullPage ? styles.pageHeader : styles.header}>
        <div style={styles.headerContent}>
          <Settings2 size={24} style={{ color: 'var(--color-navy)' }} />
          <h2 style={isFullPage ? styles.pageTitle : styles.title}>Settings</h2>
        </div>
        {!isFullPage && (
          <button style={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Search */}
      <div style={styles.searchContainer}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={SETTINGS_LABELS.search.placeholder}
          debounce={150}
        />
      </div>

      {/* Content */}
      <div style={{ ...styles.content, flex: isSearching ? 'none' : 1 }}>
        <Accordion type="multiple" value={openSections} onChange={setOpenSections}>
          {shouldShowSection('display') && (
            <DisplaySection sectionRef={sectionRefs.display} />
          )}
          {shouldShowSection('academic') && (
            <AcademicSection sectionRef={sectionRefs.academic} />
          )}
          {shouldShowSection('files') && (
            <FilesContentSection sectionRef={sectionRefs.files} />
          )}
          {shouldShowSection('sync') && <SyncSection sectionRef={sectionRefs.sync} />}
          {shouldShowSection('account') && (
            <AccountSection sectionRef={sectionRefs.account} />
          )}
          {shouldShowSection('behavior') && (
            <AppBehaviorSection sectionRef={sectionRefs.behavior} />
          )}
          {shouldShowSection('notifications') && (
            <NotificationsSection sectionRef={sectionRefs.notifications} />
          )}
          {shouldShowSection('data') && <DataSection sectionRef={sectionRefs.data} />}
        </Accordion>

        {/* No search results message */}
        {hasSearchResults && filteredSettings?.length === 0 && (
          <div style={styles.noResults}>
            <p>{SETTINGS_LABELS.search.noResultsFor(searchQuery)}</p>
            <button style={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
              {MENU_LABELS.common.clearSearch}
            </button>
          </div>
        )}

        {/* Settings Dock Navigation */}
        <SettingsDock
          openSections={openSections}
          onSectionChange={setOpenSections}
          sectionRefs={
            sectionRefs as unknown as Record<string, React.RefObject<HTMLDivElement>>
          }
          onClearSearch={() => setSearchQuery('')}
          autoHide={dockAutoHide}
          sectionOrder={sectionOrder}
        />
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.footerLeft}>
          <button style={styles.footerButton} onClick={handleExportSettings}>
            <Upload size={14} /> {SETTINGS_LABELS.buttons.exportSettings}
          </button>
        </div>
        <div style={styles.footerRight}>
          <button
            style={styles.footerButton}
            onClick={handleExportDatabase}
            disabled={isExporting}
          >
            <Database size={14} /> {SETTINGS_LABELS.buttons.backupData}
          </button>
          <button
            style={{ ...styles.footerButton, ...styles.dangerButtonSmall }}
            onClick={() => setShowClearDataConfirm(true)}
          >
            <RotateCcw size={14} /> {SETTINGS_LABELS.buttons.resetAll}
          </button>
        </div>
      </div>

      {exportMessage && (
        <div
          style={{
            ...styles.exportMessage,
            backgroundColor:
              exportMessage.type === 'success'
                ? 'var(--color-success-bg)'
                : 'var(--color-error-bg)',
            color:
              exportMessage.type === 'success'
                ? 'var(--color-success)'
                : 'var(--color-error)',
          }}
        >
          {exportMessage.text}
        </div>
      )}

      {/* Token Replacement Modal */}
      {showTokenReplaceModal && (
        <div
          style={styles.tokenModalOverlay}
          onClick={() => setShowTokenReplaceModal(false)}
        >
          <div style={styles.tokenModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.tokenModalHeader}>
              <h4 style={styles.tokenModalTitle}>{SETTINGS_LABELS.tokenModal.title}</h4>
              <button
                style={styles.tokenModalClose}
                onClick={() => setShowTokenReplaceModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p style={styles.tokenModalDesc}>{SETTINGS_LABELS.tokenModal.description}</p>
            <div style={styles.field}>
              <label style={styles.label}>
                {SETTINGS_LABELS.tokenModal.newTokenLabel}
              </label>
              <input
                type="password"
                value={newToken}
                onChange={(e) => {
                  setNewToken(e.target.value);
                  setNewTokenValidation({ valid: null, userName: null, error: null });
                }}
                placeholder={SETTINGS_LABELS.placeholders.newToken}
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
                {newTokenValidation.userName
                  ? SETTINGS_LABELS.tokenModal.tokenValidFor(newTokenValidation.userName)
                  : SETTINGS_LABELS.tokenModal.tokenValid}
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
                      <Loader2
                        size={14}
                        style={{ animation: 'spin 1s linear infinite' }}
                      />{' '}
                      {SETTINGS_LABELS.buttons.validating}
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} /> {SETTINGS_LABELS.buttons.validateToken}
                    </>
                  )}
                </button>
              ) : (
                <button
                  style={{ ...styles.primaryButton, opacity: isReplacingToken ? 0.6 : 1 }}
                  onClick={handleReplaceToken}
                  disabled={isReplacingToken}
                >
                  {isReplacingToken ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ animation: 'spin 1s linear infinite' }}
                      />{' '}
                      {SETTINGS_LABELS.buttons.replacing}
                    </>
                  ) : (
                    <>
                      <Key size={14} /> {SETTINGS_LABELS.buttons.replaceToken}
                    </>
                  )}
                </button>
              )}
              <button
                style={styles.cancelButton}
                onClick={() => setShowTokenReplaceModal(false)}
              >
                {MENU_LABELS.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal for Encrypted Imports */}
      {showPasswordModal && (
        <div style={styles.tokenModalOverlay} onClick={handleCancelPasswordModal}>
          <div style={styles.tokenModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.tokenModalHeader}>
              <h4 style={styles.tokenModalTitle}>
                <Lock size={18} style={{ marginRight: '8px' }} />
                Encrypted Backup
              </h4>
              <button style={styles.tokenModalClose} onClick={handleCancelPasswordModal}>
                <X size={18} />
              </button>
            </div>
            <p style={styles.tokenModalDesc}>
              This backup file is encrypted. Enter the password to decrypt it.
            </p>
            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Enter backup password"
                style={styles.input}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && importPassword) {
                    handleDecryptImport();
                  }
                }}
              />
            </div>
            <div style={styles.tokenModalButtons}>
              <button
                style={{
                  ...styles.primaryButton,
                  opacity: isDecrypting || !importPassword ? 0.6 : 1,
                }}
                onClick={handleDecryptImport}
                disabled={isDecrypting || !importPassword}
              >
                {isDecrypting ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />{' '}
                    Decrypting...
                  </>
                ) : (
                  <>
                    <Lock size={14} /> Decrypt & Import
                  </>
                )}
              </button>
              <button style={styles.cancelButton} onClick={handleCancelPasswordModal}>
                {MENU_LABELS.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Modal for Database Import */}
      {showRestartModal && (
        <div style={styles.tokenModalOverlay}>
          <div style={styles.tokenModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.tokenModalHeader}>
              <h4 style={styles.tokenModalTitle}>
                <Database size={18} style={{ marginRight: '8px' }} />
                Database Imported
              </h4>
            </div>
            <p style={styles.tokenModalDesc}>
              Database imported successfully. The app needs to restart to apply the
              changes.
            </p>
            <div style={styles.tokenModalButtons}>
              <button style={styles.primaryButton} onClick={handleRestartApp}>
                <RotateCcw size={14} /> Restart Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation */}
      <ConfirmDialog
        isOpen={showClearDataConfirm}
        type="danger"
        title={SETTINGS_LABELS.data.resetAllData}
        message={
          deleteTokenOnClear
            ? SETTINGS_LABELS.data.resetConfirmWithToken
            : SETTINGS_LABELS.data.resetConfirmWithoutToken
        }
        confirmText={SETTINGS_LABELS.data.resetAllData}
        cancelText={MENU_LABELS.common.cancel}
        onCancel={() => {
          setShowClearDataConfirm(false);
          setDeleteTokenOnClear(false);
        }}
        onConfirm={async () => {
          setShowClearDataConfirm(false);
          try {
            await window.api.clearAllData({ deleteToken: deleteTokenOnClear });
            if (!deleteTokenOnClear) {
              const savedCanvasUrl = localStorage.getItem(STORAGE_KEYS.CANVAS_URL);
              localStorage.clear();
              if (savedCanvasUrl) {
                localStorage.setItem(STORAGE_KEYS.CANVAS_URL, savedCanvasUrl);
              }
              window.location.reload();
            }
            setDeleteTokenOnClear(false);
          } catch (error) {
            console.error('Failed to clear data:', error);
          }
        }}
      >
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={deleteTokenOnClear}
            onChange={(e) => setDeleteTokenOnClear(e.target.checked)}
            style={styles.checkbox}
          />
          {SETTINGS_LABELS.data.deleteTokenLabel}
        </label>
      </ConfirmDialog>

      {/* Disconnect Confirmation */}
      <ConfirmDialog
        isOpen={showDisconnectConfirm}
        type="danger"
        title={SETTINGS_LABELS.disconnect.title}
        message={SETTINGS_LABELS.disconnect.message}
        confirmText={SETTINGS_LABELS.disconnect.confirmText}
        cancelText={SETTINGS_LABELS.buttons.keepConnected}
        onCancel={() => setShowDisconnectConfirm(false)}
        onConfirm={async () => {
          setShowDisconnectConfirm(false);
          await handleDisconnect();
          setAuthenticated(false);
        }}
      />

      {/* Custom Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
    </>
  );
}
