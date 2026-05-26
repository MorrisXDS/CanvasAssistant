/**
 * Tests for HtmlUrlRewriter
 *
 * Tests URL rewriting from Canvas URLs to local relative paths
 */

import {
  HtmlUrlRewriter,
  ResolvedDependency,
} from '../../src/layers/l2-daemon/html/HtmlUrlRewriter';

describe('HtmlUrlRewriter', () => {
  let rewriter: HtmlUrlRewriter;

  beforeEach(() => {
    rewriter = new HtmlUrlRewriter();
  });

  describe('file URL rewriting', () => {
    it('rewrites Canvas file URLs to relative paths', () => {
      const html = '<img src="/courses/123/files/456/preview">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/files/456/preview',
          localPath: './Assignment1_files/image.png',
        },
      ];

      const result = rewriter.rewrite(html, 'Assignment1.html', deps);

      expect(result).toBe('<img src="./Assignment1_files/image.png">');
    });

    it('rewrites download links', () => {
      const html = '<a href="/courses/123/files/789/download">Download PDF</a>';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/files/789/download',
          localPath: './Assignment1_files/document.pdf',
        },
      ];

      const result = rewriter.rewrite(html, 'Assignment1.html', deps);

      expect(result).toBe('<a href="./Assignment1_files/document.pdf">Download PDF</a>');
    });

    it('rewrites data-api-endpoint attributes', () => {
      const html = '<img data-api-endpoint="/api/v1/courses/123/files/456">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/api/v1/courses/123/files/456',
          localPath: './Assignment1_files/image.png',
        },
      ];

      const result = rewriter.rewrite(html, 'Assignment1.html', deps);

      expect(result).toContain('./Assignment1_files/image.png');
    });

    it('handles multiple file references', () => {
      const html = `
        <img src="/courses/123/files/1/preview">
        <img src="/courses/123/files/2/preview">
        <a href="/courses/123/files/3/download">Link</a>
      `;
      const deps: ResolvedDependency[] = [
        { canvasUrl: '/courses/123/files/1/preview', localPath: './files/img1.png' },
        { canvasUrl: '/courses/123/files/2/preview', localPath: './files/img2.png' },
        { canvasUrl: '/courses/123/files/3/download', localPath: './files/doc.pdf' },
      ];

      const result = rewriter.rewrite(html, 'page.html', deps);

      expect(result).toContain('./files/img1.png');
      expect(result).toContain('./files/img2.png');
      expect(result).toContain('./files/doc.pdf');
    });
  });

  describe('HTML reference rewriting', () => {
    it('rewrites Canvas page URLs to relative paths', () => {
      const html = '<a href="/courses/123/pages/instructions">See Instructions</a>';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/pages/instructions',
          localPath: './Assignment1_files/instructions.html',
        },
      ];

      const result = rewriter.rewrite(html, 'Assignment1.html', deps);

      expect(result).toBe(
        '<a href="./Assignment1_files/instructions.html">See Instructions</a>'
      );
    });

    it('rewrites iframe src', () => {
      const html = '<iframe src="/courses/123/pages/embedded"></iframe>';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/pages/embedded',
          localPath: './page1_files/embedded.html',
        },
      ];

      const result = rewriter.rewrite(html, 'page1.html', deps);

      expect(result).toBe('<iframe src="./page1_files/embedded.html"></iframe>');
    });
  });

  describe('external URL handling', () => {
    it('preserves external URLs when keepExternalUrls is true', () => {
      const html = '<a href="https://youtube.com/watch?v=123">Video</a>';
      const deps: ResolvedDependency[] = [];

      const result = rewriter.rewrite(html, 'page.html', deps, {
        keepExternalUrls: true,
      });

      expect(result).toBe('<a href="https://youtube.com/watch?v=123">Video</a>');
    });

    it('preserves mailto links', () => {
      const html = '<a href="mailto:test@example.com">Email</a>';
      const deps: ResolvedDependency[] = [];

      const result = rewriter.rewrite(html, 'page.html', deps, {
        keepExternalUrls: true,
      });

      expect(result).toBe('<a href="mailto:test@example.com">Email</a>');
    });

    it('preserves tel links', () => {
      const html = '<a href="tel:+1234567890">Call</a>';
      const deps: ResolvedDependency[] = [];

      const result = rewriter.rewrite(html, 'page.html', deps, {
        keepExternalUrls: true,
      });

      expect(result).toBe('<a href="tel:+1234567890">Call</a>');
    });

    it('preserves javascript links', () => {
      const html = '<a href="javascript:void(0)">Click</a>';
      const deps: ResolvedDependency[] = [];

      const result = rewriter.rewrite(html, 'page.html', deps, {
        keepExternalUrls: true,
      });

      expect(result).toBe('<a href="javascript:void(0)">Click</a>');
    });

    it('preserves anchor links', () => {
      const html = '<a href="#section1">Jump</a>';
      const deps: ResolvedDependency[] = [];

      const result = rewriter.rewrite(html, 'page.html', deps, {
        keepExternalUrls: true,
      });

      expect(result).toBe('<a href="#section1">Jump</a>');
    });
  });

  describe('missing file handling', () => {
    it('uses Canvas URL for files without local path', () => {
      const html = '<img src="/courses/123/files/456/preview">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/files/456/preview',
          localPath: null, // Not downloaded
        },
      ];

      const result = rewriter.rewrite(html, 'page.html', deps, {
        fallbackToCanvasUrl: true,
      });

      // URL should remain unchanged
      expect(result).toBe('<img src="/courses/123/files/456/preview">');
    });

    it('uses Canvas URL fallback for unmapped URLs', () => {
      const html = '<img src="/courses/999/files/888/preview">';
      const deps: ResolvedDependency[] = []; // No mapping for this file

      const result = rewriter.rewrite(html, 'page.html', deps, {
        fallbackToCanvasUrl: true,
      });

      // URL should remain unchanged
      expect(result).toBe('<img src="/courses/999/files/888/preview">');
    });
  });

  describe('cycle reference handling', () => {
    it('uses Canvas URL for cycle references', () => {
      const html = '<iframe src="/courses/123/pages/parent"></iframe>';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/pages/parent',
          localPath: './parent.html',
          isCycleRef: true,
        },
      ];

      const result = rewriter.rewrite(html, 'child.html', deps);

      // Cycle refs should keep Canvas URL
      expect(result).toBe('<iframe src="/courses/123/pages/parent"></iframe>');
    });
  });

  describe('relative path calculation', () => {
    it('calculates correct relative paths for nested HTMLs', () => {
      const html = '<img src="/files/789">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/files/789',
          localPath:
            'CSC108/Assignments/Assignment1_files/instructions_files/diagram.svg',
        },
      ];

      // HTML is at: CSC108/Assignments/Assignment1_files/instructions.html
      const result = rewriter.rewrite(
        html,
        'CSC108/Assignments/Assignment1_files/instructions.html',
        deps
      );

      expect(result).toContain('instructions_files/diagram.svg');
    });

    it('handles same-directory references', () => {
      const html = '<img src="/files/100">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/files/100',
          localPath: 'CSC108/image.png',
        },
      ];

      const result = rewriter.rewrite(html, 'CSC108/page.html', deps);

      expect(result).toContain('./image.png');
    });

    it('handles parent directory references', () => {
      const html = '<img src="/files/200">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/files/200',
          localPath: 'CSC108/shared/common.png',
        },
      ];

      const result = rewriter.rewrite(html, 'CSC108/pages/detail.html', deps);

      expect(result).toContain('../shared/common.png');
    });
  });

  describe('URL normalization', () => {
    it('matches URLs with different query strings', () => {
      const html = '<img src="/courses/123/files/456/preview?wrap=1">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/files/456/preview',
          localPath: './files/image.png',
        },
      ];

      const result = rewriter.rewrite(html, 'page.html', deps);

      // Should still match and replace
      expect(result).toContain('./files/image.png');
    });

    it('matches file ID patterns', () => {
      const html = '<a href="/files/456/download?verifier=abc123">Download</a>';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/files/456',
          localPath: './files/doc.pdf',
        },
      ];

      const result = rewriter.rewrite(html, 'page.html', deps);

      expect(result).toContain('./files/doc.pdf');
    });
  });

  describe('special characters', () => {
    it('handles filenames with spaces', () => {
      const html = '<img src="/courses/123/files/456/preview">';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/files/456/preview',
          localPath: './files/my file.png',
        },
      ];

      const result = rewriter.rewrite(html, 'page.html', deps);

      expect(result).toBe('<img src="./files/my file.png">');
    });

    it('handles URLs with encoded characters', () => {
      const html =
        '<a href="/courses/123/files/456/download?filename=test%20file.pdf">Link</a>';
      const deps: ResolvedDependency[] = [
        {
          canvasUrl: '/courses/123/files/456/download',
          localPath: './files/test_file.pdf',
        },
      ];

      const result = rewriter.rewrite(html, 'page.html', deps);

      expect(result).toContain('./files/test_file.pdf');
    });
  });

  describe('empty/null input handling', () => {
    it('returns empty string for empty HTML', () => {
      const result = rewriter.rewrite('', 'page.html', []);
      expect(result).toBe('');
    });

    it('handles null HTML gracefully', () => {
      const result = rewriter.rewrite(null as unknown as string, 'page.html', []);
      expect(result).toBeNull();
    });

    it('handles empty dependencies array', () => {
      const html = '<p>No dependencies</p>';
      const result = rewriter.rewrite(html, 'page.html', []);
      expect(result).toBe('<p>No dependencies</p>');
    });
  });

  describe('rewriteWithNodes', () => {
    it('converts DependencyNodes to ResolvedDependency format', () => {
      const html = '<img src="/courses/123/files/456/preview">';
      const nodes = [
        {
          sourceType: 'file' as const,
          sourceId: '456',
          canvasUrl: '/courses/123/files/456/preview',
          localPath: './files/image.png',
          isCycleRef: false,
          useCanvasUrl: false,
          isExternal: false,
          dependencies: [],
          isDownloaded: true,
        },
      ];

      const result = rewriter.rewriteWithNodes(html, 'page.html', nodes);

      expect(result).toBe('<img src="./files/image.png">');
    });
  });

  describe('static create method', () => {
    it('creates a new HtmlUrlRewriter instance', () => {
      const instance = HtmlUrlRewriter.create();
      expect(instance).toBeInstanceOf(HtmlUrlRewriter);
    });
  });
});
