/**
 * Text Formatters - Text, number, file size, and course name formatting
 */

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Extract the clean course name from the full Canvas name string
 */
export function getCleanCourseName(name: string | null | undefined): string {
  if (!name) return '';

  const colonIndex = name.indexOf(':');
  if (colonIndex !== -1) {
    return name.substring(colonIndex + 1).trim();
  }

  return name;
}

/**
 * Format a full course display string (code + clean name)
 */
export function formatCourseName(code: string, name: string | null | undefined): string {
  const cleanName = getCleanCourseName(name);
  if (!cleanName) return code;
  return `${code} - ${cleanName}`;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Format a number with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Pluralize a word based on count
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count} ${word}`;
}
