/**
 * TaskTypeClassifier - Intelligent 4-tier task type classification
 *
 * Replaces the simple deriveTaskType() function with a sophisticated classification
 * system that uses multiple detection tiers with confidence scoring.
 *
 * ## Tiers (processed in order, first match wins)
 *
 * 1. **Exact Match (100%)** - Regex patterns that definitively identify task type
 *    Examples: "Quiz #3", "Lab 4", "Final Exam"
 *
 * 2. **Keyword Match (85-95%)** - Strong keyword indicators in title
 *    Examples: "webwork", "crowdmark", "wireshark"
 *
 * 3. **Submission Type (60-80%)** - Canvas submission_types array
 *    Examples: "online_quiz", "discussion_topic", "external_tool"
 *
 * 4. **Context (40-70%)** - Assignment group name or description keywords
 *    Fallback when no other tier matches
 *
 * ## Classification Metadata
 *
 * Stores tier, confidence, and matched patterns in field_sources for
 * deterministic sync conflict handling.
 */

// =============================================================================
// Types
// =============================================================================

export interface ClassificationInput {
  /** Assignment title from Canvas */
  title: string;
  /** Canvas submission_types array */
  submissionTypes: string[];
  /** Canvas assignment group name (optional) */
  assignmentGroupName?: string;
  /** Assignment description HTML (optional, used for context fallback) */
  description?: string;
}

export interface ClassificationResult {
  /** Main task type (e.g., 'quiz', 'homework', 'lab') */
  type: string;
  /** Subtype for more specific categorization (e.g., 'numbered', 'webwork') */
  subtype: string | null;
  /** Detection tier (1 = best, 4 = weakest) */
  tier: 1 | 2 | 3 | 4;
  /** Confidence score (0-100) */
  confidence: number;
  /** Patterns/indicators that matched */
  patternsMatched: string[];
}

/**
 * Extended field_sources format for task_type
 * Stored in tasks.field_sources JSON
 */
export interface TaskTypeFieldSource {
  source: 'canvas' | 'user' | 'guessed';
  tier: 1 | 2 | 3 | 4;
  confidence: number;
  detectedType: string;
  detectedSubtype: string | null;
  patternsMatched: string[];
}

// =============================================================================
// Pattern Definitions
// =============================================================================

interface Tier1Pattern {
  regex: RegExp;
  type: string;
  subtype: string | null;
}

interface Tier2Keyword {
  keywords: string[];
  type: string;
  subtype: string | null;
  confidence: number;
}

interface Tier3SubmissionType {
  submissionType: string;
  type: string;
  subtype: string | null;
  confidence: number;
}

/**
 * Tier 1: Exact regex patterns (100% confidence)
 * Order matters - first match wins
 */
