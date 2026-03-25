import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session-store';
import { generateReportPDF } from '@/lib/pipeline/reporter';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }

  if (session.status !== 'complete') {
    return NextResponse.json({ error: 'Processing not complete' }, { status: 400 });
  }

  if (type === 'docx') {
    const buffer = session.correctedBuffer || session.originalBuffer;
    const fileName = session.metadata.fileName.replace('.docx', '_corrected.docx');
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
      },
    });
  }

  if (type === 'report') {
    if (!session.results) {
      return NextResponse.json({ error: 'Results not available' }, { status: 400 });
    }
    try {
      const pdfBuffer = await generateReportPDF(session.results);
      const baseName = session.metadata.fileName.replace('.docx', '');
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseName}_compliance_report.pdf"`,
          'Content-Length': String(pdfBuffer.length),
        },
      });
    } catch (err) {
      console.error('PDF generation error:', err);
      return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid download type. Use "docx" or "report".' }, { status: 400 });
}
