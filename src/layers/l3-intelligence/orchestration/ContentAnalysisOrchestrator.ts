/**
 * ContentAnalysisOrchestrator - Coordinates Multi-Layer Content Analysis
 *
 * This orchestrator manages the layered content analysis pipeline:
 * - Layer 1: Text Extraction (always runs)
 * - Layer 2: Rule-Based Extraction (always runs)
 * - Layer 3: Local ML (Transformers.js) - optional, settings-based
 * - Layer 4: LLM Analysis - optional, user-configured
 *
 * The orchestrator:
 * 1. Fetches content from course_pages, resources, or syllabus
 * 2. Runs through the analysis layers progressively
 * 3. Persists results to the content_analysis table
 * 4. Auto-creates policies from extracted data when confident
 * 5. Emits events for UI updates
 */

import { EventEmitter } from 'events';
import { Database } from '../../l1-persistence/Database';
import type {
  ContentAnalysisRow,
  CoursePageRow,
  ResourceRow,
  CourseRowSyllabusOnly,
} from '../../l1-persistence/DatabaseRowTypes';
import {
  extractTextFromHtml,
  normalizeText,
  detectDocumentType,
  TextExtractionResult,
} from '../domain/TextExtractor';
import {
  runRuleBasedExtraction,
  RuleBasedExtractionResult,
  ExtractedPolicy,
} from '../domain/RuleBasedExtractor';
import { ORCHESTRATOR_DEFAULTS } from '../domain/Constants';

/**
 * Source types for content analysis
 */
export type ContentSourceType = 'course_page' | 'resource' | 'attachment' | 'syllabus';

/**
 * Document types
 */
export type DocumentType =
  | 'syllabus'
  | 'rubric'
  | 'assignment'
  | 'reading'
  | 'lecture'
  | 'notes'
  | 'other'
  | 'unknown';

/**
 * Analysis level (how deep the analysis went)
 */
export type AnalysisLevel = 1 | 2 | 3 | 4;

/**
 * Stored content analysis record
 */
export interface ContentAnalysis {
  id: number;
  sourceType: ContentSourceType;
  sourceId: number;
  courseId: number | null;
  documentType: DocumentType;
  extractedText: string | null;
  extractedEntities: {
    dates: Array<{
      rawText: string;
      parsedDate: string | null;
      dateType: string;
    }>;
    percentages: Array<{
      rawText: string;
      value: number;
      percentType: string;
    }>;
    policies: Array<{
      policyType: string;
      name: string;
      rules: Record<string, unknown>;
    }>;
    keywords: string[];
  };
  analysisLevel: AnalysisLevel;
  analyzedAt: Date | null;
}

/**
 * Result from running content analysis
 */
export interface AnalysisResult {
  success: boolean;
  contentAnalysisId: number | null;
  documentType: DocumentType;
  analysisLevel: AnalysisLevel;
  extractedEntities: ContentAnalysis['extractedEntities'];
  textExtractionResult: TextExtractionResult;
  ruleBasedResult: RuleBasedExtractionResult;
  policiesCreated: number;
  error?: string;
}

/**
 * Configuration for ContentAnalysisOrchestrator
 */
export interface ContentAnalysisOrchestratorConfig {
  /** Minimum confidence to auto-create policies (default: 0.7) */
  policyConfidenceThreshold?: number;
  /** Maximum text length to process (default: 500000) */
  maxTextLength?: number;
  /** Whether to auto-create policies (default: true) */
  autoCreatePolicies?: boolean;
}

const DEFAULT_CONFIG: Required<ContentAnalysisOrchestratorConfig> = {
  ...ORCHESTRATOR_DEFAULTS.CONTENT_ANALYSIS,
};

/**
 * ContentAnalysisOrchestrator manages the content analysis pipeline
 *
 * Events:
 * - 'analysis-complete': Emitted when analysis finishes
 * - 'policy-created': Emitted when a policy is auto-created
 * - 'error': Emitted on errors
 */
export class ContentAnalysisOrchestrator extends EventEmitter {
  private db: Database;
  private config: Required<ContentAnalysisOrchestratorConfig>;