const TIER1_PATTERNS: Tier1Pattern[] = [
  // Numbered patterns - highest priority
  { regex: /^quiz\s*#?\d+/i, type: 'quiz', subtype: 'numbered' },
  { regex: /^lab(?:oratory)?\s*#?\d+/i, type: 'lab', subtype: 'numbered' },
  { regex: /^(?:homework|hw)\s*#?\d+/i, type: 'homework', subtype: 'numbered' },
  { regex: /^tutorial\s*#?\d+/i, type: 'tutorial', subtype: 'numbered' },
  {
    regex: /^(?:problem\s*set|pset|ps)\s*#?\d+/i,
    type: 'homework',
    subtype: 'problem_set',
  },
  { regex: /^(?:assignment|asst?|a)\s*#?\d+/i, type: 'homework', subtype: 'numbered' },
  { regex: /^exercise\s*#?\d+/i, type: 'homework', subtype: 'exercise' },

  // Exam patterns
  { regex: /^final\s*(?:exam(?:ination)?)?$/i, type: 'exam', subtype: 'final' },
  { regex: /final\s+exam/i, type: 'exam', subtype: 'final' },
  { regex: /^mid[-\s]?term/i, type: 'exam', subtype: 'midterm' },
  { regex: /midterm\s+(?:exam|test)/i, type: 'exam', subtype: 'midterm' },
  { regex: /^term\s*test\s*#?\d*/i, type: 'exam', subtype: 'term_test' },

  // Project patterns
  {
    regex: /^project\s*(?:milestone|phase)\s*#?\d+/i,
    type: 'project',
    subtype: 'milestone',
  },
  { regex: /^(?:final\s+)?project\s+proposal/i, type: 'project', subtype: 'proposal' },
  { regex: /^project\s+presentation/i, type: 'project', subtype: 'presentation' },
  { regex: /^(?:final\s+)?project\s+report/i, type: 'project', subtype: 'final' },
  { regex: /^project\s+requirements/i, type: 'project', subtype: 'requirements' },
  { regex: /^draft\s*#?\d*/i, type: 'project', subtype: 'draft' },

  // Paper patterns
  { regex: /^(?:essay|paper)\s*#?\d*/i, type: 'paper', subtype: 'writing_task' },
  { regex: /^(?:research\s+)?paper/i, type: 'paper', subtype: 'writing_task' },
  { regex: /^(?:lab\s+)?report\s*#?\d*/i, type: 'paper', subtype: 'report' },
  { regex: /^writing\s+(?:assignment|task)/i, type: 'paper', subtype: 'writing_task' },

  // Peer review
  { regex: /^peer\s+review/i, type: 'peer_review', subtype: 'assessment' },
  { regex: /^review\s+(?:of\s+)?peer/i, type: 'peer_review', subtype: 'assessment' },

  // Participation/attendance
  { regex: /^(?:class\s+)?attendance/i, type: 'participation', subtype: 'generic' },
  { regex: /^(?:class\s+)?participation/i, type: 'participation', subtype: 'engagement' },

  // Survey/info
  { regex: /^(?:course\s+)?survey/i, type: 'info', subtype: 'survey' },
  { regex: /^(?:student\s+)?feedback/i, type: 'info', subtype: 'survey' },
  { regex: /^solutions?\s+(?:for|to)?/i, type: 'info', subtype: 'solution' },
  { regex: /^(?:course\s+)?announcement/i, type: 'info', subtype: 'announcement' },

  // In-person
  {
    regex: /^(?:in[-\s]person|in[-\s]class)\s+(?:quiz|test|exam)/i,
    type: 'in_person',
    subtype: 'generic',
  },
  { regex: /^ta[-\s]graded/i, type: 'in_person', subtype: 'ta_graded' },

  // Discussion/reflection
  {
    regex: /^(?:discussion|forum)\s*(?:post|board)?/i,
    type: 'discussion',
    subtype: 'generic',
  },
  { regex: /^reflection\s*#?\d*/i, type: 'discussion', subtype: 'reflection' },

  // Reading
  { regex: /^reading\s*(?:assignment|response)?/i, type: 'reading', subtype: 'generic' },

  // Media
  { regex: /^(?:video\s+)?interview/i, type: 'media', subtype: 'interview' },
  {
    regex: /^(?:video|audio)\s+(?:submission|recording)/i,
    type: 'media',
    subtype: 'interview',
  },
];

/**
 * Tier 2: Keyword patterns (85-95% confidence)
 * Checks if title contains any of the keywords
 */
const TIER2_KEYWORDS: Tier2Keyword[] = [
  // Homework subtypes with high confidence
  { keywords: ['webwork'], type: 'homework', subtype: 'webwork', confidence: 95 },
  { keywords: ['crowdmark'], type: 'external', subtype: 'crowdmark', confidence: 95 },
  { keywords: ['matlab'], type: 'lab', subtype: 'matlab', confidence: 92 },
  { keywords: ['wireshark'], type: 'lab', subtype: 'wireshark', confidence: 92 },

  // Quiz keywords
  {
    keywords: ['quiz', 'check-in', 'check in'],
    type: 'quiz',
    subtype: 'generic',
    confidence: 90,
  },
  {
    keywords: ['pre-quiz', 'prequiz', 'pre quiz'],
    type: 'quiz',
    subtype: 'check_in',
    confidence: 88,
  },
  {
    keywords: ['review quiz', 'practice quiz'],
    type: 'quiz',
    subtype: 'review',
    confidence: 88,
  },

  // Lab keywords
  {
    keywords: ['lab', 'laboratory', 'practical'],
    type: 'lab',
    subtype: 'generic',
    confidence: 88,
  },

  // Exam keywords
  { keywords: ['exam', 'examination'], type: 'exam', subtype: 'generic', confidence: 90 },
  { keywords: ['test'], type: 'exam', subtype: 'generic', confidence: 85 },

  // Homework keywords
  { keywords: ['homework', 'hw'], type: 'homework', subtype: 'generic', confidence: 88 },
  {
    keywords: ['problem set', 'pset'],
    type: 'homework',
    subtype: 'problem_set',
    confidence: 90,
  },
  {
    keywords: ['exercise', 'exercises'],
    type: 'homework',
    subtype: 'exercise',
    confidence: 85,
  },
  {
    keywords: ['assignment', 'asst'],
    type: 'homework',
    subtype: 'assignment',
    confidence: 85,
  },

  // Tutorial keywords
  { keywords: ['tutorial', 'tut'], type: 'tutorial', subtype: 'generic', confidence: 88 },

  // Project keywords
  {
    keywords: ['project', 'milestone'],
    type: 'project',
    subtype: 'generic',
    confidence: 88,
  },
  {
    keywords: ['presentation'],
    type: 'project',
    subtype: 'presentation',
    confidence: 85,
  },
  { keywords: ['proposal'], type: 'project', subtype: 'proposal', confidence: 85 },

  // Paper keywords
  {
    keywords: ['essay', 'paper', 'report'],
    type: 'paper',
    subtype: 'writing_task',
    confidence: 88,
  },

  // Discussion keywords
  {
    keywords: ['discussion', 'forum', 'post'],
    type: 'discussion',
    subtype: 'generic',
    confidence: 88,
  },
  {
    keywords: ['reflection', 'journal'],
    type: 'discussion',
    subtype: 'reflection',
    confidence: 85,
  },

  // Participation keywords
  {
    keywords: ['participation', 'attendance', 'engagement'],
    type: 'participation',
    subtype: 'generic',
    confidence: 88,
  },

  // External tool keywords
  {
    keywords: ['lti', 'external tool', 'external link'],
    type: 'external',
    subtype: 'lti_module',
    confidence: 85,
  },

  // Info keywords
  { keywords: ['survey', 'feedback'], type: 'info', subtype: 'survey', confidence: 90 },
  {
    keywords: ['solution', 'solutions', 'answer key'],
    type: 'info',
    subtype: 'solution',
    confidence: 88,
  },

  // Peer review
  {
    keywords: ['peer review', 'peer assessment'],
    type: 'peer_review',
    subtype: 'assessment',
    confidence: 90,
  },

  // Reading
  { keywords: ['reading'], type: 'reading', subtype: 'generic', confidence: 85 },
];

/**
 * Tier 3: Submission type mapping (60-80% confidence)
 * Maps Canvas submission_types to task types
 */
const TIER3_SUBMISSION_TYPES: Tier3SubmissionType[] = [
  { submissionType: 'online_quiz', type: 'quiz', subtype: null, confidence: 80 },
  {
    submissionType: 'discussion_topic',
    type: 'discussion',
    subtype: null,
    confidence: 80,
  },
  { submissionType: 'external_tool', type: 'external', subtype: null, confidence: 70 },
  { submissionType: 'not_graded', type: 'info', subtype: null, confidence: 75 },
  { submissionType: 'none', type: 'participation', subtype: null, confidence: 60 },
  { submissionType: 'on_paper', type: 'in_person', subtype: null, confidence: 65 },
  { submissionType: 'online_upload', type: 'homework', subtype: null, confidence: 60 },
  {
    submissionType: 'online_text_entry',
    type: 'homework',
    subtype: null,
    confidence: 60,
  },
  { submissionType: 'online_url', type: 'homework', subtype: null, confidence: 60 },
  { submissionType: 'media_recording', type: 'media', subtype: null, confidence: 70 },
  {
    submissionType: 'student_annotation',
    type: 'homework',
    subtype: null,
    confidence: 60,
  },
];

/**
 * Tier 4: Context keywords for assignment group names (40-70% confidence)
 */
const TIER4_CONTEXT_KEYWORDS: Tier2Keyword[] = [
  { keywords: ['quizzes', 'quiz'], type: 'quiz', subtype: null, confidence: 70 },
  {
    keywords: ['labs', 'laboratory', 'practicals'],
    type: 'lab',
    subtype: null,
    confidence: 70,
  },
  {
    keywords: ['homework', 'assignments', 'problem sets'],
    type: 'homework',
    subtype: null,
    confidence: 65,
  },
  {
    keywords: ['exams', 'tests', 'midterms', 'finals'],
    type: 'exam',
    subtype: null,
    confidence: 70,
  },
  { keywords: ['projects'], type: 'project', subtype: null, confidence: 70 },
  { keywords: ['tutorials'], type: 'tutorial', subtype: null, confidence: 70 },
  {
    keywords: ['participation', 'attendance'],
    type: 'participation',
    subtype: null,
    confidence: 65,
  },
  {
    keywords: ['discussions', 'forum'],
    type: 'discussion',
    subtype: null,
    confidence: 65,
  },
  {
    keywords: ['essays', 'papers', 'writing'],
    type: 'paper',
    subtype: null,
    confidence: 65,
  },
  { keywords: ['reading', 'readings'], type: 'reading', subtype: null, confidence: 60 },
  { keywords: ['peer review'], type: 'peer_review', subtype: null, confidence: 65 },
  // Lower confidence for generic groups
  {
    keywords: ['graded', 'coursework'],
    type: 'assignment',
    subtype: null,
    confidence: 40,
  },
];

// =============================================================================
// Classifier Implementation
// =============================================================================

export class TaskTypeClassifier {
  /**
   * Classify a task based on available information
   * @returns Classification result with type, subtype, tier, and confidence
   */
  classify(input: ClassificationInput): ClassificationResult {
    // Normalize title for matching
    const normalizedTitle = input.title.toLowerCase().trim();

    // Tier 1: Exact regex match (100% confidence)
    const tier1Result = this.matchTier1(normalizedTitle, input.title);
    if (tier1Result) {
      return tier1Result;
    }

    // Tier 2: Keyword match (85-95% confidence)
    const tier2Result = this.matchTier2(normalizedTitle);
    if (tier2Result) {
      return tier2Result;
    }

    // Tier 3: Submission type (60-80% confidence)
    const tier3Result = this.matchTier3(input.submissionTypes);
    if (tier3Result) {
      return tier3Result;
    }

    // Tier 4: Context from assignment group (40-70% confidence)
    const tier4Result = this.matchTier4(input.assignmentGroupName, input.description);
    if (tier4Result) {
      return tier4Result;
    }

    // Fallback: assignment with low confidence
    return {
      type: 'assignment',
      subtype: null,
      tier: 4,
      confidence: 30,
      patternsMatched: ['fallback:no_match'],
    };
  }

  /**
   * Compare two classifications and determine if candidate is better
   * Used during sync to decide whether to upgrade classification
   */
  isClassificationBetter(
    current: ClassificationResult | TaskTypeFieldSource | null,
    candidate: ClassificationResult
  ): boolean {
    if (!current) return true;

    // Better tier always wins (lower number = better)
    if (candidate.tier < current.tier) return true;
    if (candidate.tier > current.tier) return false;

    // Same tier: higher confidence wins
    return candidate.confidence > current.confidence;
  }

  /**
   * Convert ClassificationResult to TaskTypeFieldSource for storage
   */
  toFieldSource(
    result: ClassificationResult,
    source: 'canvas' | 'user' = 'canvas'
  ): TaskTypeFieldSource {
    return {
      source,
      tier: result.tier,
      confidence: result.confidence,
      detectedType: result.type,
      detectedSubtype: result.subtype,
      patternsMatched: result.patternsMatched,
    };
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private matchTier1(
    normalizedTitle: string,
    originalTitle: string
  ): ClassificationResult | null {
    for (const pattern of TIER1_PATTERNS) {
      if (pattern.regex.test(originalTitle) || pattern.regex.test(normalizedTitle)) {
        return {
          type: pattern.type,
          subtype: pattern.subtype,
          tier: 1,
          confidence: 100,
          patternsMatched: [`tier1:${pattern.regex.toString()}`],
        };
      }
    }
    return null;
  }

  private matchTier2(normalizedTitle: string): ClassificationResult | null {
    for (const entry of TIER2_KEYWORDS) {
      for (const keyword of entry.keywords) {
        if (normalizedTitle.includes(keyword.toLowerCase())) {
          return {
            type: entry.type,
            subtype: entry.subtype,
            tier: 2,
            confidence: entry.confidence,
            patternsMatched: [`tier2:keyword:${keyword}`],
          };
        }
      }
    }
    return null;
  }

  private matchTier3(submissionTypes: string[]): ClassificationResult | null {
    if (!submissionTypes || submissionTypes.length === 0) {
      return null;
    }

    // Check submission types in priority order
    for (const entry of TIER3_SUBMISSION_TYPES) {
      if (submissionTypes.includes(entry.submissionType)) {
        return {
          type: entry.type,
          subtype: entry.subtype,
          tier: 3,
          confidence: entry.confidence,
          patternsMatched: [`tier3:submission_type:${entry.submissionType}`],
        };
      }
    }

    return null;
  }

  private matchTier4(
    assignmentGroupName?: string,
    description?: string
  ): ClassificationResult | null {
    // Try assignment group name first (higher confidence)
    if (assignmentGroupName) {
      const normalizedGroup = assignmentGroupName.toLowerCase().trim();
      for (const entry of TIER4_CONTEXT_KEYWORDS) {
        for (const keyword of entry.keywords) {
          if (normalizedGroup.includes(keyword.toLowerCase())) {
            return {
              type: entry.type,
              subtype: entry.subtype,
              tier: 4,
              confidence: entry.confidence,
              patternsMatched: [`tier4:group:${keyword}`],
            };
          }
        }
      }
    }

    // Try description as last resort (lower confidence)
    if (description) {
      // Strip HTML and normalize
      const normalizedDesc = description
        .replace(/<[^>]*>/g, ' ')
        .toLowerCase()
        .substring(0, 500); // Only check first 500 chars

      for (const entry of TIER4_CONTEXT_KEYWORDS) {
        for (const keyword of entry.keywords) {
          if (normalizedDesc.includes(keyword.toLowerCase())) {
            // Reduce confidence for description matches
            return {
              type: entry.type,
              subtype: entry.subtype,
              tier: 4,
              confidence: Math.max(entry.confidence - 15, 40),
              patternsMatched: [`tier4:description:${keyword}`],
            };
          }
        }
      }
    }

    return null;
  }
}

// Export singleton instance for convenience
export const taskTypeClassifier = new TaskTypeClassifier();
