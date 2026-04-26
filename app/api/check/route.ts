import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { put, del, get } from '@vercel/blob';
import { parseDocument } from '@/lib/pipeline/parser';
import { validateDocument, buildValidationResults } from '@/lib/pipeline/validator';
import { applyAutoFixes } from '@/lib/pipeline/fixer';
import { DocumentMetadata, DocumentType, DegreeType, RuleResult } from '@/lib/types';
import { resolveOwnedBlobReference, assertUploadedDocumentPathname } from '@/lib/blob-store';
import { buildCorrectedBlobPathname } from '@/lib/blob-paths';
import { createDocumentDownloadToken } from '@/lib/server/document-download-token';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let uploadedBlobPathname: string | undefined;

  try {
    const body = await request.json();
    const {
      blobPathname,
      blobUrl,
      documentType = 'dissertation',
      degreeType = 'doctoral',
      fileName,
      fileSize,
    } = body;

    if (!fileName?.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ error: 'Only .docx files are accepted' }, { status: 400 });
    }

    // Only accept references to blobs uploaded through this app's blob store,
    // and require they live under the uploads/ prefix (gated by /api/blob-upload).
    let uploadedBlob;
    try {
      uploadedBlob = resolveOwnedBlobReference(blobPathname, blobUrl);
      assertUploadedDocumentPathname(uploadedBlob.pathname);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid uploaded file reference' },
        { status: 400 }
      );
    }

    uploadedBlobPathname = uploadedBlob.pathname;

    // Fetch the file from Blob storage via the SDK so private blobs work.
    const fileResponse = await get(uploadedBlob.pathname, {
      access: uploadedBlob.access,
      useCache: false,
    });
    if (!fileResponse || fileResponse.statusCode !== 200) {
      return NextResponse.json({ error: 'Failed to retrieve uploaded file' }, { status: 500 });
    }
    const arrayBuffer = await new Response(fileResponse.stream).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const sessionId = uuidv4();

    const metadata: DocumentMetadata = {
      type: documentType as DocumentType,
      degreeType: degreeType as DegreeType,
      fileName: fileName || 'document.docx',
      fileSize: fileSize || buffer.length,
    };

    // Parse, validate, auto-fix, and finalize.
    const documentModel = await parseDocument(buffer, metadata);
    const ruleResults: RuleResult[] = validateDocument(documentModel);
    const { correctedBuffer, changes } = await applyAutoFixes(buffer, documentModel, ruleResults);
    const results = buildValidationResults(sessionId, metadata, ruleResults, changes);

    // Upload corrected file to private Blob storage. The user gets a
    // short-lived signed download token instead of a public URL.
    const correctedBlob = await put(
      buildCorrectedBlobPathname(sessionId, metadata.fileName),
      correctedBuffer,
      {
        access: 'private',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
    );

    // Best-effort cleanup of the original uploaded blob.
    try {
      await del(uploadedBlob.pathname);
    } catch {
      console.warn('Failed to delete original blob:', uploadedBlobPathname);
    }

    return NextResponse.json({
      results,
      correctedDocumentToken: createDocumentDownloadToken({
        sessionId,
        pathname: correctedBlob.pathname,
        fileName: metadata.fileName,
      }),
      originalFileName: metadata.fileName,
    });
  } catch (error: unknown) {
    console.error('Check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
