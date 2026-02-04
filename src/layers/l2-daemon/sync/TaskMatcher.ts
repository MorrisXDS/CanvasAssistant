/**
 * TaskMatcher - Fuzzy matching service for linking user tasks to Canvas tasks
 *
 * Uses string similarity algorithms with abbreviation expansion to find
 * matching tasks across user-created and Canvas-synced tasks.
 */

// Configurable thresholds (can be overridden per-user in settings)
export const LINK_THRESHOLDS = {
  autoLink: 0.9, // >= 90% confidence: auto-link without asking
  suggestLink: 0.7, // >= 70% confidence: suggest link to user
  noLink: 0.7, // < 70% confidence: don't suggest
};

export interface MatchResult {
  confidence: number;
  method: 'exact' | 'fuzzy' | 'none';
  canvasTaskId: number | null;
  canvasTaskTitle: string | null;
  expandedUserTitle?: string;
  expandedCanvasTitle?: string;
}

export interface TaskForMatching {
  id: number;
  title: string;
  courseId: number;
  dueAt: string | null;
  sourceType: 'canvas' | 'user';
}

// Common academic abbreviations
const ABBREVIATIONS: Record<string, string> = {
  hw: 'homework',
  asgn: 'assignment',
  assgn: 'assignment',
  assn: 'assignment',
  ch: 'chapter',
  chap: 'chapter',
  lec: 'lecture',
  lab: 'laboratory',
  proj: 'project',
  q: 'quiz',
  ex: 'exam',
  mt: 'midterm',
  mid: 'midterm',
  fin: 'final',
  pset: 'problem set',
  ps: 'problem set',
  rev: 'review',
  disc: 'discussion',
  wk: 'week',
  pt: 'part',
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;

  // Create matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Expand common abbreviations in a title
 *
 * Handles cases like:
 * - "HW 5" → "homework 5" (space-separated)
 * - "HW5" → "homework 5" (directly followed by number)
 * - "hw2" → "homework 2" (lowercase with number)
 */
export function expandAbbreviations(title: string): string {
  let expanded = title.toLowerCase();
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    // Match abbreviation at word boundary OR followed by a digit
    // Pattern: \b{abbr}(?=\d|\b) - matches "hw" when followed by digit or word boundary
    // This handles both "HW 5" and "HW5" cases
    expanded = expanded.replace(
      new RegExp(`\\b${abbr}(?=\\d|\\b|$|\\s)`, 'gi'),
      (match, offset, str) => {
        // Check if followed by a digit - if so, add a space after the expansion
        const nextChar = str[offset + match.length];
        if (nextChar && /\d/.test(nextChar)) {
          return full + ' ';
        }
        return full;
      }
    );
  }
  return expanded;
}

/**
 * Normalize a title for comparison
 */
export function normalizeTitle(title: string): string {
  return (
    expandAbbreviations(title)
      .toLowerCase()
      // Remove punctuation except numbers
      .replace(/[^a-z0-9\s]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Check if due dates are within tolerance
 */
export function areDueDatesClose(
  d1: string | null,
  d2: string | null,
  hoursThreshold = 24
): boolean {
  if (!d1 || !d2) return false;
  try {
    const diff = Math.abs(new Date(d1).getTime() - new Date(d2).getTime());
    return diff <= hoursThreshold * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Calculate similarity between two normalized strings (0.0 to 1.0)
 */
export function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0;

  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Calculate overall similarity between two tasks
 */
export function calculateSimilarity(
  userTask: TaskForMatching,
  canvasTask: TaskForMatching
): number {
  const t1 = normalizeTitle(userTask.title);
  const t2 = normalizeTitle(canvasTask.title);

  // Exact match after normalization
  if (t1 === t2) return 1.0;

  // String similarity (Levenshtein-based)
  const stringSim = stringSimilarity(t1, t2);

  // Due date proximity bonus
  const dateBonus = areDueDatesClose(userTask.dueAt, canvasTask.dueAt) ? 0.05 : 0;

  // Substring containment bonus
  const containsBonus = t1.includes(t2) || t2.includes(t1) ? 0.05 : 0;

  // Length ratio penalty (very different lengths suggest different assignments)
  const lengthRatio = Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
  const lengthPenalty = lengthRatio < 0.5 ? -0.1 : 0;

  const finalScore = stringSim + dateBonus + containsBonus + lengthPenalty;
  return Math.min(Math.max(finalScore, 0), 1);
}

/**
 * Find the best matching Canvas task for a user task
 */
export function findMatchingCanvasTask(
  userTask: TaskForMatching,
  canvasTasks: TaskForMatching[],
  thresholds = LINK_THRESHOLDS
): MatchResult {
  // Must be same course
  const sameCourse = canvasTasks.filter((t) => t.courseId === userTask.courseId);

  if (sameCourse.length === 0) {
    return { confidence: 0, method: 'none', canvasTaskId: null, canvasTaskTitle: null };
  }

  // Find best match
  let bestMatch: MatchResult = {
    confidence: 0,
    method: 'none',
    canvasTaskId: null,
    canvasTaskTitle: null,
  };

  for (const canvasTask of sameCourse) {
    const confidence = calculateSimilarity(userTask, canvasTask);

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        confidence,
        method:
          confidence >= thresholds.autoLink
            ? 'exact'
            : confidence >= thresholds.suggestLink
              ? 'fuzzy'
              : 'none',
        canvasTaskId: canvasTask.id,
        canvasTaskTitle: canvasTask.title,
        expandedUserTitle: normalizeTitle(userTask.title),
        expandedCanvasTitle: normalizeTitle(canvasTask.title),
      };
    }
  }

  return bestMatch;
}

/**
 * Find all potential matches above a minimum threshold
 */
export function findAllPotentialMatches(
  userTask: TaskForMatching,
  canvasTasks: TaskForMatching[],
  minThreshold = 0.5
): MatchResult[] {
  const sameCourse = canvasTasks.filter((t) => t.courseId === userTask.courseId);

  return sameCourse
    .map((canvasTask) => ({
      confidence: calculateSimilarity(userTask, canvasTask),
      method: 'fuzzy' as const,
      canvasTaskId: canvasTask.id,
      canvasTaskTitle: canvasTask.title,
      expandedUserTitle: normalizeTitle(userTask.title),
      expandedCanvasTitle: normalizeTitle(canvasTask.title),
    }))
    .filter((m) => m.confidence >= minThreshold)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * TaskMatcher class for use in sync strategies
 */
export class TaskMatcher {
  private thresholds: typeof LINK_THRESHOLDS;

  constructor(thresholds?: Partial<typeof LINK_THRESHOLDS>) {
    this.thresholds = { ...LINK_THRESHOLDS, ...thresholds };
  }

  findMatch(userTask: TaskForMatching, canvasTasks: TaskForMatching[]): MatchResult {
    return findMatchingCanvasTask(userTask, canvasTasks, this.thresholds);
  }

  findAllMatches(
    userTask: TaskForMatching,
    canvasTasks: TaskForMatching[],
    minThreshold?: number
  ): MatchResult[] {
    return findAllPotentialMatches(userTask, canvasTasks, minThreshold);
  }

  shouldAutoLink(confidence: number): boolean {
    return confidence >= this.thresholds.autoLink;
  }

  shouldSuggestLink(confidence: number): boolean {
    return (
      confidence >= this.thresholds.suggestLink && confidence < this.thresholds.autoLink
    );
  }

  getThresholds(): typeof LINK_THRESHOLDS {
    return { ...this.thresholds };
  }
}
