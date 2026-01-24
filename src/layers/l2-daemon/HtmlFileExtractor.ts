/**
 * HtmlFileExtractor - Extract Canvas file IDs from HTML content
 *
 * Extracts Canvas file references from HTML content using various patterns:
 * - /files/(\d+) - Standard API reference
 * - /courses/\d+/files/(\d+)(?:/download)? - Download links
 * - data-api-endpoint="[^"]*\/files\/(\d+)" - Data attributes (Instructure RCE)
 * - href="[^"]*\/courses\/\d+\/files\/(\d+)[?"] - Standard href links
 *
 * This enables discovery of embedded files in:
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
 * Configuration for the HTML file extractor
 */
export interface HtmlFileExtractorConfig {
  /** Whether to include preview links (non-download) */
  includePreviewLinks?: boolean;
  /** Whether to deduplicate by file ID */
  deduplicate?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<HtmlFileExtractorConfig> = {
  includePreviewLinks: true,
  deduplicate: true,
};

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
      regex: /data-api-endpoint=["'][^"']*\/(?:api\/v1\/)?courses\/(\d+)\/files\/(\d+)["']/gi,
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
        if (!this.config.includePreviewLinks && !pattern.isDownload && pattern.name !== 'api') {
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

export default HtmlFileExtractor;
