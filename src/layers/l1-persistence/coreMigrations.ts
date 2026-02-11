import type { Migration } from './MigrationRunner';
import { schemaCoreMigrations } from './migrations/schema-core';
import { migrationsV21toV40 } from './migrations/v21-v40';
import { migrationsV41toV60 } from './migrations/v41-v60';
import { migrationsV61toV80 } from './migrations/v61-v80';
import { migrationsV81toV102 } from './migrations/v81-v102';

/**
 * Core schema migrations for CID
 *
 * Migrations are split into separate files for maintainability:
 * - migrations/schema-core.ts: v1-20 (foundation tables)
 * - migrations/v21-v40.ts: Task workflows, intelligence tables
 * - migrations/v41-v60.ts: Content analysis, grading, sync
 * - migrations/v61-v80.ts: Calendar, policy, export/coordination
 * - migrations/v81-v102.ts: Linking, queue, sync, classification
 */
export const coreMigrations: Migration[] = [
  ...schemaCoreMigrations,
  ...migrationsV21toV40,
  ...migrationsV41toV60,
  ...migrationsV61toV80,
  ...migrationsV81toV102,
];
