import { FormattingRule, DocumentModel, RuleResult } from '../types';
import { MARGIN_1_INCH, MARGIN_HALF_INCH, MARGIN_2_5_INCH } from '../constants';

function makeResult(
  ruleId: string,
  category: FormattingRule['category'],
  name: string,
  severity: FormattingRule['severity'],
  autoFixable: boolean,
  pass: boolean,
  message: string,
  details?: string,
  manualFixInstruction?: string
): RuleResult {
  return {
    ruleId,
    category,
    name,
    status: pass ? 'pass' : 'fail',
    message,
    details,
    autoFixable,
    severity,
    manualFixInstruction,
  };
}

const marginRules: FormattingRule[] = [
  {
    id: 'MARGIN-001',
    category: 'margins',
    name: 'Left Margin ≥ 1"',
    description: 'Left margin must be at least 1 inch',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const failing = doc.margins.filter(m => m.left < MARGIN_1_INCH);
      const pass = failing.length === 0;
      return makeResult(
        'MARGIN-001', 'margins', 'Left Margin ≥ 1"', 'critical', true, pass,
        pass ? 'Left margin is at least 1"' : `Left margin is less than 1" in ${failing.length} section(s)`,
        pass ? undefined : `Found: ${(failing[0].left / 1440).toFixed(2)}"`,
        'Open document → Layout → Margins and set left margin to at least 1"'
      );
    },
  },
  {
    id: 'MARGIN-002',
    category: 'margins',
    name: 'Right Margin ≥ 1"',
    description: 'Right margin must be at least 1 inch',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const failing = doc.margins.filter(m => m.right < MARGIN_1_INCH);
      const pass = failing.length === 0;
      return makeResult(
        'MARGIN-002', 'margins', 'Right Margin ≥ 1"', 'critical', true, pass,
        pass ? 'Right margin is at least 1"' : `Right margin is less than 1" in ${failing.length} section(s)`,
        pass ? undefined : `Found: ${(failing[0].right / 1440).toFixed(2)}"`,
        'Open document → Layout → Margins and set right margin to at least 1"'
      );
    },
  },
  {
    id: 'MARGIN-003',
    category: 'margins',
    name: 'Top Margin ≥ 1"',
    description: 'Top margin must be at least 1 inch',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const failing = doc.margins.filter(m => m.top < MARGIN_1_INCH);
      const pass = failing.length === 0;
      return makeResult(
        'MARGIN-003', 'margins', 'Top Margin ≥ 1"', 'critical', true, pass,
        pass ? 'Top margin is at least 1"' : `Top margin is less than 1" in ${failing.length} section(s)`,
        pass ? undefined : `Found: ${(failing[0].top / 1440).toFixed(2)}"`,
        'Open document → Layout → Margins and set top margin to at least 1"'
      );
    },
  },
  {
    id: 'MARGIN-004',
    category: 'margins',
    name: 'Bottom Margin ≥ 1"',
    description: 'Bottom margin must be at least 1 inch',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const failing = doc.margins.filter(m => m.bottom < MARGIN_1_INCH);
      const pass = failing.length === 0;
      return makeResult(
        'MARGIN-004', 'margins', 'Bottom Margin ≥ 1"', 'critical', true, pass,
        pass ? 'Bottom margin is at least 1"' : `Bottom margin is less than 1" in ${failing.length} section(s)`,
        pass ? undefined : `Found: ${(failing[0].bottom / 1440).toFixed(2)}"`,
        'Open document → Layout → Margins and set bottom margin to at least 1"'
      );
    },
  },
  {
    id: 'MARGIN-005',
    category: 'margins',
    name: 'Page Numbers 0.5" from Bottom',
    description: 'Footer margin should be 0.5" to position page numbers correctly',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const failing = doc.margins.filter(m => m.footer !== MARGIN_HALF_INCH);
      const pass = failing.length === 0;
      return makeResult(
        'MARGIN-005', 'margins', 'Page Numbers 0.5" from Bottom', 'major', true, pass,
        pass ? 'Page numbers positioned 0.5" from bottom' : `Footer margin is not 0.5" in ${failing.length} section(s)`,
        pass ? undefined : `Found: ${(failing[0].footer / 1440).toFixed(2)}"`,
        'Open document → Layout → Margins and set footer distance to 0.5"'
      );
    },
  },
  {
    id: 'MARGIN-006',
    category: 'margins',
    name: 'Abstract Top Margin 2.5"',
    description: 'The abstract page must have a 2.5" top margin (separate from body margins)',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      if (!doc.abstract.detected) {
        return makeResult(
          'MARGIN-006', 'margins', 'Abstract Top Margin 2.5"', 'major', false, false,
          'Abstract section not detected — cannot check abstract top margin',
          undefined,
          'Add an Abstract section with a 2.5" top margin. Use a section break before the abstract page and set a custom top margin.'
        );
      }
      const topMargin = doc.abstract.topMargin;
      if (!topMargin) {
        return makeResult(
          'MARGIN-006', 'margins', 'Abstract Top Margin 2.5"', 'major', false, false,
          'Could not determine abstract page top margin',
          undefined,
          'Set the abstract page top margin to 2.5". You may need to use a section break and custom margin for just that page.'
        );
      }
      if (topMargin >= MARGIN_2_5_INCH) {
        return makeResult(
          'MARGIN-006', 'margins', 'Abstract Top Margin 2.5"', 'major', false, true,
          `Abstract top margin is ${(topMargin / 1440).toFixed(2)}" (≥ 2.5")`
        );
      }
      return makeResult(
        'MARGIN-006', 'margins', 'Abstract Top Margin 2.5"', 'major', false, false,
        `Abstract top margin is ${(topMargin / 1440).toFixed(2)}" — must be 2.5"`,
        `Found: ${(topMargin / 1440).toFixed(2)}", required: 2.5"`,
        'The abstract page must have a 2.5" top margin. Use a section break to isolate the abstract page, then set its top margin to 2.5" via Layout → Margins → Custom Margins.'
      );
    },
  },
];

export default marginRules;
