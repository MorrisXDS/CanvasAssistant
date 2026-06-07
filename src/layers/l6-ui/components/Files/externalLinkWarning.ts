/**
 * externalLinkWarning — pure helpers for the "skip external-link warning" setting.
 *
 * Extracted from `useFileDialogs` so the read/write branch of the
 * `fileExplorerSettings.skipExternalLinkWarning` flag is unit-testable without
 * a React render or a `window.api` stub. The hook delegates the JSON parsing /
 * serialization to these functions and keeps only the side-effecting
 * `localStorage` + `api.openExternal` glue.
 */

/**
 * Decide whether the external-link warning dialog should be skipped, given the
 * raw JSON string stored under `STORAGE_KEYS.FILE_EXPLORER`.
 *
 * Returns true ONLY when the parsed settings object has
 * `skipExternalLinkWarning === true`. Missing key, malformed JSON, or a
 * non-boolean value all fall back to false (show the warning) — matching the
 * fail-safe behavior of the original inline logic.
 */
export function shouldSkipExternalLinkWarning(
  storedSettingsJson: string | null
): boolean {
  if (!storedSettingsJson) return false;
  try {
    const settings = JSON.parse(storedSettingsJson) as {
      skipExternalLinkWarning?: unknown;
    };
    return settings.skipExternalLinkWarning === true;
  } catch {
    return false;
  }
}

/**
 * Produce the JSON string to persist when the user opts to skip the warning in
 * future ("don't show again"). Merges `skipExternalLinkWarning: true` onto the
 * existing settings object (or an empty object if none/malformed).
 */
export function withSkipExternalLinkWarning(storedSettingsJson: string | null): string {
  let settings: Record<string, unknown> = {};
  if (storedSettingsJson) {
    try {
      const parsed = JSON.parse(storedSettingsJson);
      if (parsed && typeof parsed === 'object') {
        settings = parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed stored value — start from a clean object.
    }
  }
  settings.skipExternalLinkWarning = true;
  return JSON.stringify(settings);
}
