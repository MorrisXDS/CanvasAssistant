/**
 * LocalMLService - Layer 3 Content Analysis
 *
 * Wrapper for Transformers.js local ML models.
 * This is an OPTIONAL layer that runs only when enabled in settings.
 *
 * Provides:
 * - Document classification (syllabus, rubric, assignment, etc.)
 * - Named entity recognition (improved entity extraction)
 * - Text embeddings for semantic search
 *
 * Note: Requires the optional @xenova/transformers dependency.
 * Models are downloaded on first use (~100MB total, cached locally).
 */

import { EventEmitter } from 'events';

/**
 * Document classification result
 */
export interface DocumentClassification {
  /** Predicted document type */
  documentType: 'syllabus' | 'rubric' | 'assignment' | 'lecture' | 'notes' | 'reading' | 'other';
  /** Confidence score 0-1 */
  confidence: number;
  /** All class scores */
  allScores: Record<string, number>;
}

/**
 * Named entity extracted by ML
 */
export interface NamedEntity {
  /** Entity text */
  text: string;
  /** Entity type */
  type: 'DATE' | 'PERCENTAGE' | 'ORG' | 'PERSON' | 'TIME' | 'MONEY' | 'OTHER';
  /** Start position in text */
  start: number;
  /** End position in text */
  end: number;
  /** Confidence score */
  confidence: number;
}

/**
 * Text embedding result
 */
export interface TextEmbedding {
  /** The embedded text (truncated if too long) */
  text: string;
  /** Embedding vector */
  embedding: number[];
  /** Model used */
  model: string;
  /** Dimensions of the embedding */
  dimensions: number;
}

/**
 * ML processing result
 */
export interface LocalMLResult {
  /** Document classification */
  classification: DocumentClassification | null;
  /** Named entities found */
  entities: NamedEntity[];
  /** Text embedding (if requested) */
  embedding: TextEmbedding | null;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Whether ML is available */
  mlAvailable: boolean;
  /** Error message if ML failed */
  error?: string;
}

/**
 * Configuration for LocalMLService
 */
export interface LocalMLConfig {
  /** Model for document classification */
  classificationModel?: string;
  /** Model for NER */
  nerModel?: string;
  /** Model for embeddings */
  embeddingModel?: string;
  /** Whether to generate embeddings */
  generateEmbeddings?: boolean;
  /** Max text length to process (tokens) */
  maxLength?: number;
}

const DEFAULT_CONFIG: Required<LocalMLConfig> = {
  classificationModel: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
  nerModel: 'Xenova/bert-base-NER',
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  generateEmbeddings: true,
  maxLength: 512,
};

/**
 * LocalMLService provides local ML capabilities via Transformers.js
 *
 * Events:
 * - 'model-loading': Emitted when a model starts loading
 * - 'model-loaded': Emitted when a model finishes loading
 * - 'error': Emitted on errors
 */
export class LocalMLService extends EventEmitter {
  private config: Required<LocalMLConfig>;
  private initialized = false;
  private available = false;

  // Lazy-loaded transformers module and pipelines
  private pipeline: unknown = null;
  private classifierPipeline: unknown = null;
  private nerPipeline: unknown = null;
  private embeddingPipeline: unknown = null;

  constructor(config?: LocalMLConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Transformers.js is available
   */
  async checkAvailability(): Promise<boolean> {
    if (this.initialized) {
      return this.available;
    }

    try {
      // Try to dynamically import @xenova/transformers
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const transformers = require('@xenova/transformers');
      this.pipeline = transformers.pipeline;
      this.available = true;
      this.initialized = true;
      return true;
    } catch {
      this.available = false;
      this.initialized = true;
      return false;
    }
  }

  /**
   * Initialize a pipeline lazily
   */
  private async initPipeline(
    task: string,
    model: string
  ): Promise<unknown> {
    if (!this.pipeline) {
      const isAvailable = await this.checkAvailability();
      if (!isAvailable) {
        throw new Error('Transformers.js not available');
      }
    }

    this.emit('model-loading', { task, model });

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineFn = this.pipeline as any;
      const pipe = await pipelineFn(task, model);
      this.emit('model-loaded', { task, model });
      return pipe;
    } catch (error) {
      this.emit('error', { task, model, error });
      throw error;
    }
  }

