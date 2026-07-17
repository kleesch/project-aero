import { describe, expect, it, vi } from 'vitest';

import { MAX_PDF_BYTES, sanitizePdfFilename, validatePdfUpload } from './documents.js';

vi.mock('../db/client.js', () => ({ db: {} }));
vi.mock('./storage.js', () => ({ putObject: vi.fn(), deleteObject: vi.fn() }));

const pdfBytes = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj');

describe('validatePdfUpload', () => {
  it('accepts a real PDF', () => {
    expect(validatePdfUpload(pdfBytes, 'application/pdf')).toBeNull();
  });

  it('rejects a wrong content type even with valid magic bytes', () => {
    expect(validatePdfUpload(pdfBytes, 'application/octet-stream')).toMatch(/content type/i);
  });

  it('rejects non-PDF magic bytes', () => {
    const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');
    expect(validatePdfUpload(html, 'application/pdf')).toMatch(/%PDF-/);
  });

  it('rejects files over the 20 MB cap', () => {
    const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_BYTES)]);
    expect(validatePdfUpload(oversized, 'application/pdf')).toMatch(/20 MB/);
  });

  it('rejects an empty file', () => {
    expect(validatePdfUpload(Buffer.alloc(0), 'application/pdf')).toMatch(/%PDF-/);
  });
});

describe('sanitizePdfFilename', () => {
  it('keeps a plain name, normalizing the extension', () => {
    expect(sanitizePdfFilename('Judgment 2026-07 (final).PDF')).toBe(
      'Judgment 2026-07 (final).pdf',
    );
  });

  it('strips directories and header-hostile characters', () => {
    expect(sanitizePdfFilename('../../etc/passwd')).toBe('passwd.pdf');
    expect(sanitizePdfFilename('a"b;c\r\nd.pdf')).toBe('a_b_c_d.pdf');
  });

  it('falls back to document.pdf when nothing survives', () => {
    expect(sanitizePdfFilename('')).toBe('document.pdf');
    expect(sanitizePdfFilename('....')).toBe('document.pdf');
  });

  it('bounds the length', () => {
    expect(sanitizePdfFilename(`${'x'.repeat(500)}.pdf`).length).toBeLessThanOrEqual(124);
  });
});
