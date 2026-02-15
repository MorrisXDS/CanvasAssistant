/**
 * File Mappers - Transform Canvas file/folder API responses to local resource schema
 */

import { z } from 'zod';
import { safeParse } from './courseMappers';
import type { CanvasFile, CanvasFolder, LocalResource } from './DataMapperTypes';

// Validation schemas for defensive parsing
const SafeNumber = z.number().catch(0);
const SafeString = z.string().catch('');
const SafeNullableString = z.string().nullable().catch(null);
const SafeNullableNumber = z.number().nullable().catch(null);

/**
 * Map Canvas file to local resource record
 */
export function mapFile(
  canvas: CanvasFile,
  localCourseId: number,
  localFolderId: number | null = null,
  folderPath: string | null = null,
  contextType: LocalResource['context_type'] = 'files',
  contextId: string | null = null
): Omit<LocalResource, 'local_path'> {
  const fileId = safeParse(SafeNumber, canvas.id, 'file.id');
  const displayName =
    safeParse(SafeString, canvas.display_name, 'file.display_name') || `File_${fileId}`;
  const url = safeParse(SafeNullableString, canvas.url, 'file.url');
  const size = safeParse(SafeNullableNumber, canvas.size, 'file.size');
  const contentType = safeParse(
    SafeNullableString,
    canvas.content_type,
    'file.content_type'
  );
  const unlockAt = safeParse(SafeNullableString, canvas.unlock_at, 'file.unlock_at');
  const modifiedAt = safeParse(
    SafeNullableString,
    canvas.modified_at,
    'file.modified_at'
  );
  const updatedAt = safeParse(SafeNullableString, canvas.updated_at, 'file.updated_at');

  const remoteUpdatedAt = modifiedAt || updatedAt;

  return {
    external_id: String(fileId),
    course_id: localCourseId,
    parent_folder_id: localFolderId,
    folder_path: folderPath,
    type: 'file' as const,
    title: displayName,
    url: url,
    size_bytes: size,
    mime_type: contentType,
    unlock_at: unlockAt,
    remote_updated_at: remoteUpdatedAt,
    context_type: contextType,
    context_id: contextId,
  };
}

/**
 * Map Canvas folder to local resource record
 */
export function mapFolder(
  canvas: CanvasFolder,
  localCourseId: number,
  localParentFolderId: number | null = null
): Omit<LocalResource, 'local_path'> {
  const folderId = safeParse(SafeNumber, canvas.id, 'folder.id');
  const folderName =
    safeParse(SafeString, canvas.name, 'folder.name') || `Folder_${folderId}`;
  const fullName = safeParse(SafeString, canvas.full_name, 'folder.full_name');
  const updatedAt = safeParse(SafeNullableString, canvas.updated_at, 'folder.updated_at');

  let folderPath = fullName || folderName;

  if (folderPath.startsWith('course files/')) {
    folderPath = folderPath.substring('course files/'.length);
  } else if (folderPath === 'course files') {
    folderPath = '';
  }

  return {
    external_id: String(folderId),
    course_id: localCourseId,
    parent_folder_id: localParentFolderId,
    folder_path: folderPath || null,
    type: 'folder' as const,
    title: folderName,
    url: null,
    size_bytes: null,
    mime_type: null,
    unlock_at: null,
    remote_updated_at: updatedAt,
    context_type: 'files' as const,
    context_id: null,
  };
}
