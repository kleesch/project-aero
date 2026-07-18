import { createHash, randomUUID } from 'node:crypto';

import { AUDIT_ACTIONS, AUDIT_ENTITIES, type DocumentView } from '@aero/shared';
import { eq } from 'drizzle-orm';

import { config } from '../config.js';
import { db } from '../db/client.js';
import { documents } from '../db/schema.js';
import { logger } from '../logger.js';
import { audit, toSnapshot } from './audit.js';
import { deleteObject, putObject } from './storage.js';
import type { UserRefLookup } from './user-refs.js';

/**
 * Upload pipeline for user-submitted PDFs (see DESIGN.md — PDF Storage &
 * Safety). Validation here is a sanity gate, not a malware scan — the real
 * defense is serving-side isolation on the separate file origin.
 */

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

export const PDF_MIME = 'application/pdf';

/** Every stored PDF begins with these magic bytes. */
const PDF_MAGIC = Buffer.from('%PDF-');

/** Returns a user-facing rejection message, or null when the upload is acceptable. */
export function validatePdfUpload(buffer: Buffer, mimetype: string): string | null {
  if (mimetype !== PDF_MIME) {
    return `Unsupported content type "${mimetype}"; only ${PDF_MIME} is accepted.`;
  }
  if (buffer.byteLength > MAX_PDF_BYTES) {
    return `File exceeds the ${MAX_PDF_BYTES / (1024 * 1024)} MB limit.`;
  }
  if (buffer.byteLength < PDF_MAGIC.byteLength || !buffer.subarray(0, 5).equals(PDF_MAGIC)) {
    return 'File is not a PDF (missing %PDF- signature).';
  }
  return null;
}

/**
 * Reduces a user-supplied filename to display-safe metadata: basename only,
 * conservative character set, bounded length, always ending in `.pdf`. The
 * result is safe to echo in a Content-Disposition header.
 */
export function sanitizePdfFilename(original: string): string {
  const basename = original.split(/[\\/]/).pop() ?? '';
  const stem = basename
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9._ ()-]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[ .]+|[ .]+$/g, '')
    .slice(0, 120);
  return `${stem || 'document'}.pdf`;
}

export interface StorePdfInput {
  uploaderUserId: number;
  buffer: Buffer;
  originalFilename: string;
  requestIp: string | null;
}

/**
 * Stores a validated PDF: object first (random uuid key), then the documents
 * row and its audit event in one transaction. A failed transaction leaves at
 * worst an unreferenced object, which is deleted best-effort.
 */
export async function storePdfDocument(
  input: StorePdfInput,
): Promise<typeof documents.$inferSelect> {
  const id = randomUUID();
  const sha256 = createHash('sha256').update(input.buffer).digest('hex');

  await putObject(id, input.buffer, PDF_MIME);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          id,
          uploaderUserId: input.uploaderUserId,
          byteSize: input.buffer.byteLength,
          sha256,
          mime: PDF_MIME,
          displayFilename: sanitizePdfFilename(input.originalFilename),
        })
        .returning();
      if (!row) throw new Error('Document insert returned no row.');
      await audit(tx, {
        actorUserId: input.uploaderUserId,
        actionKey: AUDIT_ACTIONS.DOCUMENT_UPLOAD,
        entityType: AUDIT_ENTITIES.DOCUMENT,
        entityId: row.id,
        after: toSnapshot(row),
        requestIp: input.requestIp,
      });
      return row;
    });
  } catch (error) {
    // The object is unreferenced without its row; clean it up best-effort.
    await deleteObject(id).catch((cleanupError: unknown) => {
      logger.warn({ documentId: id, error: cleanupError }, 'orphaned object cleanup failed');
    });
    throw error;
  }
}

/**
 * Guards attaching a document to a record (bill version, judgment, appeal
 * verdict) against ids that don't exist, PDFs someone else uploaded, or
 * quarantined files. Returns a user-facing rejection message, or null.
 */
export async function validateAttachableDocument(
  documentId: string,
  actorUserId: number,
): Promise<string | null> {
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!document) return 'Unknown document id; upload the PDF first.';
  if (document.uploaderUserId !== actorUserId) {
    return 'The referenced document was uploaded by someone else.';
  }
  if (document.quarantinedAt !== null) return 'The referenced document is quarantined.';
  return null;
}

/** Separate-origin URL the browser loads a document from. */
export function documentFileUrl(id: string): string {
  return new URL(`/files/${id}`, config.FILE_ORIGIN_BASE_URL).toString();
}

export function toDocumentView(
  row: typeof documents.$inferSelect,
  refs: UserRefLookup,
): DocumentView {
  return {
    id: row.id,
    uploader: refs(row.uploaderUserId),
    byteSize: row.byteSize,
    sha256: row.sha256,
    mime: row.mime,
    displayFilename: row.displayFilename,
    quarantinedAt: row.quarantinedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    fileUrl: documentFileUrl(row.id),
  };
}
