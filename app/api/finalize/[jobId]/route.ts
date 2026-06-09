/**
 * POST /api/finalize/[jobId]  (internal)
 *
 * Triggered (possibly multiple times) by the last slice worker(s).
 * Acquires a Blob-backed lock; merges slice results; generates the
 * BioBib docx; writes result.json, biobib.docx, and status.json.
 *
 * Idempotent — duplicate triggers are absorbed by the lock.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { checkInternalSecret } from '@/lib/jobs/auth';
import { mergeSlices, PartialResult } from '@/lib/pipeline/converter';
import { SliceKey } from '@/lib/pipeline/slices';
import { generateBioBibDocx } from '@/lib/docx/writer';
import {
  deleteCvSourceData,
  readCvRichText,
  readFinalStatus,
  readManifest,
  readSliceError,
  readSliceResult,
  tryAcquireFinalizeLock,
  writeFinalDocx,
  writeFinalResult,
  writeFinalStatus,
} from '@/lib/jobs/store';

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const denied = checkInternalSecret(req);
  if (denied) return denied;

  const { jobId } = await ctx.params;

  // If already finalized, absorb. status.json is written last, so it (not
  // result.json) is the reliable terminal marker — a finalize that crashed
  // between the two must be re-runnable via the stale-lock retry.
  const existing = await readFinalStatus(jobId);
  if (existing) {
    return NextResponse.json({ ok: true, status: 'already_finalized' }, { status: 200 });
  }

  // Acquire the lock; if held, another finalize is in progress.
  const acquired = await tryAcquireFinalizeLock(jobId);
  if (!acquired) {
    return NextResponse.json({ ok: true, status: 'lock_held' }, { status: 200 });
  }

  // Do the merge + docx asynchronously and return 202 immediately.
  after(async () => {
    try {
      const manifest = await readManifest(jobId);
      if (!manifest) {
        await writeFinalStatus(jobId, {
          state: 'failed',
          error: 'Manifest missing during finalize.',
          completedAt: Date.now(),
        });
        return;
      }

      const sliceKeys = manifest.sliceKeys as SliceKey[];
      const failedSlices: string[] = [];
      const parts: PartialResult[] = [];

      for (const key of sliceKeys) {
        const result = await readSliceResult(jobId, key);
        if (result) {
          parts.push(result);
        } else {
          const err = await readSliceError(jobId, key);
          failedSlices.push(`${key}: ${err?.message ?? 'unknown'}`);
        }
      }

      const merged = mergeSlices(parts);
      const richTextParagraphs = await readCvRichText(jobId);
      const docxBuffer = await generateBioBibDocx(merged, richTextParagraphs, {
        sinceYear: manifest.sinceYear,
      });

      await writeFinalResult(jobId, merged);
      await writeFinalDocx(jobId, docxBuffer);

      await writeFinalStatus(jobId, {
        state: failedSlices.length === 0 ? 'complete' : parts.length > 0 ? 'failed_partial' : 'failed',
        error: failedSlices.length > 0 ? `Slices failed: ${failedSlices.join('; ')}` : undefined,
        completedAt: Date.now(),
      });

      // The job is terminal; drop the parsed CV text (most sensitive data).
      await deleteCvSourceData(jobId).catch(() => {});
    } catch (e) {
      console.error(`[finalize ${jobId}] unexpected error:`, e);
      // A stale-lock retry may already have written status.json — tolerate that.
      await writeFinalStatus(jobId, {
        state: 'failed',
        error: (e as Error).message || 'Unknown finalize error',
        completedAt: Date.now(),
      }).catch(err => console.error(`[finalize ${jobId}] could not write failed status:`, err));
    }
  });

  return NextResponse.json({ ok: true, status: 'finalizing' }, { status: 202 });
}
