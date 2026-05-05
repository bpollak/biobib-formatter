import { NextResponse } from 'next/server';
import { del, get } from '@vercel/blob';
import { assertCorrectedDocumentPathname } from '@/lib/blob-store';
import {
  buildAttachmentDisposition,
  buildCorrectedDownloadFileName,
} from '@/lib/blob-paths';
import { verifyDocumentDownloadToken } from '@/lib/server/document-download-token';

export const dynamic = 'force-dynamic';

function streamWithBlobCleanup(
  stream: ReadableStream<Uint8Array>,
  pathname: string
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let cleaned = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try {
      await del(pathname);
    } catch (error) {
      console.warn('Failed to delete corrected blob after download:', pathname, error);
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
        await cleanup();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await cleanup();
    },
  });
}

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

    return new NextResponse(streamWithBlobCleanup(blob.stream, payload.pathname), {
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
