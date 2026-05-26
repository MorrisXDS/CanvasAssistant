/**
 * CanvasFieldMappings Tests
 *
 * Tests for field ownership mappings used by sync conflict resolution.
 */

import {
  COURSE_CANVAS_FIELDS,
  COURSE_LOCAL_FIELDS,
  TASK_CANVAS_FIELDS,
  TASK_LOCAL_FIELDS,
  NOTIFICATION_CANVAS_FIELDS,
  NOTIFICATION_LOCAL_FIELDS,
  CANVAS_PROVIDED_FIELDS,
  LOCAL_ONLY_FIELDS,
  isCanvasField,
  isLocalField,
  getCanvasFields,
  getLocalFields,
} from '../../src/layers/l2-daemon/data/CanvasFieldMappings';

describe('CanvasFieldMappings', () => {
  describe('COURSE_CANVAS_FIELDS', () => {
    it('should include expected Canvas-provided fields', () => {
      expect(COURSE_CANVAS_FIELDS).toContain('external_id');
      expect(COURSE_CANVAS_FIELDS).toContain('code');
      expect(COURSE_CANVAS_FIELDS).toContain('name');
      expect(COURSE_CANVAS_FIELDS).toContain('current_grade');
      expect(COURSE_CANVAS_FIELDS).toContain('syllabus_body');
    });

    it('should not include local-only fields', () => {
      expect(COURSE_CANVAS_FIELDS).not.toContain('target_grade');
      expect(COURSE_CANVAS_FIELDS).not.toContain('color');
      expect(COURSE_CANVAS_FIELDS).not.toContain('nickname');
      expect(COURSE_CANVAS_FIELDS).not.toContain('is_hidden');
    });
  });

  describe('COURSE_LOCAL_FIELDS', () => {
    it('should include expected local-only fields', () => {
      expect(COURSE_LOCAL_FIELDS).toContain('target_grade');
      expect(COURSE_LOCAL_FIELDS).toContain('color');
      expect(COURSE_LOCAL_FIELDS).toContain('nickname');
      expect(COURSE_LOCAL_FIELDS).toContain('is_hidden');
      expect(COURSE_LOCAL_FIELDS).toContain('local_modified_fields');
    });

    it('should not include Canvas-provided fields', () => {
      expect(COURSE_LOCAL_FIELDS).not.toContain('external_id');
      expect(COURSE_LOCAL_FIELDS).not.toContain('name');
    });
  });

  describe('TASK_CANVAS_FIELDS', () => {
    it('should include expected Canvas-provided fields', () => {
      expect(TASK_CANVAS_FIELDS).toContain('external_id');
      expect(TASK_CANVAS_FIELDS).toContain('title');
      expect(TASK_CANVAS_FIELDS).toContain('due_at');
      expect(TASK_CANVAS_FIELDS).toContain('points_possible');
      expect(TASK_CANVAS_FIELDS).toContain('submission_types');
    });

    it('should not include local-only fields', () => {
      expect(TASK_CANVAS_FIELDS).not.toContain('weight');
      expect(TASK_CANVAS_FIELDS).not.toContain('priority_score');
    });
  });

  describe('TASK_LOCAL_FIELDS', () => {
    it('should include expected local-only fields', () => {
      expect(TASK_LOCAL_FIELDS).toContain('weight');
      expect(TASK_LOCAL_FIELDS).toContain('priority_score');
      expect(TASK_LOCAL_FIELDS).toContain('task_group_id');
      expect(TASK_LOCAL_FIELDS).toContain('local_modified_fields');
      expect(TASK_LOCAL_FIELDS).toContain('is_optional');
      expect(TASK_LOCAL_FIELDS).toContain('user_submission_status');
    });

    it('should NOT include Canvas-derived fields', () => {
      // task_type is derived from Canvas submission_types, so it's a Canvas field
      expect(TASK_LOCAL_FIELDS).not.toContain('task_type');
      expect(TASK_LOCAL_FIELDS).not.toContain('is_completed');
    });
  });

  describe('NOTIFICATION_CANVAS_FIELDS', () => {
    it('should include expected Canvas-provided fields', () => {
      expect(NOTIFICATION_CANVAS_FIELDS).toContain('title');
      expect(NOTIFICATION_CANVAS_FIELDS).toContain('message');
      expect(NOTIFICATION_CANVAS_FIELDS).toContain('message_html');
      expect(NOTIFICATION_CANVAS_FIELDS).toContain('published_at');
    });
  });

  describe('NOTIFICATION_LOCAL_FIELDS', () => {
    it('should include expected local-only fields', () => {
      expect(NOTIFICATION_LOCAL_FIELDS).toContain('dismissed_at');
      expect(NOTIFICATION_LOCAL_FIELDS).toContain('is_read');
      expect(NOTIFICATION_LOCAL_FIELDS).toContain('local_modified_fields');
    });
  });

  describe('CANVAS_PROVIDED_FIELDS', () => {
    it('should have mappings for all entity types', () => {
      expect(CANVAS_PROVIDED_FIELDS.courses).toBeDefined();
      expect(CANVAS_PROVIDED_FIELDS.tasks).toBeDefined();
      expect(CANVAS_PROVIDED_FIELDS.notifications).toBeDefined();
    });

    it('should reference the correct field arrays', () => {
      expect(CANVAS_PROVIDED_FIELDS.courses).toBe(COURSE_CANVAS_FIELDS);
      expect(CANVAS_PROVIDED_FIELDS.tasks).toBe(TASK_CANVAS_FIELDS);
      expect(CANVAS_PROVIDED_FIELDS.notifications).toBe(NOTIFICATION_CANVAS_FIELDS);
    });
  });

  describe('LOCAL_ONLY_FIELDS', () => {
    it('should have mappings for all entity types', () => {
      expect(LOCAL_ONLY_FIELDS.courses).toBeDefined();
      expect(LOCAL_ONLY_FIELDS.tasks).toBeDefined();
      expect(LOCAL_ONLY_FIELDS.notifications).toBeDefined();
    });

    it('should reference the correct field arrays', () => {
      expect(LOCAL_ONLY_FIELDS.courses).toBe(COURSE_LOCAL_FIELDS);
      expect(LOCAL_ONLY_FIELDS.tasks).toBe(TASK_LOCAL_FIELDS);
      expect(LOCAL_ONLY_FIELDS.notifications).toBe(NOTIFICATION_LOCAL_FIELDS);
    });
  });

  describe('isCanvasField', () => {
    it('should return true for Canvas-provided course fields', () => {
      expect(isCanvasField('courses', 'external_id')).toBe(true);
      expect(isCanvasField('courses', 'name')).toBe(true);
      expect(isCanvasField('courses', 'current_grade')).toBe(true);
    });

    it('should return false for local course fields', () => {
      expect(isCanvasField('courses', 'target_grade')).toBe(false);
      expect(isCanvasField('courses', 'color')).toBe(false);
    });

    it('should return true for Canvas-provided task fields', () => {
      expect(isCanvasField('tasks', 'title')).toBe(true);
      expect(isCanvasField('tasks', 'due_at')).toBe(true);
    });

    it('should return false for local task fields', () => {
      expect(isCanvasField('tasks', 'weight')).toBe(false);
      expect(isCanvasField('tasks', 'priority_score')).toBe(false);
    });

    it('should return true for Canvas-provided notification fields', () => {
      expect(isCanvasField('notifications', 'title')).toBe(true);
      expect(isCanvasField('notifications', 'message')).toBe(true);
    });

    it('should return false for unknown table', () => {
      expect(isCanvasField('unknown_table', 'any_field')).toBe(false);
    });

    it('should return false for unknown field in known table', () => {
      expect(isCanvasField('courses', 'unknown_field')).toBe(false);
    });
  });

  describe('isLocalField', () => {
    it('should return true for local course fields', () => {
      expect(isLocalField('courses', 'target_grade')).toBe(true);
      expect(isLocalField('courses', 'color')).toBe(true);
      expect(isLocalField('courses', 'nickname')).toBe(true);
    });

    it('should return false for Canvas-provided course fields', () => {
      expect(isLocalField('courses', 'external_id')).toBe(false);
      expect(isLocalField('courses', 'name')).toBe(false);
    });

    it('should return true for local task fields', () => {
      expect(isLocalField('tasks', 'weight')).toBe(true);
      expect(isLocalField('tasks', 'priority_score')).toBe(true);
    });

    it('should return false for Canvas-provided task fields', () => {
      expect(isLocalField('tasks', 'title')).toBe(false);
      expect(isLocalField('tasks', 'due_at')).toBe(false);
    });

    it('should return true for local notification fields', () => {
      expect(isLocalField('notifications', 'dismissed_at')).toBe(true);
      expect(isLocalField('notifications', 'is_read')).toBe(true);
    });

    it('should return false for unknown table', () => {
      expect(isLocalField('unknown_table', 'any_field')).toBe(false);
    });
  });

  describe('getCanvasFields', () => {
    it('should return Canvas fields for courses', () => {
      const fields = getCanvasFields('courses');
      expect(fields).toBe(COURSE_CANVAS_FIELDS);
      expect(fields.length).toBeGreaterThan(0);
    });

    it('should return Canvas fields for tasks', () => {
      const fields = getCanvasFields('tasks');
      expect(fields).toBe(TASK_CANVAS_FIELDS);
    });

    it('should return Canvas fields for notifications', () => {
      const fields = getCanvasFields('notifications');
      expect(fields).toBe(NOTIFICATION_CANVAS_FIELDS);
    });

    it('should return empty array for unknown table', () => {
      const fields = getCanvasFields('unknown_table');
      expect(fields).toEqual([]);
    });
  });

  describe('getLocalFields', () => {
    it('should return local fields for courses', () => {
      const fields = getLocalFields('courses');
      expect(fields).toBe(COURSE_LOCAL_FIELDS);
      expect(fields.length).toBeGreaterThan(0);
    });

    it('should return local fields for tasks', () => {
      const fields = getLocalFields('tasks');
      expect(fields).toBe(TASK_LOCAL_FIELDS);
    });

    it('should return local fields for notifications', () => {
      const fields = getLocalFields('notifications');
      expect(fields).toBe(NOTIFICATION_LOCAL_FIELDS);
    });

    it('should return empty array for unknown table', () => {
      const fields = getLocalFields('unknown_table');
      expect(fields).toEqual([]);
    });
  });

  describe('field uniqueness', () => {
    it('should have no overlap between Canvas and local course fields', () => {
      const canvasSet = new Set<string>(COURSE_CANVAS_FIELDS);
      const localSet = new Set<string>(COURSE_LOCAL_FIELDS);

      const overlap = [...canvasSet].filter((f) => localSet.has(f));
      expect(overlap).toEqual([]);
    });

    it('should have no overlap between Canvas and local task fields', () => {
      const canvasSet = new Set<string>(TASK_CANVAS_FIELDS);
      const localSet = new Set<string>(TASK_LOCAL_FIELDS);

      const overlap = [...canvasSet].filter((f) => localSet.has(f));
      expect(overlap).toEqual([]);
    });

    it('should have no overlap between Canvas and local notification fields', () => {
      const canvasSet = new Set<string>(NOTIFICATION_CANVAS_FIELDS);
      const localSet = new Set<string>(NOTIFICATION_LOCAL_FIELDS);

      const overlap = [...canvasSet].filter((f) => localSet.has(f));
      expect(overlap).toEqual([]);
    });
  });
});
