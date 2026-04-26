import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { put, del } from '@vercel/blob';
import { parseDocument } from '@/lib/pipeline/parser';
import { validateDocument, buildValidationResults } from '@/lib/pipeline/validator';
import { applyAutoFixes } from '@/lib/pipeline/fixer';
import { DocumentMetadata, DocumentType, DegreeType, RuleResult } from '@/lib/types';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let uploadedBlobUrl: string | undefined;

  try {
    const body = await request.json();
    const { blobUrl, documentType = 'dissertation', degreeType = 'doctoral', fileName, fileSize } = body;

    if (!blobUrl || typeof blobUrl !== 'string') {
      return NextResponse.json({ error: 'No file URL provided' }, { status: 400 });
    }

    if (!fileName?.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ error: 'Only .docx files are accepted' }, { status: 400 });
    }

    uploadedBlobUrl = blobUrl;

    // Download the file from Blob storage
    const fileResponse = await fetch(blobUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'Failed to retrieve uploaded file' }, { status: 500 });
    }
    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const sessionId = uuidv4();

    const metadata: DocumentMetadata = {
      type: documentType as DocumentType,
      degreeType: degreeType as DegreeType,
      fileName: fileName || 'document.docx',
      fileSize: fileSize || buffer.length,
    };

    // Parse document
    const documentModel = await parseDocument(buffer, metadata);

    // Run validation
    const ruleResults: RuleResult[] = validateDocument(documentModel);

    // Run auto-fixes (uses the already-computed validation results)
    const { correctedBuffer, changes } = await applyAutoFixes(buffer, documentModel, ruleResults);

    // Build the final ValidationResults (status flips, summary, manual fixes).
    const results = buildValidationResults(sessionId, metadata, ruleResults, changes);

    // Strip path-traversal / unsafe characters before using filename in the blob path.
    // Keep alphanumerics, dots, hyphens, underscores; collapse everything else to "_".
    const safeBaseName = (fileName || 'document.docx')
      .replace(/\.docx$/i, '')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 80) || 'document';

    // Upload corrected file to Blob storage. addRandomSuffix prevents URL guessing
    // for these student-owned files; the URL is still public-read but unguessable.
    const correctedBlob = await put(
      `corrected/${sessionId}/${safeBaseName}_corrected.docx`,
      correctedBuffer,
      {
        access: 'public',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        addRandomSuffix: true,
      }
    );

    // Clean up the original uploaded blob
    try {
      await del(uploadedBlobUrl);
    } catch {
      // Non-critical: original blob will expire eventually
      console.warn('Failed to delete original blob:', uploadedBlobUrl);
    }

    return NextResponse.json({
      results,
      correctedFileUrl: correctedBlob.url,
      originalFileName: fileName,
    });
  } catch (error: unknown) {
    console.error('Check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
