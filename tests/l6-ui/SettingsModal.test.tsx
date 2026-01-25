/**
 * SettingsModal Tests
 *
 * Tests for the Settings Modal component, focusing on:
 * - Course Settings section structure and visual hierarchy
 * - Canvas URL input behavior
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

// Helper to find sidebar button by exact text match
function findSidebarButton(container: HTMLElement, text: string): HTMLElement | null {
  const buttons = Array.from(container.querySelectorAll('button'));
  for (const btn of buttons) {
    // Sidebar buttons have specific text content
    if (btn.textContent?.trim() === text) {
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

  describe('Course Settings section', () => {
    it('renders only one Course Settings heading', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to courses section via sidebar button
      const coursesTab = findSidebarButton(container, 'Courses');
      expect(coursesTab).not.toBeNull();

      await act(async () => {
        fireEvent.click(coursesTab!);
      });

      await waitFor(() => {
        // Should find exactly one "Course Settings" heading
        const headings = screen.getAllByRole('heading', { level: 3 });
        const courseSettingsHeadings = headings.filter(
          (h) => h.textContent === 'Course Settings'
        );
        expect(courseSettingsHeadings).toHaveLength(1);
      });
    });

    it('renders settings in distinct visual cards with subsection titles', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to courses section
      const coursesTab = findSidebarButton(container, 'Courses');

      await act(async () => {
        fireEvent.click(coursesTab!);
      });

      await waitFor(() => {
        // Check for subsection titles that indicate visual separation
        expect(screen.getByText('Display')).toBeInTheDocument();
        expect(screen.getByText('Per-Course Sync')).toBeInTheDocument();
        expect(screen.getByText('Visibility')).toBeInTheDocument();
      });
    });

    it('shows course selector in per-course sync section', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to courses section
      const coursesTab = findSidebarButton(container, 'Courses');

      await act(async () => {
        fireEvent.click(coursesTab!);
      });

      await waitFor(() => {
        const courseSelect = screen.getByRole('combobox');
        expect(courseSelect).toBeInTheDocument();

        // Should have the default option plus course options
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThanOrEqual(2); // Default + at least one course
      });
    });

    it('shows sync settings only after selecting a course', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to courses section
      const coursesTab = findSidebarButton(container, 'Courses');

      await act(async () => {
        fireEvent.click(coursesTab!);
      });

      await waitFor(() => {
        // Before selecting a course, auto-fill settings should not be visible
        expect(screen.queryByText('Auto-fill due dates')).not.toBeInTheDocument();
      });

      // Select a course
      const courseSelect = screen.getByRole('combobox');

      await act(async () => {
        fireEvent.change(courseSelect, { target: { value: '1' } });
      });

      await waitFor(() => {
        // After selecting a course, auto-fill settings should be visible
        expect(screen.getByText('Auto-fill due dates')).toBeInTheDocument();
      });
    });

    it('displays course visibility list with course codes', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to courses section
      const coursesTab = findSidebarButton(container, 'Courses');

      await act(async () => {
        fireEvent.click(coursesTab!);
      });

      await waitFor(() => {
        // Should show course codes in the visibility list
        expect(screen.getByText('CS101')).toBeInTheDocument();
        expect(screen.getByText('MATH200')).toBeInTheDocument();
      });
    });
  });

  describe('Canvas URL input', () => {
    it('allows typing full URL without interruption', async () => {
      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to canvas section
      const canvasTab = findSidebarButton(container, 'Canvas');

      await act(async () => {
        fireEvent.click(canvasTab!);
      });

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

    it('loads saved URL from localStorage on mount', async () => {
      const savedUrl = 'https://saved.instructure.com';
      // Set the canvas URL in localStorage (the mock's internal store)
      localStorageMock.setItem('canvasUrl', savedUrl);
      // Reset settingsManager so it picks up the new localStorage value
      SettingsManager.resetInstance();

      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to canvas section
      const canvasTab = findSidebarButton(container, 'Canvas');

      await act(async () => {
        fireEvent.click(canvasTab!);
      });

      await waitFor(() => {
        const urlInput = screen.getByPlaceholderText(/instructure\.com/i) as HTMLInputElement;
        expect(urlInput.value).toBe(savedUrl);
      });
    });

    it('does not overwrite user input when async operations complete', async () => {
      // Setup: no saved URL - reset settingsManager to start fresh
      SettingsManager.resetInstance();

      // Make hasCredential slow
      let resolveCredential: (value: boolean) => void;
      mockApi.hasCredential.mockImplementation(
        () => new Promise((resolve) => {
          resolveCredential = resolve;
        })
      );

      const { container } = render(<SettingsModal isOpen={true} onClose={jest.fn()} />);

      // Navigate to canvas section
      const canvasTab = findSidebarButton(container, 'Canvas');

      await act(async () => {
        fireEvent.click(canvasTab!);
      });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/instructure\.com/i)).toBeInTheDocument();
      });

      const urlInput = screen.getByPlaceholderText(/instructure\.com/i) as HTMLInputElement;

      // User starts typing
      const userUrl = 'https://user-typed.instructure.com';
      await act(async () => {
        fireEvent.change(urlInput, { target: { value: userUrl } });
      });

      expect(urlInput.value).toBe(userUrl);

      // Now the async operation completes
      await act(async () => {
        resolveCredential!(false);
      });

      // The user's input should NOT be overwritten
      expect(urlInput.value).toBe(userUrl);
    });
  });
});
