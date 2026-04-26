import { ChangeRecord, DocumentMetadata, DocumentModel, ManualFix, RuleResult, ValidationResults } from '../types';
import { allRules } from '../rules';

// Rules whose 'fail' status is fully resolved by another rule's auto-fix.
// When the source rule's fix runs, the dependent rules should also flip to 'auto-fixed'.
// FONT-005 (font color) and TEXT-002 (no colored text) check the same colored runs.
const FIX_DEPENDENCIES: Record<string, string[]> = {
  'FONT-005': ['TEXT-002'],
};

export function validateDocument(doc: DocumentModel): RuleResult[] {
  const results: RuleResult[] = [];

  for (const rule of allRules) {
    // Check if rule applies to this document type — skip without calling check()
    if (rule.appliesTo === 'dissertation' && doc.metadata.type !== 'dissertation') {
      results.push({
        ruleId: rule.id,
        category: rule.category,
        name: rule.name,
        status: 'skipped',
        message: `Skipped: not applicable for master's thesis`,
        autoFixable: false,
        severity: rule.severity,
      });
      continue;
    }
    if (rule.appliesTo === 'thesis' && doc.metadata.type !== 'thesis') {
      results.push({
        ruleId: rule.id,
        category: rule.category,
        name: rule.name,
        status: 'skipped',
        message: 'Skipped: not applicable for doctoral dissertation',
        autoFixable: false,
        severity: rule.severity,
      });
      continue;
    }

    results.push(rule.check(doc));
  }

  return results;
}

/**
 * Combine validation results with the auto-fixer's change list to produce the
 * final ValidationResults the API returns. Marks fixed rules as 'auto-fixed',
 * propagates fix dependencies, and computes summary/manualFixes.
 */
export function buildValidationResults(
  sessionId: string,
  metadata: DocumentMetadata,
  ruleResults: RuleResult[],
  changes: ChangeRecord[]
): ValidationResults {
  const fixedRuleIds = new Set(changes.map(c => c.ruleId));
  for (const sourceId of Object.keys(FIX_DEPENDENCIES)) {
    if (fixedRuleIds.has(sourceId)) {
      for (const dependentId of FIX_DEPENDENCIES[sourceId]) {
        fixedRuleIds.add(dependentId);
      }
    }
  }

  const finalRules: RuleResult[] = ruleResults.map(r =>
    fixedRuleIds.has(r.ruleId) && r.status === 'fail'
      ? { ...r, status: 'auto-fixed' as const }
      : r
  );

  const passed = finalRules.filter(r => r.status === 'pass').length;
  const failed = finalRules.filter(r => r.status === 'fail').length;
  const warned = finalRules.filter(r => r.status === 'warning').length;
  const autoFixed = finalRules.filter(r => r.status === 'auto-fixed').length;
  const skipped = finalRules.filter(r => r.status === 'skipped').length;
  const total = finalRules.length;

  const criticalFailed = finalRules.filter(
    r => r.status === 'fail' && r.severity === 'critical'
  ).length;

  const overallStatus: ValidationResults['summary']['overallStatus'] =
    failed === 0 ? 'pass' :
    criticalFailed > 0 || failed > 5 ? 'fail' :
    'needs-attention';

  const manualFixes: ManualFix[] = finalRules
    .filter(r => r.status === 'fail' || r.status === 'warning')
    .map(r => ({
      ruleId: r.ruleId,
      severity: r.severity,
      title: r.name,
      instruction: r.manualFixInstruction || r.message,
      location: r.details,
    }));

  return {
    sessionId,
    metadata,
    summary: { total, passed, failed, warned, autoFixed, skipped, overallStatus },
    rules: finalRules,
    changes,
    manualFixes,
  };
}
