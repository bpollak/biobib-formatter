import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { assertCorrectedDocumentPathname } from '@/lib/blob-store';
import {
  buildAttachmentDisposition,
  buildCorrectedDownloadFileName,
} from '@/lib/blob-paths';
import { verifyDocumentDownloadToken } from '@/lib/server/document-download-token';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const token = new URL(request.url).searchParams.get('token');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: 'Document download token is required' }, { status: 400 });
    }

    const payload = verifyDocumentDownloadToken(token);
    if (payload.sessionId !== sessionId) {
      return NextResponse.json(
        { error: 'Document download token does not match this session' },
        { status: 403 }
      );
    }

    assertCorrectedDocumentPathname(payload.pathname);

    const blob = await get(payload.pathname, {
      access: 'private',
      useCache: false,
    });
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json({ error: 'Corrected document not found or expired' }, { status: 404 });
    }

    return new NextResponse(blob.stream, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': buildAttachmentDisposition(
          buildCorrectedDownloadFileName(payload.fileName)
        ),
        'Content-Length': String(blob.blob.size),
        'Content-Type': blob.blob.contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Download document error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Document download failed' },
      { status: 400 }
    );
  }
}
