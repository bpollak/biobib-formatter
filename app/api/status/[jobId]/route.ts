/**
 * GET /api/status/[jobId]
 *
 * Public-by-jobId (UUID is the capability). Returns per-slice progress
 * and embeds the final ConversionResult when the job is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeStatus } from '@/lib/jobs/store';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  const status = await computeStatus(jobId);
  if (!status) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
