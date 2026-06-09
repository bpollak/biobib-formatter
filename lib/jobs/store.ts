/**
 * Vercel Blob–backed job state store.
 *
 * All keys live under `jobs/<jobId>/`. Append-only: no key is ever
 * overwritten. Status is derived by listing the prefix instead of by
 * mutating a single status doc — this sidesteps Blob's lack of atomic
 * ops without needing a separate KV store.
 */

import { put, head, list, get, del, BlobNotFoundError } from '@vercel/blob';
import { ConversionResult, RichTextParagraph } from '../types';
import { SLICE_KEYS, SliceKey } from '../pipeline/slices';
import { PartialResult } from '../pipeline/converter';

// ── Path helpers ─────────────────────────────────────────────────────────────

const root = (jobId: string) => `jobs/${jobId}`;
const path = {
  manifest: (j: string) => `${root(j)}/manifest.json`,
  cv: (j: string) => `${root(j)}/cv.txt`,
  cvRich: (j: string) => `${root(j)}/cv-rich.json`,
  sliceResult: (j: string, k: SliceKey) => `${root(j)}/slice-${k}.json`,
  sliceError: (j: string, k: SliceKey) => `${root(j)}/slice-${k}.error`,
  lock: (j: string) => `${root(j)}/finalize.lock`,
  result: (j: string) => `${root(j)}/result.json`,
  docx: (j: string) => `${root(j)}/biobib.docx`,
  status: (j: string) => `${root(j)}/status.json`,
};

const PUT_OPTS = { access: 'public' as const, addRandomSuffix: false, allowOverwrite: false };

// ── Manifest + CV text ───────────────────────────────────────────────────────

export interface JobManifest {
  fileName: string;
  sliceKeys: SliceKey[];
  createdAt: number;
  sourceBlobUrl: string;
  aiModel?: string;
  /** Earliest year to include for Section II activities; absent = all years. */
  sinceYear?: number;
}

export async function writeManifest(jobId: string, manifest: JobManifest): Promise<void> {
  await put(path.manifest(jobId), JSON.stringify(manifest), PUT_OPTS);
}

export async function readManifest(jobId: string): Promise<JobManifest | null> {
  return readJson<JobManifest>(path.manifest(jobId));
}

export async function writeCvText(jobId: string, text: string): Promise<void> {
  await put(path.cv(jobId), text, { ...PUT_OPTS, contentType: 'text/plain; charset=utf-8' });
}

export async function readCvText(jobId: string): Promise<string> {
  const result = await get(path.cv(jobId), { access: 'public' });
  if (!result || result.statusCode !== 200) {
    throw new Error(`Could not read cv.txt for job ${jobId}`);
  }
  return new Response(result.stream).text();
}

export async function writeCvRichText(jobId: string, paragraphs: RichTextParagraph[]): Promise<void> {
  await put(path.cvRich(jobId), JSON.stringify(paragraphs), {
    ...PUT_OPTS,
    contentType: 'application/json; charset=utf-8',
  });
}

export async function readCvRichText(jobId: string): Promise<RichTextParagraph[]> {
  try {
    return (await readJson<RichTextParagraph[]>(path.cvRich(jobId))) ?? [];
  } catch (e) {
    if (e instanceof BlobNotFoundError || (e as Error).message.includes('status 404')) return [];
    throw e;
  }
}

// ── Per-slice results ────────────────────────────────────────────────────────

export interface SliceErrorPayload {
  message: string;
  finishReason?: string;
}

export async function writeSliceResult(jobId: string, key: SliceKey, result: PartialResult): Promise<void> {
  await put(path.sliceResult(jobId, key), JSON.stringify(result), PUT_OPTS);
}

export async function writeSliceError(jobId: string, key: SliceKey, err: SliceErrorPayload): Promise<void> {
  await put(path.sliceError(jobId, key), JSON.stringify(err), PUT_OPTS);
}

export async function readSliceResult(jobId: string, key: SliceKey): Promise<PartialResult | null> {
  return readJson<PartialResult>(path.sliceResult(jobId, key));
}

export async function readSliceError(jobId: string, key: SliceKey): Promise<SliceErrorPayload | null> {
  return readJson<SliceErrorPayload>(path.sliceError(jobId, key));
}

export async function sliceAlreadyHandled(jobId: string, key: SliceKey): Promise<boolean> {
  const [okResult, okError] = await Promise.all([
    headExists(path.sliceResult(jobId, key)),
    headExists(path.sliceError(jobId, key)),
  ]);
  return okResult || okError;
}

// ── Finalize lock + final outputs ────────────────────────────────────────────

