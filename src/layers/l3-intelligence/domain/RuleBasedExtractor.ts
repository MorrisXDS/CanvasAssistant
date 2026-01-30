/**
 * RuleBasedExtractor - Layer 2 Content Analysis
 *
 * Pure functions for extracting structured data from text using regex patterns.
 * This is the second layer that always runs - fast, offline, no ML required.
 *
 * Handles ~70% of extraction needs:
 * - Dates (due dates, exam dates, deadlines)
 * - Percentages (weights, penalties, grades)
 * - Policy keywords (late penalties, grace periods, etc.)
 * - Academic terms and patterns
 */

/**
 * Extracted date information
 */
export interface ExtractedDate {
  /** The raw matched text */
  rawText: string;
  /** Parsed date if possible */
  parsedDate: Date | null;
  /** Context around the date (surrounding text) */
  context: string;
  /** Type of date if detectable */
  dateType: 'due_date' | 'exam' | 'midterm' | 'final' | 'deadline' | 'other';
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Extracted percentage information
 */
export interface ExtractedPercentage {
  /** The raw matched text */
  rawText: string;
  /** Numeric value (0-100) */
  value: number;
  /** Context around the percentage */
  context: string;
  /** Type of percentage if detectable */
  percentType: 'weight' | 'penalty' | 'grade' | 'threshold' | 'other';
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Extracted policy information
 */
export interface ExtractedPolicy {
  /** Type of policy detected */
  policyType: 'late_penalty' | 'grace_period' | 'grace_token' | 'extension' | 'attendance' | 'other';
  /** Policy name/description */
  name: string;
  /** The matched text */
  matchedText: string;
  /** Extracted rules (structured data) */
  rules: Record<string, unknown>;
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Complete extraction result from rule-based analysis
 */
export interface RuleBasedExtractionResult {
  /** All extracted dates */
  dates: ExtractedDate[];
  /** All extracted percentages */
  percentages: ExtractedPercentage[];
  /** All detected policies */
  policies: ExtractedPolicy[];
  /** General keywords found */
  keywords: string[];
  /** Academic terms detected */
  academicTerms: string[];
  /** Extraction statistics */
  stats: {
    totalMatches: number;
    processingTimeMs: number;
  };
}

// ============================================================================
// Date Extraction Patterns
// ============================================================================

// Common date formats
const DATE_PATTERNS = [
  // ISO format: 2024-01-15
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
  // US format: January 15, 2024 or Jan 15, 2024
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/gi,
  // US numeric: 01/15/2024 or 1/15/24
  /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
  // Day, Month Day: Monday, January 15
  /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
];

// Date context patterns (to determine date type)
const DATE_CONTEXT_PATTERNS = {
  due_date: /\b(due|submit|submission|deadline|turn\s*in|hand\s*in)\b/i,
  exam: /\b(exam|examination|test|assessment)\b/i,
  midterm: /\b(midterm|mid-term|mid\s+term)\b/i,
  final: /\b(final|final\s+exam)\b/i,
  deadline: /\b(deadline|by|before|no\s+later\s+than)\b/i,
};

// ============================================================================
// Percentage Extraction Patterns
// ============================================================================

const PERCENTAGE_PATTERN = /(\d+(?:\.\d+)?)\s*%/g;

const PERCENTAGE_CONTEXT_PATTERNS = {
  weight: /\b(worth|weight|weighted|counts?\s+for|value)\b/i,
  penalty: /\b(penalty|deduct|late|reduction|lose|minus)\b/i,
  grade: /\b(grade|score|mark|earned|achieved)\b/i,
  threshold: /\b(minimum|maximum|required|passing|at\s+least|threshold)\b/i,
};

// ============================================================================
// Policy Detection Patterns
// ============================================================================

const POLICY_PATTERNS = {
  late_penalty: [
    /late\s+(?:submission|assignment)s?\s+(?:will\s+)?(?:be\s+)?(?:penalized|deducted)/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:penalty|deduction)\s*(?:per|each)\s*(day|hour)/i,
    /(?:penalty|deduction)\s+of\s+(\d+(?:\.\d+)?)\s*%/i,
    /lose\s+(\d+(?:\.\d+)?)\s*%\s*(?:per|each)\s*(day|hour)/i,
    /(\d+(?:\.\d+)?)\s*%\s*off\s+(?:per|each)\s*(day|hour)/i,
  ],
  grace_period: [
    /grace\s+period\s+of\s+(\d+)\s*(hour|day|minute)/i,
    /(\d+)\s*(hour|day|minute)s?\s+grace\s+period/i,
    /no\s+penalty\s+(?:for|within)\s+(?:the\s+)?(?:first\s+)?(\d+)\s*(hour|day|minute)/i,
  ],
  grace_token: [
    /grace\s+(?:day|token)s?/i,
    /(?:late|extension)\s+(?:day|token)s?/i,
    /(\d+)\s+(?:free\s+)?(?:late|extension)\s+(?:day|token)s?/i,
    /token\s+system/i,
  ],
  extension: [
    /extension\s+(?:may\s+be|can\s+be|will\s+be)\s+(?:granted|requested|given)/i,
    /request\s+(?:an?\s+)?extension/i,
    /accommodations?\s+(?:may\s+be|can\s+be)\s+(?:made|arranged)/i,
  ],
  attendance: [
    /attendance\s+(?:is\s+)?(?:mandatory|required|compulsory)/i,
    /(\d+)\s*%\s*(?:of\s+)?(?:the\s+)?(?:grade|mark)\s+(?:is\s+)?(?:for\s+)?attendance/i,
    /missing\s+(?:more\s+than\s+)?(\d+)\s+class(?:es)?/i,
  ],
};

// ============================================================================
// Academic Term Patterns
// ============================================================================

const ACADEMIC_TERMS = [
  'assignment',
  'exam',
  'quiz',
  'midterm',
  'final',
  'project',
  'essay',
  'paper',
  'lab',
  'laboratory',
  'tutorial',
  'lecture',
  'homework',
  'test',
  'presentation',
  'discussion',
  'participation',
  'attendance',
  'syllabus',
  'rubric',
  'grading',
  'office hours',
  'textbook',
  'reading',
  'prerequisite',
  'corequisite',
  'credit',
  'semester',
  'term',
  'academic integrity',
  'plagiarism',
];

// ============================================================================
// Extraction Functions
// ============================================================================

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Extract dates from text
 */
export function extractDates(text: string): ExtractedDate[] {
  const dates: ExtractedDate[] = [];
  const seen = new Set<string>();

  for (const pattern of DATE_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const rawText = match[0];

      // Skip if we've seen this exact text
      if (seen.has(rawText.toLowerCase())) continue;
      seen.add(rawText.toLowerCase());

      // Get surrounding context (50 chars before and after)
      const start = Math.max(0, match.index - 50);
      const end = Math.min(text.length, match.index + rawText.length + 50);
      const context = text.slice(start, end);

      // Try to parse the date
      const parsedDate = parseDate(rawText);

      // Determine date type from context
      let dateType: ExtractedDate['dateType'] = 'other';
      for (const [type, contextPattern] of Object.entries(DATE_CONTEXT_PATTERNS)) {
        if (contextPattern.test(context)) {
          dateType = type as ExtractedDate['dateType'];
          break;
        }
      }

      // Calculate confidence
      let confidence = 0.5;
      if (parsedDate) confidence += 0.3;
      if (dateType !== 'other') confidence += 0.2;

      dates.push({
        rawText,
        parsedDate,
        context: context.trim(),
        dateType,
        confidence,
      });
    }
  }

