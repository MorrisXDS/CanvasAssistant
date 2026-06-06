/**
 * L0 Utilities - Token Validity Classifier (ADR-0013)
 *
 * Pure, dependency-light classification of a single Canvas `/users/self` probe
 * outcome into a tri-state verdict. This is the load-bearing core of the
 * "offline never invalidates a good token" guarantee:
 *
 *   - `valid`   — the token is definitively good (2xx response).
 *   - `invalid` — the token is definitively bad (401/403 — revoked / no access).
 *   - `unknown` — we could not determine validity (offline, timeout, 5xx, 429,
 *                 404, redirects, plain errors). MUST NOT invalidate a stored
 *                 token; the user may simply be offline.
 *
 * No I/O, no Electron, no DB — lives in L0 next to `CredentialManager` because
 * it is credential-domain logic and must be trivially unit-testable.
 *
 * Mirrors the 401/403-vs-network split that `CredentialManager.isRetryableError`
 * already uses for retry control, but adds the third (`unknown`) bucket and
 * produces the *verdict* rather than a retry decision.
 */

import { AxiosError } from 'axios';

export type TokenValidity = 'valid' | 'invalid' | 'unknown';

export type ValidationInput =
  | { kind: 'status'; status: number } // got an HTTP response
  | { kind: 'error'; error: unknown }; // axios threw (network/timeout/etc.)

/**
 * Map an HTTP status code to a tri-state validity verdict.
 *   2xx                 -> 'valid'
 *   401 | 403           -> 'invalid'  (definitive: revoked / no access)
 *   anything else       -> 'unknown'  (don't invalidate a good token)
 */
function classifyStatus(status: number): TokenValidity {
  if (status >= 200 && status < 300) return 'valid';
  if (status === 401 || status === 403) return 'invalid';
  return 'unknown';
}

/**
 * Pure classification of one Canvas `/users/self` probe outcome. No I/O.
 *
 * @param input Either the HTTP status we observed, or the error axios threw.
 * @returns The tri-state token validity verdict.
 */
export function classifyValidationResult(input: ValidationInput): TokenValidity {
  if (input.kind === 'status') {
    return classifyStatus(input.status);
  }

  // error path: only an AxiosError carrying an actual response with 401/403 is
  // a definitive token problem. Everything else (no response = offline/DNS,
  // timeout, 5xx, 429, plain Error, non-Error throwables) is `unknown`.
  const { error } = input;
  if (error instanceof AxiosError && error.response) {
    return classifyStatus(error.response.status);
  }
  return 'unknown';
}
