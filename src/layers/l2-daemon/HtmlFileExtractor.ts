/**
 * HtmlFileExtractor - Extract Canvas file IDs and HTML references from HTML content
 *
 * Extracts Canvas file references from HTML content using various patterns:
 * - /files/(\d+) - Standard API reference
 * - /courses/\d+/files/(\d+)(?:/download)? - Download links
 * - data-api-endpoint="[^"]*\/files\/(\d+)" - Data attributes (Instructure RCE)
 * - href="[^"]*\/courses\/\d+\/files\/(\d+)[?"] - Standard href links
 *
 * Also extracts HTML-to-HTML references for dependency resolution:
 * - iframe src (embedded HTML pages)
 * - object data (embedded HTML content)
 * - embed src (embedded content)
 * - a href to .html files
 * - /courses/ID/pages/SLUG links (Canvas pages)
 *
 * This enables discovery of embedded files and HTML dependencies in:
 * - Pages
 * - Assignments
 * - Syllabus
 * - Module descriptions
 * - Announcements
 */

/**
 * Represents a file reference extracted from HTML content
 */
export interface ExtractedFileReference {
  /** Canvas file ID (numeric string) */
  canvasFileId: string;
  /** The full URL/path that was matched */
  matchedUrl: string;
  /** The pattern type that matched this reference */
  patternType: 'api' | 'download' | 'data-attr' | 'href' | 'preview' | 'verifier';
  /** Optional course ID if present in the URL */
  courseId?: string;
  /** Whether this is a download link (vs preview/embed) */
  isDownloadLink: boolean;
}

/**
 * Represents an HTML reference extracted from HTML content (for dependency resolution)
 */
export interface ExtractedHtmlReference {
  /** The type of HTML reference */
  refType: 'iframe' | 'object' | 'embed' | 'html-link' | 'canvas-page';
  /** The full URL/path that was matched */
  matchedUrl: string;
  /** Course ID if this is a Canvas page link */
  courseId?: string;
  /** Page slug if this is a Canvas page link */
  pageSlug?: string;
  /** Whether this is an external URL (should be skipped) */
  isExternal: boolean;
}

/**
 * Configuration for the HTML file extractor
 */
