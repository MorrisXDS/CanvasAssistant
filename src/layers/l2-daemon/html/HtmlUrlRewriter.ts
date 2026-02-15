/**
 * HtmlUrlRewriter - Rewrite Canvas URLs to local paths in HTML content
 *
 * Transforms HTML content by replacing Canvas file/page URLs with relative
 * local paths, enabling offline access when opened in a browser.
 *
 * Features:
 * - Replaces Canvas file URLs (/files/ID, /courses/ID/files/ID) with local paths
 * - Replaces Canvas page URLs (/courses/ID/pages/SLUG) with local paths
 * - Preserves external URLs (https://, mailto:, etc.)
 * - Falls back to Canvas URL for missing files or cycle references
 * - Calculates correct relative paths for nested HTML files
 *
 * Example:
 * Input: `<img src="/courses/123/files/456/preview">`
 * Output: `<img src="./Assignment1_files/image.png">`
 */

import path from 'path';
import { DependencyNode } from './HtmlDependencyResolver';

/**
 * Represents a resolved dependency with URL mapping
 */
export interface ResolvedDependency {
  /** Original Canvas URL (or matched pattern) */
  canvasUrl: string;
  /** Local path where the file is/will be saved */
  localPath: string | null;
  /** Whether this is a cycle reference (use Canvas URL) */
  isCycleRef?: boolean;
  /** Whether this is an external URL */
  isExternal?: boolean;
}

/**
 * Options for URL rewriting
 */
export interface RewriteOptions {
  /** Keep external URLs unchanged (default: true) */
  keepExternalUrls?: boolean;
  /** Use Canvas URL for missing files (default: true) */
  fallbackToCanvasUrl?: boolean;
  /** Base URL for Canvas (for absolute URL fallbacks) */
  canvasBaseUrl?: string;
}

const DEFAULT_OPTIONS: Required<RewriteOptions> = {
  keepExternalUrls: true,
  fallbackToCanvasUrl: true,
  canvasBaseUrl: '',
};

/**
 * Patterns to match and replace in HTML content
 */
const URL_PATTERNS = [
  // data-api-endpoint attributes
  /data-api-endpoint=["']([^"']+)["']/gi,
  // href attributes
  /href=["']([^"']+)["']/gi,
  // src attributes
  /src=["']([^"']+)["']/gi,
  // data attributes (for object tags)
  /data=["']([^"']+)["']/gi,
];

/**
 * Rewrites Canvas URLs to local paths in HTML content
 */
export class HtmlUrlRewriter {
  /**
   * Rewrite URLs in HTML content
   *
   * @param html The HTML content to rewrite
   * @param htmlPath Where this HTML file will be saved (for relative path calculation)
   * @param dependencies Array of resolved dependencies with URL mappings
   * @param options Rewrite options
   * @returns Rewritten HTML content
   */
  rewrite(
    html: string,
    htmlPath: string,
    dependencies: ResolvedDependency[],
    options: RewriteOptions = {}
  ): string {
    if (!html || typeof html !== 'string') {
      return html;
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let result = html;

    // Build URL mapping for quick lookups
    const urlMap = this.buildUrlMap(dependencies, htmlPath);

    // Process each URL pattern
    for (const pattern of URL_PATTERNS) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, (match, url: string) => {
        return this.replaceUrl(match, url, urlMap, opts);
      });
    }

