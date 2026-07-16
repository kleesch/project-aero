import { eq } from 'drizzle-orm';
import express from 'express';

import { db } from '../db/client.js';
import { documents } from '../db/schema.js';
import { requestLogger } from '../middleware/request-logger.js';
import { sanitizePdfFilename } from '../services/documents.js';
import { getObject } from '../services/storage.js';

/**
 * The separate-origin PDF proxy (see DESIGN.md — PDF Storage & Safety).
 * Deliberately loads no cookie or session code: PDFs are hostile by default,
 * and a script running in a viewer context on this origin must find nothing
 * — no credentials, no app DOM — worth stealing. Bound to its own
 * port/hostname; the isolation only works if browsers see a different origin
 * than the app.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createFileOriginApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/files/:id', async (req, res, next) => {
    try {
      const id = req.params.id ?? '';
      if (!UUID_PATTERN.test(id)) {
        res.status(404).json({ error: 'Not found.' });
        return;
      }

      const [document] = await db.select().from(documents).where(eq(documents.id, id));
      if (!document) {
        res.status(404).json({ error: 'Not found.' });
        return;
      }
      if (document.quarantinedAt) {
        // Takedowns must bite on the very next request — never cache the 410.
        res.setHeader('Cache-Control', 'no-store');
        res.status(410).json({ error: 'This document has been removed.' });
        return;
      }

      const object = await getObject(document.id);
      if (!object) {
        res.status(404).json({ error: 'Not found.' });
        return;
      }

      // The full hostile-PDF header set — every response, no exceptions:
      // sandboxed viewer context, no sniffing, inline rendering with a
      // sanitized name, and immutable caching (content never changes for a
      // given id; revisions are new documents).
      res.setHeader('Content-Security-Policy', 'sandbox');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${sanitizePdfFilename(document.displayFilename)}"`,
      );
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Length', String(object.contentLength ?? document.byteSize));

      object.stream.on('error', (error) => {
        req.log?.error({ documentId: id, error }, 'object stream failed mid-response');
        res.destroy(error);
      });
      object.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return app;
}
