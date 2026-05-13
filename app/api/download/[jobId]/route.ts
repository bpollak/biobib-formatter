/**
 * GET /api/download/[jobId]
 *
 * Streams the finalized BioBib .docx from Vercel Blob. Public-by-jobId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFinalDocxUrl, readManifest } from '@/lib/jobs/store';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const url = await getFinalDocxUrl(jobId);
  if (!url) {
    return NextResponse.json({ error: 'Document not ready.' }, { status: 404 });
  }

  const manifest = await readManifest(jobId);
  const stem = manifest?.fileName?.replace(/\.docx$/i, '');
  const downloadName = stem ? `${stem}-biobib.docx` : 'biobib.docx';

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: 'Could not fetch generated docx.' }, { status: 502 });
  }

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
