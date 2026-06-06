/**
 * SettingsModal Tests
 *
 * Tests for the redesigned Settings Modal component with accordion sections.
 * Focuses on:
 * - Accordion section structure
 * - Canvas URL input behavior
 * - Search functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the store
const mockCourses = [
  {
    id: 1,
    externalId: 'ext-1',
    code: 'CS101',
    name: 'Intro to Computer Science',
    targetGrade: 85,
    targetGradeSource: 'default' as const,
    assessedGrade: 80,
    currentGrade: 78,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
  },
  {
    id: 2,
    externalId: 'ext-2',
    code: 'MATH200',
    name: 'Calculus II',
    targetGrade: 90,
    targetGradeSource: 'user' as const,
    assessedGrade: 85,
    currentGrade: 82,
    color: '#3366FF',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
  },
];

// The store barrel is consumed two ways in this subtree:
//   - SettingsModalContent destructures: `const { courses, ... } = useStore()`.
//   - The nested ExportDialog selects: `useStore(selectors.visibleCourses)`.
// So `useStore(selector?)` must return the selected slice when a selector is
// passed and the whole fake state otherwise, and the barrel must export
// `selectors` (ExportDialog reads `selectors.visibleCourses`).
const mockStoreState = {
  courses: mockCourses,
  fetchCourses: jest.fn(),
  setAuthenticated: jest.fn(),
};

jest.mock('../../src/layers/l5-presentation/store', () => ({
  selectors: {
    visibleCourses: (state: { courses: typeof mockCourses }) =>
      state.courses.filter((c) => !c.isHidden),
  },
  useStore: jest.fn((selector?: (s: typeof mockStoreState) => unknown) =>
    selector ? selector(mockStoreState) : mockStoreState
  ),
}));

// Mock window.api
const mockApi = {
  hasCredential: jest.fn().mockResolvedValue(false),
  getEnrollmentTerms: jest.fn().mockResolvedValue([]),
  getFilesDirectory: jest.fn().mockResolvedValue({ path: '/downloads' }),
  getCourseSettings: jest.fn().mockResolvedValue({
    autoAssignDueDate: null,
    allowGuessedOverride: 1,
  }),
  updateCourseSettings: jest.fn().mockResolvedValue({ success: true }),
  toggleCourseHidden: jest.fn().mockResolvedValue({ success: true }),
  getWindowBehavior: jest
    .fn()
    .mockResolvedValue({ closeAction: null, minimizeToTray: false }),
  setWindowBehavior: jest.fn().mockResolvedValue({ success: true }),
  connectCanvas: jest.fn().mockResolvedValue({ success: true }),
  deleteCredential: jest.fn().mockResolvedValue({ success: true }),
  getBackupSchedule: jest.fn().mockResolvedValue({
    enabled: false,
    frequency: 'daily',
    time: '03:00',
    maxBackups: 5,
  }),
  getBackupHistory: jest.fn().mockResolvedValue([]),
  getBackupDirectoryInfo: jest
    .fn()
    .mockResolvedValue({ path: '/backups', size: 0, count: 0 }),
  setBackupSchedule: jest.fn().mockResolvedValue({ success: true }),
  clearAllData: jest.fn().mockResolvedValue({ success: true }),
  validateToken: jest.fn().mockResolvedValue({ valid: true }),
  storeCredential: jest.fn().mockResolvedValue({ success: true }),
  setAutoSyncPreferences: jest.fn().mockResolvedValue({ success: true }),
  setLocalHtmlPathsSettings: jest.fn().mockResolvedValue({ success: true }),
  selectFilesDirectory: jest.fn().mockResolvedValue(null),
  setFilesDirectory: jest.fn().mockResolvedValue({ success: true }),
  exportDatabase: jest.fn().mockResolvedValue({ success: true }),
  importDatabase: jest.fn().mockResolvedValue({ success: true }),
  restartApp: jest.fn().mockResolvedValue(undefined),
  dispatch: jest.fn().mockResolvedValue({ success: true }),
  getPlatform: jest.fn().mockResolvedValue('win32'),
  getLinuxUninstallCommand: jest.fn().mockResolvedValue({ command: '' }),
  prepareUninstall: jest.fn().mockResolvedValue({ success: true }),
  launchUninstaller: jest.fn().mockResolvedValue({ success: true }),
  openAppLocation: jest.fn().mockResolvedValue(undefined),
};

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Import after mocks
import { SettingsModal } from '../../src/layers/l6-ui/components/SettingsModal';
import { SettingsManager } from '../../src/layers/l5-presentation/settings/SettingsManager';

// For the sub-dialogs block we render SettingsModalContent directly and drive
// the three open-flags through a stubbed useSettings (the flags live in
// useCanvasConnection / useExportImport — internal useState that's awkward to
// flip end-to-end in jsdom). We spy on the module namespace bindings (ts-jest
// compiles `import { useSettings }` to `SettingsContext_1.useSettings(...)`, so
// a spyOn intercepts it) and restore after each test, so the existing
// real-provider SettingsModal tests above are untouched.
import * as SettingsModalContentModule from '../../src/layers/l6-ui/components/Settings/SettingsModalContent';
import * as SettingsContextModule from '../../src/layers/l6-ui/components/Settings/SettingsContext';
import * as DisplaySectionModule from '../../src/layers/l6-ui/components/Settings/DisplaySection';
import * as AcademicSectionModule from '../../src/layers/l6-ui/components/Settings/AcademicSection';
import * as FilesContentSectionModule from '../../src/layers/l6-ui/components/Settings/FilesContentSection';
import * as SyncSectionModule from '../../src/layers/l6-ui/components/Settings/SyncSection';
import * as AccountSectionModule from '../../src/layers/l6-ui/components/Settings/AccountSection';
import * as AppBehaviorSectionModule from '../../src/layers/l6-ui/components/Settings/AppBehaviorSection';
import * as NotificationsSectionModule from '../../src/layers/l6-ui/components/Settings/NotificationsSection';
import * as DataSectionModule from '../../src/layers/l6-ui/components/Settings/DataSection';
import * as UpdatesSectionModule from '../../src/layers/l6-ui/components/Settings/UpdatesSection';
import * as ConfirmDialogModule from '../../src/layers/l6-ui/components/shared/ConfirmDialog';
import * as ExportDialogModule from '../../src/layers/l6-ui/components/shared/ExportDialog';
import * as PrimitivesModule from '../../src/layers/l6-ui/components/primitives';
import type { SettingsContextType } from '../../src/layers/l6-ui/components/Settings/settingsContextTypes';
import { SETTINGS_LABELS } from '../../src/layers/l6-ui/constants';

// Helper to find accordion section trigger by text
function findAccordionTrigger(container: HTMLElement, text: string): HTMLElement | null {
  const buttons = Array.from(container.querySelectorAll('button'));
  for (const btn of buttons) {
    if (btn.textContent?.includes(text)) {
      return btn;
    }
  }
  return null;
}

describe('SettingsModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    // Reset the settings manager singleton to clear its cache
    SettingsManager.resetInstance();
  });

  describe('Accordion structure', () => {
    it('renders accordion sections', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        // Check for the main section headers (labels from SETTINGS_CATEGORIES)
        expect(screen.getByText('Account')).toBeInTheDocument();
        expect(screen.getByText('Display & Layout')).toBeInTheDocument();
        expect(screen.getByText('Academic')).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });
    });

    it('renders search input at the top', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search settings...');
        expect(searchInput).toBeInTheDocument();
      });
    });

    it('all sections are expanded by default', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        // Look for expanded accordion content areas
        // When a section is expanded, its content should be visible
        expect(screen.getByText('Canvas URL')).toBeInTheDocument();
        expect(screen.getByText('Theme')).toBeInTheDocument();
      });
    });
  });

  describe('Canvas URL input', () => {
    it('allows typing full URL without interruption', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const urlInput = screen.getByPlaceholderText(/instructure\.com/i);
        expect(urlInput).toBeInTheDocument();
      });

      const urlInput = screen.getByPlaceholderText(
        /instructure\.com/i
      ) as HTMLInputElement;

      // Type a URL
      const testUrl = 'https://myschool.instructure.com';

      await act(async () => {
        fireEvent.change(urlInput, { target: { value: testUrl } });
      });

      // The input should retain the full value
      expect(urlInput.value).toBe(testUrl);
    });

    it('renders Canvas URL input field', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        const urlInput = screen.getByPlaceholderText(/instructure\.com/i);
        expect(urlInput).toBeInTheDocument();
      });
    });

    it('shows connection status', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        // Should show "Not Connected" when hasCredential returns false
        expect(screen.getByText(/Not Connected/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search functionality', () => {
    it('filters settings when typing in search', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      const searchInput = screen.getByPlaceholderText('Search settings...');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'theme' } });
      });

      // Wait for debounce
      await waitFor(
        () => {
          // Theme setting should still be visible
          expect(screen.getByText('Theme')).toBeInTheDocument();
        },
        { timeout: 500 }
      );
    });

    it('shows no results message when search has no matches', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      const searchInput = screen.getByPlaceholderText('Search settings...');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });
      });

      // Wait for debounce and check for no results
      await waitFor(
        () => {
          expect(screen.getByText(/no settings found/i)).toBeInTheDocument();
        },
        { timeout: 500 }
      );
    });
  });

  describe('Footer actions', () => {
    it('renders export and backup buttons', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Wait for export button (appears in footer)
      await waitFor(() => {
        expect(screen.getByText(/Export Settings/)).toBeInTheDocument();
      });

      // Wait for backup button (appears in footer)
      await waitFor(() => {
        expect(screen.getByText(/Backup Data/)).toBeInTheDocument();
      });
    });

    it('renders reset all button', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Reset All')).toBeInTheDocument();
      });
    });
  });

  describe('Display settings', () => {
    it('shows theme options', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        // Theme setting should be visible in the Display section
        expect(screen.getByText('Theme')).toBeInTheDocument();
      });
    });

    it('shows landing page setting', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Landing page')).toBeInTheDocument();
      });
    });
  });

  describe('Academic settings', () => {
    it('shows target grade setting', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default target grade')).toBeInTheDocument();
      });
    });

    it('displays show hidden courses toggle', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Show hidden courses')).toBeInTheDocument();
      });
    });
  });

  describe('Notification settings', () => {
    it('shows notification toggles', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Modal-primitive migration (refactor/modal-settings-primitive)
  //
  // The overlay branch (non-fullPage) now renders the shared <Modal> primitive;
  // the full-page branch is an unchanged plain <div>. Esc is delegated to the
  // primitive in the overlay branch and to a hand-rolled (gated) listener in the
  // full-page branch. These cases pin both branches + the per-branch Esc
  // decision (the load-bearing risk: no double-fire in overlay, Esc still works
  // in full-page).
  // ---------------------------------------------------------------------------
  describe('Render branches & Esc handling', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(<SettingsModal isOpen={false} onClose={jest.fn()} />);
      // Early `return null` — no dialog, no fullPage div, nothing rendered.
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    describe('Overlay branch (isFullPage omitted / false)', () => {
      it('renders the Modal primitive (role=dialog + backdrop) with content', async () => {
        render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

        // Flush the content's async mount effects first (jsdom act-guard).
        await waitFor(() => {
          expect(screen.getByText('Account')).toBeInTheDocument();
        });

        // Primitive container is role="dialog" aria-modal; backdrop is a
        // div[aria-hidden] (narrowed from [aria-hidden] so it doesn't match the
        // content's decorative aria-hidden lucide icon SVGs).
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        const backdrop = document.querySelector('div[aria-hidden="true"]');
        expect(backdrop).toBeInTheDocument();
      });

      it('Escape fires onClose exactly once (primitive only, no double-fire from the gated effect)', async () => {
        const onClose = jest.fn();
        render(<SettingsModal isOpen={true} onClose={onClose} />);

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        act(() => {
          fireEvent.keyDown(document, { key: 'Escape' });
        });

        // The hand-rolled listener is gated OFF in the overlay branch, so only
        // the primitive's closeOnEscape fires. If it fired twice the gate is wrong.
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('backdrop click closes (primitive closeOnBackdropClick parity)', async () => {
        const onClose = jest.fn();
        render(<SettingsModal isOpen={true} onClose={onClose} />);

        await waitFor(() => {
          expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;
        expect(backdrop).toBeInTheDocument();

        act(() => {
          fireEvent.click(backdrop);
        });

        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('header close button (aria-label="Close") closes', async () => {
        const onClose = jest.fn();
        render(<SettingsModal isOpen={true} onClose={onClose} />);

        // The content's own close button is shown only in overlay (!isFullPage).
        const closeBtn = await screen.findByLabelText('Close');
        expect(closeBtn).toBeInTheDocument();

        act(() => {
          fireEvent.click(closeBtn);
        });

        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    describe('Full-page branch (isFullPage=true)', () => {
      it('renders a plain div with NO Modal primitive backdrop / dialog', async () => {
        render(<SettingsModal isOpen={true} isFullPage={true} onClose={jest.fn()} />);

        // Flush the content's async mount effects first (jsdom act-guard).
        await waitFor(() => {
          expect(screen.getByText('Account')).toBeInTheDocument();
        });

        // Full-page embed is a plain <div> — no primitive backdrop (the Modal's
        // backdrop is a div[aria-hidden]; the content's decorative icon SVGs are
        // aria-hidden too, so narrow to div), no role=dialog.
        expect(document.querySelector('div[aria-hidden="true"]')).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      it('hides the content close button in full-page mode', async () => {
        render(<SettingsModal isOpen={true} isFullPage={true} onClose={jest.fn()} />);

        await waitFor(() => {
          expect(screen.getByText('Account')).toBeInTheDocument();
        });
        // SettingsModalContent gates its close button to !isFullPage.
        expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
      });

      it('Escape still fires onClose via the kept hand-rolled listener', async () => {
        const onClose = jest.fn();
        render(<SettingsModal isOpen={true} isFullPage={true} onClose={onClose} />);

        await waitFor(() => {
          expect(screen.getByText('Account')).toBeInTheDocument();
        });

        act(() => {
          fireEvent.keyDown(document, { key: 'Escape' });
        });

        // The full-page branch is NOT a Modal, so the gated hand-rolled listener
        // is the only Esc path — and it must still close (SettingsPage navigates
        // back on close). Load-bearing: this listener must not be removed.
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Settings sub-dialogs (refactor/modal-settings-subdialogs-primitive)
  //
  // The three handwritten overlay sub-dialogs inside SettingsModalContent
  // (Token Replacement, Password, Restart) are migrated to the shared <Modal>
  // primitive. These cases pin, per dialog:
  //   - open trigger renders the dialog with <Modal> chrome,
  //   - the two dismissible ones (token, password) close via Esc + backdrop +
  //     their Cancel / X (each closing path fires the right handler), and
  //   - the LOAD-BEARING case: the Restart dialog is NON-dismissible (no Esc,
  //     no backdrop close, no close button; only "Restart Now").
  //
  // We render SettingsModalContent directly and stub useSettings so we can
  // drive each open-flag + capture its handler. The 8 section components,
  // ConfirmDialog, ExportDialog, and the primitives barrel (Accordion /
  // SearchInput / SettingsDock) are stubbed so only the three real <Modal>
  // sub-dialogs (and the real Modal primitive, imported directly — NOT via the
  // mocked barrel) render. Spies are restored after each test.
  // ---------------------------------------------------------------------------
  describe('Settings sub-dialogs', () => {
    const { SettingsModalContent } = SettingsModalContentModule;

    // A no-op section stub keyed by name so React devtools / errors are legible.
    const stubSection = (label: string) => () =>
      React.createElement('div', { 'data-stub-section': label });

    /** Build a complete-enough SettingsContextType with overridable fields. */
    function buildContext(overrides: Partial<SettingsContextType>): SettingsContextType {
      const refs = {
        display: { current: null },
        academic: { current: null },
        files: { current: null },
        sync: { current: null },
        account: { current: null },
        behavior: { current: null },
        notifications: { current: null },
        data: { current: null },
        updates: { current: null },
      };
      const noop = jest.fn();
      const base = {
        isOpen: true,
        onClose: jest.fn(),
        isFullPage: false,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        hasSearchResults: false,
        matchingCategories: new Set(),
        isSearching: false,
        openSections: [],
        setOpenSections: jest.fn(),
        dockAutoHide: false,
        sectionOrder: [
          'display',
          'academic',
          'files',
          'sync',
          'account',
          'behavior',
          'notifications',
          'data',
          'updates',
        ],
        getDragWrapperStyle: jest.fn().mockReturnValue({}),
        handleMouseDown: jest.fn(),
        handleDragStart: jest.fn(),
        handleDragEnd: jest.fn(),
        handleDragOver: jest.fn(),
        handleDragLeave: jest.fn(),
        handleDrop: jest.fn(),
        sectionRefs: refs,
        filteredSettings: null,
        // Token replacement (defaults: closed)
        showTokenReplaceModal: false,
        setShowTokenReplaceModal: jest.fn(),
        newToken: '',
        setNewToken: jest.fn(),
        isValidatingNewToken: false,
        newTokenValidation: { valid: null, userName: null, error: null },
        setNewTokenValidation: jest.fn(),
        isReplacingToken: false,
        handleValidateNewToken: jest.fn().mockResolvedValue(undefined),
        handleReplaceToken: jest.fn().mockResolvedValue(undefined),
        // ClearData / Disconnect (unrelated, kept ConfirmDialogs — stubbed)
        showClearDataConfirm: false,
        setShowClearDataConfirm: jest.fn(),
        deleteTokenOnClear: false,
        setDeleteTokenOnClear: jest.fn(),
        showDisconnectConfirm: false,
        setShowDisconnectConfirm: jest.fn(),
        handleDisconnect: jest.fn().mockResolvedValue(undefined),
        // Export/import
        isExporting: false,
        exportMessage: null,
        showExportDialog: false,
        setShowExportDialog: jest.fn(),
        handleExportDatabase: jest.fn().mockResolvedValue(undefined),
        handleExportSettings: jest.fn().mockResolvedValue(undefined),
        // Password modal (defaults: closed)
        showPasswordModal: false,
        importPassword: '',
        setImportPassword: jest.fn(),
        isDecrypting: false,
        handleDecryptImport: jest.fn().mockResolvedValue(undefined),
        handleCancelPasswordModal: jest.fn(),
        // Restart modal (defaults: closed)
        showRestartModal: false,
        handleRestartApp: jest.fn().mockResolvedValue(undefined),
        noop,
      } as unknown as SettingsContextType;
      return { ...base, ...overrides };
    }

    function renderContent(overrides: Partial<SettingsContextType>) {
      const ctx = buildContext(overrides);
      jest.spyOn(SettingsContextModule, 'useSettings').mockReturnValue(ctx);
      render(<SettingsModalContent />);
      return ctx;
    }

    beforeEach(() => {
      // Stub the 8 section components, the two surviving ConfirmDialogs, the
      // ExportDialog, and the primitives barrel (Accordion / SearchInput /
      // SettingsDock) so only the three real <Modal> sub-dialogs render. The
      // real Modal primitive is imported directly by SettingsModalContent (not
      // via the mocked barrel), so it is NOT stubbed.
      jest
        .spyOn(DisplaySectionModule, 'DisplaySection')
        .mockImplementation(stubSection('display'));
      jest
        .spyOn(AcademicSectionModule, 'AcademicSection')
        .mockImplementation(stubSection('academic'));
      jest
        .spyOn(FilesContentSectionModule, 'FilesContentSection')
        .mockImplementation(stubSection('files'));
      jest
        .spyOn(SyncSectionModule, 'SyncSection')
        .mockImplementation(stubSection('sync'));
      jest
        .spyOn(AccountSectionModule, 'AccountSection')
        .mockImplementation(stubSection('account'));
      jest
        .spyOn(AppBehaviorSectionModule, 'AppBehaviorSection')
        .mockImplementation(stubSection('behavior'));
      jest
        .spyOn(NotificationsSectionModule, 'NotificationsSection')
        .mockImplementation(stubSection('notifications'));
      jest
        .spyOn(DataSectionModule, 'DataSection')
        .mockImplementation(stubSection('data'));
      jest
        .spyOn(UpdatesSectionModule, 'UpdatesSection')
        .mockImplementation(stubSection('updates'));
      jest
        .spyOn(ConfirmDialogModule, 'ConfirmDialog')
        .mockImplementation(() => React.createElement(React.Fragment));
      jest
        .spyOn(ExportDialogModule, 'ExportDialog')
        .mockImplementation(() => React.createElement(React.Fragment));
      jest
        .spyOn(PrimitivesModule, 'Accordion')
        .mockImplementation(({ children }: { children?: React.ReactNode }) =>
          React.createElement('div', { 'data-stub': 'accordion' }, children)
        );
      jest
        .spyOn(PrimitivesModule, 'SearchInput')
        .mockImplementation(() => React.createElement(React.Fragment));
      jest
        .spyOn(PrimitivesModule, 'SettingsDock')
        .mockImplementation(() => React.createElement(React.Fragment));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    // -------------------------------------------------------------------------
    // 1-5: Token Replacement Modal (dismissible)
    // -------------------------------------------------------------------------
    describe('Token Replacement Modal', () => {
      it('renders <Modal> chrome when showTokenReplaceModal is true', () => {
        renderContent({ showTokenReplaceModal: true });

        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        // Title from SETTINGS_LABELS.tokenModal.title
        expect(screen.getByText('Replace Canvas Token')).toBeInTheDocument();
        // New-token password input
        expect(screen.getByText('New Access Token')).toBeInTheDocument();
        // Validate button (state machine: not-yet-valid → Validate)
        expect(screen.getByText(/Validate/i)).toBeInTheDocument();
      });

      it('does not render when showTokenReplaceModal is false', () => {
        renderContent({ showTokenReplaceModal: false });
        // No dialog (all three sub-dialogs closed; sections stubbed).
        expect(screen.queryByText('Replace Canvas Token')).not.toBeInTheDocument();
      });

      it('shows the Replace button (not Validate) once newTokenValidation.valid', () => {
        renderContent({
          showTokenReplaceModal: true,
          newToken: 'tok',
          newTokenValidation: { valid: true, userName: 'Jane', error: null },
        });
        // Footer flips to the Replace state-machine branch + success row.
        expect(screen.getByText(/Replace Token/i)).toBeInTheDocument();
        expect(screen.getByText('Token valid for Jane')).toBeInTheDocument();
      });

      it('renders the error row when newTokenValidation.error is set', () => {
        renderContent({
          showTokenReplaceModal: true,
          newTokenValidation: { valid: null, userName: null, error: 'Invalid token' },
        });
        expect(screen.getByText('Invalid token')).toBeInTheDocument();
      });

      it('Cancel button calls setShowTokenReplaceModal(false)', () => {
        const ctx = renderContent({ showTokenReplaceModal: true });
        const cancelBtn = screen.getByText('Cancel');

        act(() => {
          fireEvent.click(cancelBtn);
        });

        expect(ctx.setShowTokenReplaceModal).toHaveBeenCalledWith(false);
      });

      it('header X (aria-label="Close modal") calls setShowTokenReplaceModal(false)', () => {
        const ctx = renderContent({ showTokenReplaceModal: true });
        const closeBtn = screen.getByLabelText('Close modal');

        act(() => {
          fireEvent.click(closeBtn);
        });

        expect(ctx.setShowTokenReplaceModal).toHaveBeenCalledWith(false);
      });

      it('backdrop click calls setShowTokenReplaceModal(false)', () => {
        const ctx = renderContent({ showTokenReplaceModal: true });
        const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;
        expect(backdrop).toBeInTheDocument();

        act(() => {
          fireEvent.click(backdrop);
        });

        expect(ctx.setShowTokenReplaceModal).toHaveBeenCalledWith(false);
      });

      it('Escape closes it (primitive owns Esc — faithful upgrade)', () => {
        const ctx = renderContent({ showTokenReplaceModal: true });

        act(() => {
          fireEvent.keyDown(document, { key: 'Escape' });
        });

        // onClose → setShowTokenReplaceModal(false). No parent Esc handler in
        // this component, so exactly one call (no double-fire).
        expect(ctx.setShowTokenReplaceModal).toHaveBeenCalledTimes(1);
        expect(ctx.setShowTokenReplaceModal).toHaveBeenCalledWith(false);
      });

      it('Validate button invokes handleValidateNewToken', () => {
        const ctx = renderContent({
          showTokenReplaceModal: true,
          newToken: 'tok',
        });
        const validateBtn = screen.getByText(/Validate/i).closest('button')!;

        act(() => {
          fireEvent.click(validateBtn);
        });

        expect(ctx.handleValidateNewToken).toHaveBeenCalled();
      });

      it('typing in the token input updates newToken + resets validation', () => {
        const ctx = renderContent({
          showTokenReplaceModal: true,
          newTokenValidation: { valid: null, userName: null, error: 'stale' },
        });
        const input = screen.getByPlaceholderText(
          SETTINGS_LABELS.placeholders.newToken
        ) as HTMLInputElement;

        act(() => {
          fireEvent.change(input, { target: { value: 'new-tok' } });
        });

        // The inline onChange body runs both setters.
        expect(ctx.setNewToken).toHaveBeenCalledWith('new-tok');
        expect(ctx.setNewTokenValidation).toHaveBeenCalledWith({
          valid: null,
          userName: null,
          error: null,
        });
      });
    });

    // -------------------------------------------------------------------------
    // 6-7: Password Modal (dismissible — all paths → handleCancelPasswordModal)
    // -------------------------------------------------------------------------
    describe('Password Modal', () => {
      it('renders <Modal> chrome when showPasswordModal is true', () => {
        renderContent({ showPasswordModal: true });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Encrypted Backup')).toBeInTheDocument();
        expect(screen.getByText('Password')).toBeInTheDocument();
        expect(screen.getByText(/Decrypt & Import/i)).toBeInTheDocument();
      });

      it('in-input Enter (with a password) calls handleDecryptImport', () => {
        const ctx = renderContent({
          showPasswordModal: true,
          importPassword: 'secret',
        });
        const input = screen.getByPlaceholderText(
          'Enter backup password'
        ) as HTMLInputElement;

        act(() => {
          fireEvent.keyDown(input, { key: 'Enter' });
        });

        expect(ctx.handleDecryptImport).toHaveBeenCalled();
      });

      it('typing in the password input calls setImportPassword', () => {
        const ctx = renderContent({ showPasswordModal: true });
        const input = screen.getByPlaceholderText(
          'Enter backup password'
        ) as HTMLInputElement;

        act(() => {
          fireEvent.change(input, { target: { value: 'pw' } });
        });

        expect(ctx.setImportPassword).toHaveBeenCalledWith('pw');
      });

      it('in-input Enter with EMPTY password does NOT decrypt', () => {
        const ctx = renderContent({
          showPasswordModal: true,
          importPassword: '',
        });
        const input = screen.getByPlaceholderText(
          'Enter backup password'
        ) as HTMLInputElement;

        act(() => {
          fireEvent.keyDown(input, { key: 'Enter' });
        });

        expect(ctx.handleDecryptImport).not.toHaveBeenCalled();
      });

      it('Decrypt & Import button calls handleDecryptImport', () => {
        const ctx = renderContent({
          showPasswordModal: true,
          importPassword: 'secret',
        });
        const decryptBtn = screen.getByText(/Decrypt & Import/i).closest('button')!;

        act(() => {
          fireEvent.click(decryptBtn);
        });

        expect(ctx.handleDecryptImport).toHaveBeenCalled();
      });

      // Each closing path is its own test (single render each) so RTL's
      // afterEach cleanup unmounts between them — multiple renders in one test
      // would accumulate in document.body and duplicate the "Close modal" /
      // backdrop matches.
      it('Cancel button calls handleCancelPasswordModal', () => {
        const ctx = renderContent({ showPasswordModal: true });
        act(() => {
          fireEvent.click(screen.getByText('Cancel'));
        });
        expect(ctx.handleCancelPasswordModal).toHaveBeenCalledTimes(1);
      });

      it('header X calls handleCancelPasswordModal', () => {
        const ctx = renderContent({ showPasswordModal: true });
        act(() => {
          fireEvent.click(screen.getByLabelText('Close modal'));
        });
        expect(ctx.handleCancelPasswordModal).toHaveBeenCalledTimes(1);
      });

      it('backdrop click calls handleCancelPasswordModal', () => {
        const ctx = renderContent({ showPasswordModal: true });
        act(() => {
          fireEvent.click(
            document.querySelector('div[aria-hidden="true"]') as HTMLElement
          );
        });
        expect(ctx.handleCancelPasswordModal).toHaveBeenCalledTimes(1);
      });

      it('Escape calls handleCancelPasswordModal', () => {
        const ctx = renderContent({ showPasswordModal: true });
        act(() => {
          fireEvent.keyDown(document, { key: 'Escape' });
        });
        expect(ctx.handleCancelPasswordModal).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------
    // 8: Restart Modal (NON-dismissible — the load-bearing case)
    // -------------------------------------------------------------------------
    describe('Restart Modal (non-dismissible)', () => {
      it('renders <Modal> chrome + "Restart Now" when showRestartModal is true', () => {
        renderContent({ showRestartModal: true });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Database Imported')).toBeInTheDocument();
        expect(screen.getByText(/Restart Now/i)).toBeInTheDocument();
      });

      it('"Restart Now" calls handleRestartApp', () => {
        const ctx = renderContent({ showRestartModal: true });
        const restartBtn = screen.getByText(/Restart Now/i).closest('button')!;

        act(() => {
          fireEvent.click(restartBtn);
        });

        expect(ctx.handleRestartApp).toHaveBeenCalled();
      });

      it('has NO close (X) button (showCloseButton={false})', () => {
        renderContent({ showRestartModal: true });
        // The primitive close button uses aria-label="Close modal".
        expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
      });

      it('Escape does NOT close it (closeOnEscape={false})', () => {
        renderContent({ showRestartModal: true });
        expect(screen.getByText('Database Imported')).toBeInTheDocument();

        act(() => {
          fireEvent.keyDown(document, { key: 'Escape' });
        });

        // Still mounted — Esc is disabled and no onClose is wired.
        expect(screen.getByText('Database Imported')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      it('backdrop click does NOT close it (closeOnBackdropClick={false})', () => {
        renderContent({ showRestartModal: true });
        const backdrop = document.querySelector('div[aria-hidden="true"]') as HTMLElement;
        expect(backdrop).toBeInTheDocument();

        act(() => {
          fireEvent.click(backdrop);
        });

        // Still mounted — backdrop click is disabled.
        expect(screen.getByText('Database Imported')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });
  });
});