  constructor(db: Database, config?: ContentAnalysisOrchestratorConfig) {
    super();
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a course page
   */
  async analyzeCoursePage(pageId: number): Promise<AnalysisResult> {
    const page = this.db.executeReadOne<CoursePageRow>(
      `SELECT id, course_id, title, body_html, page_type FROM course_pages WHERE id = ?`,
      [pageId]
    );

    if (!page) {
      return this.errorResult(`Course page not found: ${pageId}`);
    }

    if (!page.body_html) {
      return this.errorResult('Course page has no HTML content');
    }

    return this.runAnalysis(
      'course_page',
      pageId,
      page.course_id,
      page.body_html,
      page.title
    );
  }

  /**
   * Analyze a syllabus for a course
   */
  async analyzeSyllabus(courseId: number): Promise<AnalysisResult> {
    const course = this.db.executeReadOne<CourseRowSyllabusOnly>(
      `SELECT id, syllabus_body FROM courses WHERE id = ?`,
      [courseId]
    );

    if (!course) {
      return this.errorResult(`Course not found: ${courseId}`);
    }

    if (!course.syllabus_body) {
      return this.errorResult('Course has no syllabus content');
    }

    return this.runAnalysis(
      'syllabus',
      courseId,
      courseId,
      course.syllabus_body,
      'Syllabus'
    );
  }

  /**
   * Analyze a resource (file) - currently only supports HTML files
   */
  async analyzeResource(resourceId: number): Promise<AnalysisResult> {
    const resource = this.db.executeReadOne<ResourceRow>(
      `SELECT id, course_id, title, local_path, mime_type FROM resources WHERE id = ?`,
      [resourceId]
    );

    if (!resource) {
      return this.errorResult(`Resource not found: ${resourceId}`);
    }

    // Only HTML files are supported for now (PDF requires pdf-parse)
    if (resource.mime_type !== 'text/html' && !resource.local_path?.endsWith('.html')) {
      return this.errorResult('Only HTML resources are currently supported for analysis');
    }

    // For HTML resources, try to get content from course_pages if linked
    // Otherwise we'd need to read the file directly
    return this.errorResult(
      'Resource analysis requires file reading - use analyzeCoursePage instead'
    );
  }

  /**
   * Get existing analysis for a source
   */
  getAnalysis(sourceType: ContentSourceType, sourceId: number): ContentAnalysis | null {
    const row = this.db.executeReadOne<ContentAnalysisRow>(
      `SELECT * FROM content_analysis WHERE source_type = ? AND source_id = ?`,
      [sourceType, sourceId]
    );

    return row ? this.mapRow(row) : null;
  }

  /**
   * Get all analyses for a course
   */
  getAnalysesForCourse(courseId: number): ContentAnalysis[] {
    const rows = this.db.executeRead<ContentAnalysisRow>(
      `SELECT * FROM content_analysis WHERE course_id = ? ORDER BY analyzed_at DESC`,
      [courseId]
    );

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Search content by keyword
   */
  searchContent(
    query: string,
    courseId?: number
  ): Array<{ analysis: ContentAnalysis; snippet: string }> {
    const lowerQuery = query.toLowerCase();
    let sql = `SELECT * FROM content_analysis WHERE extracted_text IS NOT NULL`;
    const params: unknown[] = [];

    if (courseId !== undefined) {
      sql += ` AND course_id = ?`;
      params.push(courseId);
    }

    const rows = this.db.executeRead<ContentAnalysisRow>(sql, params);
    const results: Array<{ analysis: ContentAnalysis; snippet: string }> = [];

    for (const row of rows) {
      const text = row.extracted_text?.toLowerCase() ?? '';
      const index = text.indexOf(lowerQuery);

      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + query.length + 50);
        const snippet = (row.extracted_text ?? '').slice(start, end);

        results.push({
          analysis: this.mapRow(row),
          snippet: `...${snippet}...`,
        });
      }
    }

    return results;
  }

  /**
   * Delete analysis for a source
   */
  deleteAnalysis(sourceType: ContentSourceType, sourceId: number): boolean {
    const result = this.db.executeWrite(
      `DELETE FROM content_analysis WHERE source_type = ? AND source_id = ?`,
      [sourceType, sourceId],
      'content_analysis'
    );

    return result.changes > 0;
  }

