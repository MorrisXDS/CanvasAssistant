/**
 * Policy Detection - Detect policy keywords and calculate confidence scores
 */

// Policy detection keywords
export const POLICY_KEYWORDS: Record<string, string[]> = {
  late_submission: ['late', 'deadline', 'extension', 'overdue', 'past due'],
  grace_period: ['grace', 'token', 'free pass', 'slip day', 'slip days'],
  penalties: ['penalty', 'deduction', '-5%', '-10%', 'penalize', 'penalized'],
  weight_changes: ['weight', 'reweight', 'redistribute', 'weighted'],
  drops: ['drop lowest', 'drop', 'forgive', 'forgiven'],
  bonus: ['bonus', 'extra credit', 'additional marks', 'additional points'],
  resubmission: ['resubmit', 'redo', 'correction', 'revision', 'reattempt'],
};

/**
 * Detect policy keywords in text and return matches
 */
export function detectPolicyKeywords(text: string): {
  isPolicy: boolean;
  keywords: string[];
  categories: string[];
} {
  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
  const foundKeywords: string[] = [];
  const foundCategories = new Set<string>();

  for (const [category, keywords] of Object.entries(POLICY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (plainText.includes(keyword.toLowerCase())) {
        foundKeywords.push(keyword);
        foundCategories.add(category);
      }
    }
  }

  return {
    isPolicy: foundKeywords.length > 0,
    keywords: foundKeywords,
    categories: Array.from(foundCategories),
  };
}

/**
 * Calculate confidence score for policy detection (0-1)
 */
export function calculatePolicyConfidence(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  const keywordScore = Math.min(keywords.length * 0.2, 0.6);

  const plainText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
  let patternBoost = 0;

  const strongPatterns = [
    /late (submission|penalty|policy)/,
    /grace (period|token)/,
    /\d+%\s*(penalty|deduction)/,
    /drop (lowest|your lowest)/,
    /extension (policy|request)/,
    /resubmit(ted|tion)? (allowed|permitted)/,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(plainText)) {
      patternBoost += 0.15;
    }
  }

  return Math.min(keywordScore + patternBoost, 1.0);
}
