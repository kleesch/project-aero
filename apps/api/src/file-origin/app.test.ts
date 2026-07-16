import { Readable } from 'node:stream';

import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { documents } from '../db/schema.js';
import { createFileOriginApp } from './app.js';

vi.mock('../db/client.js', () => ({ db: { select: vi.fn() } }));
vi.mock('../services/storage.js', () => ({ getObject: vi.fn() }));

import { db } from '../db/client.js';
import { getObject } from '../services/storage.js';

const selectMock = vi.mocked(db.select);
const getObjectMock = vi.mocked(getObject);

const DOC_ID = '3b241101-e2bb-4255-8caf-4136c566a962';

function stubDocumentQuery(rows: Partial<typeof documents.$inferSelect>[]) {
  selectMock.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  } as unknown as ReturnType<typeof db.select>);
}

const baseDocument = {
  id: DOC_ID,
  uploaderUserId: 42,
  byteSize: 27,
  sha256: 'abc',
  mime: 'application/pdf',
  displayFilename: 'ruling.pdf',
  quarantinedAt: null as Date | null,
  createdAt: new Date(),
};

const pdfBytes = Buffer.from('%PDF-1.7 fake body for test');

beforeEach(() => {
  selectMock.mockReset();
  getObjectMock.mockReset();
});

describe('GET /files/:id', () => {
  it('serves the PDF with the full hostile-content header set', async () => {
    stubDocumentQuery([baseDocument]);
    getObjectMock.mockResolvedValue({
      stream: Readable.from(pdfBytes),
      contentLength: pdfBytes.byteLength,
    });

    const response = await request(createFileOriginApp()).get(`/files/${DOC_ID}`).expect(200);

    expect(response.headers['content-security-policy']).toBe('sandbox');
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe('inline; filename="ruling.pdf"');
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['content-length']).toBe(String(pdfBytes.byteLength));
    expect(response.body).toEqual(pdfBytes);
  });

  it('sanitizes stored filenames before they reach the header', async () => {
    stubDocumentQuery([{ ...baseDocument, displayFilename: 'evil";drop.pdf' }]);
    getObjectMock.mockResolvedValue({ stream: Readable.from(pdfBytes), contentLength: 27 });

    const response = await request(createFileOriginApp()).get(`/files/${DOC_ID}`).expect(200);
    expect(response.headers['content-disposition']).toBe('inline; filename="evil_drop.pdf"');
  });

  it('answers 410 with no-store for quarantined documents, without touching storage', async () => {
    stubDocumentQuery([{ ...baseDocument, quarantinedAt: new Date() }]);

    const response = await request(createFileOriginApp()).get(`/files/${DOC_ID}`).expect(410);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('answers 404 for unknown ids', async () => {
    stubDocumentQuery([]);
    await request(createFileOriginApp()).get(`/files/${DOC_ID}`).expect(404);
  });

  it('answers 404 for non-uuid ids without querying', async () => {
    await request(createFileOriginApp()).get('/files/not-a-uuid').expect(404);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('answers 404 when the object is missing from the bucket', async () => {
    stubDocumentQuery([baseDocument]);
    getObjectMock.mockResolvedValue(null);
    await request(createFileOriginApp()).get(`/files/${DOC_ID}`).expect(404);
  });
});
