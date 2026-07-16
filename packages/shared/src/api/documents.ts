import type { UserRef } from '../users.js';

/**
 * Response shapes for the document API (see DESIGN.md — PDF Storage &
 * Safety). Same contract rules as the other APIs: ISO timestamps, people as
 * `UserRef`s.
 */
export interface DocumentView {
  /** Uuid; also the object key in the bucket. */
  id: string;
  uploader: UserRef;
  byteSize: number;
  sha256: string;
  mime: string;
  displayFilename: string;
  quarantinedAt: string | null;
  createdAt: string;
  /** Separate-origin URL the browser loads the PDF from (410 once quarantined). */
  fileUrl: string;
}
