/**
 * Grade Formatters - Grade percentage and letter grade utilities
 */

/**
 * Get letter grade from percentage (UofT grading scale)
 */
export function getLetterGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 85) return 'A';
  if (percentage >= 80) return 'A-';
  if (percentage >= 77) return 'B+';
  if (percentage >= 73) return 'B';
  if (percentage >= 70) return 'B-';
  if (percentage >= 67) return 'C+';
  if (percentage >= 63) return 'C';
  if (percentage >= 60) return 'C-';
  if (percentage >= 57) return 'D+';
  if (percentage >= 53) return 'D';
  if (percentage >= 50) return 'D-';
  return 'F';
}

/**
 * Format a grade percentage for display with smart decimals
 */
export function formatGrade(percentage: number | null): string {
  if (percentage === null) return '-';

  const rounded = Math.round(percentage * 100) / 100;
  const hasHundredths = Math.round(rounded * 100) % 10 !== 0;

  return hasHundredths ? `${rounded.toFixed(2)}%` : `${rounded.toFixed(1)}%`;
}

/**
 * Format grade with letter grade
 */
export function formatGradeWithLetter(percentage: number | null): string {
  if (percentage === null) return '-';
  return `${formatGrade(percentage)} (${getLetterGrade(percentage)})`;
}
