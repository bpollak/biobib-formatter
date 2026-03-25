import { FormattingRule, DocumentModel, RuleResult } from '../types';
import { ABSTRACT_WORD_LIMIT_DOCTORAL, ABSTRACT_WORD_LIMIT_MASTERS, MARGIN_2_5_INCH } from '../constants';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'abstract', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const abstractRules: FormattingRule[] = [
  {
    id: 'ABSTRACT-001',
    category: 'abstract',
    name: 'Abstract Word Count ≤ 350 (Doctoral)',
    description: 'Doctoral dissertation abstracts must not exceed 350 words',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'dissertation',
    check(doc: DocumentModel): RuleResult {
      if (doc.metadata.degreeType !== 'doctoral') {
        return { ruleId: 'ABSTRACT-001', category: 'abstract', name: 'Abstract Word Count ≤ 350 (Doctoral)', status: 'skipped', message: 'Not applicable for master\'s theses', autoFixable: false, severity: 'critical' };
      }
      if (!doc.abstract.detected) {
        return makeResult('ABSTRACT-001', 'Abstract Word Count ≤ 350 (Doctoral)', 'critical', false, false,
          'Abstract section not detected',
          undefined,
          'Add an Abstract section. For doctoral dissertations, the abstract must not exceed 350 words.'
        );
      }
      const wordCount = doc.abstract.wordCount;
      const limit = ABSTRACT_WORD_LIMIT_DOCTORAL;
      if (wordCount <= limit) {
        return makeResult('ABSTRACT-001', 'Abstract Word Count ≤ 350 (Doctoral)', 'critical', false, true,
          `Abstract word count is within limit: ${wordCount} / ${limit} words`);
      }
      return makeResult('ABSTRACT-001', 'Abstract Word Count ≤ 350 (Doctoral)', 'critical', false, false,
        `Abstract exceeds 350-word limit: ${wordCount} words`,
        `Over by ${wordCount - limit} words`,
        `Shorten the abstract to ${limit} words or fewer. Current count: ${wordCount} words.`
      );
    },
  },
  {
    id: 'ABSTRACT-002',
    category: 'abstract',
    name: "Abstract Word Count ≤ 250 (Master's)",
    description: "Master's thesis abstracts must not exceed 250 words",
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'thesis',
    check(doc: DocumentModel): RuleResult {
      if (doc.metadata.degreeType !== 'masters') {
        return { ruleId: 'ABSTRACT-002', category: 'abstract', name: "Abstract Word Count ≤ 250 (Master's)", status: 'skipped', message: 'Not applicable for doctoral dissertations', autoFixable: false, severity: 'critical' };
      }
      if (!doc.abstract.detected) {
        return makeResult('ABSTRACT-002', "Abstract Word Count ≤ 250 (Master's)", 'critical', false, false,
          'Abstract section not detected',
          undefined,
          "Add an Abstract section. For master's theses, the abstract must not exceed 250 words."
        );
      }
      const wordCount = doc.abstract.wordCount;
      const limit = ABSTRACT_WORD_LIMIT_MASTERS;
      if (wordCount <= limit) {
        return makeResult('ABSTRACT-002', "Abstract Word Count ≤ 250 (Master's)", 'critical', false, true,
          `Abstract word count is within limit: ${wordCount} / ${limit} words`);
      }
      return makeResult('ABSTRACT-002', "Abstract Word Count ≤ 250 (Master's)", 'critical', false, false,
        `Abstract exceeds 250-word limit: ${wordCount} words`,
        `Over by ${wordCount - limit} words`,
        `Shorten the abstract to ${limit} words or fewer. Current count: ${wordCount} words.`
      );
    },
  },
  {
    id: 'ABSTRACT-003',
    category: 'abstract',
    name: 'Abstract Top Margin 2.5"',
    description: 'The abstract page must have a 2.5" top margin',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.abstract.detected) {
        return makeResult('ABSTRACT-003', 'Abstract Top Margin 2.5"', 'major', true, false,
          'Abstract section not detected — cannot check margin',
          undefined,
          'Add an Abstract section. The abstract page requires a 2.5" top margin.'
        );
      }
      const topMargin = doc.abstract.topMargin;
      if (!topMargin) {
        return {
          ruleId: 'ABSTRACT-003', category: 'abstract', name: 'Abstract Top Margin 2.5"',
          status: 'warning', message: 'Could not determine abstract page top margin',
          autoFixable: true, severity: 'major',
          manualFixInstruction: 'Set the abstract page top margin to 2.5". You may need to use a section break and custom margin for just that page.'
        };
      }
      if (topMargin >= MARGIN_2_5_INCH) {
        return makeResult('ABSTRACT-003', 'Abstract Top Margin 2.5"', 'major', true, true,
          `Abstract top margin is ${(topMargin / 1440).toFixed(2)}" (≥ 2.5")`);
      }
      return makeResult('ABSTRACT-003', 'Abstract Top Margin 2.5"', 'major', true, false,
        `Abstract top margin is ${(topMargin / 1440).toFixed(2)}" — must be 2.5"`,
        `Found: ${(topMargin / 1440).toFixed(2)}", required: 2.5"`,
        'The abstract page must have a 2.5" top margin. Use a section break to isolate the abstract page, then set its top margin to 2.5" via Layout → Margins → Custom Margins.'
      );
    },
  },
  {
    id: 'ABSTRACT-004',
    category: 'abstract',
    name: 'Abstract Double-Spaced',
    description: 'Abstract body text must be double-spaced',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.abstract.detected) {
        return makeResult('ABSTRACT-004', 'Abstract Double-Spaced', 'major', true, false,
          'Abstract section not detected',
          undefined,
          'Add an Abstract section with double-spaced text.'
        );
      }
      // Check paragraphs in abstract section for spacing
      const abstractParas = doc.paragraphs.filter((_, i) =>
        doc.abstract.paragraphIndices.includes(i)
      );
      const notDoubleSpaced = abstractParas.filter(p =>
        p.lineSpacing !== undefined && p.lineSpacing < 480
      );
      if (notDoubleSpaced.length === 0) {
        return makeResult('ABSTRACT-004', 'Abstract Double-Spaced', 'major', true, true,
          'Abstract text is double-spaced');
      }
      return makeResult('ABSTRACT-004', 'Abstract Double-Spaced', 'major', true, false,
        'Abstract text may not be double-spaced',
        undefined,
        'Select all text in the Abstract and set line spacing to Double via Home → Paragraph → Line Spacing.'
      );
    },
  },
];

export default abstractRules;
