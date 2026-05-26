/**
 * HtmlFileExtractor Tests
 *
 * Tests for extracting Canvas file references from HTML content.
 */

import {
  HtmlFileExtractor,
  extractCanvasFileIds,
  extractCanvasFileReferences,
  extractHtmlReferences,
  extractAllDependencies,
} from '../../src/layers/l2-daemon/html/HtmlFileExtractor';

describe('HtmlFileExtractor', () => {
  let extractor: HtmlFileExtractor;

  beforeEach(() => {
    extractor = new HtmlFileExtractor();
  });

  describe('extract', () => {
    it('should extract file IDs from data-api-endpoint attributes', () => {
      const html = '<a data-api-endpoint="/api/v1/courses/123/files/456">Download</a>';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
      expect(results[0].courseId).toBe('123');
      expect(results[0].patternType).toBe('data-attr');
      expect(results[0].isDownloadLink).toBe(false);
    });

    it('should extract file IDs from download links', () => {
      const html = '<a href="/courses/123/files/456/download">Download File</a>';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
      expect(results[0].courseId).toBe('123');
      expect(results[0].patternType).toBe('download');
      expect(results[0].isDownloadLink).toBe(true);
    });

    it('should extract file IDs from href links', () => {
      const html = '<a href="/courses/123/files/456?preview=true">View File</a>';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
      expect(results[0].courseId).toBe('123');
      expect(results[0].patternType).toBe('href');
    });

    it('should extract file IDs from preview image sources', () => {
      const html = '<img src="/courses/123/files/456/preview">';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
      expect(results[0].patternType).toBe('preview');
    });

    it('should extract file IDs from verifier links', () => {
      const html = '<a href="/files/456/download?verifier=abc123xyz">File</a>';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
      expect(results[0].patternType).toBe('verifier');
      expect(results[0].isDownloadLink).toBe(true);
    });

    it('should extract file IDs from generic /files/ pattern', () => {
      const html = 'Reference: /files/789/some/path';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('789');
      expect(results[0].patternType).toBe('api');
    });

    it('should extract multiple file references', () => {
      const html = `
        <a href="/courses/100/files/1/download">File 1</a>
        <a href="/courses/100/files/2/download">File 2</a>
        <a href="/courses/100/files/3/download">File 3</a>
      `;

      const results = extractor.extract(html);

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.canvasFileId)).toEqual(['1', '2', '3']);
    });

    it('should deduplicate file IDs by default', () => {
      const html = `
        <a href="/courses/100/files/456">Link 1</a>
        <a href="/courses/100/files/456/download">Link 2</a>
        <img src="/courses/100/files/456/preview">
      `;

      const results = extractor.extract(html);

      // Should only include first match (data-attr or whatever matches first)
      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
    });

    it('should include duplicates when deduplication disabled', () => {
      const extractorNoDedupe = new HtmlFileExtractor({ deduplicate: false });
      const html = `
        <a href="/courses/100/files/456">Link 1</a>
        <a href="/courses/100/files/456/download">Link 2</a>
      `;

      const results = extractorNoDedupe.extract(html);

      expect(results.length).toBeGreaterThan(1);
    });

    it('should return empty array for empty HTML', () => {
      expect(extractor.extract('')).toEqual([]);
      expect(extractor.extract(null as unknown as string)).toEqual([]);
      expect(extractor.extract(undefined as unknown as string)).toEqual([]);
    });

    it('should return empty array when no file references found', () => {
      const html = '<p>This is just regular text with no file links.</p>';

      const results = extractor.extract(html);

      expect(results).toEqual([]);
    });

    it('should handle complex HTML with multiple patterns', () => {
      const html = `
        <div class="content">
          <p>Please see the attached documents:</p>
          <a href="/courses/101/files/1001/download" data-api-endpoint="/api/v1/courses/101/files/1001">
            Syllabus.pdf
          </a>
          <img src="/courses/101/files/1002/preview" alt="Diagram">
          <a href="/files/1003/download?verifier=xyz123">Extra Material</a>
        </div>
      `;

      const results = extractor.extract(html);

      expect(results.length).toBe(3);
      const fileIds = results.map((r) => r.canvasFileId);
      expect(fileIds).toContain('1001');
      expect(fileIds).toContain('1002');
      expect(fileIds).toContain('1003');
    });
  });

  describe('extractByCourse', () => {
    it('should group file references by course ID', () => {
      const html = `
        <a href="/courses/100/files/1/download">Course 100 File 1</a>
        <a href="/courses/100/files/2/download">Course 100 File 2</a>
        <a href="/courses/200/files/3/download">Course 200 File</a>
      `;

      const grouped = extractor.extractByCourse(html);

      expect(grouped.get('100')?.length).toBe(2);
      expect(grouped.get('200')?.length).toBe(1);
    });

    it('should group files without course ID under null key', () => {
      const html = `
        <a href="/courses/100/files/1/download">Course File</a>
        <a href="/files/2/download?verifier=abc">Verifier File</a>
      `;

      const grouped = extractor.extractByCourse(html);

      expect(grouped.get('100')?.length).toBe(1);
      expect(grouped.get(null)?.length).toBe(1);
    });
  });

  describe('extractFileIds', () => {
    it('should return unique file IDs', () => {
      const html = `
        <a href="/courses/100/files/1/download">File 1</a>
        <a href="/courses/100/files/2/download">File 2</a>
        <a href="/courses/200/files/3/download">File 3</a>
      `;

      const ids = extractor.extractFileIds(html);

      expect(ids).toEqual(['1', '2', '3']);
    });

    it('should return empty array for no files', () => {
      const ids = extractor.extractFileIds('<p>No files here</p>');

      expect(ids).toEqual([]);
    });
  });

  describe('hasFileReferences', () => {
    it('should return true when file references exist', () => {
      const html = '<a href="/courses/100/files/456/download">Download</a>';

      expect(extractor.hasFileReferences(html)).toBe(true);
    });

    it('should return false when no file references exist', () => {
      const html = '<p>Just some text</p>';

      expect(extractor.hasFileReferences(html)).toBe(false);
    });

    it('should return false for empty input', () => {
      expect(extractor.hasFileReferences('')).toBe(false);
      expect(extractor.hasFileReferences(null as unknown as string)).toBe(false);
    });
  });

  describe('countFileReferences', () => {
    it('should count unique file references', () => {
      const html = `
        <a href="/courses/100/files/1/download">File 1</a>
        <a href="/courses/100/files/2/download">File 2</a>
        <a href="/courses/100/files/3/download">File 3</a>
      `;

      expect(extractor.countFileReferences(html)).toBe(3);
    });

    it('should return 0 for no files', () => {
      expect(extractor.countFileReferences('<p>No files</p>')).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should exclude preview links when configured', () => {
      const extractorNoPreview = new HtmlFileExtractor({ includePreviewLinks: false });
      const html = `
        <a href="/courses/100/files/1/download">Download</a>
        <a href="/courses/100/files/2">Preview</a>
      `;

      const results = extractorNoPreview.extract(html);

      // Should only include download link
      const downloadResults = results.filter((r) => r.isDownloadLink);
      expect(downloadResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('convenience functions', () => {
    describe('extractCanvasFileIds', () => {
      it('should extract file IDs using default config', () => {
        const html = '<a href="/courses/100/files/456/download">File</a>';

        const ids = extractCanvasFileIds(html);

        expect(ids).toContain('456');
      });
    });

    describe('extractCanvasFileReferences', () => {
      it('should extract file references using default config', () => {
        const html = '<a href="/courses/100/files/456/download">File</a>';

        const refs = extractCanvasFileReferences(html);

        expect(refs).toHaveLength(1);
        expect(refs[0].canvasFileId).toBe('456');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle URL-encoded paths', () => {
      const html = '<a href="/courses/100/files/456/download%20file">File</a>';

      const results = extractor.extract(html);

      // Should still extract the file ID
      expect(results.some((r) => r.canvasFileId === '456')).toBe(true);
    });

    it('should handle single quotes in attributes', () => {
      const html = "<a href='/courses/100/files/456/download'>File</a>";

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('456');
    });

    it('should handle mixed quotes', () => {
      const html = `
        <a href="/courses/100/files/1/download">Double</a>
        <a href='/courses/100/files/2/download'>Single</a>
      `;

      const results = extractor.extract(html);

      expect(results).toHaveLength(2);
    });

    it('should handle very long file IDs', () => {
      const html = '<a href="/courses/100/files/123456789012345/download">File</a>';

      const results = extractor.extract(html);

      expect(results).toHaveLength(1);
      expect(results[0].canvasFileId).toBe('123456789012345');
    });
  });

  describe('HTML reference extraction', () => {
    describe('extractHtmlReferences', () => {
      it('should extract iframe src HTML references', () => {
        const html = '<iframe src="./embedded.html"></iframe>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].matchedUrl).toBe('./embedded.html');
        expect(refs[0].refType).toBe('iframe');
      });

      it('should extract object data HTML references', () => {
        const html = '<object data="content.html" type="text/html"></object>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].refType).toBe('object');
      });

      it('should extract embed src HTML references', () => {
        const html = '<embed src="widget.html">';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].refType).toBe('embed');
      });

      it('should extract .html link references', () => {
        const html = '<a href="page.html">Link</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].refType).toBe('html-link');
      });

      it('should extract .htm link references', () => {
        const html = '<a href="legacy.htm">Old Link</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].refType).toBe('html-link');
      });

      it('should extract Canvas page links', () => {
        const html = '<a href="/courses/123/pages/syllabus">Syllabus</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].courseId).toBe('123');
        expect(refs[0].pageSlug).toBe('syllabus');
        expect(refs[0].refType).toBe('canvas-page');
      });

      it('should extract Canvas page links with query strings', () => {
        const html = '<a href="/courses/456/pages/info?titleize=0">Info</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].courseId).toBe('456');
        expect(refs[0].pageSlug).toBe('info');
      });

      it('should ignore external HTTPS URLs', () => {
        const html = '<a href="https://youtube.com/watch">Video</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should ignore external HTTP URLs', () => {
        const html = '<iframe src="http://external.com/page.html"></iframe>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should ignore mailto links', () => {
        const html = '<a href="mailto:test@example.com">Email</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should ignore tel links', () => {
        const html = '<a href="tel:+1234567890">Call</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should ignore javascript links', () => {
        const html = '<a href="javascript:void(0)">Click</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should ignore anchor links', () => {
        const html = '<a href="#section1">Jump</a>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should ignore data URIs', () => {
        const html = '<iframe src="data:text/html,<h1>Test</h1>"></iframe>';
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(0);
      });

      it('should deduplicate HTML references by default', () => {
        const html = `
          <a href="./page.html">Link 1</a>
          <a href="./page.html">Link 2</a>
        `;
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
      });

      it('should extract multiple different HTML references', () => {
        const html = `
          <iframe src="./embed.html"></iframe>
          <a href="./page.html">Link</a>
          <a href="/courses/123/pages/info">Info</a>
        `;
        const refs = extractor.extractHtmlReferences(html);
        expect(refs).toHaveLength(3);
      });

      it('should return empty array for empty HTML', () => {
        expect(extractor.extractHtmlReferences('')).toEqual([]);
        expect(extractor.extractHtmlReferences(null as unknown as string)).toEqual([]);
      });

      it('should return empty array when extractHtmlRefs is disabled', () => {
        const noHtmlExtractor = new HtmlFileExtractor({ extractHtmlRefs: false });
        const html = '<iframe src="./embedded.html"></iframe>';
        const refs = noHtmlExtractor.extractHtmlReferences(html);
        expect(refs).toEqual([]);
      });
    });

    describe('hasHtmlReferences', () => {
      it('should return true when HTML references exist', () => {
        const html = '<a href="/courses/123/pages/test">Link</a>';
        expect(extractor.hasHtmlReferences(html)).toBe(true);
      });

      it('should return false when no HTML references exist', () => {
        const html = '<p>Just some text</p>';
        expect(extractor.hasHtmlReferences(html)).toBe(false);
      });

      it('should return false for external URLs only', () => {
        const html = '<a href="https://example.com/page.html">External</a>';
        expect(extractor.hasHtmlReferences(html)).toBe(false);
      });

      it('should return false for empty input', () => {
        expect(extractor.hasHtmlReferences('')).toBe(false);
        expect(extractor.hasHtmlReferences(null as unknown as string)).toBe(false);
      });
    });

    describe('countHtmlReferences', () => {
      it('should count unique HTML references', () => {
        const html = `
          <iframe src="./a.html"></iframe>
          <a href="./b.html">B</a>
          <a href="/courses/123/pages/c">C</a>
        `;
        expect(extractor.countHtmlReferences(html)).toBe(3);
      });

      it('should return 0 for no HTML references', () => {
        expect(extractor.countHtmlReferences('<p>No refs</p>')).toBe(0);
      });
    });

    describe('extractAllDependencies', () => {
      it('should extract both file and HTML references', () => {
        const html = `
          <img src="/courses/123/files/456/preview">
          <a href="/courses/123/pages/info">Info</a>
        `;
        const deps = extractor.extractAllDependencies(html);

        expect(deps.files).toHaveLength(1);
        expect(deps.files[0].canvasFileId).toBe('456');

        expect(deps.htmlRefs).toHaveLength(1);
        expect(deps.htmlRefs[0].pageSlug).toBe('info');
      });

      it('should return empty arrays for no dependencies', () => {
        const deps = extractor.extractAllDependencies('<p>Plain text</p>');
        expect(deps.files).toEqual([]);
        expect(deps.htmlRefs).toEqual([]);
      });
    });
  });

  describe('convenience functions for HTML refs', () => {
    describe('extractHtmlReferences', () => {
      it('should extract HTML references using default config', () => {
        const html = '<a href="/courses/123/pages/test">Link</a>';
        const refs = extractHtmlReferences(html);
        expect(refs).toHaveLength(1);
        expect(refs[0].pageSlug).toBe('test');
      });
    });

    describe('extractAllDependencies', () => {
      it('should extract all dependencies using default config', () => {
        const html = `
          <img src="/courses/123/files/456/preview">
          <a href="/courses/123/pages/info">Info</a>
        `;
        const deps = extractAllDependencies(html);
        expect(deps.files).toHaveLength(1);
        expect(deps.htmlRefs).toHaveLength(1);
      });
    });
  });
});
