/**
 * TextExtractor - Layer 1 Content Analysis
 *
 * Pure functions for extracting text from various document formats.
 * This is the first layer that always runs - no ML, just text extraction.
 *
 * Supports:
 * - HTML content (from course_pages, syllabus)
 * - Plain text files
 *
 * Note: PDF extraction requires the optional pdf-parse dependency.
 * If not available, PDF text extraction will return empty.
 */

import { convert as htmlToText } from 'html-to-text';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Result of text extraction
 */
export interface TextExtractionResult {
  /** Raw extracted text */
  text: string;
  /** Number of characters extracted */
  charCount: number;
  /** Source format detected */
  format: 'html' | 'pdf' | 'text' | 'unknown';
  /** Whether extraction succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Metadata about the extraction */
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    hasImages?: boolean;
    hasTables?: boolean;
  };
}

/**
 * Options for text extraction
 */
export interface TextExtractionOptions {
  /** Maximum characters to extract (default: 500000) */
  maxLength?: number;
  /** Whether to preserve some formatting (default: true) */
  preserveFormatting?: boolean;
  /** Whether to include link URLs (default: false) */
  includeLinks?: boolean;
}

const DEFAULT_OPTIONS: TextExtractionOptions = {
  maxLength: 500000,
  preserveFormatting: true,
  includeLinks: false,
};

/**
 * Extract text from HTML content
 */