  /**
   * Run the full analysis pipeline
   */
  private async runAnalysis(
    sourceType: ContentSourceType,
    sourceId: number,
    courseId: number,
    htmlContent: string,
    title?: string
  ): Promise<AnalysisResult> {
    try {
      // Layer 1: Text Extraction
      const textResult = extractTextFromHtml(htmlContent, {
        maxLength: this.config.maxTextLength,
        preserveFormatting: true,
      });

      if (!textResult.success) {
        return this.errorResult(textResult.error ?? 'Text extraction failed');
      }

      const normalizedText = normalizeText(textResult.text);

      // Layer 2: Rule-Based Extraction
      const ruleResult = runRuleBasedExtraction(normalizedText);

      // Detect document type
      const documentType = detectDocumentType(normalizedText, title);

      // Build extracted entities
      const extractedEntities: ContentAnalysis['extractedEntities'] = {
        dates: ruleResult.dates.map((d) => ({
          rawText: d.rawText,
          parsedDate: d.parsedDate?.toISOString() ?? null,
          dateType: d.dateType,
        })),
        percentages: ruleResult.percentages.map((p) => ({
          rawText: p.rawText,
          value: p.value,
          percentType: p.percentType,
        })),
        policies: ruleResult.policies.map((p) => ({
          policyType: p.policyType,
          name: p.name,
          rules: p.rules,
        })),
        keywords: ruleResult.keywords,
      };

      // Analysis level: 1 = text only, 2 = rule-based
      const analysisLevel: AnalysisLevel = ruleResult.stats.totalMatches > 0 ? 2 : 1;

      // Save to database
      const contentAnalysisId = this.saveAnalysis(
        sourceType,
        sourceId,
        courseId,
        documentType,
        normalizedText,
        extractedEntities,
        analysisLevel
      );

      // Auto-create policies if enabled and confident
      let policiesCreated = 0;
      if (this.config.autoCreatePolicies) {
        policiesCreated = this.createPoliciesFromExtraction(
          courseId,
          ruleResult.policies
        );
      }

      this.emit('analysis-complete', {
        sourceType,
        sourceId,
        courseId,
        documentType,
        analysisLevel,
      });

      return {
        success: true,
        contentAnalysisId,
        documentType,
        analysisLevel,
        extractedEntities,
        textExtractionResult: textResult,
        ruleBasedResult: ruleResult,
        policiesCreated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit('error', error);
      return this.errorResult(message);
    }
  }

  /**
   * Save analysis to database
   */
  private saveAnalysis(
    sourceType: ContentSourceType,
    sourceId: number,
    courseId: number,
    documentType: DocumentType,
    extractedText: string,
    extractedEntities: ContentAnalysis['extractedEntities'],
    analysisLevel: AnalysisLevel
  ): number {
    // Use upsert - update if exists, insert if not
    const existing = this.db.executeReadOne<{ id: number }>(
      `SELECT id FROM content_analysis WHERE source_type = ? AND source_id = ?`,
      [sourceType, sourceId]
    );

    if (existing) {
      this.db.executeWrite(
        `UPDATE content_analysis SET
          course_id = ?,
          document_type = ?,
          extracted_text = ?,
          extracted_entities = ?,
          analysis_level = ?,
          analyzed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          courseId,
          documentType,
          extractedText,
          JSON.stringify(extractedEntities),
          analysisLevel,
          existing.id,
        ],
        'content_analysis'
      );
      return existing.id;
    } else {
      const result = this.db.executeWrite(
        `INSERT INTO content_analysis (
          source_type, source_id, course_id, document_type,
          extracted_text, extracted_entities, analysis_level, analyzed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          sourceType,
          sourceId,
          courseId,
          documentType,
          extractedText,
          JSON.stringify(extractedEntities),
          analysisLevel,
        ],
        'content_analysis'
      );
      return result.lastInsertRowid as number;
    }
  }

  /**
   * Auto-create course policies from extracted data
   */
  private createPoliciesFromExtraction(
    courseId: number,
    policies: ExtractedPolicy[]
  ): number {
    let created = 0;

    for (const policy of policies) {
      // Only create if confidence is above threshold
      if (policy.confidence < this.config.policyConfidenceThreshold) {
        continue;
      }

      // Check if policy already exists
      const existing = this.db.executeReadOne<{ id: number }>(
        `SELECT id FROM course_policies
         WHERE course_id = ? AND policy_type = ? AND policy_name = ?`,
        [courseId, policy.policyType, policy.name]
      );

      if (existing) {
        continue;
      }

      // Create the policy
      try {
        this.db.executeWrite(
          `INSERT INTO course_policies (
            course_id, policy_type, policy_name, policy_config,
            raw_text, is_user_verified, is_active
          ) VALUES (?, ?, ?, ?, ?, 0, 1)`,
          [
            courseId,
            policy.policyType,
            policy.name,
            JSON.stringify(policy.rules),
            policy.matchedText,
          ],
          'course_policies'
        );

        this.emit('policy-created', {
          courseId,
          policyType: policy.policyType,
          policyName: policy.name,
        });

        created++;
      } catch {
        // Ignore duplicate key errors
      }
    }

    return created;
  }

  /**
   * Map database row to domain type
   */
  private mapRow(row: ContentAnalysisRow): ContentAnalysis {
    const entities = row.extracted_entities
      ? JSON.parse(row.extracted_entities)
      : { dates: [], percentages: [], policies: [], keywords: [] };

    return {
      id: row.id,
      sourceType: row.source_type as ContentSourceType,
      sourceId: row.source_id,
      courseId: row.course_id,
      documentType: (row.document_type as DocumentType) ?? 'unknown',
      extractedText: row.extracted_text,
      extractedEntities: entities,
      analysisLevel: row.analysis_level as AnalysisLevel,
      analyzedAt: row.analyzed_at ? new Date(row.analyzed_at) : null,
    };
  }

  /**
   * Create an error result
   */
  private errorResult(error: string): AnalysisResult {
    return {
      success: false,
      contentAnalysisId: null,
      documentType: 'unknown',
      analysisLevel: 1,
      extractedEntities: {
        dates: [],
        percentages: [],
        policies: [],
        keywords: [],
      },
      textExtractionResult: {
        text: '',
        charCount: 0,
        format: 'unknown',
        success: false,
        error,
      },
      ruleBasedResult: {
        dates: [],
        percentages: [],
        policies: [],
        keywords: [],
        academicTerms: [],
        stats: { totalMatches: 0, processingTimeMs: 0 },
      },
      policiesCreated: 0,
      error,
    };
  }

  /**
   * Get statistics about content analysis
   */
  getStatistics(): {
    totalAnalyzed: number;
    byDocumentType: Record<string, number>;
    byAnalysisLevel: Record<number, number>;
    avgEntitiesPerDocument: number;
  } {
    const total = this.db.executeReadOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM content_analysis`
    );

    const byType = this.db.executeRead<{ document_type: string; count: number }>(
      `SELECT document_type, COUNT(*) as count FROM content_analysis GROUP BY document_type`
    );

    const byLevel = this.db.executeRead<{ analysis_level: number; count: number }>(
      `SELECT analysis_level, COUNT(*) as count FROM content_analysis GROUP BY analysis_level`
    );

    const byDocumentType: Record<string, number> = {};
    for (const row of byType) {
      byDocumentType[row.document_type ?? 'unknown'] = row.count;
    }

    const byAnalysisLevel: Record<number, number> = {};
    for (const row of byLevel) {
      byAnalysisLevel[row.analysis_level] = row.count;
    }

    // Calculate average entities per document
    const entities = this.db.executeRead<{ extracted_entities: string }>(
      `SELECT extracted_entities FROM content_analysis WHERE extracted_entities IS NOT NULL`
    );

    let totalEntities = 0;
    for (const row of entities) {
      const parsed = JSON.parse(row.extracted_entities);
      totalEntities +=
        (parsed.dates?.length ?? 0) +
        (parsed.percentages?.length ?? 0) +
        (parsed.policies?.length ?? 0);
    }

    return {
      totalAnalyzed: total?.count ?? 0,
      byDocumentType,
      byAnalysisLevel,
      avgEntitiesPerDocument: entities.length > 0 ? totalEntities / entities.length : 0,
    };
  }
}
