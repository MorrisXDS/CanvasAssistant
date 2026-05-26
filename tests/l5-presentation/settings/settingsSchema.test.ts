/**
 * Tests for settingsSchema module
 */

import {
  STORAGE_KEYS,
  SyncPreferencesSchema,
  AppearanceSettingsSchema,
  NotificationSettingsSchema,
  AcademicSettingsSchema,
  FileExplorerSettingsSchema,
  CourseSettingsSchema,
  CalendarSettingsSchema,
  ContentSettingsSchema,
  DEFAULT_SYNC_PREFERENCES,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_FILE_EXPLORER_SETTINGS,
  DEFAULT_COURSE_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_CONTENT_SETTINGS,
  SETTINGS_DEFAULTS,
} from '../../../src/layers/l5-presentation/settings/settingsSchema';

describe('settingsSchema', () => {
  describe('STORAGE_KEYS', () => {
    it('should define all expected storage keys', () => {
      expect(STORAGE_KEYS.SYNC_PREFS).toBe('syncPreferences');
      expect(STORAGE_KEYS.APPEARANCE).toBe('appearanceSettings');
      expect(STORAGE_KEYS.NOTIFICATIONS).toBe('notificationSettings');
      expect(STORAGE_KEYS.ACADEMIC).toBe('academicSettings');
      expect(STORAGE_KEYS.FILE_EXPLORER).toBe('fileExplorerSettings');
      expect(STORAGE_KEYS.COURSES).toBe('courseSettings');
      expect(STORAGE_KEYS.CALENDAR).toBe('calendarSettings');
      expect(STORAGE_KEYS.CONTENT).toBe('contentSettings');
      expect(STORAGE_KEYS.CANVAS_URL).toBe('canvasUrl');
      expect(STORAGE_KEYS.LANDING_PAGE).toBe('landingPage');
      expect(STORAGE_KEYS.SIDEBAR_COLLAPSED).toBe('sidebarCollapsed');
      expect(STORAGE_KEYS.NAV_ORDER).toBe('navItemOrder');
    });

    it('should have unique values for all keys', () => {
      const values = Object.values(STORAGE_KEYS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  describe('SyncPreferencesSchema', () => {
    it('should validate correct sync preferences', () => {
      const result = SyncPreferencesSchema.safeParse(DEFAULT_SYNC_PREFERENCES);
      expect(result.success).toBe(true);
    });

    it('should reject invalid autoSyncInterval', () => {
      const result = SyncPreferencesSchema.safeParse({
        ...DEFAULT_SYNC_PREFERENCES,
        autoSyncInterval: 200, // Max is 120
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = SyncPreferencesSchema.safeParse({
        autoSyncEnabled: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AppearanceSettingsSchema', () => {
    it('should validate correct appearance settings', () => {
      const result = AppearanceSettingsSchema.safeParse(DEFAULT_APPEARANCE_SETTINGS);
      expect(result.success).toBe(true);
    });

    it('should validate all theme options', () => {
      const themes = ['light', 'dark', 'system'] as const;
      themes.forEach((theme) => {
        const result = AppearanceSettingsSchema.safeParse({
          theme,
          sidebarCollapsed: false,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid theme', () => {
      const result = AppearanceSettingsSchema.safeParse({
        theme: 'blue',
        sidebarCollapsed: false,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('NotificationSettingsSchema', () => {
    it('should validate correct notification settings', () => {
      const result = NotificationSettingsSchema.safeParse(DEFAULT_NOTIFICATION_SETTINGS);
      expect(result.success).toBe(true);
    });
  });

  describe('AcademicSettingsSchema', () => {
    it('should validate correct academic settings', () => {
      const result = AcademicSettingsSchema.safeParse(DEFAULT_ACADEMIC_SETTINGS);
      expect(result.success).toBe(true);
    });

    it('should validate all term selection options', () => {
      const options = ['auto', 'all', '12345'];
      options.forEach((termSelection) => {
        const result = AcademicSettingsSchema.safeParse({
          defaultTargetGrade: 85,
          termSelection,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid grade range', () => {
      const result = AcademicSettingsSchema.safeParse({
        defaultTargetGrade: 150, // Max is 100
        termSelection: 'auto',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FileExplorerSettingsSchema', () => {
    it('should validate correct file explorer settings', () => {
      const result = FileExplorerSettingsSchema.safeParse(DEFAULT_FILE_EXPLORER_SETTINGS);
      expect(result.success).toBe(true);
    });

    it('should allow null downloadLocation', () => {
      const result = FileExplorerSettingsSchema.safeParse({
        defaultState: 'collapsed',
        defaultViewMode: 'grid',
        downloadLocation: null,
        skipExternalLinkWarning: false,
      });
      expect(result.success).toBe(true);
    });

    it('should allow string downloadLocation', () => {
      const result = FileExplorerSettingsSchema.safeParse({
        defaultState: 'collapsed',
        defaultViewMode: 'grid',
        downloadLocation: '/path/to/downloads',
        skipExternalLinkWarning: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CourseSettingsSchema', () => {
    it('should validate correct course settings', () => {
      const result = CourseSettingsSchema.safeParse(DEFAULT_COURSE_SETTINGS);
      expect(result.success).toBe(true);
    });
  });

  describe('CalendarSettingsSchema', () => {
    it('should validate correct calendar settings', () => {
      const result = CalendarSettingsSchema.safeParse(DEFAULT_CALENDAR_SETTINGS);
      expect(result.success).toBe(true);
    });

    it('should validate both view modes', () => {
      ['month', 'week'].forEach((defaultViewMode) => {
        const result = CalendarSettingsSchema.safeParse({ defaultViewMode });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('ContentSettingsSchema', () => {
    it('should validate correct content settings', () => {
      const result = ContentSettingsSchema.safeParse(DEFAULT_CONTENT_SETTINGS);
      expect(result.success).toBe(true);
    });

    it('should validate both link behavior options', () => {
      ['always-external', 'prefer-local'].forEach((linkBehavior) => {
        const result = ContentSettingsSchema.safeParse({ linkBehavior });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('SETTINGS_DEFAULTS', () => {
    it('should have defaults for all settings keys', () => {
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.SYNC_PREFS]).toEqual(
        DEFAULT_SYNC_PREFERENCES
      );
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.APPEARANCE]).toEqual(
        DEFAULT_APPEARANCE_SETTINGS
      );
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.NOTIFICATIONS]).toEqual(
        DEFAULT_NOTIFICATION_SETTINGS
      );
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.ACADEMIC]).toEqual(DEFAULT_ACADEMIC_SETTINGS);
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.FILE_EXPLORER]).toEqual(
        DEFAULT_FILE_EXPLORER_SETTINGS
      );
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.COURSES]).toEqual(DEFAULT_COURSE_SETTINGS);
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.CALENDAR]).toEqual(DEFAULT_CALENDAR_SETTINGS);
      expect(SETTINGS_DEFAULTS[STORAGE_KEYS.CONTENT]).toEqual(DEFAULT_CONTENT_SETTINGS);
    });
  });
});
