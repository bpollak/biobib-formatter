import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    return NextResponse.json({
      sessionId,
      status: session.status,
      stage: session.stage,
      progress: session.progress,
    });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
