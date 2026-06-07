/**
 * externalLinkWarning — pure helpers extracted from useFileDialogs.
 * Coverage for the `skipExternalLinkWarning` setting read/write logic.
 */

import {
  shouldSkipExternalLinkWarning,
  withSkipExternalLinkWarning,
} from '../../../../src/layers/l6-ui/components/Files/externalLinkWarning';

describe('shouldSkipExternalLinkWarning', () => {
  test('null stored value → false (show warning)', () => {
    expect(shouldSkipExternalLinkWarning(null)).toBe(false);
  });

  test('skipExternalLinkWarning:true → true', () => {
    expect(
      shouldSkipExternalLinkWarning(JSON.stringify({ skipExternalLinkWarning: true }))
    ).toBe(true);
  });

  test('skipExternalLinkWarning:false → false', () => {
    expect(
      shouldSkipExternalLinkWarning(JSON.stringify({ skipExternalLinkWarning: false }))
    ).toBe(false);
  });

  test('key absent → false', () => {
    expect(shouldSkipExternalLinkWarning(JSON.stringify({ other: 1 }))).toBe(false);
  });

  test('non-boolean truthy value is NOT treated as true (strict === true)', () => {
    expect(
      shouldSkipExternalLinkWarning(JSON.stringify({ skipExternalLinkWarning: 'yes' }))
    ).toBe(false);
  });

  test('malformed JSON → false (fail-safe)', () => {
    expect(shouldSkipExternalLinkWarning('{not json')).toBe(false);
  });
});

describe('withSkipExternalLinkWarning', () => {
  test('null stored value → fresh object with the flag set', () => {
    expect(JSON.parse(withSkipExternalLinkWarning(null))).toEqual({
      skipExternalLinkWarning: true,
    });
  });

  test('merges the flag onto existing settings, preserving other keys', () => {
    const result = JSON.parse(
      withSkipExternalLinkWarning(
        JSON.stringify({ defaultViewMode: 'grid', downloadLocation: '/x' })
      )
    );
    expect(result).toEqual({
      defaultViewMode: 'grid',
      downloadLocation: '/x',
      skipExternalLinkWarning: true,
    });
  });

  test('malformed JSON → starts from a clean object', () => {
    expect(JSON.parse(withSkipExternalLinkWarning('{broken'))).toEqual({
      skipExternalLinkWarning: true,
    });
  });

  test('round-trips: written value reads back as skip=true', () => {
    const written = withSkipExternalLinkWarning(null);
    expect(shouldSkipExternalLinkWarning(written)).toBe(true);
  });
});
