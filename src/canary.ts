/**
 * Deliberate canary for verifying that PR-Gate-1's diff-coverage check
 * fails CI on uncovered src/ additions. This PR will be CLOSED without
 * merge after CI demonstrates the gate works. The file will be removed.
 *
 * Three branches, all untested — the gate should report 4+ uncovered lines.
 */
export function diffCoverageCanary(input: string): string {
  if (input === 'a') return 'A';
  if (input === 'b') return 'B';
  return 'OTHER';
}