/**
 * Returns true if this caller acquired the lock; false if another caller already has it.
 * A lock left behind by a crashed/timed-out finalize (older than FINALIZE_TIMEOUT_MS)
 * is treated as stale and stolen, so the status route's fallback kick can retry the
 * merge instead of the job being permanently stuck.
 */
export async function tryAcquireFinalizeLock(jobId: string): Promise<boolean> {
  try {
    await put(path.lock(jobId), String(Date.now()), PUT_OPTS);
    return true;
  } catch {
    // allowOverwrite:false throws if the blob already exists — that's our "lock held".
    const ageMs = await readFinalizeLockAgeMs(jobId);
    if (ageMs !== null && ageMs > FINALIZE_TIMEOUT_MS) {
      try {
        await put(path.lock(jobId), String(Date.now()), { ...PUT_OPTS, allowOverwrite: true });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/** Age of the finalize lock in ms, or null if absent/unreadable. */
async function readFinalizeLockAgeMs(jobId: string): Promise<number | null> {
  try {
    // The lock body is a bare epoch-ms number, which readJson parses fine.
    const acquiredAt = await readJson<number>(path.lock(jobId));
    if (typeof acquiredAt !== 'number' || !Number.isFinite(acquiredAt)) return null;
    return Date.now() - acquiredAt;
  } catch {
    return null;
  }
}

// Final outputs allow overwrite: they are single-writer under the finalize
// lock, and a stale-lock retry must be able to redo a partially-crashed
// finalize (status.json is written last and is the terminal marker).
const FINAL_PUT_OPTS = { ...PUT_OPTS, allowOverwrite: true };

export async function writeFinalResult(jobId: string, result: ConversionResult): Promise<void> {
  await put(path.result(jobId), JSON.stringify(result), FINAL_PUT_OPTS);
}

export async function writeFinalDocx(jobId: string, buffer: Buffer): Promise<void> {
  await put(path.docx(jobId), buffer, {
    ...FINAL_PUT_OPTS,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export interface FinalStatus {
  state: 'complete' | 'failed' | 'failed_partial';
  error?: string;
  completedAt: number;
}

export async function writeFinalStatus(jobId: string, status: FinalStatus): Promise<void> {
  await put(path.status(jobId), JSON.stringify(status), FINAL_PUT_OPTS);
}

/**
 * Returns a readable stream of the final BioBib docx, or null if not yet generated.
 * Uses get() so the request is authenticated against the Blob store; the public
 * CDN URL is not accessible under Deployment Protection.
 */
export async function getFinalDocxStream(jobId: string): Promise<ReadableStream<Uint8Array> | null> {
  const result = await get(path.docx(jobId), { access: 'public' });
  if (!result || result.statusCode !== 200) return null;
  return result.stream;
}

export async function readFinalResult(jobId: string): Promise<ConversionResult | null> {
  return readJson<ConversionResult>(path.result(jobId));
}

export async function readFinalStatus(jobId: string): Promise<FinalStatus | null> {
  return readJson<FinalStatus>(path.status(jobId));
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export async function deleteJob(jobId: string): Promise<void> {
  const { blobs } = await list({ prefix: `${root(jobId)}/` });
  if (blobs.length === 0) return;
  await del(blobs.map(b => b.url)).catch(() => {});
}

/**
 * Deletes the parsed CV source data (cv.txt, cv-rich.json) once the job has a
 * terminal status. Nothing reads these after finalize writes status.json
 * (duplicate finalize triggers are absorbed by the existing-result check),
 * and they hold the most sensitive personal data in the job folder.
 */
export async function deleteCvSourceData(jobId: string): Promise<void> {
  const { blobs } = await list({ prefix: `${root(jobId)}/cv` });
  if (blobs.length === 0) return;
  await del(blobs.map(b => b.url)).catch(() => {});
}

// ── Status derivation ────────────────────────────────────────────────────────

export type SliceState = 'pending' | 'done' | 'failed';

export interface JobStatus {
  state: 'pending' | 'merging' | 'complete' | 'failed' | 'failed_partial';
  slices: Record<SliceKey, SliceState>;
  result?: ConversionResult;
  error?: string;
  startedAt: number;
  aiModel?: string;
  /**
   * True when every slice has written a terminal outcome (result or error)
   * but no finalize has started. The status route uses this to fire a
   * fallback /api/finalize dispatch — protects against the rare case where
   * the last-slice's in-process trigger missed.
   */
  needsFinalizeKick?: boolean;
}

const SLICE_TIMEOUT_MS = 620_000; // maxDuration of slice + 20s cushion
const FINALIZE_TIMEOUT_MS = 90_000;
const FINAL_RESULT_PROPAGATION_MS = 90_000;

export async function computeStatus(jobId: string): Promise<JobStatus | null> {
  const manifest = await readManifest(jobId);
  if (!manifest) return null;

  const slices: Record<SliceKey, SliceState> = SLICE_KEYS.reduce((acc, k) => {
    acc[k] = 'pending';
    return acc;
  }, {} as Record<SliceKey, SliceState>);

  // Strongly-consistent per-key probe sidesteps any list() edge eventual consistency.
  await Promise.all(
    manifest.sliceKeys.map(async k => {
      const [hasResult, hasError] = await Promise.all([
        headExists(path.sliceResult(jobId, k)),
        headExists(path.sliceError(jobId, k)),
      ]);
      if (hasResult) slices[k] = 'done';
      else if (hasError) slices[k] = 'failed';
    }),
  );

  const finalStatus = await readFinalStatus(jobId);
  if (finalStatus) {
    const result = (await readFinalResult(jobId)) ?? undefined;
    if ((finalStatus.state === 'complete' || finalStatus.state === 'failed_partial') && !result) {
      if (Date.now() - finalStatus.completedAt < FINAL_RESULT_PROPAGATION_MS) {
        return {
          state: 'merging',
          slices,
          startedAt: manifest.createdAt,
          aiModel: manifest.aiModel,
        };
      }
      return {
        state: 'failed',
        slices,
        error: 'Finalize completed but the generated result is not available. Please try again.',
        startedAt: manifest.createdAt,
        aiModel: manifest.aiModel,
      };
    }
    return {
      state: finalStatus.state,
      slices,
      result,
      error: finalStatus.error,
      startedAt: manifest.createdAt,
      aiModel: manifest.aiModel,
    };
  }

  const lockExists = await headExists(path.lock(jobId));
  const allTerminal = manifest.sliceKeys.every(k => slices[k] !== 'pending');
  const ageMs = Date.now() - manifest.createdAt;

  if (allTerminal && lockExists) {
    if (ageMs > FINALIZE_TIMEOUT_MS + SLICE_TIMEOUT_MS) {
      return {
        state: 'failed',
        slices,
        error: 'Finalize step crashed or timed out.',
        startedAt: manifest.createdAt,
        aiModel: manifest.aiModel,
      };
    }
    // If the lock is stale the finalize holding it crashed without writing
    // status.json. Flag a kick — tryAcquireFinalizeLock steals stale locks.
    const lockAgeMs = await readFinalizeLockAgeMs(jobId);
    const lockIsStale = lockAgeMs !== null && lockAgeMs > FINALIZE_TIMEOUT_MS;
    return {
      state: 'merging',
      slices,
      startedAt: manifest.createdAt,
      aiModel: manifest.aiModel,
      needsFinalizeKick: lockIsStale || undefined,
    };
  }

  // All slices terminal but finalize never started — the last slice's
  // in-process trigger likely missed. Flag for the route to kick.
  if (allTerminal) {
    return {
      state: 'merging',
      slices,
      startedAt: manifest.createdAt,
      aiModel: manifest.aiModel,
      needsFinalizeKick: true,
    };
  }

  // Mark stale pending slices as failed once the per-slice timeout has passed.
  // If any slice finished, let finalize produce a partial document rather than
  // losing all completed work because one worker was terminated by the platform.
  if (ageMs > SLICE_TIMEOUT_MS) {
    for (const k of manifest.sliceKeys) {
      if (slices[k] === 'pending') slices[k] = 'failed';
    }
    if (manifest.sliceKeys.some(k => slices[k] === 'done')) {
      return {
        state: 'merging',
        slices,
        error: 'One or more slice workers timed out; finalizing completed sections.',
        startedAt: manifest.createdAt,
        aiModel: manifest.aiModel,
        needsFinalizeKick: true,
      };
    }
    return {
      state: 'failed',
      slices,
      error: 'One or more slice workers timed out.',
      startedAt: manifest.createdAt,
      aiModel: manifest.aiModel,
    };
  }

  return { state: 'pending', slices, startedAt: manifest.createdAt, aiModel: manifest.aiModel };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function headExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return false;
    throw e;
  }
}

// Authenticated reads via the SDK's get(). Plain fetch() against the public
// CDN URL returns 403 when Vercel Deployment Protection is enabled — get()
// adds Bearer auth via BLOB_READ_WRITE_TOKEN and bypasses that gate.
async function readJson<T>(pathname: string): Promise<T | null> {
  const result = await get(pathname, { access: 'public' });
  if (!result) return null;
  if (result.statusCode !== 200) {
    throw new Error(`Unexpected status ${result.statusCode} reading ${pathname}`);
  }
  const text = await new Response(result.stream).text();
  if (!text) throw new Error(`Empty body for ${pathname}`);
  return JSON.parse(text) as T;
}
