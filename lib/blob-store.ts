import { normalizeBlobPathname } from './blob-paths';

export type OwnedBlobReference = {
  access: 'public' | 'private';
  pathname: string;
};

function getBlobStoreId(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const [, , , storeId = ''] = token?.split('_') ?? [];

  if (!storeId) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }

  return storeId;
}

function getAllowedBlobHost(access: 'public' | 'private'): string {
  return `${getBlobStoreId().toLowerCase()}.${access}.blob.vercel-storage.com`;
}

function extractOwnedBlobReference(blobUrl: string): OwnedBlobReference {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(blobUrl);
  } catch {
    throw new Error('Invalid uploaded file URL');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const access = hostname === getAllowedBlobHost('private')
    ? 'private'
    : hostname === getAllowedBlobHost('public')
    ? 'public'
    : null;

  if (!access) {
    throw new Error('Only files uploaded through this app may be processed');
  }

  return {
    access,
    pathname: normalizeBlobPathname(decodeURIComponent(parsedUrl.pathname.slice(1))),
  };
}

export function resolveOwnedBlobReference(
  blobPathname: unknown,
  blobUrl: unknown
): OwnedBlobReference {
  if (typeof blobPathname === 'string') {
    return {
      access: 'private',
      pathname: normalizeBlobPathname(blobPathname),
    };
  }

  if (typeof blobUrl === 'string') {
    return extractOwnedBlobReference(blobUrl);
  }

  throw new Error('No uploaded file reference provided');
}

export function assertUploadedDocumentPathname(pathname: string): void {
  if (!pathname.startsWith('uploads/')) {
    throw new Error('Only files uploaded through this app may be processed');
  }
}

export function assertCorrectedDocumentPathname(pathname: string): void {
  if (!pathname.startsWith('corrected/')) {
    throw new Error('Invalid corrected document path');
  }
}
