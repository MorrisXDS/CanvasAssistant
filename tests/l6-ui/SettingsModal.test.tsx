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
});
