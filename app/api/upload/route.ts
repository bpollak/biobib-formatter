/**
 * POST /api/upload
 * Accepts { blobUrl, fileName } pointing at a CV uploaded directly to
 * Vercel Blob storage. Fetches the blob, runs the conversion pipeline,
 * and returns a ConversionResult. The client uses /api/upload-token first
 * to obtain a blob URL — this keeps the request body small so it isn't
 * blocked by Vercel's 4.5 MB serverless body limit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseCV } from '@/lib/docx/reader';
import { convertCVtoBioBib } from '@/lib/pipeline/converter';
import { generateBioBibDocx } from '@/lib/docx/writer';
import { blobStore } from '@/lib/blob-store';
import { del } from '@vercel/blob';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { randomUUID } from 'crypto';

export const maxDuration = 300; // 5 min — full-CV AI conversion can take 60–120s

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

  const blobRes = await fetch(blobUrl);
  if (!blobRes.ok) {
    return NextResponse.json(
      { error: `Could not fetch uploaded file (status ${blobRes.status}).` },
      { status: 400 },
    );
  }

  const contentLength = Number(blobRes.headers.get('content-length') ?? 0);
  if (contentLength > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await blobRes.arrayBuffer());
  const sessionId = randomUUID();

  const cv = await parseCV(buffer);
  const result = await convertCVtoBioBib(cv);
  const docxBuffer = await generateBioBibDocx(result);

  blobStore.set(sessionId, {
    document: docxBuffer,
    fileName: fileName.replace('.docx', '') + '-biobib.docx',
    result,
  });

  // Best-effort cleanup — the source CV blob isn't needed after processing.
  del(blobUrl).catch(() => {});

  return NextResponse.json({ sessionId, result });
}
