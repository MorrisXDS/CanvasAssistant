/**
 * L2 Daemon - Input Validator
 *
 * Validates external data (Canvas API responses) using Zod schemas.
 * Lenient mode logs warnings and uses defaults for missing fields.
 */

import { z } from 'zod';
import { EventEmitter } from 'events';
import { InputValidatorConfig } from '../DaemonConfig';
import { ComponentLogger, Logger } from '../../l0-utilities/Logger';

export type ValidationStrictness = 'strict' | 'lenient';
export type HtmlHandling = 'strip' | 'sanitize' | 'keep';

export interface InputValidatorOptions {
  strictness?: ValidationStrictness;
  logWarnings?: boolean;
  htmlHandling?: HtmlHandling;
  logger?: Logger;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

// ============================================================================
// Canvas API Response Schemas
// ============================================================================

/**
 * Canvas Course schema
 */
export const CanvasCourseSchema = z.object({
  id: z.number(),
  name: z.string().optional().default('Unnamed Course'),
  course_code: z.string().optional().default(''),
  workflow_state: z.string().optional().default('available'),
  enrollments: z
    .array(
      z.object({
        type: z.string(),
        computed_current_score: z.number().nullable().optional(),
        computed_final_score: z.number().nullable().optional(),
      })
    )
    .optional()
    .default([]),
  term: z
    .object({
      id: z.number(),
      name: z.string(),
      start_at: z.string().nullable().optional(),
      end_at: z.string().nullable().optional(),
    })
    .optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
});

export type CanvasCourse = z.infer<typeof CanvasCourseSchema>;

/**
 * Canvas Assignment schema
 */
export const CanvasAssignmentSchema = z.object({
  id: z.number(),
  name: z.string().optional().default('Unnamed Assignment'),
  description: z.string().nullable().optional(),
  due_at: z.string().nullable().optional(),
  lock_at: z.string().nullable().optional(),
  unlock_at: z.string().nullable().optional(),
  points_possible: z.number().nullable().optional(),
  grading_type: z.string().optional().default('points'),
  submission_types: z.array(z.string()).optional().default([]),
  has_submitted_submissions: z.boolean().optional().default(false),
  published: z.boolean().optional().default(true),
  course_id: z.number().optional(),
  assignment_group_id: z.number().optional(),
  position: z.number().optional(),
  html_url: z.string().optional(),
});

export type CanvasAssignment = z.infer<typeof CanvasAssignmentSchema>;

/**
 * Canvas Submission schema
 */
export const CanvasSubmissionSchema = z.object({
  id: z.number(),
  assignment_id: z.number(),
  user_id: z.number(),
  submitted_at: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  grade: z.string().nullable().optional(),
  workflow_state: z.string().optional().default('unsubmitted'),
  late: z.boolean().optional().default(false),
  missing: z.boolean().optional().default(false),
  excused: z.boolean().optional().default(false),
  attempt: z.number().nullable().optional(),
  graded_at: z.string().nullable().optional(),
});

export type CanvasSubmission = z.infer<typeof CanvasSubmissionSchema>;

/**
 * Canvas User schema
 */
export const CanvasUserSchema = z.object({
  id: z.number(),
  name: z.string().optional().default('Unknown User'),
  short_name: z.string().optional(),
  login_id: z.string().optional(),
  email: z.string().optional(),
  avatar_url: z.string().optional(),
});

export type CanvasUser = z.infer<typeof CanvasUserSchema>;

/**
 * Canvas Announcement schema
 */
export const CanvasAnnouncementSchema = z.object({
  id: z.number(),
  title: z.string().optional().default(''),
  message: z.string().optional().default(''),
  posted_at: z.string().nullable().optional(),
  context_code: z.string().optional(),
  html_url: z.string().optional(),
});

export type CanvasAnnouncement = z.infer<typeof CanvasAnnouncementSchema>;

/**
 * Canvas Assignment Group schema
 */
export const CanvasAssignmentGroupSchema = z.object({
  id: z.number(),
  name: z.string().optional().default(''),
  position: z.number().optional(),
  group_weight: z.number().optional(),
  rules: z
    .object({
      drop_lowest: z.number().optional(),
      drop_highest: z.number().optional(),
      never_drop: z.array(z.number()).optional(),
    })
    .optional(),
});

export type CanvasAssignmentGroup = z.infer<typeof CanvasAssignmentGroupSchema>;

// ============================================================================
// InputValidator Class
// ============================================================================

/**
 * Input Validator for Canvas API responses
 *
 * Features:
 * - Zod schema validation
 * - Lenient mode with warnings
 * - HTML handling options
 */
export class InputValidator extends EventEmitter {
  private readonly strictness: ValidationStrictness;
  private readonly logWarnings: boolean;
  private readonly htmlHandling: HtmlHandling;
  private readonly log: ComponentLogger;

  constructor(config?: InputValidatorConfig | InputValidatorOptions, logger?: Logger) {
    super();

    // Apply defaults
    this.strictness = config?.strictness ?? 'lenient';
    this.logWarnings = config?.logWarnings ?? true;
    this.htmlHandling = config?.htmlHandling ?? 'sanitize';

    // Setup logger
    if (config && 'logger' in config && config.logger) {
      this.log = config.logger.child('inputValidator');
    } else if (logger) {
      this.log = logger.child('inputValidator');
    } else {
      const defaultLogger = new Logger({ enableConsole: false });
      this.log = defaultLogger.child('inputValidator');
    }
  }

