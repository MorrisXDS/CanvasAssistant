/**
 * Update sub-package barrel.
 * Re-exports the public API for the update channel feature (ADR-0012).
 */

export { assessUpdate } from './assessUpdate';
export type { UpdateLevel, UpdateCompatVerdict } from './assessUpdate';
export { UpdateChecker } from './UpdateChecker';
export type { UpdateCheckerConfig } from './UpdateChecker';
