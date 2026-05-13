/**
 * POST /api/upload
 * Accepts a .docx CV, runs the conversion pipeline, returns ConversionResult.
 * Stateless — no database. Document stored in-memory during processing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseCV } from '@/lib/docx/reader';
import { convertCVtoBioBib } from '@/lib/pipeline/converter';
import { generateBioBibDocx } from '@/lib/docx/writer';
import { blobStore } from '@/lib/blob-store';
import { MAX_FILE_SIZE_BYTES, ACCEPTED_MIME_TYPES } from '@/lib/constants';
import { randomUUID } from 'crypto';

export const maxDuration = 120; // 2 min — AI conversion can be slow

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  if (!ACCEPTED_MIME_TYPES.includes(file.type) && !file.name.endsWith('.docx')) {
    return NextResponse.json({ error: 'Only .docx files are accepted.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit.` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sessionId = randomUUID();

  // Step 1: Parse CV
  const cv = await parseCV(buffer);

  // Step 2: AI conversion
  const result = await convertCVtoBioBib(cv);

  // Step 3: Generate BioBib .docx
  const docxBuffer = await generateBioBibDocx(result);

  // Step 4: Store for download (in-memory blob, short TTL)
  blobStore.set(sessionId, {
    document: docxBuffer,
    fileName: file.name.replace('.docx', '') + '-biobib.docx',
    result,
  });

  return NextResponse.json({ sessionId, result });
}
