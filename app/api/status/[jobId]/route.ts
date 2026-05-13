/**
 * GET /api/status/[jobId]
 *
 * Public-by-jobId (UUID is the capability). Returns per-slice progress
 * and embeds the final ConversionResult when the job is complete.
 *
 * Also acts as a self-healing trigger: if every slice has written a
 * terminal outcome but finalize never started (e.g. the last slice's
 * in-process dispatch missed due to a network blip or Blob propagation
 * delay), this route fires a fallback /api/finalize call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeStatus } from '@/lib/jobs/store';
import { INTERNAL_SECRET_HEADER, getInternalSecret } from '@/lib/jobs/auth';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await ctx.params;
  try {
    const status = await computeStatus(jobId);
    if (!status) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    if (status.needsFinalizeKick) {
      try {
        const secret = getInternalSecret();
        fetch(`${req.nextUrl.origin}/api/finalize/${jobId}`, {
          method: 'POST',
          headers: { [INTERNAL_SECRET_HEADER]: secret },
        }).catch(err => console.error(`[/api/status ${jobId}] finalize kick failed:`, err));
      } catch (e) {
        console.error(`[/api/status ${jobId}] cannot kick finalize:`, (e as Error).message);
      }
    }

    // Don't leak the internal flag to the client.
    const { needsFinalizeKick: _kick, ...publicStatus } = status;
    void _kick;

    return NextResponse.json(publicStatus, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (e) {
    console.error(`[/api/status ${jobId}] computeStatus failed:`, e);
    return NextResponse.json(
      { error: 'Status check failed', detail: (e as Error).message ?? String(e) },
      { status: 500 },
    );
  }
}
