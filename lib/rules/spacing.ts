import { FormattingRule, DocumentModel, RuleResult } from '../types';
import { LINE_SPACING_DOUBLE, LINE_SPACING_SINGLE, INDENT_HALF_INCH } from '../constants';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'spacing', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const spacingRules: FormattingRule[] = [
  {
    id: 'SPACE-001',
    category: 'spacing',
    name: 'Body Text Double-Spaced',
    description: 'All body text must be double-spaced',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const bodyParas = doc.paragraphs.filter(p =>
        !p.isHeading &&
        !p.isCaption &&
        !p.isEmpty &&
        p.text.trim().length > 20 &&
        !/^(caption|footnote|figure|table|toc|list)/i.test(p.style)
      );
      
      if (bodyParas.length === 0) {
        return makeResult('SPACE-001', 'Body Text Double-Spaced', 'critical', true, true,
          'No body text paragraphs detected to check');
      }

      const notDoubleSpaced = bodyParas.filter(p =>
        p.lineSpacing !== undefined && p.lineSpacing < LINE_SPACING_DOUBLE
      );

      if (notDoubleSpaced.length === 0) {
        return makeResult('SPACE-001', 'Body Text Double-Spaced', 'critical', true, true,
          'Body text is double-spaced');
      }

      return makeResult('SPACE-001', 'Body Text Double-Spaced', 'critical', true, false,
        `${notDoubleSpaced.length} body paragraph(s) are not double-spaced`,
        `First occurrence at paragraph ${notDoubleSpaced[0].index + 1}`,
        'Select all body text (Ctrl+A), then set line spacing to Double (2.0) via Home → Paragraph → Line Spacing.'
      );
    },
  },
  {
    id: 'SPACE-002',
    category: 'spacing',
    name: 'Block Quotes Single-Spaced',
    description: 'Long quotations (block quotes) should be single-spaced',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Look for paragraphs with significant indentation that might be block quotes
      const blockQuotes = doc.paragraphs.filter(p =>
        p.indentLeft && p.indentLeft >= INDENT_HALF_INCH &&
        p.indentRight && p.indentRight >= INDENT_HALF_INCH &&
        p.text.trim().length > 50
      );

      if (blockQuotes.length === 0) {
        return makeResult('SPACE-002', 'Block Quotes Single-Spaced', 'major', false, true,
          'No block quotes detected, or all are correctly single-spaced');
      }

      const wrongSpacing = blockQuotes.filter(p =>
        p.lineSpacing !== undefined && p.lineSpacing > LINE_SPACING_SINGLE * 1.5
      );

      if (wrongSpacing.length === 0) {
        return makeResult('SPACE-002', 'Block Quotes Single-Spaced', 'major', false, true,
          'Block quotes appear to be single-spaced');
      }

      return makeResult('SPACE-002', 'Block Quotes Single-Spaced', 'major', false, false,
        `${wrongSpacing.length} block quote(s) may not be single-spaced`,
        undefined,
        'Select block quote text, then set line spacing to Single (1.0) via Home → Paragraph → Line Spacing.'
      );
    },
  },
  {
    id: 'SPACE-003',
    category: 'spacing',
    name: 'Block Quotes Indented 0.5" Both Sides',
    description: 'Block quotes must be indented 0.5" on both left and right',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      // Heuristic: paragraphs that are very long (likely quotes) but may not have indentation
      const longParas = doc.paragraphs.filter(p =>
        p.text.trim().length > 200 &&
        !p.isHeading &&
        !p.isEmpty
      );

      if (longParas.length === 0) {
        return makeResult('SPACE-003', 'Block Quotes Indented 0.5"', 'major', false, true,
          'No block quotes detected requiring indentation check');
      }

      // Check if long paragraphs that look like quotes have proper indentation
      const noIndent = longParas.filter(p =>
        (!p.indentLeft || p.indentLeft < INDENT_HALF_INCH) &&
        p.text.trim().startsWith('"') // crude quote detection
      );

      if (noIndent.length === 0) {
        return makeResult('SPACE-003', 'Block Quotes Indented 0.5"', 'major', false, true,
          'Block quote indentation appears correct');
      }

      return makeResult('SPACE-003', 'Block Quotes Indented 0.5"', 'major', false, false,
        `${noIndent.length} potential block quote(s) may need indentation`,
        undefined,
        'For block quotes (6+ lines), set left and right indentation to 0.5" via Home → Paragraph → Indentation.'
      );
    },
  },
];

export default spacingRules;
