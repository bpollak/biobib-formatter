/**
 * In-memory blob store for generated BioBib documents.
 * Entries expire after 30 minutes — stateless, no persistence.
 */

import { ConversionResult } from './types';

interface BlobEntry {
  document: Buffer;
  fileName: string;
  result: ConversionResult;
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutes

class BlobStore {
  private store = new Map<string, BlobEntry>();

  set(sessionId: string, data: Omit<BlobEntry, 'expiresAt'>): void {
    this.store.set(sessionId, { ...data, expiresAt: Date.now() + TTL_MS });
    this.gc();
  }

  get(sessionId: string): BlobEntry | undefined {
    const entry = this.store.get(sessionId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(sessionId);
      return undefined;
    }
    return entry;
  }

  private gc(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

// Singleton — survives across requests in the same Next.js server process
export const blobStore = new BlobStore();