export function extractTextFromHtml(
  html: string,
  options: TextExtractionOptions = {}
): TextExtractionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!html || html.trim().length === 0) {
    return {
      text: '',
      charCount: 0,
      format: 'html',
      success: true,
      metadata: { wordCount: 0 },
    };
  }

  try {
    const text = htmlToText(html, {
      wordwrap: false,
      preserveNewlines: opts.preserveFormatting,
      selectors: [
        { selector: 'a', options: { ignoreHref: !opts.includeLinks } },
        { selector: 'img', format: 'skip' },
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'table', format: opts.preserveFormatting ? 'dataTable' : 'skip' },
      ],
    });

    // Truncate if needed
    const truncatedText = text.slice(0, opts.maxLength);
    const wordCount = truncatedText.split(/\s+/).filter((w) => w.length > 0).length;

    // Detect if there are tables or images in the HTML
    const hasImages = /<img\s/i.test(html);
    const hasTables = /<table\s/i.test(html);

    return {
      text: truncatedText,
      charCount: truncatedText.length,
      format: 'html',
      success: true,
      metadata: {
        wordCount,
        hasImages,
        hasTables,
      },
    };
  } catch (error) {
    return {
      text: '',
      charCount: 0,
      format: 'html',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract text from a plain text file
 */
export function extractTextFromFile(
  filePath: string,
  options: TextExtractionOptions = {}
): TextExtractionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    if (!fs.existsSync(filePath)) {
      return {
        text: '',
        charCount: 0,
        format: 'unknown',
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    const ext = path.extname(filePath).toLowerCase();

    // Detect format
    let format: TextExtractionResult['format'] = 'unknown';
    if (ext === '.html' || ext === '.htm') {
      format = 'html';
    } else if (ext === '.pdf') {
      format = 'pdf';
    } else if (['.txt', '.md', '.markdown', '.text'].includes(ext)) {
      format = 'text';
    }

    // Handle HTML files
    if (format === 'html') {
      const html = fs.readFileSync(filePath, 'utf-8');
      return extractTextFromHtml(html, options);
    }

    // Handle PDF files - requires optional pdf-parse dependency
    if (format === 'pdf') {
      // PDF parsing is handled by extractTextFromPdf if pdf-parse is available
      return {
        text: '',
        charCount: 0,
        format: 'pdf',
        success: false,
        error: 'PDF extraction not available. Call extractTextFromPdf with pdf buffer.',
      };
    }

    // Handle plain text files
    const text = fs.readFileSync(filePath, 'utf-8').slice(0, opts.maxLength);
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

    return {
      text,
      charCount: text.length,
      format: format === 'unknown' ? 'text' : format,
      success: true,
      metadata: { wordCount },
    };
  } catch (error) {
    return {
      text: '',
      charCount: 0,
      format: 'unknown',
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract text from PDF buffer
 * Note: This is a stub that returns empty result.
 * The actual implementation requires pdf-parse which is an optional dependency.
 * For now, PDF content can be analyzed via course_pages HTML if available.
 */
export async function extractTextFromPdf(
  buffer: Buffer,
  options: TextExtractionOptions = {}
): Promise<TextExtractionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!buffer || buffer.length === 0) {
    return {
      text: '',
      charCount: 0,
      format: 'pdf',
      success: false,
      error: 'Empty buffer provided',
    };
  }

  // Try to dynamically import pdf-parse if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);

    const text = data.text.slice(0, opts.maxLength);
    const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;

    return {
      text,
      charCount: text.length,
      format: 'pdf',
      success: true,
      metadata: {
        pageCount: data.numpages,
        wordCount,
      },
    };
  } catch {
    // pdf-parse not available or parsing failed
    return {
      text: '',
      charCount: 0,
      format: 'pdf',
      success: false,
      error: 'PDF parsing not available. Install pdf-parse for PDF support.',
    };
  }
}

/**
 * Clean and normalize extracted text
 */
export function normalizeText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    // Remove excessive spaces
    .replace(/[ \t]{2,}/g, ' ')
    // Trim lines
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // Final trim
    .trim();
}

/**
 * Detect the likely document type based on content analysis
 */
export function detectDocumentType(
  text: string,
  filename?: string
): 'syllabus' | 'rubric' | 'assignment' | 'reading' | 'lecture' | 'notes' | 'other' | 'unknown' {
  const lowerText = text.toLowerCase();
  const lowerFilename = filename?.toLowerCase() ?? '';

  // Check filename first
  if (lowerFilename.includes('syllabus')) return 'syllabus';
  if (lowerFilename.includes('rubric')) return 'rubric';
  if (lowerFilename.includes('assignment') || lowerFilename.includes('homework')) return 'assignment';
  if (lowerFilename.includes('lecture') || lowerFilename.includes('slide')) return 'lecture';
  if (lowerFilename.includes('notes') || lowerFilename.includes('note')) return 'notes';
  if (lowerFilename.includes('reading') || lowerFilename.includes('chapter')) return 'reading';

  // Content-based detection
  const syllabusKeywords = [
    'course outline',
    'course description',
    'learning objectives',
    'grading scheme',
    'office hours',
    'course schedule',
    'textbook',
    'required materials',
    'academic integrity',
    'late policy',
    'attendance policy',
  ];

  const rubricKeywords = [
    'criteria',
    'grading rubric',
    'point breakdown',
    'excellent',
    'satisfactory',
    'needs improvement',
    'assessment criteria',
    'marking scheme',
  ];

  const assignmentKeywords = [
    'submit by',
    'submission deadline',
    'due date',
    'deliverables',
    'requirements',
    'instructions',
    'problem',
    'question',
  ];

  // Count keyword matches
  let syllabusScore = 0;
  let rubricScore = 0;
  let assignmentScore = 0;

  for (const kw of syllabusKeywords) {
    if (lowerText.includes(kw)) syllabusScore++;
  }
  for (const kw of rubricKeywords) {
    if (lowerText.includes(kw)) rubricScore++;
  }
  for (const kw of assignmentKeywords) {
    if (lowerText.includes(kw)) assignmentScore++;
  }

  // Require at least 2 keyword matches for classification
  const threshold = 2;

  if (syllabusScore >= threshold && syllabusScore >= rubricScore && syllabusScore >= assignmentScore) {
    return 'syllabus';
  }
  if (rubricScore >= threshold && rubricScore >= syllabusScore && rubricScore >= assignmentScore) {
    return 'rubric';
  }
  if (assignmentScore >= threshold && assignmentScore >= syllabusScore && assignmentScore >= rubricScore) {
    return 'assignment';
  }

  // If no strong match, classify as other
  if (text.length > 100) {
    return 'other';
  }

  return 'unknown';
}
