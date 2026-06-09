/**
 * GET /api/download/[jobId]
 *
 * Streams the finalized BioBib .docx from Vercel Blob. Public-by-jobId.
 * Streams through the authenticated SDK get() — plain fetch() of the
 * public CDN URL is 403'd by Deployment Protection.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFinalDocxStream, readManifest } from '@/lib/jobs/store';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const stream = await getFinalDocxStream(jobId);
  if (!stream) {
    return NextResponse.json({ error: 'Document not ready.' }, { status: 404 });
  }

  const manifest = await readManifest(jobId);
  // The stem comes from the user-supplied upload filename; keep it to
  // header-safe characters so it can't break out of Content-Disposition.
  const stem = manifest?.fileName
    ?.replace(/\.docx$/i, '')
    .replace(/[^\w.\- ()]+/g, '')
    .trim();
  const downloadName = stem ? `${stem}-biobib.docx` : 'biobib.docx';

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
