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

import { after, NextRequest, NextResponse } from 'next/server';
import { computeStatus } from '@/lib/jobs/store';
import { getInternalFetchHeaders } from '@/lib/jobs/auth';

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
      // Keep the recovery request alive after the polling response is sent.
      after(async () => {
        try {
          const response = await fetch(`${req.nextUrl.origin}/api/finalize/${jobId}`, {
            method: 'POST',
            headers: getInternalFetchHeaders(),
          });
          if (!response.ok) throw new Error(`Finalize returned HTTP ${response.status}`);
        } catch (e) {
          console.error(`[/api/status ${jobId}] finalize kick failed:`, e);
        }
      });
    }

    // Don't leak the internal flag to the client.
    const { needsFinalizeKick: _kick, ...publicStatus } = status;
    void _kick;

    return NextResponse.json(publicStatus, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (e) {
    // Log the cause server-side; don't echo internals to the public client.
    console.error(`[/api/status ${jobId}] computeStatus failed:`, e);
    return NextResponse.json({ error: 'Status check failed. Please retry.' }, { status: 500 });
  }
}
