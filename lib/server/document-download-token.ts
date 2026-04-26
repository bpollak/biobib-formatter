import { createHmac, timingSafeEqual } from 'node:crypto';

import { sanitizeUserFileName } from '../blob-paths';

const DOCUMENT_DOWNLOAD_TOKEN_VERSION = 1;
const DOCUMENT_DOWNLOAD_TTL_MS = 30 * 60 * 1000;

type DocumentDownloadTokenPayload = {
  expiresAt: number;
  fileName: string;
  pathname: string;
  purpose: 'document';
  sessionId: string;
  version: number;
};

function getDocumentDownloadSecret(): string {
  const secret = process.env.DOCUMENT_DOWNLOAD_TOKEN_SECRET || process.env.BLOB_READ_WRITE_TOKEN;

  if (!secret) {
    throw new Error('DOCUMENT_DOWNLOAD_TOKEN_SECRET or BLOB_READ_WRITE_TOKEN is required');
  }

  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getDocumentDownloadSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createDocumentDownloadToken(args: {
  fileName: string;
  pathname: string;
  sessionId: string;
}): string {
  const payload: DocumentDownloadTokenPayload = {
    expiresAt: Date.now() + DOCUMENT_DOWNLOAD_TTL_MS,
    fileName: sanitizeUserFileName(args.fileName),
    pathname: args.pathname,
    purpose: 'document',
    sessionId: args.sessionId,
    version: DOCUMENT_DOWNLOAD_TOKEN_VERSION,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyDocumentDownloadToken(token: string): DocumentDownloadTokenPayload {
  const [encodedPayload, signature] = token.split('.');

  if (!encodedPayload || !signature) {
    throw new Error('Invalid document download token');
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid document download token');
  }

  let payload: unknown;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid document download token');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload as DocumentDownloadTokenPayload).version !== DOCUMENT_DOWNLOAD_TOKEN_VERSION ||
    (payload as DocumentDownloadTokenPayload).purpose !== 'document' ||
    typeof (payload as DocumentDownloadTokenPayload).sessionId !== 'string' ||
    typeof (payload as DocumentDownloadTokenPayload).pathname !== 'string' ||
    typeof (payload as DocumentDownloadTokenPayload).fileName !== 'string' ||
    typeof (payload as DocumentDownloadTokenPayload).expiresAt !== 'number'
  ) {
    throw new Error('Invalid document download token');
  }

  if ((payload as DocumentDownloadTokenPayload).expiresAt <= Date.now()) {
    throw new Error('Document download token has expired');
  }

  return payload as DocumentDownloadTokenPayload;
}
