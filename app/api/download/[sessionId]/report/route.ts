import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session-store';
import { generateReportPDF } from '@/lib/pipeline/reporter';

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

    if (!session.results) {
      return NextResponse.json({ error: 'Results not available' }, { status: 404 });
    }

    const pdfBuffer = await generateReportPDF(session.results);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${session.metadata.fileName.replace('.docx', '-compliance-report.pdf')}"`,
      },
    });
  } catch (error) {
    console.error('Download report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
