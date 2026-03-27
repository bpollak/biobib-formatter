import { DocumentModel, RuleResult } from '../types';
import { allRules } from '../rules';

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
        autoFixable: rule.autoFixable,
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
        autoFixable: rule.autoFixable,
        severity: rule.severity,
      });
      continue;
    }

    results.push(rule.check(doc));
  }

  return results;
}
