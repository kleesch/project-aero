import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { config } from '../config.js';

/**
 * Object storage for user-submitted PDFs (see DESIGN.md — PDF Storage &
 * Safety): Cloudflare R2 in production, MinIO locally, one S3 code path.
 * Object keys are the documents.id uuid — random, never user-derived.
 */
export const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  // Path-style addressing works for both MinIO and R2; virtual-hosted style
  // would need per-bucket DNS locally.
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
});

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    }),
  );
}

export interface StoredObject {
  stream: Readable;
  contentLength: number | undefined;
}

/** Returns null when the object does not exist. */
export async function getObject(key: string): Promise<StoredObject | null> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    if (!(result.Body instanceof Readable)) return null;
    return { stream: result.Body, contentLength: result.ContentLength };
  } catch (error) {
    if ((error as { name?: string }).name === 'NoSuchKey') return null;
    throw error;
  }
}

/** Best-effort cleanup for failed uploads; missing objects are fine. */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}
