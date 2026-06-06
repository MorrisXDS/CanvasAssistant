/**
 * assessUpdate — unit tests
 *
 * Full branch coverage for the pure compatibility helper.
 * No mocks needed — this is a pure function.
 */

import { assessUpdate } from '../../src/layers/l2-daemon/update/assessUpdate';

describe('assessUpdate', () => {
  // ---- Equal versions ----

  it('returns safe when versions are identical (no leading v)', () => {
    const result = assessUpdate('1.2.3', '1.2.3');
    expect(result.level).toBe('safe');
    expect(result.reason).toBe('You are already on the latest version.');
  });

  it('returns safe when versions are identical with leading v on target', () => {
    const result = assessUpdate('1.2.3', 'v1.2.3');
    expect(result.level).toBe('safe');
  });

  it('returns safe when versions are identical with leading v on both', () => {
    const result = assessUpdate('v1.0.0', 'v1.0.0');
    expect(result.level).toBe('safe');
  });

  // ---- Patch bump → caution ----

  it('returns caution for a patch-level bump', () => {
    const result = assessUpdate('1.2.3', '1.2.4');
    expect(result.level).toBe('caution');
    expect(result.reason).toContain('migrate your local database');
    expect(result.reason).toContain('cannot roll back to v1.2.3');
  });

  it('returns caution for a patch bump with v prefix on both', () => {
    const result = assessUpdate('v1.1.1', 'v1.1.2');
    expect(result.level).toBe('caution');
    // Leading 'v' is stripped from the current version in the reason string.
    expect(result.reason).toContain('cannot roll back to v1.1.1');
  });

  // ---- Minor bump → caution ----

  it('returns caution for a minor-version bump', () => {
    const result = assessUpdate('1.2.3', '1.3.0');
    expect(result.level).toBe('caution');
    expect(result.reason).toContain('migrate your local database');
    expect(result.reason).toContain('cannot roll back to v1.2.3');
  });

  it('returns caution for minor bump with v prefix on target', () => {
    const result = assessUpdate('1.0.0', 'v1.1.0');
    expect(result.level).toBe('caution');
  });

  // ---- Major bump → breaking ----

  it('returns breaking for a major-version bump', () => {
    const result = assessUpdate('1.2.3', '2.0.0');
    expect(result.level).toBe('breaking');
    expect(result.reason).toContain('v2.0.0 is a major release');
    expect(result.reason).toContain('may not be backward-compatible');
  });

  it('returns breaking for a major bump with v prefix', () => {
    const result = assessUpdate('1.0.0', 'v2.0.0');
    expect(result.level).toBe('breaking');
  });

  it('returns breaking for a large major-version jump', () => {
    const result = assessUpdate('1.5.3', '3.0.0');
    expect(result.level).toBe('breaking');
    expect(result.reason).toContain('v3.0.0');
  });

  // ---- Major boundary: same major is NOT breaking ----

  it('does NOT return breaking when major is the same and only minor increases', () => {
    const result = assessUpdate('2.0.0', '2.1.0');
    expect(result.level).toBe('caution');
  });

  // ---- Malformed current version → caution ----

  it('returns caution when current version is malformed', () => {
    const result = assessUpdate('not-a-version', '1.2.3');
    expect(result.level).toBe('caution');
    expect(result.reason).toContain('Version comparison could not be determined');
    expect(result.reason).toContain('update with care');
  });

  // ---- Malformed target version → caution ----

  it('returns caution when target version is malformed', () => {
    const result = assessUpdate('1.2.3', 'garbage');
    expect(result.level).toBe('caution');
    expect(result.reason).toContain('Version comparison could not be determined');
  });

  // ---- Both malformed → caution ----

  it('returns caution when both versions are malformed', () => {
    const result = assessUpdate('abc', 'xyz');
    expect(result.level).toBe('caution');
    expect(result.reason).toContain('Version comparison could not be determined');
  });

  // ---- Leading 'v' is stripped correctly ----

  it('strips leading v from current and target before comparison', () => {
    // v1.2.3 and v1.2.3 → equal → safe
    expect(assessUpdate('v1.2.3', 'v1.2.3').level).toBe('safe');
    // v1.0.0 and v2.0.0 → breaking
    expect(assessUpdate('v1.0.0', 'v2.0.0').level).toBe('breaking');
    // v1.1.0 and v1.2.0 → caution
    expect(assessUpdate('v1.1.0', 'v1.2.0').level).toBe('caution');
  });

  // ---- Pre-release suffix ----

  it('treats a pre-release version (same major) as caution', () => {
    // 1.2.0-beta.1 normalises to 1.2.0 — same as current → safe
    const sameResult = assessUpdate('1.2.0', '1.2.0-beta.1');
    expect(sameResult.level).toBe('safe');
  });

  it('treats a pre-release version with a higher patch as caution', () => {
    const result = assessUpdate('1.2.0', '1.2.1-beta.1');
    expect(result.level).toBe('caution');
  });

  it('treats a pre-release version with a higher major as breaking', () => {
    const result = assessUpdate('1.2.0', '2.0.0-rc.1');
    expect(result.level).toBe('breaking');
  });

  // ---- No-rollback note is always present in caution/breaking reason ----

  it('includes the no-rollback note in caution reason', () => {
    const result = assessUpdate('1.0.0', '1.1.0');
    expect(result.reason).toMatch(/cannot roll back/i);
  });

  // ---- Boundary: major 0 → 1 ----

  it('returns breaking when upgrading from major 0 to major 1', () => {
    const result = assessUpdate('0.9.5', '1.0.0');
    expect(result.level).toBe('breaking');
  });
});
