// Pipeline orchestrator — combines parse, validate, fix, report
export { parseDocument } from './parser';
export { validateDocument } from './validator';
export { applyAutoFixes } from './fixer';
export { generateReportPDF, generateResultsSummary } from './reporter';

import { DocumentMetadata, ProcessingSession, ValidationResults, RuleResult, ManualFix } from '../types';
import { setSession, updateSession, getSession } from '../session-store';
import { parseDocument } from './parser';
import { validateDocument } from './validator';
import { applyAutoFixes } from './fixer';
import { generateReportPDF } from './reporter';
import { v4 as uuidv4 } from 'uuid';

/**
 * Full pipeline: parse → validate → fix → report
 */
export async function processDocument(
  fileBuffer: Buffer,
  metadata: DocumentMetadata
): Promise<string> {
  const sessionId = uuidv4();

  const session: ProcessingSession = {
    id: sessionId,
    createdAt: Date.now(),
    status: 'parsing',
    stage: 'Parsing document...',
    progress: 10,
    metadata,
    originalBuffer: fileBuffer,
  };
  setSession(session);

  try {
    updateSession(sessionId, { stage: 'Parsing document structure...', progress: 20 });
    const doc = await parseDocument(fileBuffer, metadata);
    updateSession(sessionId, { documentModel: doc, status: 'validating', stage: 'Validating...', progress: 40 });

    const ruleResults: RuleResult[] = validateDocument(doc);
    updateSession(sessionId, { status: 'fixing', stage: 'Applying auto-fixes...', progress: 65 });

    const { correctedBuffer, changes } = await applyAutoFixes(fileBuffer, doc);

    // Mark auto-fixed rules
    const fixedRuleIds = new Set(changes.map(c => c.ruleId));
    const finalRules: RuleResult[] = ruleResults.map(r => {
      if (fixedRuleIds.has(r.ruleId) && r.status === 'fail') {
        return { ...r, status: 'auto-fixed' as const };
      }
      return r;
    });

    const passed = finalRules.filter(r => r.status === 'pass').length;
    const failed = finalRules.filter(r => r.status === 'fail').length;
    const warned = finalRules.filter(r => r.status === 'warning').length;
    const autoFixed = finalRules.filter(r => r.status === 'auto-fixed').length;
    const skipped = finalRules.filter(r => r.status === 'skipped').length;
    const total = finalRules.length;

    const criticalFailed = finalRules.filter(r => r.status === 'fail' && r.severity === 'critical').length;
    const overallStatus = failed === 0 ? 'pass' : criticalFailed > 0 || failed > 5 ? 'fail' : 'needs-attention';

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
      summary: { total, passed, failed, warned, autoFixed, skipped, overallStatus },
      rules: finalRules,
      changes,
      manualFixes,
    };

    updateSession(sessionId, {
      status: 'complete',
      stage: 'Complete',
      progress: 100,
      correctedBuffer,
      results,
    });

    return sessionId;
  } catch (error: unknown) {
    updateSession(sessionId, {
      status: 'error',
      stage: 'Processing failed',
      error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error),
    });
    throw error;
  }
}
