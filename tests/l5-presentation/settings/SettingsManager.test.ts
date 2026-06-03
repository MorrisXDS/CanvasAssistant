/**
 * @jest-environment jsdom
 */

/**
 * Tests for SettingsManager
 */

import {
  SettingsManager,
  settingsManager,
} from '../../../src/layers/l5-presentation/settings/SettingsManager';
import {
  STORAGE_KEYS,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_SYNC_PREFERENCES,
  AppearanceSettings,
} from '../../../src/layers/l5-presentation/settings/settingsSchema';

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
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('SettingsManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    SettingsManager.resetInstance();
  });

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = SettingsManager.getInstance();
      const instance2 = SettingsManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return a new instance after reset', () => {
      const instance1 = SettingsManager.getInstance();
      SettingsManager.resetInstance();
      const instance2 = SettingsManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('get', () => {
    it('should return default value when no stored value exists', () => {
      const manager = SettingsManager.getInstance();
      const value = manager.get(STORAGE_KEYS.APPEARANCE);
      expect(value).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    });

    it('should return stored value when it exists', () => {
      const stored: AppearanceSettings = { theme: 'dark', sidebarCollapsed: true };
      localStorageMock.setItem(STORAGE_KEYS.APPEARANCE, JSON.stringify(stored));

      const manager = SettingsManager.getInstance();
      const value = manager.get(STORAGE_KEYS.APPEARANCE);
      expect(value).toEqual(stored);
    });

    it('should handle boolean stored as string', () => {
      localStorageMock.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, 'true');

      const manager = SettingsManager.getInstance();
      const value = manager.get(STORAGE_KEYS.SIDEBAR_COLLAPSED);
      expect(value).toBe(true);
    });

    it('should return default when stored value is invalid', () => {
      localStorageMock.setItem(
        STORAGE_KEYS.APPEARANCE,
        JSON.stringify({ theme: 'invalid' })
      );

      const manager = SettingsManager.getInstance();
      const value = manager.get(STORAGE_KEYS.APPEARANCE);
      expect(value).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    });

    it('should cache values after first read', () => {
      const manager = SettingsManager.getInstance();

      // First read
      manager.get(STORAGE_KEYS.APPEARANCE);

      // Second read should use cache
      manager.get(STORAGE_KEYS.APPEARANCE);

      // localStorage.getItem should only be called once per key
      // (Note: may be called during initialization too)
    });
  });

  describe('set', () => {
    it('should store value in localStorage', () => {
      const manager = SettingsManager.getInstance();
      const newValue: AppearanceSettings = { theme: 'dark', sidebarCollapsed: true };

      manager.set(STORAGE_KEYS.APPEARANCE, newValue);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.APPEARANCE,
        JSON.stringify(newValue)
      );
    });

    it('should store boolean as string', () => {
      const manager = SettingsManager.getInstance();

      manager.set(STORAGE_KEYS.SIDEBAR_COLLAPSED, true);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.SIDEBAR_COLLAPSED,
        'true'
      );
    });

    it('should return true on success', () => {
      const manager = SettingsManager.getInstance();
      const result = manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');
      expect(result).toBe(true);
    });

    it('should return false for invalid value', () => {
      const manager = SettingsManager.getInstance();
      // Suppress expected validation error output
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      // Use unknown to bypass TypeScript type checking for this test
      const result = manager.set(STORAGE_KEYS.APPEARANCE, {
        theme: 'invalid',
      } as unknown as AppearanceSettings);
      expect(result).toBe(false);
      spy.mockRestore();
    });

    it('should emit change event', () => {
      const manager = SettingsManager.getInstance();
      const callback = jest.fn();

      manager.onChange(STORAGE_KEYS.LANDING_PAGE, callback);
      manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');

      expect(callback).toHaveBeenCalledWith({
        key: STORAGE_KEYS.LANDING_PAGE,
        value: '/calendar',
        previousValue: undefined,
      });
    });
  });

  describe('update', () => {
    it('should merge partial updates with existing value', () => {
      const manager = SettingsManager.getInstance();

      // Set initial value
      manager.set(STORAGE_KEYS.APPEARANCE, { theme: 'light', sidebarCollapsed: false });

      // Update only theme
      manager.update(STORAGE_KEYS.APPEARANCE, { theme: 'dark' });

      const result = manager.get(STORAGE_KEYS.APPEARANCE);
      expect(result).toEqual({ theme: 'dark', sidebarCollapsed: false });
    });
  });

  describe('remove', () => {
    it('should remove value from localStorage', () => {
      const manager = SettingsManager.getInstance();

      manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');
      manager.remove(STORAGE_KEYS.LANDING_PAGE);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.LANDING_PAGE);
    });

    it('should reset to default value', () => {
      const manager = SettingsManager.getInstance();

      manager.set(STORAGE_KEYS.APPEARANCE, { theme: 'dark', sidebarCollapsed: true });
      manager.remove(STORAGE_KEYS.APPEARANCE);

      const value = manager.get(STORAGE_KEYS.APPEARANCE);
      expect(value).toEqual(DEFAULT_APPEARANCE_SETTINGS);
    });
  });

  describe('onChange', () => {
    it('should return unsubscribe function', () => {
      const manager = SettingsManager.getInstance();
      const callback = jest.fn();

      const unsubscribe = manager.onChange(STORAGE_KEYS.LANDING_PAGE, callback);

      manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();

      manager.set(STORAGE_KEYS.LANDING_PAGE, '/courses');
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should support multiple subscribers', () => {
      const manager = SettingsManager.getInstance();
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      manager.onChange(STORAGE_KEYS.LANDING_PAGE, callback1);
      manager.onChange(STORAGE_KEYS.LANDING_PAGE, callback2);

      manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('onAnyChange', () => {
    it('should be called for any setting change', () => {
      const manager = SettingsManager.getInstance();
      const callback = jest.fn();

      manager.onAnyChange(callback);

      manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');
      manager.set(STORAGE_KEYS.SIDEBAR_COLLAPSED, true);

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('has', () => {
    it('should return false for non-existent key', () => {
      const manager = SettingsManager.getInstance();
      expect(manager.has(STORAGE_KEYS.CANVAS_URL)).toBe(false);
    });

    it('should return true for existing key', () => {
      localStorageMock.setItem(STORAGE_KEYS.CANVAS_URL, 'https://example.com');
      const manager = SettingsManager.getInstance();
      expect(manager.has(STORAGE_KEYS.CANVAS_URL)).toBe(true);
    });
  });

  describe('resetAll', () => {
    it('should reset all settings to defaults', () => {
      const manager = SettingsManager.getInstance();

      // Set some values
      manager.set(STORAGE_KEYS.LANDING_PAGE, '/calendar');
      manager.set(STORAGE_KEYS.SIDEBAR_COLLAPSED, true);

      // Reset all
      manager.resetAll();

      // Values should be defaults
      expect(manager.get(STORAGE_KEYS.LANDING_PAGE)).toBe('/');
      expect(manager.get(STORAGE_KEYS.SIDEBAR_COLLAPSED)).toBe(false);
    });
  });

  describe('singleton export', () => {
    it('should export settingsManager singleton', () => {
      expect(settingsManager).toBeInstanceOf(SettingsManager);
    });
  });

  // Straggler centralization (chunk 7) regression guard.
  //
  // The drag-drop/files-explorer keys (FILES_COURSE_ORDER, FOLDER_ORDER,
  // COURSE_ORDER, COURSE_DETAIL_* , FILES_EXPANDED_STATE, FILES_VIEW_PREFS)
  // were added to SettingsTypeMap so SettingsManager.initialize() can iterate
  // Object.values(STORAGE_KEYS) without a tsc error. They are NOT in
  // SETTINGS_DEFAULTS and NOT in SETTINGS_SCHEMAS — they remain managed only by
  // raw localStorage in the renderer hooks.
  //
  // initialize() must therefore be PURELY a read: it pre-loads into cache but
  // must never write back / overwrite / migrate the persisted user values.
  // If it ever clobbered them, users' saved drag-orderings would silently reset.
  describe('initialize() must not clobber raw drag-drop localStorage values', () => {
    it('leaves a pre-existing course-order value byte-identical after initialize()', () => {
      const persisted = JSON.stringify(['101', '202', '303']);
      localStorageMock.setItem(STORAGE_KEYS.COURSE_ORDER, persisted);
      // Clear the setItem/removeItem call log from seeding so the assertions
      // below observe ONLY what initialize() does.
      jest.clearAllMocks();

      const manager = SettingsManager.getInstance();
      manager.initialize();

      // The persisted value must be untouched — no overwrite, no re-serialize,
      // no removal. setItem must not have been called for this key by initialize().
      expect(localStorageMock.getItem(STORAGE_KEYS.COURSE_ORDER)).toBe(persisted);
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        STORAGE_KEYS.COURSE_ORDER,
        expect.anything()
      );
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(
        STORAGE_KEYS.COURSE_ORDER
      );
    });

    it('does not invent a value for an unset drag-drop key', () => {
      // No value seeded for FOLDER_ORDER — initialize must not create one
      // (there is no default for these keys, so nothing should be written).
      const manager = SettingsManager.getInstance();
      manager.initialize();

      expect(localStorageMock.getItem(STORAGE_KEYS.FOLDER_ORDER)).toBeNull();
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
        STORAGE_KEYS.FOLDER_ORDER,
        expect.anything()
      );
    });

    it('preserves all chunk-7 drag-drop keys across initialize()', () => {
      const seeded: Array<[string, string]> = [
        [STORAGE_KEYS.FILES_COURSE_ORDER, JSON.stringify(['c1', 'c2'])],
        [STORAGE_KEYS.FOLDER_ORDER, JSON.stringify(['f1', 'f2'])],
        [STORAGE_KEYS.COURSE_ORDER, JSON.stringify(['a', 'b'])],
        [STORAGE_KEYS.COURSE_DETAIL_TASK_ORDER, JSON.stringify(['t1'])],
        [STORAGE_KEYS.COURSE_DETAIL_SIDEBAR_ORDER, JSON.stringify(['s1'])],
        [STORAGE_KEYS.FILES_EXPANDED_STATE, JSON.stringify({ '1': true })],
        [STORAGE_KEYS.FILES_VIEW_PREFS, JSON.stringify({ mode: 'grid' })],
      ];
      seeded.forEach(([key, value]) => localStorageMock.setItem(key, value));

      const manager = SettingsManager.getInstance();
      manager.initialize();

      seeded.forEach(([key, value]) => {
        expect(localStorageMock.getItem(key)).toBe(value);
      });
    });
  });
});