  /**
   * Classify document type
   */
  async classifyDocument(text: string): Promise<DocumentClassification | null> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) return null;

    // For document classification, we use zero-shot classification
    // with our academic document labels
    const labels = ['syllabus', 'rubric', 'assignment', 'lecture notes', 'reading material', 'other'];

    try {
      if (!this.classifierPipeline) {
        this.classifierPipeline = await this.initPipeline(
          'zero-shot-classification',
          'Xenova/nli-deberta-v3-small'
        );
      }

      // Truncate text for classification
      const truncatedText = text.slice(0, 1000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.classifierPipeline as any)(truncatedText, labels);

      // Map results to our types
      const allScores: Record<string, number> = {};
      for (let i = 0; i < result.labels.length; i++) {
        allScores[result.labels[i]] = result.scores[i];
      }

      // Map label to document type
      const topLabel = result.labels[0];
      const typeMap: Record<string, DocumentClassification['documentType']> = {
        syllabus: 'syllabus',
        rubric: 'rubric',
        assignment: 'assignment',
        'lecture notes': 'lecture',
        'reading material': 'reading',
        other: 'other',
      };

      return {
        documentType: typeMap[topLabel] || 'other',
        confidence: result.scores[0],
        allScores,
      };
    } catch (error) {
      this.emit('error', { operation: 'classification', error });
      return null;
    }
  }

  /**
   * Extract named entities from text
   */
  async extractEntities(text: string): Promise<NamedEntity[]> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) return [];

    try {
      if (!this.nerPipeline) {
        this.nerPipeline = await this.initPipeline('ner', this.config.nerModel);
      }

      // Truncate text
      const truncatedText = text.slice(0, this.config.maxLength * 4);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = await (this.nerPipeline as any)(truncatedText);

      // Map NER results to our entity types
      const entities: NamedEntity[] = [];
      for (const result of results) {
        // Map entity type
        let type: NamedEntity['type'] = 'OTHER';
        const entityType = result.entity?.toUpperCase() || '';

        if (entityType.includes('DATE') || entityType.includes('TIME')) {
          type = 'DATE';
        } else if (entityType.includes('PER') || entityType.includes('PERSON')) {
          type = 'PERSON';
        } else if (entityType.includes('ORG')) {
          type = 'ORG';
        } else if (entityType.includes('MONEY') || entityType.includes('PERCENT')) {
          type = 'PERCENTAGE';
        }

        entities.push({
          text: result.word,
          type,
          start: result.start,
          end: result.end,
          confidence: result.score,
        });
      }

      return entities;
    } catch (error) {
      this.emit('error', { operation: 'ner', error });
      return [];
    }
  }

  /**
   * Generate text embedding for semantic search
   */
  async generateEmbedding(text: string): Promise<TextEmbedding | null> {
    const isAvailable = await this.checkAvailability();
    if (!isAvailable) return null;

    try {
      if (!this.embeddingPipeline) {
        this.embeddingPipeline = await this.initPipeline(
          'feature-extraction',
          this.config.embeddingModel
        );
      }

      // Truncate text
      const truncatedText = text.slice(0, this.config.maxLength * 4);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.embeddingPipeline as any)(truncatedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Extract embedding vector
      const embedding = Array.from(result.data) as number[];

      return {
        text: truncatedText,
        embedding,
        model: this.config.embeddingModel,
        dimensions: embedding.length,
      };
    } catch (error) {
      this.emit('error', { operation: 'embedding', error });
      return null;
    }
  }

  /**
   * Run full ML analysis on text
   */
  async analyze(
    text: string,
    options: {
      classify?: boolean;
      extractEntities?: boolean;
      generateEmbedding?: boolean;
    } = {}
  ): Promise<LocalMLResult> {
    const startTime = Date.now();
    const {
      classify = true,
      extractEntities = true,
      generateEmbedding = this.config.generateEmbeddings,
    } = options;

    const isAvailable = await this.checkAvailability();

    if (!isAvailable) {
      return {
        classification: null,
        entities: [],
        embedding: null,
        processingTimeMs: Date.now() - startTime,
        mlAvailable: false,
        error: 'Transformers.js not available. Install @xenova/transformers for ML features.',
      };
    }

    try {
      // Run operations in parallel where possible
      const [classification, entities, embedding] = await Promise.all([
        classify ? this.classifyDocument(text) : null,
        extractEntities ? this.extractEntities(text) : [],
        generateEmbedding ? this.generateEmbedding(text) : null,
      ]);

      return {
        classification,
        entities,
        embedding,
        processingTimeMs: Date.now() - startTime,
        mlAvailable: true,
      };
    } catch (error) {
      return {
        classification: null,
        entities: [],
        embedding: null,
        processingTimeMs: Date.now() - startTime,
        mlAvailable: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar texts using embeddings
   */
  static findSimilar(
    queryEmbedding: number[],
    candidates: Array<{ id: string | number; embedding: number[] }>,
    topK: number = 5
  ): Array<{ id: string | number; similarity: number }> {
    const scored = candidates.map((c) => ({
      id: c.id,
      similarity: LocalMLService.cosineSimilarity(queryEmbedding, c.embedding),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);

    return scored.slice(0, topK);
  }

  /**
   * Clear cached pipelines to free memory
   */
  clearCache(): void {
    this.classifierPipeline = null;
    this.nerPipeline = null;
    this.embeddingPipeline = null;
  }
}

/**
 * Singleton instance for shared use
 */
let sharedInstance: LocalMLService | null = null;

/**
 * Get or create shared LocalMLService instance
 */
export function getLocalMLService(config?: LocalMLConfig): LocalMLService {
  if (!sharedInstance) {
    sharedInstance = new LocalMLService(config);
  }
  return sharedInstance;
}
