import {
  mapCourse,
  mapAssignment,
  mapAnnouncement,
  mapModule,
  mapModuleItem,
  mapPage,
  CanvasCourse,
  CanvasAssignment,
  CanvasAnnouncement,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
} from '../../src/layers/l2-daemon/data/DataMappers';

describe('DataMappers', () => {
  describe('mapCourse', () => {
    it('should map a Canvas course to local format', () => {
      const canvasCourse: CanvasCourse = {
        id: 12345,
        name: 'Introduction to Computer Science',
        course_code: 'CSC108',
        enrollment_term_id: 1,
        default_view: 'modules',
        syllabus_body: '<p>Welcome to CSC108!</p>',
        enrollments: [
          {
            type: 'student',
            computed_current_score: 87.5,
            computed_current_grade: 'A-',
          },
        ],
      };

      const result = mapCourse(canvasCourse, 'https://q.utoronto.ca');

      expect(result.external_id).toBe('12345');
      expect(result.code).toBe('CSC108');
      expect(result.name).toBe('Introduction to Computer Science');
      expect(result.current_grade).toBe(87.5);
      expect(result.syllabus_body).toBe('<p>Welcome to CSC108!</p>');
      expect(result.landing_page_url).toBe('https://q.utoronto.ca/courses/12345');
      expect(result.target_grade).toBe(80.0); // Default target grade is now 80
    });

    it('should handle missing enrollment data', () => {
      const canvasCourse: CanvasCourse = {
        id: 12345,
        name: 'Test Course',
        course_code: 'TEST',
        enrollment_term_id: 1,
        default_view: 'modules',
      };

      const result = mapCourse(canvasCourse, 'https://canvas.test.com');

      expect(result.current_grade).toBeNull();
    });
  });

  describe('mapAssignment', () => {
    it('should map a Canvas assignment to local task format', () => {
      const canvasAssignment: CanvasAssignment = {
        id: 98765,
        name: 'Problem Set 3',
        description: '<p>Complete exercises 1-5</p>',
        due_at: '2024-02-15T23:59:00Z',
        unlock_at: '2024-02-01T00:00:00Z',
        lock_at: null,
        points_possible: 100,
        submission_types: ['online_upload', 'online_text_entry'],
        has_submitted_submissions: false,
        course_id: 12345,
        grading_type: 'points',
        assignment_group_id: 1,
      };

      const result = mapAssignment(canvasAssignment, 1);

      expect(result.external_id).toBe('98765');
      expect(result.source_type).toBe('canvas');
      expect(result.course_id).toBe(1);
      expect(result.title).toBe('Problem Set 3');
      expect(result.due_at).toBe('2024-02-15T23:59:00Z');
      expect(result.points_possible).toBe(100);
      expect(result.submission_types).toBe('online_upload,online_text_entry');
      expect(result.is_completed).toBe(0);
    });

    it('should handle submitted assignments', () => {
      const canvasAssignment: CanvasAssignment = {
        id: 11111,
        name: 'Submitted Task',
        description: null,
        due_at: null,
        unlock_at: null,
        lock_at: null,
        points_possible: 50,
        submission_types: ['online_quiz'],
        has_submitted_submissions: true,
        course_id: 12345,
        grading_type: 'points',
        assignment_group_id: 1,
        // Completion is now determined by submission.workflow_state
        submission: {
          workflow_state: 'submitted',
          submitted_at: '2024-02-10T12:00:00Z',
        },
      };

      const result = mapAssignment(canvasAssignment, 1);

      expect(result.is_completed).toBe(1);
      expect(result.submission_status).toBe('submitted');
      expect(result.completed_at).toBe('2024-02-10T12:00:00Z');
    });

    it('should handle graded assignments', () => {
      const canvasAssignment: CanvasAssignment = {
        id: 22222,
        name: 'Graded Task',
        description: null,
        due_at: null,
        unlock_at: null,
        lock_at: null,
        points_possible: 100,
        submission_types: ['online_upload'],
        has_submitted_submissions: true,
        course_id: 12345,
        grading_type: 'points',
        assignment_group_id: 1,
        submission: {
          workflow_state: 'graded',
          submitted_at: '2024-02-10T12:00:00Z',
          score: 85,
          grade: '85',
        },
      };

      const result = mapAssignment(canvasAssignment, 1);

      expect(result.is_completed).toBe(1);
      expect(result.submission_status).toBe('graded');
      expect(result.grade).toBe(85);
    });
  });

  describe('mapAnnouncement', () => {
    const baseUrl = 'https://utoronto.instructure.com';
    const externalCourseId = '12345';

    it('should map a regular announcement', () => {
      const canvasAnnouncement: CanvasAnnouncement = {
        id: 55555,
        title: 'Class Cancelled',
        message: '<p>No class next Monday due to holiday.</p>',
        posted_at: '2024-02-10T12:00:00Z',
        context_code: 'course_12345',
      };

      const result = mapAnnouncement(canvasAnnouncement, 1, baseUrl, externalCourseId);

      expect(result.notification.source_type).toBe('canvas');
      expect(result.notification.source_id).toBe('55555');
      expect(result.notification.course_id).toBe(1);
      expect(result.notification.title).toBe('Class Cancelled');
      expect(result.notification.message).toBe('No class next Monday due to holiday.');
      expect(result.notification.url).toBe(
        'https://utoronto.instructure.com/courses/12345/discussion_topics/55555'
      );
      expect(result.attachments).toHaveLength(0);
    });

    it('should strip HTML from message', () => {
      const canvasAnnouncement: CanvasAnnouncement = {
        id: 88888,
        title: 'HTML Test',
        message:
          '<h1>Title</h1><p>First paragraph.</p><ul><li>Item 1</li><li>Item 2</li></ul><p>Final text.</p>',
        posted_at: '2024-02-10T12:00:00Z',
        context_code: 'course_12345',
      };

      const result = mapAnnouncement(canvasAnnouncement, 1, baseUrl, externalCourseId);

      expect(result.notification.message).not.toContain('<');
      expect(result.notification.message).not.toContain('>');
      expect(result.notification.message).toContain('First paragraph.');
      expect(result.notification.message).toContain('Item 1');
    });

    it('should map attachments', () => {
      const canvasAnnouncement: CanvasAnnouncement = {
        id: 99999,
        title: 'Announcement with File',
        message: '<p>Please see the attached syllabus.</p>',
        posted_at: '2024-02-10T12:00:00Z',
        context_code: 'course_12345',
        attachments: [
          {
            id: 111,
            uuid: 'abc-123',
            display_name: 'Syllabus.pdf',
            filename: 'syllabus_2024.pdf',
            url: 'https://canvas.instructure.com/files/111/download',
            size: 102400,
            content_type: 'application/pdf',
            created_at: '2024-02-10T10:00:00Z',
          },
        ],
      };

      const result = mapAnnouncement(canvasAnnouncement, 1, baseUrl, externalCourseId);

      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].external_id).toBe('111');
      expect(result.attachments[0].display_name).toBe('Syllabus.pdf');
      expect(result.attachments[0].filename).toBe('syllabus_2024.pdf');
      expect(result.attachments[0].size_bytes).toBe(102400);
      expect(result.attachments[0].content_type).toBe('application/pdf');
      expect(result.attachments[0].download_status).toBe('pending');
      expect(result.attachments[0].course_id).toBe(1);
    });
  });

  describe('mapModule', () => {
    it('should map a Canvas module to local format', () => {
      const canvasModule: CanvasModule = {
        id: 33333,
        name: 'Week 1: Introduction',
        position: 1,
        unlock_at: '2024-01-08T00:00:00Z',
        require_sequential_progress: true,
        publish_final_grade: false,
        published: true,
        items_count: 5,
        items_url: '/api/v1/courses/12345/modules/33333/items',
      };

      const result = mapModule(canvasModule, 1);

      expect(result.external_id).toBe('33333');
      expect(result.course_id).toBe(1);
      expect(result.name).toBe('Week 1: Introduction');
      expect(result.position).toBe(1);
      expect(result.require_sequential_progress).toBe(1);
      expect(result.published).toBe(1);
    });
  });

  describe('mapModuleItem', () => {
    it('should map a Canvas module item to local format', () => {
      const canvasModuleItem: CanvasModuleItem = {
        id: 44444,
        module_id: 33333,
        title: 'Lecture 1 Slides',
        type: 'File',
        content_id: 99999,
        position: 1,
        indent: 0,
        html_url: 'https://q.utoronto.ca/courses/12345/files/99999',
        published: true,
        completion_requirement: {
          type: 'must_view',
          completed: false,
        },
      };

      const result = mapModuleItem(canvasModuleItem, 10);

      expect(result.external_id).toBe('44444');
      expect(result.module_id).toBe(10);
      expect(result.title).toBe('Lecture 1 Slides');
      expect(result.item_type).toBe('File');
      expect(result.content_id).toBe('99999');
      expect(result.completion_requirement).toBe(
        '{"type":"must_view","completed":false}'
      );
    });

    it('should handle external URLs', () => {
      const canvasModuleItem: CanvasModuleItem = {
        id: 55555,
        module_id: 33333,
        title: 'Python Documentation',
        type: 'ExternalUrl',
        position: 2,
        indent: 1,
        external_url: 'https://docs.python.org',
        published: true,
      };

      const result = mapModuleItem(canvasModuleItem, 10);

      expect(result.item_type).toBe('ExternalUrl');
      expect(result.external_url).toBe('https://docs.python.org');
      expect(result.content_id).toBeNull();
    });
  });

  describe('mapPage', () => {
    it('should map a Canvas page to local format', () => {
      const canvasPage: CanvasPage = {
        url: 'course-syllabus',
        title: 'Course Syllabus',
        body: '<h1>CSC108 Syllabus</h1><p>Welcome to the course.</p>',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T12:00:00Z',
        editing_roles: 'teachers',
        published: true,
        front_page: false,
      };

      const result = mapPage(canvasPage, 1, 'syllabus');

      expect(result.external_id).toBe('course-syllabus');
      expect(result.course_id).toBe(1);
      expect(result.page_type).toBe('syllabus');
      expect(result.title).toBe('Course Syllabus');
      expect(result.body_html).toBe(
        '<h1>CSC108 Syllabus</h1><p>Welcome to the course.</p>'
      );
      expect(result.body_text).toBe('CSC108 Syllabus Welcome to the course.');
      expect(result.is_front_page).toBe(0);
    });

    it('should identify front pages', () => {
      const canvasPage: CanvasPage = {
        url: 'home',
        title: 'Course Home',
        body: '<p>Welcome!</p>',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        editing_roles: 'teachers',
        published: true,
        front_page: true,
      };

      const result = mapPage(canvasPage, 1, 'landing');

      expect(result.is_front_page).toBe(1);
      expect(result.page_type).toBe('landing');
    });
  });
});
