import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { parseDocument } from '@/lib/pipeline/parser';
import { validateDocument } from '@/lib/pipeline/validator';
import { applyAutoFixes } from '@/lib/pipeline/fixer';
import { DocumentMetadata, DocumentType, DegreeType, RuleResult, ManualFix, ValidationResults } from '@/lib/types';
import { MAX_FILE_SIZE_BYTES, ALLOWED_EXTENSIONS } from '@/lib/constants';

export const maxDuration = 120;
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

    // Parse document
    const documentModel = await parseDocument(buffer, metadata);

    // Run validation
    const ruleResults: RuleResult[] = validateDocument(documentModel);

    // Run auto-fixes
    const { correctedBuffer, changes } = await applyAutoFixes(buffer, documentModel);

    // Mark auto-fixed rules
    const fixedRuleIds = new Set(changes.map(c => c.ruleId));
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

    // Encode corrected buffer as base64 for client-side download
    const correctedFile = correctedBuffer.toString('base64');

    return NextResponse.json({
      results,
      correctedFile,
      originalFileName: file.name,
    });
  } catch (error) {
    console.error('Check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
