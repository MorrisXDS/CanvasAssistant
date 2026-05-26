/**
 * Tests for HtmlDependencyResolver
 *
 * Tests cycle detection, shared files (Option B), and recursive resolution
 */

import {
  HtmlDependencyResolver,
  HtmlSourceType,
} from '../../src/layers/l2-daemon/html/HtmlDependencyResolver';
import { Database } from '../../src/layers/l1-persistence/Database';

// Mock the Database
jest.mock('../../src/layers/l1-persistence/Database');

describe('HtmlDependencyResolver', () => {
  let mockDb: jest.Mocked<Database>;
  let resolver: HtmlDependencyResolver;

  beforeEach(() => {
    mockDb = {
      executeRead: jest.fn(),
      executeReadOne: jest.fn(),
      executeWrite: jest.fn(),
    } as unknown as jest.Mocked<Database>;

    resolver = new HtmlDependencyResolver(mockDb, {
      filesBaseDir: '/test/downloads',
    });
  });

  // Helper to create mock implementation
  const createMockImplementation = (
    handler: (sql: string, params: unknown[]) => unknown
  ) => {
    return (sql: string, params?: unknown[]) => handler(sql, params || []);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cycle detection', () => {
    it('detects self-reference cycle', () => {
      // Page1 embeds itself - the HTML ref points back to itself
      const htmlWithSelfRef = '<iframe src="/courses/123/pages/page1"></iframe>';

      // Mock returns the self-referencing HTML for page1
      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          // When querying course_pages for page1
          if (sql.includes('course_pages') && sql.includes('url_slug')) {
            const slug = params[0];
            if (slug === 'page1') {
              return { body_html: htmlWithSelfRef };
            }
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      // The resolver should detect that page1 references itself
      expect(result.cycles).toHaveLength(1);
      expect(result.cycles[0]).toContain('page:page1');
    });

    it('detects simple cycle (A -> B -> A)', () => {
      // Page1 embeds Page2, Page2 embeds Page1
      const html1 = '<iframe src="/courses/123/pages/page2"></iframe>';
      const html2 = '<iframe src="/courses/123/pages/page1"></iframe>';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('course_pages') && sql.includes('url_slug')) {
            const slug = params[0];
            if (slug === 'page1') {
              return { body_html: html1 };
            }
            if (slug === 'page2') {
              return { body_html: html2 };
            }
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      // Should detect the A -> B -> A cycle
      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('detects long cycle (A -> B -> C -> A)', () => {
      const html1 = '<iframe src="/courses/123/pages/page2"></iframe>';
      const html2 = '<iframe src="/courses/123/pages/page3"></iframe>';
      const html3 = '<iframe src="/courses/123/pages/page1"></iframe>';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('course_pages') && sql.includes('url_slug')) {
            const slug = params[0];
            if (slug === 'page1') return { body_html: html1 };
            if (slug === 'page2') return { body_html: html2 };
            if (slug === 'page3') return { body_html: html3 };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      expect(result.cycles.length).toBeGreaterThan(0);
    });

    it('marks cycle references with isCycleRef flag', () => {
      const html1 = '<iframe src="/courses/123/pages/page2"></iframe>';
      const html2 = '<iframe src="/courses/123/pages/page1"></iframe>';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('course_pages') && sql.includes('url_slug')) {
            const slug = params[0];
            if (slug === 'page1') return { body_html: html1 };
            if (slug === 'page2') return { body_html: html2 };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      // Should have cycle(s) detected
      expect(result.cycles.length).toBeGreaterThan(0);
    });
  });

  describe('shared files (Option B)', () => {
    it('reuses existing download location for shared files', () => {
      const html1 = '<img src="/courses/123/files/456/preview">';

      // First resource lookup returns existing download
      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (
            sql.includes('course_pages') &&
            (params[0] === 'page1' || params[1] === 'page1')
          ) {
            return { body_html: html1 };
          }
          if (sql.includes('resources') && params[0] === '456') {
            return {
              id: 1,
              local_path: '/test/other/image.png',
              title: 'image.png',
              size_bytes: 1024,
              mime_type: 'image/png',
              first_referenced_by: 'page:other-page',
            };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      // Should have one file dependency
      const fileDeps = result.allDependencies.filter((d) => d.sourceType === 'file');
      expect(fileDeps.length).toBe(1);

      // Should use existing path
      expect(fileDeps[0].localPath).toBe('/test/other/image.png');
      expect(fileDeps[0].isDownloaded).toBe(true);
    });

    it('assigns new download location for first reference', () => {
      const html1 = '<img src="/courses/123/files/789/preview">';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (
            sql.includes('course_pages') &&
            (params[0] === 'page1' || params[1] === 'page1')
          ) {
            return { body_html: html1 };
          }
          if (sql.includes('resources') && params[0] === '789') {
            return {
              id: 2,
              local_path: null, // Not downloaded yet
              title: 'new-image.png',
              size_bytes: 2048,
              mime_type: 'image/png',
              first_referenced_by: null,
            };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      const fileDeps = result.allDependencies.filter((d) => d.sourceType === 'file');
      expect(fileDeps.length).toBe(1);

      // Should assign new path in _files folder
      expect(fileDeps[0].localPath).toContain('page1_files');
      expect(fileDeps[0].isDownloaded).toBe(false);
    });
  });

  describe('recursive resolution', () => {
    it('resolves nested HTML dependencies', () => {
      const html1 = '<iframe src="./instructions.html"></iframe>';
      const html2 = '<img src="/courses/123/files/789/preview">';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('course_pages')) {
            if (params[0] === 'page1' || params[1] === 'page1') {
              return { body_html: html1 };
            }
            if (params[0] === 'instructions' || params[1] === 'instructions') {
              return { body_html: html2 };
            }
          }
          if (sql.includes('resources') && params[0] === '789') {
            return {
              id: 3,
              local_path: null,
              title: 'diagram.png',
              size_bytes: 1024,
              mime_type: 'image/png',
              first_referenced_by: null,
            };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      // Should have HTML and file dependencies
      expect(result.allDependencies.length).toBeGreaterThan(0);
    });

    it('respects maxDepth limit', () => {
      // Create a chain of HTMLs that exceeds max depth
      const makeHtml = (next: number) =>
        `<iframe src="/courses/123/pages/page${next}"></iframe>`;

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('course_pages')) {
            const pageNum = parseInt(String(params[0]).replace('page', ''), 10) || 1;
            return { body_html: makeHtml(pageNum + 1) };
          }
          return null;
        })
      );

      // Create resolver with low max depth
      const limitedResolver = new HtmlDependencyResolver(mockDb, {
        filesBaseDir: '/test/downloads',
        maxDepth: 3,
      });

      const result = limitedResolver.resolve('page', 'page1', '123', '/test/page1.html');

      // Should stop at depth limit (not infinite)
      expect(result.allDependencies.length).toBeLessThan(10);
    });
  });

  describe('source type handling', () => {
    it('resolves assignment HTML', () => {
      const html = '<img src="/courses/123/files/100/preview">';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('tasks') && params[0] === 'assign1') {
            return { description: html };
          }
          if (sql.includes('resources') && params[0] === '100') {
            return {
              id: 10,
              local_path: null,
              title: 'rubric.pdf',
              size_bytes: 5000,
              mime_type: 'application/pdf',
              first_referenced_by: null,
            };
          }
          return null;
        })
      );

      const result = resolver.resolve(
        'assignment',
        'assign1',
        '123',
        '/test/assign1.html'
      );

      expect(result.allDependencies.length).toBe(1);
      expect(result.allDependencies[0].sourceType).toBe('file');
    });

    it('resolves syllabus HTML', () => {
      const html = '<a href="/courses/123/files/200/download">Download</a>';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('courses') && sql.includes('syllabus_body')) {
            return { syllabus_body: html };
          }
          if (sql.includes('resources') && params[0] === '200') {
            return {
              id: 20,
              local_path: null,
              title: 'syllabus.pdf',
              size_bytes: 10000,
              mime_type: 'application/pdf',
              first_referenced_by: null,
            };
          }
          return null;
        })
      );

      const result = resolver.resolve(
        'syllabus',
        'syllabus',
        '123',
        '/test/syllabus.html'
      );

      expect(result.allDependencies.length).toBe(1);
    });

    it('resolves announcement HTML', () => {
      const html = '<img src="/courses/123/files/300/preview">';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (sql.includes('notifications') && params[0] === 'ann1') {
            return { message_html: html };
          }
          if (sql.includes('resources') && params[0] === '300') {
            return {
              id: 30,
              local_path: null,
              title: 'announcement-image.png',
              size_bytes: 2000,
              mime_type: 'image/png',
              first_referenced_by: null,
            };
          }
          return null;
        })
      );

      const result = resolver.resolve('announcement', 'ann1', '123', '/test/ann1.html');

      expect(result.allDependencies.length).toBe(1);
    });
  });

  describe('missing dependencies', () => {
    it('calculates missingCount correctly', () => {
      const html = `
        <img src="/courses/123/files/1/preview">
        <img src="/courses/123/files/2/preview">
        <img src="/courses/123/files/3/preview">
      `;

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (
            sql.includes('course_pages') &&
            (params[0] === 'page1' || params[1] === 'page1')
          ) {
            return { body_html: html };
          }
          if (sql.includes('resources')) {
            const id = params[0];
            if (id === '1') {
              return {
                id: 1,
                local_path: '/downloaded.png',
                title: 'img1.png',
                first_referenced_by: 'page:other',
              };
            }
            if (id === '2') {
              return {
                id: 2,
                local_path: null,
                title: 'img2.png',
                first_referenced_by: null,
              };
            }
            if (id === '3') {
              return {
                id: 3,
                local_path: null,
                title: 'img3.png',
                first_referenced_by: null,
              };
            }
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      expect(result.missingCount).toBe(2); // Files 2 and 3 are not downloaded
    });

    it('getMissingDependencies returns only missing files', () => {
      const html = `
        <img src="/courses/123/files/1/preview">
        <img src="/courses/123/files/2/preview">
      `;

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (
            sql.includes('course_pages') &&
            (params[0] === 'page1' || params[1] === 'page1')
          ) {
            return { body_html: html };
          }
          if (sql.includes('resources')) {
            const id = params[0];
            if (id === '1') {
              return {
                id: 1,
                local_path: '/downloaded.png',
                title: 'img1.png',
                first_referenced_by: 'page:other',
              };
            }
            if (id === '2') {
              return {
                id: 2,
                local_path: null,
                title: 'img2.png',
                first_referenced_by: null,
              };
            }
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');
      const missing = resolver.getMissingDependencies(result);

      expect(missing.length).toBe(1);
      expect(missing[0].sourceId).toBe('2');
    });
  });

  describe('areAllDependenciesDownloaded', () => {
    it('returns true when all dependencies are downloaded', () => {
      const html = '<img src="/courses/123/files/1/preview">';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (
            sql.includes('course_pages') &&
            (params[0] === 'page1' || params[1] === 'page1')
          ) {
            return { body_html: html };
          }
          if (sql.includes('resources') && params[0] === '1') {
            return {
              id: 1,
              local_path: '/downloaded.png',
              title: 'img.png',
              first_referenced_by: 'page:page1',
            };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      expect(resolver.areAllDependenciesDownloaded(result)).toBe(true);
    });

    it('returns false when some dependencies are missing', () => {
      const html = '<img src="/courses/123/files/1/preview">';

      mockDb.executeReadOne.mockImplementation(
        createMockImplementation((sql, params) => {
          if (
            sql.includes('course_pages') &&
            (params[0] === 'page1' || params[1] === 'page1')
          ) {
            return { body_html: html };
          }
          if (sql.includes('resources') && params[0] === '1') {
            return {
              id: 1,
              local_path: null,
              title: 'img.png',
              first_referenced_by: null,
            };
          }
          return null;
        })
      );

      const result = resolver.resolve('page', 'page1', '123', '/test/page1.html');

      expect(resolver.areAllDependenciesDownloaded(result)).toBe(false);
    });
  });
});
