import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/session-store';
import { validateDocument } from '@/lib/pipeline/validator';
import { applyAutoFixes } from '@/lib/pipeline/fixer';
import { RuleResult, ManualFix, ValidationResults } from '@/lib/types';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }

    if (!session.documentModel) {
      return NextResponse.json({ error: 'Document not yet parsed' }, { status: 400 });
    }

    // Run validation
    updateSession(sessionId, { status: 'validating', stage: 'Running formatting checks...', progress: 55 });
    const ruleResults: RuleResult[] = validateDocument(session.documentModel);

    // Run auto-fixes
    updateSession(sessionId, { status: 'fixing', stage: 'Applying auto-fixes...', progress: 75 });
    const { correctedBuffer, changes } = await applyAutoFixes(
      session.originalBuffer,
      session.documentModel
    );

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
      metadata: session.metadata,
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

    // Store results
    updateSession(sessionId, {
      status: 'complete',
      stage: 'Complete',
      progress: 100,
      correctedBuffer,
      results,
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Validate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Validation failed' },
      { status: 500 }
    );
  }
}
