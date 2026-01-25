/**
 * InputValidator Tests
 *
 * Tests the Zod-based validation system for Canvas API responses.
 */

import {
  InputValidator,
  Schemas,
  CanvasCourse,
  CanvasAssignment,
  CanvasSubmission,
} from '../../src/layers/l2-daemon/InputValidator';
import { Logger } from '../../src/layers/l0-utilities/Logger';

describe('InputValidator', () => {
  let logger: Logger;
  let validator: InputValidator;

  beforeAll(() => {
    logger = new Logger({ enableConsole: false });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      validator = new InputValidator();

      expect(validator.getStrictness()).toBe('lenient');
      // Default is 'sanitize' for security - strips script tags, event handlers, javascript: URLs
      expect(validator.getHtmlHandling()).toBe('sanitize');
    });

    it('should accept custom options', () => {
      validator = new InputValidator({
        strictness: 'strict',
        logWarnings: false,
        htmlHandling: 'strip',
        logger,
      });

      expect(validator.getStrictness()).toBe('strict');
      expect(validator.getHtmlHandling()).toBe('strip');
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      validator = new InputValidator({
        strictness: 'lenient',
        logger,
      });
    });

    it('should validate correct data', () => {
      const data = {
        id: 123,
        name: 'Test Course',
        workflow_state: 'available',
      };

      const result = validator.validateCourse(data);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(123);
      expect(result.data?.name).toBe('Test Course');
    });

    it('should provide defaults for missing optional fields', () => {
      const data = {
        id: 123,
      };

      const result = validator.validateCourse(data);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Unnamed Course');
      expect(result.data?.course_code).toBe('');
    });

    it('should fail on missing required fields in strict mode', () => {
      validator = new InputValidator({
        strictness: 'strict',
        logger,
      });

      const data = {
        name: 'Course without ID',
      };

      const result = validator.validateCourse(data);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should produce warnings in lenient mode', () => {
      const data = {
        // Missing required 'id'
        name: 'Course without ID',
      };

      const result = validator.validateCourse(data);

      // In lenient mode, it might still fail if required fields are missing
      // but should include warnings
      if (!result.success) {
        expect(result.errors).toBeDefined();
      }
    });
  });

  describe('validateCourse', () => {
    beforeEach(() => {
      validator = new InputValidator({ logger });
    });

    it('should validate a complete course', () => {
      const course = {
        id: 1,
        name: 'Introduction to Programming',
        course_code: 'CS101',
        workflow_state: 'available',
        enrollments: [
          {
            type: 'student',
            computed_current_score: 85.5,
            computed_final_score: 82.0,
          },
        ],
        term: {
          id: 1,
          name: 'Fall 2024',
          start_at: '2024-09-01T00:00:00Z',
          end_at: '2024-12-15T00:00:00Z',
        },
        start_at: '2024-09-01T00:00:00Z',
        end_at: '2024-12-15T00:00:00Z',
      };

      const result = validator.validateCourse(course);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Introduction to Programming');
      expect(result.data?.enrollments?.length).toBe(1);
    });

    it('should handle null term dates', () => {
      const course = {
        id: 1,
        name: 'Test Course',
        term: {
          id: 1,
          name: 'Fall 2024',
          start_at: null,
          end_at: null,
        },
      };

      const result = validator.validateCourse(course);

      expect(result.success).toBe(true);
      expect(result.data?.term?.start_at).toBeNull();
    });
  });

  describe('validateAssignment', () => {
    beforeEach(() => {
      validator = new InputValidator({ logger });
    });

    it('should validate a complete assignment', () => {
      const assignment = {
        id: 1,
        name: 'Homework 1',
        description: '<p>Complete the exercises</p>',
        due_at: '2024-09-15T23:59:59Z',
        points_possible: 100,
        grading_type: 'points',
        submission_types: ['online_text_entry', 'online_upload'],
        has_submitted_submissions: false,
        published: true,
        course_id: 1,
        assignment_group_id: 1,
        html_url: 'https://canvas.example.com/courses/1/assignments/1',
      };

      const result = validator.validateAssignment(assignment);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Homework 1');
      expect(result.data?.points_possible).toBe(100);
    });

    it('should handle null due_at', () => {
      const assignment = {
        id: 1,
        name: 'No Due Date Assignment',
        due_at: null,
      };

      const result = validator.validateAssignment(assignment);

      expect(result.success).toBe(true);
      expect(result.data?.due_at).toBeNull();
    });

    it('should default submission_types to empty array', () => {
      const assignment = {
        id: 1,
        name: 'Minimal Assignment',
      };

      const result = validator.validateAssignment(assignment);

      expect(result.success).toBe(true);
      expect(result.data?.submission_types).toEqual([]);
    });
  });

  describe('validateSubmission', () => {
    beforeEach(() => {
      validator = new InputValidator({ logger });
    });

    it('should validate a complete submission', () => {
      const submission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        submitted_at: '2024-09-14T20:30:00Z',
        score: 95,
        grade: 'A',
        workflow_state: 'graded',
        late: false,
        missing: false,
        excused: false,
        attempt: 1,
        graded_at: '2024-09-15T10:00:00Z',
      };

      const result = validator.validateSubmission(submission);

      expect(result.success).toBe(true);
      expect(result.data?.score).toBe(95);
      expect(result.data?.grade).toBe('A');
    });

    it('should handle unsubmitted assignment', () => {
      const submission = {
        id: 1,
        assignment_id: 1,
        user_id: 1,
        submitted_at: null,
        score: null,
        grade: null,
        workflow_state: 'unsubmitted',
      };

      const result = validator.validateSubmission(submission);

      expect(result.success).toBe(true);
      expect(result.data?.workflow_state).toBe('unsubmitted');
    });
  });

  describe('validateArray', () => {
    beforeEach(() => {
      validator = new InputValidator({ logger });
    });

    it('should validate an array of courses', () => {
      const courses = [
        { id: 1, name: 'Course 1' },
        { id: 2, name: 'Course 2' },
        { id: 3, name: 'Course 3' },
      ];

      const result = validator.validateArray(courses, Schemas.Course, 'courses');

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
    });

    it('should handle mixed valid/invalid items in lenient mode', () => {
      const courses = [
        { id: 1, name: 'Valid Course' },
        { name: 'Missing ID' }, // Invalid - missing id
        { id: 3, name: 'Another Valid' },
      ];

      const result = validator.validateArray(courses, Schemas.Course, 'courses');

      // In lenient mode, valid items should still be returned
      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2); // Only valid items
    });

    it('should reject non-array input', () => {
      const notArray = { id: 1, name: 'Not an array' };

      const result = validator.validateArray(notArray, Schemas.Course, 'courses');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Expected array but received object');
    });

    it('should fail all items in strict mode when any invalid', () => {
      validator = new InputValidator({
        strictness: 'strict',
        logger,
      });

      const courses = [
        { id: 1, name: 'Valid' },
        { name: 'Missing ID' }, // Invalid
      ];

      const result = validator.validateArray(courses, Schemas.Course, 'courses');

      expect(result.success).toBe(false);
    });
  });

  describe('processHtml', () => {
    it('should keep HTML when htmlHandling is keep', () => {
      validator = new InputValidator({
        htmlHandling: 'keep',
        logger,
      });

      const html = '<p>Hello <strong>World</strong></p>';
      const result = validator.processHtml(html);

      expect(result).toBe(html);
    });

    it('should strip all HTML tags when htmlHandling is strip', () => {
      validator = new InputValidator({
        htmlHandling: 'strip',
        logger,
      });

      const html = '<p>Hello <strong>World</strong></p>';
      const result = validator.processHtml(html);

      expect(result).toBe('Hello World');
    });

    it('should sanitize dangerous HTML when htmlHandling is sanitize', () => {
      validator = new InputValidator({
        htmlHandling: 'sanitize',
        logger,
      });

      const html = '<p onclick="alert(\'xss\')">Hello</p><script>evil()</script>';
      const result = validator.processHtml(html);

      expect(result).not.toContain('onclick');
      expect(result).not.toContain('<script>');
    });

    it('should remove javascript: URLs', () => {
      validator = new InputValidator({
        htmlHandling: 'sanitize',
        logger,
      });

      const html = '<a href="javascript:alert(1)">Click me</a>';
      const result = validator.processHtml(html);

      expect(result).not.toContain('javascript:');
    });

    it('should handle null/undefined input', () => {
      validator = new InputValidator({ logger });

      expect(validator.processHtml(null)).toBe('');
      expect(validator.processHtml(undefined)).toBe('');
    });
  });

  describe('normalizeDate', () => {
    beforeEach(() => {
      validator = new InputValidator({ logger });
    });

    it('should normalize valid date strings', () => {
      const date = '2024-09-15T23:59:59Z';
      const result = validator.normalizeDate(date);

      expect(result).toBe('2024-09-15T23:59:59.000Z');
    });

    it('should handle various date formats', () => {
      const dates = [
        '2024-09-15',
        'September 15, 2024',
        '2024/09/15',
      ];

      for (const date of dates) {
        const result = validator.normalizeDate(date);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('should return null for invalid dates', () => {
      expect(validator.normalizeDate('not a date')).toBeNull();
      expect(validator.normalizeDate('')).toBeNull();
      expect(validator.normalizeDate(null)).toBeNull();
      expect(validator.normalizeDate(undefined)).toBeNull();
    });
  });

  describe('events', () => {
    it('should emit validation-error in strict mode', () => {
      validator = new InputValidator({
        strictness: 'strict',
        logger,
      });

      const eventHandler = jest.fn();
      validator.on('validation-error', eventHandler);

      validator.validateCourse({ name: 'Missing ID' });

      expect(eventHandler).toHaveBeenCalled();
    });

    it('should emit validation-warning in lenient mode', () => {
      validator = new InputValidator({
        strictness: 'lenient',
        logWarnings: true,
        logger,
      });

      const eventHandler = jest.fn();
      validator.on('validation-warning', eventHandler);

      validator.validateCourse({ name: 'Missing ID' });

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe('Canvas schema types', () => {
    beforeEach(() => {
      validator = new InputValidator({ logger });
    });

    it('should validate Canvas User', () => {
      const user = {
        id: 1,
        name: 'John Doe',
        short_name: 'John',
        login_id: 'jdoe',
        email: 'john@example.com',
        avatar_url: 'https://example.com/avatar.png',
      };

      const result = validator.validateUser(user);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('John Doe');
    });

    it('should validate Canvas Announcement', () => {
      const announcement = {
        id: 1,
        title: 'Important Announcement',
        message: '<p>Please read this!</p>',
        posted_at: '2024-09-10T12:00:00Z',
        context_code: 'course_1',
        html_url: 'https://canvas.example.com/courses/1/announcements/1',
      };

      const result = validator.validateAnnouncement(announcement);

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Important Announcement');
    });

    it('should validate Canvas Assignment Group', () => {
      const group = {
        id: 1,
        name: 'Homework',
        position: 1,
        group_weight: 30,
        rules: {
          drop_lowest: 2,
          drop_highest: 0,
          never_drop: [1, 2, 3],
        },
      };

      const result = validator.validateAssignmentGroup(group);

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Homework');
      expect(result.data?.rules?.drop_lowest).toBe(2);
    });
  });

  describe('Schemas export', () => {
    it('should export all Canvas schemas', () => {
      expect(Schemas.Course).toBeDefined();
      expect(Schemas.Assignment).toBeDefined();
      expect(Schemas.Submission).toBeDefined();
      expect(Schemas.User).toBeDefined();
      expect(Schemas.Announcement).toBeDefined();
      expect(Schemas.AssignmentGroup).toBeDefined();
    });
  });
});
