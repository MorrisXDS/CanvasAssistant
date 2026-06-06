/**
 * assessUpdate — pure compatibility helper for the update channel.
 *
 * Compares two version strings and returns a verdict about whether it is
 * safe to install the target version, given the forward-only migration
 * constraint described in ADR-0009 / ADR-0012.
 *
 * Design decisions:
 * - No semver library dependency — we only need major-version comparison and
 *   a simple lexicographic comparison for the caution-vs-safe split.
 * - Pre-release / build-metadata suffixes (e.g. "-beta.1", "+build.42") are
 *   stripped before comparison, reducing both sides to a bare MAJOR.MINOR.PATCH
 *   triple. A pre-release of the *same* triple normalises to equal → 'safe'
 *   (user is effectively already on that version). A pre-release of a *higher*
 *   triple normalises to a newer version → 'caution' or 'breaking' as usual.
 * - Malformed input → caution (conservative default, never throws).
 */

export type UpdateLevel = 'safe' | 'caution' | 'breaking';

export interface UpdateCompatVerdict {
  level: UpdateLevel;
  reason: string;
}

/**
 * Strip a leading 'v' and any pre-release / build-metadata suffix.
 * Returns the bare MAJOR.MINOR.PATCH triple, or null when the string is
 * not a recognisable semver-shaped version at all.
 *
 * Examples:
 *   "v1.2.3"        → "1.2.3"
 *   "1.2.0-beta.1"  → "1.2.0"   (suffix stripped)
 *   "garbage"       → null
 */
function normalise(version: string): string | null {
  const stripped = version.replace(/^v/, '');
  // Accept MAJOR or MAJOR.MINOR or MAJOR.MINOR.PATCH (all digits, dots)
  const match = stripped.match(/^(\d+)(?:\.(\d+)(?:\.(\d+))?)?(?:[.-].*)?$/);
  if (!match) return null;
  const major = match[1];
  const minor = match[2] ?? '0';
  const patch = match[3] ?? '0';
  return `${major}.${minor}.${patch}`;
}

/**
 * Parse the major version number from a raw (possibly v-prefixed) version
 * string. Returns null on parse failure.
 */
function parseMajor(version: string): number | null {
  const norm = normalise(version);
  if (!norm) return null;
  const major = parseInt(norm.split('.')[0], 10);
  return isNaN(major) ? null : major;
}

/**
 * Simple numeric-component tuple comparison: [1,2,3] > [1,2,0] → true.
 * Returns a negative number, zero, or a positive number.
 */
function compareNormalised(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Assess compatibility between the currently-installed version and a
 * candidate target version from the GitHub Releases feed.
 *
 * Return values:
 *
 *   'breaking' — target has a higher major version; possible data-format
 *                incompatibility in addition to the forward-migration risk.
 *
 *   'caution'  — target is a newer minor/patch release; the no-rollback
 *                constraint still applies (forward-only DB migrations).
 *
 *   'safe'     — versions are identical; user is already on the latest.
 *
 *   (malformed input always returns 'caution' with a parse-warning note)
 */
export function assessUpdate(current: string, target: string): UpdateCompatVerdict {
  const normCurrent = normalise(current);
  const normTarget = normalise(target);

  // Malformed input — be conservative.
  if (!normCurrent || !normTarget) {
    return {
      level: 'caution',
      reason:
        'Version comparison could not be determined — update with care. ' +
        'Updating will migrate your local database. You cannot roll back afterward.',
    };
  }

  const currentMajor = parseMajor(current);
  const targetMajor = parseMajor(target);

  // Should not happen after normalise() succeeded, but guard anyway.
  if (currentMajor === null || targetMajor === null) {
    return {
      level: 'caution',
      reason:
        'Version comparison could not be determined — update with care. ' +
        'Updating will migrate your local database. You cannot roll back afterward.',
    };
  }

  const cmp = compareNormalised(normTarget, normCurrent);

  if (cmp === 0) {
    // Equal versions — user is already on the latest.
    return {
      level: 'safe',
      reason: 'You are already on the latest version.',
    };
  }

  if (targetMajor > currentMajor) {
    // Breaking: major bump.
    return {
      level: 'breaking',
      reason: `v${target} is a major release and may not be backward-compatible with your local data.`,
    };
  }

  // Caution: same-major, target is newer (or older — unexpected but handled).
  // The no-rollback note is the primary concern for all non-equal updates.
  // Strip a leading 'v' from the version in the reason string so the message
  // reads "cannot roll back to v1.2.3" even when the caller passes "v1.2.3".
  const currentBare = current.replace(/^v/, '');
  return {
    level: 'caution',
    reason: `Updating will migrate your local database. You cannot roll back to v${currentBare} afterward.`,
  };
}
