/**
 * Tests for the straggler-centralized color maps in colors.ts (chunk 4).
 *
 * These maps were previously inline hex literals in NotificationDot.tsx,
 * FileListItem.tsx, and UpdatesPage.tsx. The relocation must be byte-identical:
 * every hex value here is the exact value rendered before centralization. A drift
 * would silently change dot/category/course colors in the UI, so these assertions
 * are a regression guard pinning the exact legacy values.
 */

import {
  UPDATE_TYPE_COLORS,
  UPDATE_TYPE_FALLBACK_COLOR,
  CONTENT_CATEGORY_COLORS,
  DEFAULT_COURSE_COLOR,
} from '../../../src/layers/l6-ui/constants/colors';

describe('colors — straggler centralization (chunk 4)', () => {
  describe('UPDATE_TYPE_COLORS (NotificationDot dot colors)', () => {
    it('has exact legacy hex values', () => {
      expect(UPDATE_TYPE_COLORS.new).toBe('#22C55E');
      expect(UPDATE_TYPE_COLORS.updated).toBe('#3B82F6');
      expect(UPDATE_TYPE_COLORS.grade_changed).toBe('#F97316');
      expect(UPDATE_TYPE_COLORS.conflict).toBe('#EF4444');
    });

    it('has exactly the four update-type keys', () => {
      expect(Object.keys(UPDATE_TYPE_COLORS).sort()).toEqual(
        ['conflict', 'grade_changed', 'new', 'updated'].sort()
      );
    });
  });

  describe('UPDATE_TYPE_FALLBACK_COLOR', () => {
    it('equals the legacy NotificationDot fallback', () => {
      expect(UPDATE_TYPE_FALLBACK_COLOR).toBe('#666');
    });
  });

  describe('CONTENT_CATEGORY_COLORS (FileListItem getCategoryColor)', () => {
    it('has all 10 entries with exact legacy hex values', () => {
      expect(CONTENT_CATEGORY_COLORS['Lecture Slides']).toBe('#1976D2');
      expect(CONTENT_CATEGORY_COLORS['Lab Manual']).toBe('#7B1FA2');
      expect(CONTENT_CATEGORY_COLORS['Assignment']).toBe('#E65100');
      expect(CONTENT_CATEGORY_COLORS['Tutorial']).toBe('#00897B');
      expect(CONTENT_CATEGORY_COLORS['Notes']).toBe('#558B2F');
      expect(CONTENT_CATEGORY_COLORS['Reading']).toBe('#5D4037');
      expect(CONTENT_CATEGORY_COLORS['Syllabus']).toBe('#C62828');
      expect(CONTENT_CATEGORY_COLORS['Solution']).toBe('#00838F');
      expect(CONTENT_CATEGORY_COLORS['Exam']).toBe('#AD1457');
      expect(CONTENT_CATEGORY_COLORS['default']).toBe('#616161');
    });

    it('exposes a default entry used as the unknown-category fallback', () => {
      // getCategoryColor() does `CONTENT_CATEGORY_COLORS[category] ?? CONTENT_CATEGORY_COLORS['default']`
      const unknown =
        CONTENT_CATEGORY_COLORS['NoSuchCategory'] ?? CONTENT_CATEGORY_COLORS['default'];
      expect(unknown).toBe('#616161');
    });
  });

  describe('DEFAULT_COURSE_COLOR', () => {
    it('equals the legacy UpdatesPage fallback', () => {
      expect(DEFAULT_COURSE_COLOR).toBe('#6B7280');
    });
  });
});
