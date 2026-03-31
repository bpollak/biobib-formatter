import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { put, del } from '@vercel/blob';
import { parseDocument } from '@/lib/pipeline/parser';
import { validateDocument } from '@/lib/pipeline/validator';
import { applyAutoFixes } from '@/lib/pipeline/fixer';
import { DocumentMetadata, DocumentType, DegreeType, RuleResult, ManualFix, ValidationResults } from '@/lib/types';

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

    // Run auto-fixes
    const { correctedBuffer, changes } = await applyAutoFixes(buffer, documentModel);

    // Mark auto-fixed rules
    const fixedRuleIds = new Set(changes.map(c => c.ruleId));
    // TEXT-002 checks the same colors as FONT-005 — if FONT-005 fixed them, TEXT-002 is also resolved
    if (fixedRuleIds.has('FONT-005')) {
      fixedRuleIds.add('TEXT-002');
    }
    const finalRules: RuleResult[] = ruleResults.map(r => {
      if (fixedRuleIds.has(r.ruleId) && r.status === 'fail') {
        return { ...r, status: 'auto-fixed' as const };
      }
      return r;
    });

    // Build summary
    const passed = finalRules.filter(r => r.status === 'pass').length;
    const failed = finalRules.filter(r => r.status === 'fail').length;
    const warned = finalRules.filter(r => r.status === 'warning').length;
    const autoFixed = finalRules.filter(r => r.status === 'auto-fixed').length;
    const skipped = finalRules.filter(r => r.status === 'skipped').length;
    const total = finalRules.length;

    const criticalFailed = finalRules.filter(
      r => r.status === 'fail' && r.severity === 'critical'
    ).length;

    const overallStatus =
      failed === 0 ? 'pass' :
      criticalFailed > 0 || failed > 5 ? 'fail' :
      'needs-attention';

    // Build manual fixes list
    const manualFixes: ManualFix[] = finalRules
      .filter(r => r.status === 'fail' || r.status === 'warning')
      .map(r => ({
        ruleId: r.ruleId,
        severity: r.severity,
        title: r.name,
        instruction: r.manualFixInstruction || r.message,
        location: r.details,
      }));

    const results: ValidationResults = {
      sessionId,
      metadata,
      summary: {
        total,
        passed,
        failed,
        warned,
        autoFixed,
        skipped,
        overallStatus,
      },
      rules: finalRules,
      changes,
      manualFixes,
    };

    // Upload corrected file to Blob storage (instead of sending base64 in body)
    const correctedBlob = await put(
      `corrected/${sessionId}/${fileName?.replace(/\.docx$/i, '')}_corrected.docx`,
      correctedBuffer,
      {
        access: 'public',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  } catch (error) {
    console.error('Check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
