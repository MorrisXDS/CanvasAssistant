/**
 * UpsertHtmlExportCommand - Insert-or-update a row in `html_exports`,
 * keyed by (course_id, source_type, source_id), stamping exported_at.
 *
 * Per ADR-0007 this is the write path the HTML-export IPC handlers route
 * through after writing the file to disk.
 */

import {
  Command,
  CommandContext,
  CommandResult,
  UpsertHtmlExportParams,
} from '../../types';

export class UpsertHtmlExportCommand implements Command<UpsertHtmlExportParams, void> {
  readonly name = 'UpsertHtmlExport';

  async execute(
    context: CommandContext,
    params: UpsertHtmlExportParams
  ): Promise<CommandResult<void>> {
    try {
      context.db.executeWrite(
        `INSERT INTO html_exports (course_id, source_type, source_id, title, content_hash, local_path, exported_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(course_id, source_type, source_id) DO UPDATE SET
           title = excluded.title,
           content_hash = excluded.content_hash,
           local_path = excluded.local_path,
           exported_at = CURRENT_TIMESTAMP`,
        [
          params.courseId,
          params.sourceType,
          params.sourceId,
          params.title,
          params.contentHash,
          params.localPath,
        ],
        'html_exports'
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to record HTML export: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
