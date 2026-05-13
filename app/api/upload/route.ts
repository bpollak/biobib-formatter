/**
 * POST /api/upload  (async dispatcher)
 *
 * 1. Receive { blobUrl, fileName }.
 * 2. Fetch + parse the source CV.
 * 3. Persist manifest.json + cv.txt under jobs/<jobId>/.
 * 4. Dispatch /api/slice workers via after() + fetch (each runs in
 *    its own function invocation).
 * 5. Return { jobId } immediately (HTTP 202). Client polls /api/status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { del, get } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { parseCV } from '@/lib/docx/reader';
import { SLICE_KEYS } from '@/lib/pipeline/converter';
import { writeManifest, writeCvText } from '@/lib/jobs/store';
import { getInternalFetchHeaders, getInternalSecret } from '@/lib/jobs/auth';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { blobUrl, fileName } = (await req.json().catch(() => ({}))) as {
    blobUrl?: string;
    fileName?: string;
  };

  if (!blobUrl || !fileName) {
    return NextResponse.json({ error: 'blobUrl and fileName are required.' }, { status: 400 });
  }
  if (!fileName.endsWith('.docx')) {
    return NextResponse.json({ error: 'Only .docx files are accepted.' }, { status: 400 });
  }

  // Fail fast at the boundary if the internal secret is missing.
  try {
    getInternalSecret();
  } catch {
    return NextResponse.json(
      { error: 'Server misconfigured: INTERNAL_API_SECRET is not set.' },
      { status: 500 },
    );
  }

  const uploadedBlob = await get(blobUrl, { access: 'public' });
  if (!uploadedBlob) {
    return NextResponse.json(
      { error: 'Could not fetch uploaded file.' },
      { status: 400 },
    );
  }

  const contentLength = uploadedBlob.blob.size ?? Number(uploadedBlob.headers.get('content-length') ?? 0);
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await new Response(uploadedBlob.stream).arrayBuffer());
  const cv = await parseCV(buffer);
  const jobId = randomUUID();

  // Persist the parsed text so workers don't re-parse a multi-MB docx.
  await writeCvText(jobId, cv.rawText);
  await writeManifest(jobId, {
    fileName,
    sliceKeys: [...SLICE_KEYS],
    createdAt: Date.now(),
    sourceBlobUrl: blobUrl,
  });

  // Workers don't need the source .docx — they use cv.txt. Clean up now.
  del(blobUrl).catch(() => {});

  const origin = req.nextUrl.origin;
  const secret = getInternalSecret();

  after(async () => {
    // Each fetch's child returns 202 immediately and runs its real work in
    // its own after(). We only need the dispatch to commit (sub-second).
    const headers = getInternalFetchHeaders(secret);
    await Promise.allSettled(
      SLICE_KEYS.map(key =>
        fetch(`${origin}/api/slice/${jobId}/${key}`, {
          method: 'POST',
          headers,
        }).catch(err => {
          console.error(`[/api/upload] dispatch failed for slice "${key}":`, err);
        }),
      ),
    );
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
