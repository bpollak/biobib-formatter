import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { normalizeBlobPathname } from '@/lib/blob-paths';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const normalizedPathname = normalizeBlobPathname(pathname);

        // Validate file type
        if (!normalizedPathname.startsWith('uploads/')) {
          throw new Error('Uploads must use the uploads/ prefix');
        }

        if (!normalizedPathname.toLowerCase().endsWith('.docx')) {
          throw new Error('Only .docx files are accepted');
        }

        return {
          allowedContentTypes: [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB
          tokenPayload: JSON.stringify({}),
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Log for debugging; the blob URL is returned to the client
        console.log('Blob upload completed:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
