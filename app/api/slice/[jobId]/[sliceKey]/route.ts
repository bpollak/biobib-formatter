/**
 * POST /api/slice/[jobId]/[sliceKey]  (internal)
 *
 * Runs ONE AI slice for a job. Lives in its own Vercel function
 * invocation with a fresh 600s budget on Vercel Pro. Writes its result (or terminal
 * error) to Vercel Blob, then triggers /api/finalize if it appears to
 * be the last slice to complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { checkInternalSecret, getInternalFetchHeaders, getInternalSecret } from '@/lib/jobs/auth';
import { callSliceWithSignal } from '@/lib/pipeline/converter';
import { isSliceKey, SliceKey } from '@/lib/pipeline/slices';
import {
  readCvText,
  readManifest,
  sliceAlreadyHandled,
  writeSliceError,
  writeSliceResult,
} from '@/lib/jobs/store';
import { head, BlobNotFoundError } from '@vercel/blob';

export const maxDuration = 600;

const LITELLM_TIMEOUT_MS = 570_000;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string; sliceKey: string }> },
) {
  const denied = checkInternalSecret(req);
  if (denied) return denied;

  const { jobId, sliceKey } = await ctx.params;
  if (!isSliceKey(sliceKey)) {
    return NextResponse.json({ error: `Unknown sliceKey: ${sliceKey}` }, { status: 400 });
  }

  // Idempotency: if this slice already has an outcome, skip the AI call.
  if (await sliceAlreadyHandled(jobId, sliceKey)) {
    return NextResponse.json({ ok: true, status: 'already_handled' }, { status: 200 });
  }

  const modelCredentials = {
    cloudApiKey: process.env.LITELLM_API_KEY,
    onPremApiKey: process.env.LITELLM_ON_PREM_API_KEY,
  };
  if (!modelCredentials.cloudApiKey && !modelCredentials.onPremApiKey) {
    return NextResponse.json(
      { error: 'No LiteLLM model provider API key configured.' },
      { status: 500 },
    );
  }

  const origin = req.nextUrl.origin;
  const internalSecret = getInternalSecret();

  // Return 202 immediately; real work runs in after() with its own function budget.
  after(async () => {
    try {
      const manifest = await readManifest(jobId);
      if (!manifest) {
        console.error(`[slice ${sliceKey}] manifest missing for job ${jobId}`);
        return;
      }

      const rawText = await readCvText(jobId);
      const cv = { rawText };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LITELLM_TIMEOUT_MS);
      try {
        const partial = await callSliceWithSignal(cv, sliceKey, modelCredentials, controller.signal, manifest.sinceYear);
        await writeSliceResult(jobId, sliceKey, partial);
      } catch (e) {
        await writeSliceError(jobId, sliceKey, {
          message: controller.signal.aborted
            ? `Slice exceeded ${Math.round(LITELLM_TIMEOUT_MS / 1000)}s model timeout.`
            : (e as Error).message || 'Unknown slice error',
        });
      } finally {
        clearTimeout(timeout);
      }

      // After writing outcome, check whether we're the last to finish.
      await maybeTriggerFinalize(jobId, manifest.sliceKeys as SliceKey[], origin, internalSecret);
    } catch (e) {
      console.error(`[slice ${sliceKey}] unexpected error:`, e);
    }
  });

  return NextResponse.json({ ok: true, status: 'started' }, { status: 202 });
}

async function maybeTriggerFinalize(
  jobId: string,
  sliceKeys: SliceKey[],
  origin: string,
  secret: string,
): Promise<void> {
  // Probe each expected slice for either a result or an error blob.
  const probes = await Promise.all(
    sliceKeys.map(async k => {
      const r = await blobExists(`jobs/${jobId}/slice-${k}.json`);
      if (r) return true;
      return blobExists(`jobs/${jobId}/slice-${k}.error`);
    }),
  );
  if (!probes.every(Boolean)) return;

  fetch(`${origin}/api/finalize/${jobId}`, {
    method: 'POST',
    headers: getInternalFetchHeaders(secret),
  }).catch(err => console.error(`[slice] finalize dispatch failed:`, err));
}

async function blobExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return false;
    throw e;
  }
}