  /**
   * Validate data against a Zod schema
   */
  validate<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    context?: string
  ): ValidationResult<T> {
    const result = schema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    // Validation failed
    const errors = result.error.issues.map(
      (e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`
    );

    if (this.strictness === 'strict') {
      this.log.error(
        `Validation failed${context ? ` (${context})` : ''}: ${errors.join(', ')}`
      );
      this.emit('validation-error', {
        context,
        errors,
        data,
      });
      return {
        success: false,
        errors,
      };
    }

    // Lenient mode: try to get partial data
    if (this.logWarnings) {
      this.log.warn(
        `Validation warnings${context ? ` (${context})` : ''}: ${errors.join(', ')}`
      );
    }

    this.emit('validation-warning', {
      context,
      warnings: errors,
      data,
    });

    // Try to extract what we can with defaults
    try {
      // Use schema's default values
      const withDefaults = schema.safeParse(data);
      if (withDefaults.success) {
        return {
          success: true,
          data: withDefaults.data,
          warnings: errors,
        };
      }
    } catch {
      // Ignore
    }

    return {
      success: false,
      errors,
      warnings: errors,
    };
  }

  /**
   * Validate a Canvas course response
   */
  validateCourse(data: unknown): ValidationResult<CanvasCourse> {
    return this.validate(data, CanvasCourseSchema, 'course');
  }

  /**
   * Validate a Canvas assignment response
   */
  validateAssignment(data: unknown): ValidationResult<CanvasAssignment> {
    return this.validate(data, CanvasAssignmentSchema, 'assignment');
  }

  /**
   * Validate a Canvas submission response
   */
  validateSubmission(data: unknown): ValidationResult<CanvasSubmission> {
    return this.validate(data, CanvasSubmissionSchema, 'submission');
  }

  /**
   * Validate a Canvas user response
   */
  validateUser(data: unknown): ValidationResult<CanvasUser> {
    return this.validate(data, CanvasUserSchema, 'user');
  }

  /**
   * Validate a Canvas announcement response
   */
  validateAnnouncement(data: unknown): ValidationResult<CanvasAnnouncement> {
    return this.validate(data, CanvasAnnouncementSchema, 'announcement');
  }

  /**
   * Validate a Canvas assignment group response
   */
  validateAssignmentGroup(data: unknown): ValidationResult<CanvasAssignmentGroup> {
    return this.validate(data, CanvasAssignmentGroupSchema, 'assignmentGroup');
  }

  /**
   * Validate an array of items
   */
  validateArray<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    context?: string
  ): ValidationResult<T[]> {
    if (!Array.isArray(data)) {
      const error = 'Expected array but received ' + typeof data;
      this.log.error(`Validation failed${context ? ` (${context})` : ''}: ${error}`);
      return {
        success: false,
        errors: [error],
      };
    }

    const results: T[] = [];
    const allWarnings: string[] = [];
    const allErrors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const result = this.validate(data[i], schema, `${context}[${i}]`);

      if (result.success && result.data) {
        results.push(result.data);
      }

      if (result.warnings) {
        allWarnings.push(...result.warnings.map((w) => `[${i}] ${w}`));
      }

      if (result.errors && this.strictness === 'strict') {
        allErrors.push(...result.errors.map((e) => `[${i}] ${e}`));
      }
    }

    if (this.strictness === 'strict' && allErrors.length > 0) {
      return {
        success: false,
        errors: allErrors,
      };
    }

    return {
      success: true,
      data: results,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    };
  }

  /**
   * Process text content based on HTML handling setting
   * Note: Currently set to 'keep' as per configuration
   */
  processHtml(html: string | null | undefined): string {
    if (!html) return '';

    switch (this.htmlHandling) {
      case 'strip':
        return this.stripHtml(html);
      case 'sanitize':
        return this.sanitizeHtml(html);
      case 'keep':
      default:
        return html;
    }
  }

  /**
   * Strip all HTML tags
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Sanitize HTML (keep safe tags, remove dangerous ones)
   */
  private sanitizeHtml(html: string): string {
    // Remove script tags and their content
    let sanitized = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ''
    );

    // Remove event handlers
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*"[^"]*"/gi, '');
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*'[^']*'/gi, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
    sanitized = sanitized.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");

    // Remove style tags
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    return sanitized;
  }

  /**
   * Normalize a date string to ISO format
   */
  normalizeDate(date: string | null | undefined): string | null {
    if (!date) return null;

    try {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        this.log.warn(`Invalid date format: ${date}`);
        return null;
      }
      return parsed.toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Get current strictness setting
   */
  getStrictness(): ValidationStrictness {
    return this.strictness;
  }

  /**
   * Get HTML handling setting
   */
  getHtmlHandling(): HtmlHandling {
    return this.htmlHandling;
  }
}

// Export schemas for external use
export const Schemas = {
  Course: CanvasCourseSchema,
  Assignment: CanvasAssignmentSchema,
  Submission: CanvasSubmissionSchema,
  User: CanvasUserSchema,
  Announcement: CanvasAnnouncementSchema,
  AssignmentGroup: CanvasAssignmentGroupSchema,
};
