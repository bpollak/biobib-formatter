import { FormattingRule, DocumentModel, RuleResult } from '../types';
import { LINE_SPACING_SINGLE } from '../constants';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'references', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const referencesRules: FormattingRule[] = [
  {
    id: 'REF-001',
    category: 'references',
    name: 'References Section Exists',
    description: 'A References or Bibliography section must be present',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const hasRefs = doc.paragraphs.some(p =>
        /^(references|bibliography|works\s+cited)$/i.test(p.text.trim())
      );
      if (hasRefs || doc.references.length > 0) {
        return makeResult('REF-001', 'References Section Exists', 'critical', false, true,
          'References/Bibliography section detected');
      }
      return makeResult('REF-001', 'References Section Exists', 'critical', false, false,
        'No References or Bibliography section detected',
        undefined,
        'Add a "References" or "Bibliography" section as the last section of the document (after appendices).'
      );
    },
  },
  {
    id: 'REF-002',
    category: 'references',
    name: 'References Single-Spaced Within Entries',
    description: 'Each reference entry must be single-spaced internally',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.references.length === 0) {
        return { ruleId: 'REF-002', category: 'references', name: 'References Single-Spaced Within Entries', status: 'skipped', message: 'No reference entries detected', autoFixable: true, severity: 'major' };
      }
      const wrongSpacing = doc.references.filter(r =>
        r.lineSpacing !== undefined && r.lineSpacing > LINE_SPACING_SINGLE * 1.5
      );
      if (wrongSpacing.length === 0) {
        return makeResult('REF-002', 'References Single-Spaced Within Entries', 'major', true, true,
          'Reference entries appear to be single-spaced');
      }
      return makeResult('REF-002', 'References Single-Spaced Within Entries', 'major', true, false,
        `${wrongSpacing.length} reference entry(ies) may not be single-spaced`,
        undefined,
        'Select all text in the References section and set line spacing to Single (1.0). Then adjust spacing between entries to double-space.'
      );
    },
  },
  {
    id: 'REF-003',
    category: 'references',
    name: 'Double-Space Between Reference Entries',
    description: 'There must be a double-space (one blank line) between each reference entry',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.references.length === 0) {
        return { ruleId: 'REF-003', category: 'references', name: 'Double-Space Between Reference Entries', status: 'skipped', message: 'No reference entries detected', autoFixable: true, severity: 'major' };
      }
      const noSpacing = doc.references.filter(r =>
        r.spaceAfter !== undefined && r.spaceAfter < 200
      );
      if (noSpacing.length === 0) {
        return makeResult('REF-003', 'Double-Space Between Reference Entries', 'major', true, true,
          'References have appropriate spacing between entries');
      }
      return makeResult('REF-003', 'Double-Space Between Reference Entries', 'major', true, false,
        `${noSpacing.length} reference entry(ies) may not have double-spacing after them`,
        undefined,
        'In the References section, set "Space After" to 12pt (or equivalent) for each entry to create a blank line between entries. Each entry should be single-spaced internally.'
      );
    },
  },
  {
    id: 'REF-004',
    category: 'references',
    name: 'No "et al." in Bibliography',
    description: '"et al." abbreviation is not permitted in the References/Bibliography section — all authors must be listed',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const withEtAl = doc.references.filter(r => r.hasEtAl);
      if (withEtAl.length === 0) {
        // Also check all paragraphs in reference section
        const refSectionStart = doc.paragraphs.findIndex(p =>
          /^(references|bibliography|works\s+cited)$/i.test(p.text.trim())
        );
        if (refSectionStart !== -1) {
          const refParas = doc.paragraphs.slice(refSectionStart);
          const etAlFound = refParas.some(p => /et\s+al\./i.test(p.text));
          if (etAlFound) {
            return makeResult('REF-004', 'No "et al." in Bibliography', 'critical', false, false,
              '"et al." detected in the References section',
              undefined,
              'Replace all instances of "et al." in the References/Bibliography with the full list of author names. "et al." is only acceptable in in-text citations, not in the bibliography itself.'
            );
          }
        }
        return makeResult('REF-004', 'No "et al." in Bibliography', 'critical', false, true,
          'No "et al." detected in References section');
      }
      return makeResult('REF-004', 'No "et al." in Bibliography', 'critical', false, false,
        `"et al." found in ${withEtAl.length} reference entry(ies)`,
        undefined,
        'Replace all instances of "et al." in the References/Bibliography with the complete list of authors. GEPA requires all authors to be listed.'
      );
    },
  },
  {
    id: 'REF-005',
    category: 'references',
    name: 'All Authors Listed',
    description: 'All authors must be listed in each bibliography entry — no abbreviations',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const withEtAl = doc.references.filter(r => r.hasEtAl);
      const refParas = doc.paragraphs.filter(p => {
        const refStart = doc.paragraphs.findIndex(pp =>
          /^(references|bibliography|works\s+cited)$/i.test(pp.text.trim())
        );
        return refStart !== -1 && doc.paragraphs.indexOf(p) > refStart;
      });
      const hasOthers = refParas.some(p =>
        /\band\s+others\b/i.test(p.text) ||
        /\bet\s+al\./i.test(p.text)
      );
      
      if (!hasOthers && withEtAl.length === 0) {
        return makeResult('REF-005', 'All Authors Listed', 'critical', false, true,
          'No author abbreviations detected in References');
      }
      return makeResult('REF-005', 'All Authors Listed', 'critical', false, false,
        'Author abbreviations detected in References section',
        undefined,
        'List all authors for every reference. Remove "et al.", "and others", or any other author abbreviations. Look up each reference to find the complete author list.'
      );
    },
  },
  {
    id: 'REF-006',
    category: 'references',
    name: 'Consistent Reference Formatting',
    description: 'All reference entries should follow a consistent citation style',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (doc.references.length < 2) {
        return { ruleId: 'REF-006', category: 'references', name: 'Consistent Reference Formatting', status: 'skipped', message: 'Insufficient references to check consistency', autoFixable: false, severity: 'major' };
      }
      // Heuristic: check if formatting is roughly consistent
      return {
        ruleId: 'REF-006',
        category: 'references',
        name: 'Consistent Reference Formatting',
        status: 'warning',
        message: 'Manually verify all references use a consistent citation style',
        autoFixable: false,
        severity: 'major',
        manualFixInstruction: 'Ensure all references follow the same citation style (APA, MLA, Chicago, etc.) as approved by your dissertation committee. Consistency within the document is required.',
      };
    },
  },
];

export default referencesRules;
