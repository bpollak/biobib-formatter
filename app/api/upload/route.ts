import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { setSession, updateSession } from '@/lib/session-store';
import { parseDocument } from '@/lib/pipeline/parser';
import { DocumentMetadata, DocumentType, DegreeType, ProcessingSession } from '@/lib/types';
import { MAX_FILE_SIZE_BYTES, ALLOWED_EXTENSIONS } from '@/lib/constants';

export const maxDuration = 60; // seconds
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('documentType') as string) || 'dissertation';
    const degreeType = (formData.get('degreeType') as string) || 'doctoral';

    // Validate file
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({ error: 'Only .docx files are accepted' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `File too large. Maximum size is 50MB.` }, { status: 400 });
    }

    const sessionId = uuidv4();
    const buffer = Buffer.from(await file.arrayBuffer());

    const metadata: DocumentMetadata = {
      type: documentType as DocumentType,
      degreeType: degreeType as DegreeType,
      fileName: file.name,
      fileSize: file.size,
    };

    // Create initial session
    const session: ProcessingSession = {
      id: sessionId,
      createdAt: Date.now(),
      status: 'parsing',
      stage: 'Parsing document...',
      progress: 10,
      metadata,
      originalBuffer: buffer,
    };
    setSession(session);

    // Parse document
    try {
      updateSession(sessionId, { status: 'parsing', stage: 'Parsing document structure...', progress: 20 });
      const documentModel = await parseDocument(buffer, metadata);
      updateSession(sessionId, {
        documentModel,
        status: 'validating',
        stage: 'Ready for validation',
        progress: 50,
      });
    } catch (parseError) {
      console.error('Parse error:', parseError);
      updateSession(sessionId, {
        status: 'error',
        stage: 'Parse failed',
        error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
      });
      return NextResponse.json({ error: 'Failed to parse document' }, { status: 500 });
    }

    return NextResponse.json({
      sessionId,
      status: 'ready',
      metadata,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