export interface HtmlFileExtractorConfig {
  /** Whether to include preview links (non-download) */
  includePreviewLinks?: boolean;
  /** Whether to deduplicate by file ID */
  deduplicate?: boolean;
  /** Whether to extract HTML references (iframe, object, embed, .html links) */
  extractHtmlRefs?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<HtmlFileExtractorConfig> = {
  includePreviewLinks: true,
  deduplicate: true,
  extractHtmlRefs: true,
};

/**
 * Patterns for detecting external URLs that should not be treated as local dependencies
 */
const EXTERNAL_URL_PATTERNS = [
  /^https?:\/\//i, // http:// or https://
  /^mailto:/i, // mailto: links
  /^tel:/i, // tel: links
  /^javascript:/i, // javascript: links
  /^data:/i, // data: URIs
  /^#/, // anchor links
];

/**
 * Check if a URL is external (not a local/Canvas reference)
 */
function isExternalUrl(url: string): boolean {
  return EXTERNAL_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Extract Canvas file IDs from HTML content
 */
export class HtmlFileExtractor {
  private config: Required<HtmlFileExtractorConfig>;

  /**
   * Regex patterns for extracting file references
   * Order matters - more specific patterns first
   */
  private static readonly PATTERNS: Array<{
    name: ExtractedFileReference['patternType'];
    regex: RegExp;
    isDownload: boolean;
    courseIdGroup?: number;
    fileIdGroup: number;
  }> = [
    // data-api-endpoint="/api/v1/courses/123/files/456" (Instructure RCE embeds)
    {
      name: 'data-attr',
      regex:
        /data-api-endpoint=["'][^"']*\/(?:api\/v1\/)?courses\/(\d+)\/files\/(\d+)["']/gi,
      isDownload: false,
      courseIdGroup: 1,
      fileIdGroup: 2,
    },
    // href="/courses/123/files/456/download" (explicit download)
    {
      name: 'download',
      regex: /href=["'][^"']*\/courses\/(\d+)\/files\/(\d+)\/download[^"']*["']/gi,
      isDownload: true,
      courseIdGroup: 1,
      fileIdGroup: 2,
    },
    // href="/courses/123/files/456?..." or href="/courses/123/files/456" (preview links)
    {
      name: 'href',
      regex: /href=["'][^"']*\/courses\/(\d+)\/files\/(\d+)(?:\?[^"']*)?["']/gi,
      isDownload: false,
      courseIdGroup: 1,
      fileIdGroup: 2,
    },
    // src="/courses/123/files/456/preview" (image embeds)
    {
      name: 'preview',
      regex: /src=["'][^"']*\/courses\/(\d+)\/files\/(\d+)\/preview[^"']*["']/gi,
      isDownload: false,
      courseIdGroup: 1,
      fileIdGroup: 2,
    },
    // verifier links: /files/456/download?verifier=xxx
    {
      name: 'verifier',
      regex: /\/files\/(\d+)\/download\?verifier=[a-zA-Z0-9]+/gi,
      isDownload: true,
      fileIdGroup: 1,
    },
    // Generic /files/123 pattern (API references, fallback)
    {
      name: 'api',
      regex: /\/files\/(\d+)(?:\/|"|'|\?|$)/gi,
      isDownload: false,
      fileIdGroup: 1,
    },
  ];

  /**
   * Regex patterns for extracting HTML-to-HTML references
   * Used for dependency resolution (iframe, object, embed, .html links, Canvas pages)
   */
  private static readonly HTML_REF_PATTERNS: Array<{
    name: ExtractedHtmlReference['refType'];
    regex: RegExp;
    urlGroup: number;
    courseIdGroup?: number;
    pageSlugGroup?: number;
  }> = [
    // Canvas page links: /courses/123/pages/page-slug
    {
      name: 'canvas-page',
      regex: /(?:href|src)=["']([^"']*\/courses\/(\d+)\/pages\/([^"'\s?#]+)[^"']*)["']/gi,
      urlGroup: 1,
      courseIdGroup: 2,
      pageSlugGroup: 3,
    },
    // iframe src (embedded HTML pages)
    {
      name: 'iframe',
      regex: /<iframe[^>]+src=["']([^"']+)["']/gi,
      urlGroup: 1,
    },
    // object data (embedded HTML content - only HTML types)
    {
      name: 'object',
      regex: /<object[^>]+data=["']([^"']+\.html?)["']/gi,
      urlGroup: 1,
    },
    // embed src (embedded HTML content - only HTML types)
    {
      name: 'embed',
      regex: /<embed[^>]+src=["']([^"']+\.html?)["']/gi,
      urlGroup: 1,
    },
    // a href to .html files (local HTML links)
    {
      name: 'html-link',
      regex: /<a[^>]+href=["']([^"']+\.html?)["']/gi,
      urlGroup: 1,
    },
  ];

  constructor(config: HtmlFileExtractorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract all file references from HTML content
   *
   * @param html The HTML content to scan
   * @returns Array of extracted file references
   */
  extract(html: string): ExtractedFileReference[] {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const results: ExtractedFileReference[] = [];
    const seenFileIds = new Set<string>();

    for (const pattern of HtmlFileExtractor.PATTERNS) {
      // Reset regex state for each pattern
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(html)) !== null) {
        const fileId = match[pattern.fileIdGroup];
        const courseId = pattern.courseIdGroup ? match[pattern.courseIdGroup] : undefined;

        // Skip if we've already seen this file ID (if deduplication enabled)
        if (this.config.deduplicate && seenFileIds.has(fileId)) {
          continue;
        }

        // Skip preview links if not configured to include them
        if (
          !this.config.includePreviewLinks &&
          !pattern.isDownload &&
          pattern.name !== 'api'
        ) {
          continue;
        }

        seenFileIds.add(fileId);

        results.push({
          canvasFileId: fileId,
          matchedUrl: match[0],
          patternType: pattern.name,
          courseId,
          isDownloadLink: pattern.isDownload,
        });
      }
    }

    return results;
  }

  /**
   * Extract file references and group by course ID
   *
   * @param html The HTML content to scan
   * @returns Map of course ID to file references (null key for refs without course ID)
   */
  extractByCourse(html: string): Map<string | null, ExtractedFileReference[]> {
    const refs = this.extract(html);
    const grouped = new Map<string | null, ExtractedFileReference[]>();

    for (const ref of refs) {
      const key = ref.courseId ?? null;
      const existing = grouped.get(key) || [];
      existing.push(ref);
      grouped.set(key, existing);
    }

    return grouped;
  }

  /**
   * Extract unique file IDs from HTML content
   *
   * @param html The HTML content to scan
   * @returns Array of unique Canvas file IDs
   */
  extractFileIds(html: string): string[] {
    const refs = this.extract(html);
    return [...new Set(refs.map((r) => r.canvasFileId))];
  }

  /**
   * Check if HTML contains any file references
   *
   * @param html The HTML content to check
   * @returns True if any file references are found
   */
  hasFileReferences(html: string): boolean {
    if (!html || typeof html !== 'string') {
      return false;
    }

    // Quick check with first pattern that matches
    for (const pattern of HtmlFileExtractor.PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(html)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Count file references in HTML content
   *
   * @param html The HTML content to scan
   * @returns Number of unique file references
   */
  countFileReferences(html: string): number {
    return this.extractFileIds(html).length;
  }

  /**
   * Extract HTML-to-HTML references from HTML content
   * Used for dependency resolution (iframe, object, embed, .html links, Canvas pages)
   *
   * @param html The HTML content to scan
   * @returns Array of extracted HTML references (excluding external URLs)
   */
  extractHtmlReferences(html: string): ExtractedHtmlReference[] {
    if (!html || typeof html !== 'string' || !this.config.extractHtmlRefs) {
      return [];
    }

    const results: ExtractedHtmlReference[] = [];
    const seenUrls = new Set<string>();

    for (const pattern of HtmlFileExtractor.HTML_REF_PATTERNS) {
      // Reset regex state for each pattern
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(html)) !== null) {
        const url = match[pattern.urlGroup];

        // Skip if we've already seen this URL (deduplication)
        if (this.config.deduplicate && seenUrls.has(url)) {
          continue;
        }

        const external = isExternalUrl(url);

        // Skip external URLs - they are not local dependencies
        if (external) {
          continue;
        }

        seenUrls.add(url);

        const ref: ExtractedHtmlReference = {
          refType: pattern.name,
          matchedUrl: url,
          isExternal: external,
        };

        // Add Canvas page specific info
        if (pattern.courseIdGroup && match[pattern.courseIdGroup]) {
          ref.courseId = match[pattern.courseIdGroup];
        }
        if (pattern.pageSlugGroup && match[pattern.pageSlugGroup]) {
          ref.pageSlug = match[pattern.pageSlugGroup];
        }

        results.push(ref);
      }
    }

    return results;
  }

  /**
   * Check if HTML contains any HTML references (embedded pages, iframes, etc.)
   *
   * @param html The HTML content to check
   * @returns True if any HTML references are found
   */
  hasHtmlReferences(html: string): boolean {
    if (!html || typeof html !== 'string') {
      return false;
    }

    // Quick check with first pattern that matches (excluding external URLs)
    for (const pattern of HtmlFileExtractor.HTML_REF_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(html)) !== null) {
        const url = match[pattern.urlGroup];
        if (!isExternalUrl(url)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Count HTML references in HTML content
   *
   * @param html The HTML content to scan
   * @returns Number of unique HTML references (excluding external)
   */
  countHtmlReferences(html: string): number {
    return this.extractHtmlReferences(html).length;
  }

  /**
   * Extract all dependencies from HTML content (both files and HTML references)
   * Combined method for convenience
   *
   * @param html The HTML content to scan
   * @returns Object containing both file and HTML references
   */
  extractAllDependencies(html: string): {
    files: ExtractedFileReference[];
    htmlRefs: ExtractedHtmlReference[];
  } {
    return {
      files: this.extract(html),
      htmlRefs: this.extractHtmlReferences(html),
    };
  }
}

/**
 * Convenience function to extract file IDs from HTML
 */
export function extractCanvasFileIds(html: string): string[] {
  const extractor = new HtmlFileExtractor();
  return extractor.extractFileIds(html);
}

/**
 * Convenience function to extract full file references from HTML
 */
export function extractCanvasFileReferences(html: string): ExtractedFileReference[] {
  const extractor = new HtmlFileExtractor();
  return extractor.extract(html);
}

/**
 * Convenience function to extract HTML references from HTML
 */
export function extractHtmlReferences(html: string): ExtractedHtmlReference[] {
  const extractor = new HtmlFileExtractor();
  return extractor.extractHtmlReferences(html);
}

/**
 * Convenience function to extract all dependencies from HTML
 */
export function extractAllDependencies(html: string): {
  files: ExtractedFileReference[];
  htmlRefs: ExtractedHtmlReference[];
} {
  const extractor = new HtmlFileExtractor();
  return extractor.extractAllDependencies(html);
}

export default HtmlFileExtractor;
