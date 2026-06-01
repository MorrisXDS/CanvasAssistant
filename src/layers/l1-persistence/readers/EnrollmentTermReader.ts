/**
 * EnrollmentTermReader — read surface for the `enrollment_terms` table (per
 * ADR-0007). Backs `data:getEnrollmentTerms`.
 *
 * Not course-scoped, so no visibility composition — terms are global. Stateless;
 * returns raw rows (the handler maps to camelCase DTOs).
 */

import type { Database } from '../Database';

export interface EnrollmentTermRow {
  id: number;
  external_id: string;
  name: string;
  start_at: string | null;
  end_at: string | null;
}

export class EnrollmentTermReader {
  constructor(private readonly db: Database) {}

  /** All enrollment terms, most-recent start date first. */
  getAll(): EnrollmentTermRow[] {
    return this.db.executeRead<EnrollmentTermRow>(
      'SELECT * FROM enrollment_terms ORDER BY start_at DESC'
    );
  }
}
