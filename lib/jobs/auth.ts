/**
 * Internal-only auth: cross-function calls (/api/upload → /api/slice →
 * /api/finalize) carry a shared secret in the `x-internal-secret` header,
 * validated with constant-time compare.
 *
 * /api/status and /api/download remain public-by-jobId (the UUID is the
 * capability), matching the prior session-id behavior.
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export const INTERNAL_SECRET_HEADER = 'x-internal-secret';
const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';

export function getInternalSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error('INTERNAL_API_SECRET not configured');
  return secret;
}

export function getInternalFetchHeaders(secret = getInternalSecret()): Record<string, string> {
  const headers: Record<string, string> = { [INTERNAL_SECRET_HEADER]: secret };
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (protectionBypass) {
    headers[VERCEL_PROTECTION_BYPASS_HEADER] = protectionBypass;
  }
  return headers;
}

export function checkInternalSecret(req: NextRequest): NextResponse | null {
  const provided = req.headers.get(INTERNAL_SECRET_HEADER) ?? '';
  const expected = process.env.INTERNAL_API_SECRET ?? '';
  if (!expected) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET not configured' }, { status: 500 });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}
