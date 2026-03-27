import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// DEPRECATED: This endpoint uses in-memory session store which doesn't work on Vercel serverless.
// Use /api/check instead, which handles upload + validation + fixes in a single request.
export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Use /api/check instead, which handles upload, validation, and auto-fixes in a single request.',
    },
    { status: 410 }
  );
}
