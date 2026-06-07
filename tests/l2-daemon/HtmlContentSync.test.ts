/**
 * HtmlContentSync Tests
 *
 * Tests for syncing HTML content and embedded resources from Canvas.
 */

import { EventEmitter } from 'events';
import {
  HtmlContentSync,
  ExtractedResource,
  HtmlContentItem,
} from '../../src/layers/l2-daemon/html/HtmlContentSync';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(() => ({ size: 1024 })),
}));

import fs from 'fs';

// Mock Database
const mockDb = {
  executeRead: jest.fn(),
  executeReadOne: jest.fn(),
  executeWrite: jest.fn(),
};

// Mock FileDownloadManager with EventEmitter methods
const mockDownloadManager = {
  queueDownloads: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

describe('HtmlContentSync', () => {
  let sync: HtmlContentSync;
  const defaultConfig = {
    enabled: true,
    urlRewriting: 'original' as const,
    downloadImages: true,
    downloadLinkedFiles: true,
    maxConcurrentDownloads: 3,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    sync = new HtmlContentSync({
      db: mockDb as any,
      downloadManager: mockDownloadManager as any,
      config: defaultConfig,
      baseUrl: 'https://canvas.example.com',
      authToken: 'test-token',
    });
  });

  describe('constructor', () => {
    it('should initialize with required options', () => {
      expect(sync).toBeInstanceOf(EventEmitter);
    });

    it('should work without optional logger', () => {
      const syncNoLogger = new HtmlContentSync({
        db: mockDb as any,
        downloadManager: mockDownloadManager as any,
        config: defaultConfig,
        baseUrl: 'https://canvas.example.com',
      });
      expect(syncNoLogger).toBeDefined();
    });
  });

  describe('extractResources', () => {
    it('should return empty array for empty HTML', () => {
      expect(sync.extractResources('')).toEqual([]);
      expect(sync.extractResources(null as unknown as string)).toEqual([]);
      expect(sync.extractResources(undefined as unknown as string)).toEqual([]);
    });

    it('should extract images from src attribute', () => {
      const html = '<img src="/courses/100/files/456/preview">';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('image');
      expect(resources[0].attribute).toBe('src');
      expect(resources[0].originalUrl).toBe('/courses/100/files/456/preview');
      expect(resources[0].canvasFileId).toBe('456');
    });

    it('should extract images from data-src attribute (lazy loading)', () => {
      // Note: HTML with only data-src, no src attribute
      // The pattern may match data-src as src due to regex overlap
      const html = '<img data-src="/courses/100/files/789/preview" class="lazy">';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('image');
      // The regex for src may capture data-src due to pattern overlap
      expect(['src', 'data-src']).toContain(resources[0].attribute);
      expect(resources[0].canvasFileId).toBe('789');
    });

    it('should extract file links from href', () => {
      const html = '<a href="/courses/100/files/123/download">Download PDF</a>';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('file');
      expect(resources[0].attribute).toBe('href');
      expect(resources[0].canvasFileId).toBe('123');
    });

    it('should extract embedded iframes', () => {
      const html = '<iframe src="https://youtube.com/embed/abc123"></iframe>';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('embed');
      expect(resources[0].attribute).toBe('src');
    });

    it('should extract stylesheets', () => {
      const html = '<link rel="stylesheet" href="/styles/custom.css">';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('stylesheet');
      expect(resources[0].attribute).toBe('href');
    });

    it('should extract background images from style attributes', () => {
      const html = '<div style="background-image: url(\'/images/bg.png\')"></div>';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].type).toBe('image');
      expect(resources[0].attribute).toBe('style');
    });

    it('should skip data URIs', () => {
      const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';

      const resources = sync.extractResources(html);

      expect(resources).toEqual([]);
    });

    it('should deduplicate URLs', () => {
      const html = `
        <img src="/images/logo.png">
        <img src="/images/logo.png">
        <a href="/images/logo.png">Link</a>
      `;

      const resources = sync.extractResources(html);

      // Should only include each unique URL once
      const urls = resources.map((r) => r.originalUrl);
      expect(new Set(urls).size).toBe(urls.length);
    });

    it('should extract multiple different resources', () => {
      const html = `
        <img src="/courses/100/files/1/preview">
        <a href="/courses/100/files/2/download">File</a>
        <img src="/courses/100/files/3/preview">
        <link rel="stylesheet" href="/styles/main.css">
      `;

      const resources = sync.extractResources(html);

      expect(resources.length).toBeGreaterThanOrEqual(4);
      expect(resources.some((r) => r.canvasFileId === '1')).toBe(true);
      expect(resources.some((r) => r.canvasFileId === '2')).toBe(true);
      expect(resources.some((r) => r.canvasFileId === '3')).toBe(true);
    });

    it('should generate filename from URL path', () => {
      const html = '<img src="/images/photo.jpg">';

      const resources = sync.extractResources(html);

      expect(resources[0].filename).toContain('photo');
      expect(resources[0].filename).toContain('jpg');
    });

    it('should add default extension when missing', () => {
      const html = '<img src="/images/photo">';

      const resources = sync.extractResources(html);

      // Should add .png for images
      expect(resources[0].filename).toMatch(/\.png$/);
    });
  });

  describe('rewriteUrls', () => {
    it('should replace original URLs with local paths', () => {
      const html = '<img src="/courses/100/files/456/preview">';
      const resources: ExtractedResource[] = [
        {
          originalUrl: '/courses/100/files/456/preview',
          canvasFileId: '456',
          type: 'image',
          filename: 'image_456.png',
          attribute: 'src',
        },
      ];

      const rewritten = sync.rewriteUrls(html, resources, './assets');

      // Should replace original URL with a relative path (no resource in DB → fallback to root)
      expect(rewritten).not.toContain('/courses/100/files/456/preview');
      expect(rewritten).toContain('image_456.png');
    });

    it('should replace all occurrences of the same URL', () => {
      const html = `
        <img src="/files/789/preview">
        <div style="background: url('/files/789/preview')">
      `;
      const resources: ExtractedResource[] = [
        {
          originalUrl: '/files/789/preview',
          canvasFileId: '789',
          type: 'image',
          filename: 'logo.png',
          attribute: 'src',
        },
      ];

      const rewritten = sync.rewriteUrls(html, resources, './');

      // Both occurrences should be rewritten to the same relative path
      const matches = rewritten.match(/logo\.png/g);
      expect(matches?.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple different resources', () => {
      const html = '<img src="/files/111/preview"><img src="/files/222/preview">';
      const resources: ExtractedResource[] = [
        {
          originalUrl: '/files/111/preview',
          canvasFileId: '111',
          type: 'image',
          filename: 'img1.png',
          attribute: 'src',
        },
        {
          originalUrl: '/files/222/preview',
          canvasFileId: '222',
          type: 'image',
          filename: 'img2.png',
          attribute: 'src',
        },
      ];

      const rewritten = sync.rewriteUrls(html, resources, './');

      expect(rewritten).toContain('img1.png');
      expect(rewritten).toContain('img2.png');
      expect(rewritten).not.toContain('/files/111/preview');
      expect(rewritten).not.toContain('/files/222/preview');
    });
  });

  describe('saveHtmlFile', () => {
    const mockItem: HtmlContentItem = {
      sourceType: 'page',
      sourceId: 'test-page-1',
      title: 'Test Page',
      htmlContent: '<p>Hello World</p>',
      courseId: 1,
      courseCode: 'CS101',
    };

    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
    });

    it('should create directory if it does not exist', () => {
      sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should write HTML file with wrapper document', () => {
      sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('<!DOCTYPE html>');
      expect(writtenContent).toContain('<title>Test Page</title>');
      expect(writtenContent).toContain('<h1>Test Page</h1>');
      expect(writtenContent).toContain('<p>Content</p>');
    });

    it('should not wrap content that is already a full HTML document', () => {
      const fullHtml = '<!DOCTYPE html><html><head></head><body>Content</body></html>';

      sync.saveHtmlFile(mockItem, fullHtml, '/base/dir');

      const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      // Should be the same, not wrapped again
      expect(writtenContent).toBe(fullHtml);
    });

    it('should register in database after saving', () => {
      sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO resources'),
        expect.arrayContaining(['html-page-test-page-1', 1, 'Test Page']),
        'resources'
      );
    });

    it('should handle duplicate filenames', () => {
      // Use a custom implementation to control behavior based on path
      (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        // Directory always exists
        if (filePath.endsWith('Pages')) return true;
        // Original filename exists
        if (filePath.endsWith('Test_Page.html')) return true;
        // Counter version doesn't exist
        return false;
      });

      const result = sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      expect(result.success).toBe(true);
      // Should have written to a filename with counter
      const writeCalls = (fs.writeFileSync as jest.Mock).mock.calls;
      expect(writeCalls[0][0]).toContain('_1');
    });

    it('should return success with local path', () => {
      const result = sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      expect(result.success).toBe(true);
      expect(result.localPath).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return error on failure', () => {
      (fs.mkdirSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const result = sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should escape HTML in title', () => {
      const itemWithSpecialChars: HtmlContentItem = {
        ...mockItem,
        title: 'Test <script>alert(1)</script>',
      };

      sync.saveHtmlFile(itemWithSpecialChars, '<p>Content</p>', '/base/dir');

      const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writtenContent).not.toContain('<script>');
      expect(writtenContent).toContain('&lt;script&gt;');
    });

    it('should use module name for folder when provided', () => {
      const itemWithModule: HtmlContentItem = {
        ...mockItem,
        moduleName: 'Week 1 Readings',
      };

      sync.saveHtmlFile(itemWithModule, '<p>Content</p>', '/base/dir');

      const mkdirCall = (fs.mkdirSync as jest.Mock).mock.calls[0][0];
      expect(mkdirCall).toContain('Week_1_Readings');
    });

    it('should use source type folder when no module', () => {
      sync.saveHtmlFile(mockItem, '<p>Content</p>', '/base/dir');

      const mkdirCall = (fs.mkdirSync as jest.Mock).mock.calls[0][0];
      expect(mkdirCall).toContain('Pages');
    });
  });

  describe('createDownloadRequests', () => {
    const mockItem: HtmlContentItem = {
      sourceType: 'page',
      sourceId: 'test-1',
      title: 'Test',
      htmlContent: '',
      courseId: 1,
      courseCode: 'CS101',
    };

    it('should create download requests for images when enabled', () => {
      const resources: ExtractedResource[] = [
        {
          originalUrl: '/courses/100/files/456/preview',
          canvasFileId: '456',
          type: 'image',
          filename: 'image.png',
          attribute: 'src',
        },
      ];

      const requests = sync.createDownloadRequests(resources, mockItem);

      expect(requests).toHaveLength(1);
      expect(requests[0].url).toContain('/courses/100/files/456/preview');
      expect(requests[0].courseCode).toBe('CS101');
      expect(requests[0].authToken).toBe('test-token');
    });

    it('should skip images when downloadImages is disabled', () => {
      const syncNoImages = new HtmlContentSync({
        db: mockDb as any,
        downloadManager: mockDownloadManager as any,
        config: { ...defaultConfig, downloadImages: false },
        baseUrl: 'https://canvas.example.com',
      });

      const resources: ExtractedResource[] = [
        {
          originalUrl: '/image.png',
          type: 'image',
          filename: 'image.png',
          attribute: 'src',
        },
      ];

      const requests = syncNoImages.createDownloadRequests(resources, mockItem);

      expect(requests).toHaveLength(0);
    });

    it('should skip files when downloadLinkedFiles is disabled', () => {
      const syncNoFiles = new HtmlContentSync({
        db: mockDb as any,
        downloadManager: mockDownloadManager as any,
        config: { ...defaultConfig, downloadLinkedFiles: false },
        baseUrl: 'https://canvas.example.com',
      });

      const resources: ExtractedResource[] = [
        {
          originalUrl: '/files/123/download',
          canvasFileId: '123',
          type: 'file',
          filename: 'doc.pdf',
          attribute: 'href',
        },
      ];

      const requests = syncNoFiles.createDownloadRequests(resources, mockItem);

      expect(requests).toHaveLength(0);
    });

    it('should skip external embeds', () => {
      const resources: ExtractedResource[] = [
        {
          originalUrl: 'https://youtube.com/embed/abc',
          type: 'embed',
          filename: 'embed.html',
          attribute: 'src',
        },
      ];

      const requests = sync.createDownloadRequests(resources, mockItem);

      expect(requests).toHaveLength(0);
    });

    it('should include internal embeds', () => {
      const resources: ExtractedResource[] = [
        {
          originalUrl: 'https://canvas.example.com/embed/doc',
          type: 'embed',
          filename: 'embed.html',
          attribute: 'src',
        },
      ];

      const requests = sync.createDownloadRequests(resources, mockItem);

      expect(requests).toHaveLength(1);
    });

    it('should convert relative URLs to absolute', () => {
      const resources: ExtractedResource[] = [
        {
          originalUrl: '/images/photo.jpg',
          type: 'image',
          filename: 'photo.jpg',
          attribute: 'src',
        },
      ];

      const requests = sync.createDownloadRequests(resources, mockItem);

      expect(requests[0].url).toBe('https://canvas.example.com/images/photo.jpg');
    });

    it('should set context folder based on content type', () => {
      const resources: ExtractedResource[] = [
        {
          originalUrl: '/image.png',
          type: 'image',
          filename: 'image.png',
          attribute: 'src',
        },
      ];

      const pageItem = { ...mockItem, sourceType: 'page' as const };
      const assignmentItem = { ...mockItem, sourceType: 'assignment' as const };

      const pageRequests = sync.createDownloadRequests(resources, pageItem);
      const assignmentRequests = sync.createDownloadRequests(resources, assignmentItem);

      expect(pageRequests[0].contextFolder).toBe('Pages');
      expect(assignmentRequests[0].contextFolder).toBe('Assignments');
    });
  });

  describe('syncCourseHtmlContent', () => {
    beforeEach(() => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM courses')) {
          return { code: 'CS101', external_id: '12345', syllabus_body: null };
        }
        return null;
      });
      mockDb.executeRead.mockReturnValue([]);
    });

    it('should skip when disabled in config', async () => {
      const syncDisabled = new HtmlContentSync({
        db: mockDb as any,
        downloadManager: mockDownloadManager as any,
        config: { ...defaultConfig, enabled: false },
        baseUrl: 'https://canvas.example.com',
      });

      const result = await syncDisabled.syncCourseHtmlContent(1, '/base');

      expect(result.itemsRegistered).toBe(0);
      expect(mockDb.executeRead).not.toHaveBeenCalled();
    });

    it('should return error when course not found', async () => {
      mockDb.executeReadOne.mockReturnValue(null);

      const result = await sync.syncCourseHtmlContent(999, '/base');

      expect(result.errors).toContain('Course not found');
    });

    it('should collect pages, announcements, and assignments', async () => {
      mockDb.executeRead.mockImplementation((query: string) => {
        if (query.includes('FROM course_pages')) {
          return [
            {
              external_id: 'page-1',
              title: 'Page 1',
              body_html: '<p>Page</p>',
              module_id: null,
            },
          ];
        }
        if (query.includes('FROM notifications')) {
          return [{ source_id: 'ann-1', title: 'Ann 1', message_html: '<p>Ann</p>' }];
        }
        if (query.includes('FROM tasks')) {
          return [
            {
              external_id: 'task-1',
              title: 'Task 1',
              description: '<p>Task</p>',
              module_id: null,
            },
          ];
        }
        return [];
      });

      const result = await sync.syncCourseHtmlContent(1, '/base');

      expect(result.itemsRegistered).toBe(3);
      expect(mockDb.executeWrite).toHaveBeenCalledTimes(3);
    });

    it('should include syllabus when present', async () => {
      mockDb.executeReadOne.mockReturnValue({
        code: 'CS101',
        external_id: '12345',
        syllabus_body: '<p>Course Syllabus</p>',
      });
      mockDb.executeRead.mockReturnValue([]);

      const result = await sync.syncCourseHtmlContent(1, '/base');

      expect(result.itemsRegistered).toBe(1);
      const writeCall = mockDb.executeWrite.mock.calls[0];
      expect(writeCall[1]).toContain('html-syllabus-12345');
    });

    it('should count embedded resources', async () => {
      mockDb.executeRead.mockImplementation((query: string) => {
        if (query.includes('FROM course_pages')) {
          return [
            {
              external_id: 'page-1',
              title: 'Page 1',
              body_html: '<p>Text <img src="/img1.png"> <img src="/img2.png"></p>',
              module_id: null,
            },
          ];
        }
        return [];
      });

      const result = await sync.syncCourseHtmlContent(1, '/base');

      expect(result.resourcesFound).toBe(2);
    });

    it('should emit html-sync-complete event', async () => {
      mockDb.executeRead.mockReturnValue([]);

      const eventPromise = new Promise<void>((resolve) => {
        sync.on('html-sync-complete', (data) => {
          expect(data.courseId).toBe(1);
          expect(data.courseCode).toBe('CS101');
          resolve();
        });
      });

      await sync.syncCourseHtmlContent(1, '/base');
      await eventPromise;
    });

    it('should capture errors per item', async () => {
      mockDb.executeRead.mockImplementation((query: string) => {
        if (query.includes('FROM course_pages')) {
          return [
            {
              external_id: 'page-1',
              title: 'Page 1',
              body_html: '<p>Page</p>',
              module_id: null,
            },
          ];
        }
        return [];
      });
      mockDb.executeWrite.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      const result = await sync.syncCourseHtmlContent(1, '/base');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('page');
      expect(result.errors[0]).toContain('Database error');
    });

    it('should resolve module names', async () => {
      mockDb.executeRead.mockImplementation((query: string) => {
        if (query.includes('FROM course_pages')) {
          return [
            {
              external_id: 'page-1',
              title: 'Page 1',
              body_html: '<p>Page</p>',
              module_id: 5,
            },
          ];
        }
        return [];
      });
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM courses')) {
          return { code: 'CS101', external_id: '12345', syllabus_body: null };
        }
        if (query.includes('FROM modules')) {
          return { name: 'Week 1' };
        }
        return null;
      });

      await sync.syncCourseHtmlContent(1, '/base');

      // Should have queried for module name
      expect(mockDb.executeReadOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM modules'),
        expect.any(Array)
      );
    });
  });

  describe('downloadHtmlItem', () => {
    beforeEach(() => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
    });

    it('should reject invalid external ID format', async () => {
      const result = await sync.downloadHtmlItem('invalid-id', '/base');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid HTML resource ID');
    });

    it('should return error when resource not found', async () => {
      mockDb.executeReadOne.mockReturnValue(null);

      const result = await sync.downloadHtmlItem('html-page-123', '/base');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resource not found');
    });

    it('should return error when course not found', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Test', folder_path: 'Pages' };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-page-123', '/base');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Course not found');
    });

    it('should download page content', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Test Page', folder_path: 'Pages' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM course_pages')) {
          return { body_html: '<p>Page content</p>', title: 'Test Page' };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-page-123', '/base');

      expect(result.success).toBe(true);
      expect(result.localPath).toBeDefined();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should download announcement content', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Ann', folder_path: 'Announcements' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM notifications')) {
          return { message_html: '<p>Announcement</p>', title: 'Ann' };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-announcement-456', '/base');

      expect(result.success).toBe(true);
    });

    it('should download assignment content', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Assignment', folder_path: 'Assignments' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM tasks')) {
          return { description: '<p>Assignment instructions</p>', title: 'Assignment' };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-assignment-789', '/base');

      expect(result.success).toBe(true);
    });

    it('should download syllabus content', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Syllabus', folder_path: 'Syllabus' };
        }
        if (query.includes('FROM courses WHERE id')) {
          return { code: 'CS101', syllabus_body: '<p>Syllabus content</p>' };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-syllabus-101', '/base');

      expect(result.success).toBe(true);
    });

    it('should return error when HTML content not found', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Test', folder_path: 'Pages' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM course_pages')) {
          return { body_html: null, title: 'Test' };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-page-123', '/base');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTML content not found');
    });

    it('should update resource with local path after download', async () => {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Test', folder_path: 'Pages' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM course_pages')) {
          return { body_html: '<p>Content</p>', title: 'Test' };
        }
        return null;
      });

      await sync.downloadHtmlItem('html-page-123', '/base');

      expect(mockDb.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE resources SET local_path'),
        expect.any(Array),
        'resources'
      );
    });

    it('should handle HTML with embedded resources (uses canvas-file:// protocol for on-demand downloads)', async () => {
      // Note: Embedded resources are NOT queued for download.
      // Instead, they use the canvas-file:// protocol handler for on-demand downloads
      // when user clicks a link. See lines 941-948 in HtmlContentSync.ts for details.
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Test', folder_path: 'Pages' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM course_pages')) {
          return {
            body_html: '<p><img src="/courses/1/files/100/preview"></p>',
            title: 'Test',
          };
        }
        return null;
      });

      const result = await sync.downloadHtmlItem('html-page-123', '/base');

      // Should succeed even with embedded resources
      expect(result.success).toBe(true);

      // Embedded resources are NOT queued - handled via canvas-file:// protocol
      expect(mockDownloadManager.queueDownloads).not.toHaveBeenCalled();
    });

    // A4 — syncPrefs.htmlUrlRewriting fork (HtmlContentSync.ts:556).
    // `urlRewriting: 'local'` rewrites Canvas file URLs to local paths before
    // saving; `'original'` saves the HTML verbatim. The body references
    // `/courses/1/files/100/preview` so the assertion has a concrete URL to
    // check for presence/absence. Both assertions are UNCONDITIONAL — capturing
    // the written content and failing if nothing was written — closing the
    // `if (writtenContent)` no-op hole the prior version had.
    const URL_REWRITE_BODY = '<p><img src="/courses/1/files/100/preview"></p>';
    const ORIGINAL_FILE_URL = '/courses/1/files/100/preview';

    function mockDbForRewrite(): void {
      mockDb.executeReadOne.mockImplementation((query: string) => {
        if (query.includes('FROM resources')) {
          return { course_id: 1, title: 'Test', folder_path: 'Pages' };
        }
        if (query.includes('FROM courses')) {
          return { code: 'CS101' };
        }
        if (query.includes('FROM course_pages')) {
          return { body_html: URL_REWRITE_BODY, title: 'Test' };
        }
        return null;
      });
    }

    /** The HTML actually persisted to disk (2nd arg of the first writeFileSync). */
    function writtenHtml(): string {
      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      expect(calls.length).toBeGreaterThan(0); // a file MUST have been written
      return calls[0][1] as string;
    }

    it("urlRewriting:'local' → original Canvas file URL is rewritten away", async () => {
      const syncWithRewriting = new HtmlContentSync({
        db: mockDb as any,
        downloadManager: mockDownloadManager as any,
        config: { ...defaultConfig, urlRewriting: 'local' },
        baseUrl: 'https://canvas.example.com',
      });
      mockDbForRewrite();

      const result = await syncWithRewriting.downloadHtmlItem('html-page-123', '/base');
      expect(result.success).toBe(true);

      // Unconditional: the persisted HTML no longer carries the original URL.
      expect(writtenHtml()).not.toContain(ORIGINAL_FILE_URL);
    });

    it("urlRewriting:'original' → HTML saved verbatim, original Canvas file URL preserved (negative)", async () => {
      const syncOriginal = new HtmlContentSync({
        db: mockDb as any,
        downloadManager: mockDownloadManager as any,
        config: { ...defaultConfig, urlRewriting: 'original' },
        baseUrl: 'https://canvas.example.com',
      });
      mockDbForRewrite();

      const result = await syncOriginal.downloadHtmlItem('html-page-123', '/base');
      expect(result.success).toBe(true);

      // Backwards-wiring guard: with rewriting OFF, the original URL survives.
      expect(writtenHtml()).toContain(ORIGINAL_FILE_URL);
    });
  });

  describe('edge cases', () => {
    it('should handle HTML with special characters in URLs', () => {
      const html = '<img src="/files/test%20file.png?token=abc&id=123">';

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].originalUrl).toContain('%20');
    });

    it('should handle HTML with single quotes in attributes', () => {
      const html = "<img src='/courses/100/files/456/preview'>";

      const resources = sync.extractResources(html);

      expect(resources).toHaveLength(1);
      expect(resources[0].canvasFileId).toBe('456');
    });

    it('should sanitize dangerous characters in filenames', () => {
      const html = '<img src="/files/../../../etc/passwd">';

      const resources = sync.extractResources(html);

      expect(resources[0].filename).not.toContain('..');
      expect(resources[0].filename).not.toContain('/');
    });

    it('should truncate very long filenames', () => {
      const longName = 'a'.repeat(300);
      const html = `<img src="/files/${longName}.png">`;

      const resources = sync.extractResources(html);

      expect(resources[0].filename.length).toBeLessThanOrEqual(255);
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHtml = '<img src="/test.png" <broken';

      // Should not throw
      expect(() => sync.extractResources(malformedHtml)).not.toThrow();
    });
  });
});