  return dates;
}

/**
 * Try to parse a date string
 */
function parseDate(dateStr: string): Date | null {
  // Try native Date parsing first
  const nativeDate = new Date(dateStr);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  // Try manual parsing for common formats
  const lowerStr = dateStr.toLowerCase();

  // Match: January 15, 2024 or Jan 15, 2024
  const monthDayYear = lowerStr.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i
  );
  if (monthDayYear) {
    const month = MONTH_MAP[monthDayYear[1].toLowerCase()];
    const day = parseInt(monthDayYear[2], 10);
    const year = monthDayYear[3] ? parseInt(monthDayYear[3], 10) : new Date().getFullYear();

    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  return null;
}

/**
 * Extract percentages from text
 */
export function extractPercentages(text: string): ExtractedPercentage[] {
  const percentages: ExtractedPercentage[] = [];

  // Reset regex state
  PERCENTAGE_PATTERN.lastIndex = 0;
  let match;

  while ((match = PERCENTAGE_PATTERN.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    const rawText = match[0];

    // Get surrounding context (100 chars before and after)
    const start = Math.max(0, match.index - 100);
    const end = Math.min(text.length, match.index + rawText.length + 100);
    const context = text.slice(start, end);

    // Determine percentage type from context
    let percentType: ExtractedPercentage['percentType'] = 'other';
    for (const [type, contextPattern] of Object.entries(PERCENTAGE_CONTEXT_PATTERNS)) {
      if (contextPattern.test(context)) {
        percentType = type as ExtractedPercentage['percentType'];
        break;
      }
    }

    // Calculate confidence
    let confidence = 0.6;
    if (value >= 0 && value <= 100) confidence += 0.2;
    if (percentType !== 'other') confidence += 0.2;

    percentages.push({
      rawText,
      value,
      context: context.trim(),
      percentType,
      confidence,
    });
  }

  return percentages;
}

/**
 * Detect policies from text
 */
export function extractPolicies(text: string): ExtractedPolicy[] {
  const policies: ExtractedPolicy[] = [];

  for (const [policyType, patterns] of Object.entries(POLICY_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const rules: Record<string, unknown> = {};

        // Extract specific values from patterns
        if (policyType === 'late_penalty') {
          // Try to extract penalty percentage and time unit
          const penaltyMatch = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:penalty|deduction|off)?\s*(?:per|each|every)\s*(day|hour)/i);
          if (penaltyMatch) {
            rules.penaltyPercent = parseFloat(penaltyMatch[1]);
            rules.perUnit = penaltyMatch[2].toLowerCase();
          }
        }

        if (policyType === 'grace_period') {
          // Extract grace period duration
          const gracePeriodMatch = text.match(/(\d+)\s*(hour|day|minute)s?\s*grace/i)
            || text.match(/grace\s+(?:period\s+)?(?:of\s+)?(\d+)\s*(hour|day|minute)/i);
          if (gracePeriodMatch) {
            rules.duration = parseInt(gracePeriodMatch[1], 10);
            rules.unit = gracePeriodMatch[2].toLowerCase();
          }
        }

        if (policyType === 'grace_token') {
          // Extract token count
          const tokenMatch = text.match(/(\d+)\s+(?:grace\s+)?(?:late\s+)?(?:day|token)s?/i);
          if (tokenMatch) {
            rules.totalTokens = parseInt(tokenMatch[1], 10);
          }
        }

        // Calculate confidence based on match quality
        const confidence = match[0].length > 20 ? 0.8 : 0.6;

        policies.push({
          policyType: policyType as ExtractedPolicy['policyType'],
          name: formatPolicyName(policyType),
          matchedText: match[0],
          rules,
          confidence,
        });

        // Only add one match per policy type
        break;
      }
    }
  }

  return policies;
}