    return result;
  }

  /**
   * Rewrite URLs using DependencyNode tree from resolver
   *
   * @param html The HTML content to rewrite
   * @param htmlPath Where this HTML file will be saved
   * @param dependencies Array of DependencyNodes
   * @param options Rewrite options
   * @returns Rewritten HTML content
   */
  rewriteWithNodes(
    html: string,
    htmlPath: string,
    dependencies: DependencyNode[],
    options: RewriteOptions = {}
  ): string {
    // Convert DependencyNodes to ResolvedDependency format
    const resolved: ResolvedDependency[] = dependencies.map((dep) => ({
      canvasUrl: dep.canvasUrl,
      localPath: dep.localPath,
      isCycleRef: dep.isCycleRef,
      isExternal: dep.isExternal,
    }));

    return this.rewrite(html, htmlPath, resolved, options);
  }

  /**
   * Build URL map for quick lookups
   * Maps various forms of a Canvas URL to its local path
   */
  private buildUrlMap(
    dependencies: ResolvedDependency[],
    htmlPath: string
  ): Map<string, string | null> {
    const urlMap = new Map<string, string | null>();
    const htmlDir = path.dirname(htmlPath);

    for (const dep of dependencies) {
      if (dep.isExternal) {
        continue;
      }

      // Skip cycle references - they keep Canvas URL
      if (dep.isCycleRef) {
        continue;
      }

      // Skip if no local path
      if (!dep.localPath) {
        continue;
      }

      // Calculate relative path from HTML to dependency
      const relativePath = this.calculateRelativePath(htmlDir, dep.localPath);

      // Map various URL forms to the relative path
      urlMap.set(dep.canvasUrl, relativePath);

      // Also map normalized forms of the URL
      const normalized = this.normalizeCanvasUrl(dep.canvasUrl);
      if (normalized !== dep.canvasUrl) {
        urlMap.set(normalized, relativePath);
      }

      // Extract file ID and map /files/ID patterns
      const fileIdMatch = dep.canvasUrl.match(/\/files\/(\d+)/);
      if (fileIdMatch) {
        const fileId = fileIdMatch[1];
        urlMap.set(`/files/${fileId}`, relativePath);
        urlMap.set(`/files/${fileId}/`, relativePath);
        urlMap.set(`/files/${fileId}/preview`, relativePath);
        urlMap.set(`/files/${fileId}/download`, relativePath);
      }

      // Extract page slug and map /pages/SLUG patterns
      const pageSlugMatch = dep.canvasUrl.match(/\/pages\/([^/?#]+)/);
      if (pageSlugMatch) {
        const pageSlug = pageSlugMatch[1];
        // Map the slug to the local path
        urlMap.set(`/pages/${pageSlug}`, relativePath);
      }
    }

    return urlMap;
  }

  /**
   * Replace a URL match with local path or keep original
   */
  private replaceUrl(
    fullMatch: string,
    url: string,
    urlMap: Map<string, string | null>,
    options: Required<RewriteOptions>
  ): string {
    // Check if this is an external URL
    if (this.isExternalUrl(url) && options.keepExternalUrls) {
      return fullMatch;
    }

    // Try to find a mapping for this URL
    const localPath = this.findLocalPath(url, urlMap);

    if (localPath) {
      // Replace URL with local path
      return fullMatch.replace(url, localPath);
    }

    // No mapping found - use fallback
    if (options.fallbackToCanvasUrl) {
      // Keep the original URL (Canvas URL)
      return fullMatch;
    }

    return fullMatch;
  }

  /**
   * Find local path for a URL, trying various normalizations
   */
  private findLocalPath(url: string, urlMap: Map<string, string | null>): string | null {
    // Direct match
    if (urlMap.has(url)) {
      return urlMap.get(url) || null;
    }

    // Try normalized URL
    const normalized = this.normalizeCanvasUrl(url);
    if (urlMap.has(normalized)) {
      return urlMap.get(normalized) || null;
    }

    // Try to match by file ID
    const fileIdMatch = url.match(/\/files\/(\d+)/);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const basePath = `/files/${fileId}`;
      if (urlMap.has(basePath)) {
        return urlMap.get(basePath) || null;
      }
    }

    // Try to match by page slug
    const pageSlugMatch = url.match(/\/pages\/([^/?#]+)/);
    if (pageSlugMatch) {
      const pageSlug = pageSlugMatch[1];
      const basePath = `/pages/${pageSlug}`;
      if (urlMap.has(basePath)) {
        return urlMap.get(basePath) || null;
      }
    }

    return null;
  }

  /**
   * Normalize a Canvas URL for matching
   */
  private normalizeCanvasUrl(url: string): string {
    // Remove query string and hash
    let normalized = url.split('?')[0].split('#')[0];

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    // Remove /preview or /download suffix for files
    normalized = normalized.replace(/\/(preview|download)$/, '');

    return normalized;
  }

  /**
   * Calculate relative path from HTML file to dependency
   */
  private calculateRelativePath(htmlDir: string, depPath: string): string {
    // Use path.relative to calculate the relative path
    let relativePath = path.relative(htmlDir, depPath);

    // Normalize to forward slashes for HTML (URLs always use forward slashes)
    // eslint-disable-next-line cross-platform/no-hardcoded-path-separator -- Intentional: converting Windows paths to URL format
    relativePath = relativePath.replace(/\\/g, '/');

    // Ensure it starts with ./ for clarity
    if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
      relativePath = './' + relativePath;
    }

    return relativePath;
  }

  /**
   * Check if a URL is external (not a Canvas/local reference)
   */
  private isExternalUrl(url: string): boolean {
    const externalPatterns = [
      /^https?:\/\//i,
      /^mailto:/i,
      /^tel:/i,
      /^javascript:/i,
      /^data:/i,
      /^#/,
    ];
    return externalPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Create a new HtmlUrlRewriter instance
   */
  static create(): HtmlUrlRewriter {
    return new HtmlUrlRewriter();
  }
}

/**
 * Convenience function to rewrite URLs in HTML
 */
export function rewriteHtmlUrls(
  html: string,
  htmlPath: string,
  dependencies: ResolvedDependency[],
  options?: RewriteOptions
): string {
  const rewriter = new HtmlUrlRewriter();
  return rewriter.rewrite(html, htmlPath, dependencies, options);
}

export default HtmlUrlRewriter;
