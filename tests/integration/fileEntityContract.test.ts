/**
 * Contract tests for the FileEntity Zod schema (ADR-0008 PR-F.1).
 *
 * FileEntity unifies the two physical file-row sources (`resources` and
 * `notification_attachments`) under one Canvas-ID-keyed shape. The
 * provider that produces these (PR-F.2) lives downstream; this PR ships
 * only the contract. The tests here lock the shape invariants:
 *
 *   - canvasFile-only presence parses
 *   - attachment-only presence parses
 *   - both-presences parses
 *   - no presence fails the refinement
 */

import { FileEntitySchema } from '../../src/shared/ipc-contract';

describe('FileEntity contract (ADR-0008)', () => {
  const baseFields = {
    canvasId: '41498323',
    uuid: 'abc-uuid',
    filename: 'lab1.pdf',
    displayName: 'ECE568 - Lab 1 (2026).pdf',
    sizeBytes: 229564,
    contentType: 'application/pdf',
    courseId: 27770,
  };

  const canvasFilePresence = {
    resourceRowId: 101,
    contextType: 'files',
    folderPath: 'course files/labs',
    localPath: null,
    remoteUpdatedAt: '2026-01-15T10:00:00Z',
  };

  const attachmentPresence = {
    attachmentRowId: 55,
    notificationId: 901,
    downloadStatus: 'completed',
    localPath: '/Downloads/lab1.pdf',
    downloadedAt: '2026-01-15T10:05:00Z',
  };

  it('parses an entity with canvasFile presence only', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      presences: { canvasFile: canvasFilePresence, attachments: [] },
    });
    expect(result.success).toBe(true);
  });

  it('parses an entity with attachment presence only', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      presences: { canvasFile: null, attachments: [attachmentPresence] },
    });
    expect(result.success).toBe(true);
  });

  it('parses an entity with both canvasFile and attachment presences', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      presences: {
        canvasFile: canvasFilePresence,
        attachments: [attachmentPresence],
      },
    });
    expect(result.success).toBe(true);
  });

  it('parses an entity with multiple attachment presences (one blob, many announcements)', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      presences: {
        canvasFile: null,
        attachments: [
          attachmentPresence,
          { ...attachmentPresence, attachmentRowId: 56, notificationId: 902 },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an entity with no presences (refinement failure)', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      presences: { canvasFile: null, attachments: [] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'FileEntity must have at least one presence'
      );
    }
  });

  it('rejects an invalid downloadStatus in an attachment presence', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      presences: {
        canvasFile: null,
        attachments: [{ ...attachmentPresence, downloadStatus: 'invalid' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('preserves nullable canonical fields (sizeBytes, contentType, uuid)', () => {
    const result = FileEntitySchema.safeParse({
      ...baseFields,
      uuid: null,
      sizeBytes: null,
      contentType: null,
      presences: { canvasFile: canvasFilePresence, attachments: [] },
    });
    expect(result.success).toBe(true);
  });
});