/**
 * Format policy type to display name
 */
function formatPolicyName(policyType: string): string {
  const names: Record<string, string> = {
    late_penalty: 'Late Submission Penalty',
    grace_period: 'Grace Period',
    grace_token: 'Grace Days/Tokens',
    extension: 'Extension Policy',
    attendance: 'Attendance Policy',
    other: 'Other Policy',
  };
  return names[policyType] || policyType;
}

/**
 * Extract academic keywords from text
 */
export function extractKeywords(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const term of ACADEMIC_TERMS) {
    if (lowerText.includes(term.toLowerCase())) {
      found.push(term);
    }
  }

  return found;
}

/**
 * Main extraction function - runs all extractors
 */
export function runRuleBasedExtraction(text: string): RuleBasedExtractionResult {
  const startTime = Date.now();

  const dates = extractDates(text);
  const percentages = extractPercentages(text);
  const policies = extractPolicies(text);
  const keywords = extractKeywords(text);

  const processingTimeMs = Date.now() - startTime;

  return {
    dates,
    percentages,
    policies,
    keywords,
    academicTerms: keywords.filter((k) =>
      ['assignment', 'exam', 'quiz', 'midterm', 'final', 'project', 'lab', 'essay'].includes(k)
    ),
    stats: {
      totalMatches: dates.length + percentages.length + policies.length,
      processingTimeMs,
    },
  };
}

/**
 * Extract assignment weight from a syllabus/course page
 * Returns a map of assignment type/name to weight percentage
 */
export function extractAssignmentWeights(text: string): Map<string, number> {
  const weights = new Map<string, number>();

  // Pattern: "Assignment 15%" or "Assignments: 15%" or "Assignment (15%)"
  const weightPatterns = [
    /\b(assignment|exam|quiz|midterm|final|project|essay|paper|lab|homework|test|presentation|participation|attendance)s?\s*[:\(\[]?\s*(\d+(?:\.\d+)?)\s*%/gi,
    /(\d+(?:\.\d+)?)\s*%\s*[:\-]?\s*(assignment|exam|quiz|midterm|final|project|essay|paper|lab|homework|test|presentation|participation|attendance)s?\b/gi,
  ];

  for (const pattern of weightPatterns) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      // Determine which group has the name vs the percentage
      const name = isNaN(parseInt(match[1], 10)) ? match[1].toLowerCase() : match[2].toLowerCase();
      const percentStr = isNaN(parseInt(match[1], 10)) ? match[2] : match[1];
      const percent = parseFloat(percentStr);

      if (percent > 0 && percent <= 100) {
        // If we already have this assignment type, keep the higher weight
        const existing = weights.get(name);
        if (!existing || percent > existing) {
          weights.set(name, percent);
        }
      }
    }
  }

  return weights;
}
