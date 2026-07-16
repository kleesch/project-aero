import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { requireAuth } from '../middleware/claims.js';
import {
  MAX_PDF_BYTES,
  storePdfDocument,
  toDocumentView,
  validatePdfUpload,
} from '../services/documents.js';
import { loadUserRefs } from '../services/user-refs.js';

/**
 * Document upload (see DESIGN.md — PDF Storage & Safety), mounted at
 * /api/documents. Any authenticated user may upload; feature phases put
 * their own claim gates (bill:submit, court:submit) in front of the flows
 * that reference the resulting document id.
 */
export const documentsRouter = Router();

documentsRouter.use(requireAuth);

// Memory storage: 20 MB cap makes buffering acceptable, and the magic-byte
// check needs the bytes anyway. multer enforces the size limit while
// receiving; validatePdfUpload re-checks it as defense in depth.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

/** Translates multer's size-limit abort into a 413 instead of a 500. */
function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res
        .status(413)
        .json({ error: `File exceeds the ${MAX_PDF_BYTES / (1024 * 1024)} MB limit.` });
      return;
    }
    next(error);
  });
}

documentsRouter.post('/', uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing multipart file field "file".' });
      return;
    }
    const rejection = validatePdfUpload(req.file.buffer, req.file.mimetype);
    if (rejection) {
      res.status(422).json({ error: rejection });
      return;
    }

    const row = await storePdfDocument({
      // requireAuth guarantees req.user.
      uploaderUserId: req.user!.robloxUserId,
      buffer: req.file.buffer,
      originalFilename: req.file.originalname,
      requestIp: req.ip ?? null,
    });
    const refs = await loadUserRefs([row.uploaderUserId]);
    res.status(201).json(toDocumentView(row, refs));
  } catch (error) {
    next(error);
  }
});
