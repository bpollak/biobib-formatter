import { DocumentModel, RuleResult } from '../types';
import { allRules } from '../rules';

export function validateDocument(doc: DocumentModel): RuleResult[] {
  const results: RuleResult[] = [];

  for (const rule of allRules) {
    // Check if rule applies to this document type
    if (rule.appliesTo === 'dissertation' && doc.metadata.type !== 'dissertation') {
      results.push({
        ...rule.check(doc),
        status: 'skipped',
        message: `Skipped: not applicable for ${doc.metadata.type === 'thesis' ? "master's thesis" : 'unknown type'}`,
      });
      continue;
    }
    if (rule.appliesTo === 'thesis' && doc.metadata.type !== 'thesis') {
      results.push({
        ...rule.check(doc),
        status: 'skipped',
        message: `Skipped: not applicable for ${doc.metadata.type === 'dissertation' ? 'doctoral dissertation' : 'unknown type'}`,
      });
      continue;
    }

    results.push(rule.check(doc));
  }

  return results;
}

export function autoFixDocument(docBuffer: Buffer, doc: DocumentModel): { correctedBuffer: Buffer; changes: any[] } {
  // This is a simplified version - the actual fixing happens in fixer.ts
  // For now, just return the original buffer
  return { correctedBuffer: docBuffer, changes: [] };
}