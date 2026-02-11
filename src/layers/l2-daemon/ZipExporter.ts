/**
 * ZIP Exporter
 * Handles ZIP archive creation for exports
 */

import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import type { CryptoManager } from '../l0-utilities/CryptoManager';
import type { CourseRow } from '../l1-persistence';
import type {
  ExportResult,
  ExportManifest,
  SelectiveExportOptions,
} from './ExportManagerTypes';

export interface ZipExporterDeps {
  cryptoManager: CryptoManager;
  filesDir: string;
  appVersion: string;
  emitProgress: (stage: string, progress: number, message: string) => void;
  log: { info: (msg: string) => void; error: (msg: string, err?: Error) => void };
}

/**
 * Create ZIP archive with export data and optional files
 */
export async function createZipArchive(
  deps: ZipExporterDeps,
  outputPath: string,
  exportData: Record<string, unknown>,
  options: SelectiveExportOptions
): Promise<ExportResult> {
  return new Promise((resolve) => {
    try {
      deps.emitProgress('compressing', 50, 'Creating ZIP archive...');

      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      let filesExported = 0;

      output.on('close', () => {
        deps.emitProgress('complete', 100, 'Export complete');
        deps.log.info(`ZIP archive created: ${outputPath} (${archive.pointer()} bytes)`);

        resolve({
          success: true,
          filePath: outputPath,
          fileSize: archive.pointer(),
          coursesExported: (exportData.courses as unknown[])?.length || 0,
          tasksExported: (exportData.tasks as unknown[])?.length || 0,
          filesExported,
        });
      });

      archive.on('error', (err: Error) => {
        deps.log.error('Archive error', err);
        resolve({ success: false, error: err.message });
      });

      archive.pipe(output);

      // Create manifest
      const syncMeta = exportData.syncMetadata as
        | { preferences?: unknown[]; pendingConflicts?: unknown[] }
        | undefined;

      const manifest: ExportManifest = {
        version: '2.1',
        exportedAt: new Date().toISOString(),
        appVersion: deps.appVersion,
        format: 'zip',
        encrypted: !!options.encrypt,
        contents: {
          courses: (exportData.courses as unknown[])?.length || 0,
          tasks: (exportData.tasks as unknown[])?.length || 0,
          notifications: (exportData.notifications as unknown[])?.length || 0,
          files: 0,
          pages: (exportData.pages as unknown[])?.length || 0,
          policies: (exportData.policies as unknown[])?.length || 0,
          modules: (exportData.modules as unknown[])?.length || 0,
          resources: (exportData.resources as unknown[])?.length || 0,
          syncPreferences: syncMeta?.preferences?.length || 0,
          pendingConflicts: syncMeta?.pendingConflicts?.length || 0,
        },
        checksums: {},
      };

      // Add data files
      let dataContent = JSON.stringify(exportData, null, 2);

      if (options.encrypt && options.password) {
        const encrypted = deps.cryptoManager.encrypt(dataContent, options.password);
        if (encrypted) {
          dataContent = JSON.stringify(encrypted);
          archive.append(dataContent, { name: 'data/export.encrypted.json' });
        }
      } else {
        archive.append(dataContent, { name: 'data/export.json' });
      }

      // Add manifest (always unencrypted)
      manifest.checksums!['data'] = deps.cryptoManager.computeHash(dataContent);

      // Include actual files if requested
      if (options.includeFiles && deps.filesDir) {
        deps.emitProgress('compressing', 60, 'Adding files to archive...');

        const courses = exportData.courses as CourseRow[];
        for (const course of courses) {
          const courseDir = path.join(deps.filesDir, course.code);
          if (fs.existsSync(courseDir)) {
            archive.directory(courseDir, `files/${course.code}`);
            filesExported += countFilesInDirectory(courseDir);
          }
        }
        manifest.contents.files = filesExported;
      }

      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.finalize();
    } catch (error) {
      deps.log.error(
        'Failed to create ZIP archive',
        error instanceof Error ? error : undefined
      );
      resolve({ success: false, error: String(error) });
    }
  });
}

/**
 * Count files recursively in a directory
 */
function countFilesInDirectory(dir: string): number {
  let count = 0;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    if (fs.statSync(itemPath).isDirectory()) {
      count += countFilesInDirectory(itemPath);
    } else {
      count++;
    }
  }
  return count;
}
