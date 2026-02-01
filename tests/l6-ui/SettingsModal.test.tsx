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

jest.mock('../../src/layers/l5-presentation/store', () => ({
  useStore: jest.fn(() => ({
    courses: mockCourses,
    fetchCourses: jest.fn(),
    setAuthenticated: jest.fn(),
  })),
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
  getWindowBehavior: jest.fn().mockResolvedValue({ closeAction: null, minimizeToTray: false }),
  setWindowBehavior: jest.fn().mockResolvedValue({ success: true }),
  connectCanvas: jest.fn().mockResolvedValue({ success: true }),
  deleteCredential: jest.fn().mockResolvedValue({ success: true }),
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
    it('renders all four accordion sections', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        // Check for the four main section headers
        expect(screen.getByText('Account & Connection')).toBeInTheDocument();
        expect(screen.getByText('Display & Layout')).toBeInTheDocument();
        expect(screen.getByText('Academic & Courses')).toBeInTheDocument();
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

      const urlInput = screen.getByPlaceholderText(/instructure\.com/i) as HTMLInputElement;

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
      await waitFor(() => {
        // Theme setting should still be visible
        expect(screen.getByText('Theme')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('shows no results message when search has no matches', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      const searchInput = screen.getByPlaceholderText('Search settings...');

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });
      });

      // Wait for debounce and check for no results
      await waitFor(() => {
        expect(screen.getByText(/no settings found/i)).toBeInTheDocument();
      }, { timeout: 500 });
    });
  });

  describe('Footer actions', () => {
    it('renders import and export buttons', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Wait for export button (appears in footer)
      await waitFor(() => {
        expect(screen.getByText(/Export Settings/)).toBeInTheDocument();
      });

      // Wait for import button (appears in footer and Data section, so use getAllByText)
      await waitFor(() => {
        const importButtons = screen.getAllByText(/Import Settings/);
        expect(importButtons.length).toBeGreaterThan(0);
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

    it('displays course visibility list with course codes', async () => {
      render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      await waitFor(() => {
        // Should show course codes in the visibility list
        expect(screen.getByText('CS101')).toBeInTheDocument();
        expect(screen.getByText('MATH200')).toBeInTheDocument();
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
});
