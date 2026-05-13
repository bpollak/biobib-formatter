import { NextRequest, NextResponse } from 'next/server';
import { blobStore } from '@/lib/blob-store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const entry = blobStore.get(sessionId);

  if (!entry) {
    return NextResponse.json({ error: 'Session not found or expired. Please re-upload your CV.' }, { status: 404 });
  }

  return new NextResponse(entry.document as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${entry.fileName}"`,
    },
  });
}
