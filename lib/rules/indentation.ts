import { FormattingRule, DocumentModel, RuleResult } from '../types';
import { INDENT_HALF_INCH } from '../constants';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'indentation', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const indentationRules: FormattingRule[] = [
  {
    id: 'INDENT-001',
    category: 'indentation',
    name: 'First Line Indent 0.5"',
    description: 'Body text paragraphs must have a 0.5" first-line indent',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const bodyParas = doc.paragraphs.filter(p =>
        !p.isHeading &&
        !p.isCaption &&
        !p.isEmpty &&
        p.text.trim().length > 20 &&
        !/^(caption|footnote|figure|table|toc|list|heading|abstract)/i.test(p.style.toLowerCase())
      );

      if (bodyParas.length === 0) {
        return {
          ruleId: 'INDENT-001', category: 'indentation', name: 'First Line Indent 0.5"',
          status: 'skipped', message: 'No body paragraphs detected', autoFixable: true, severity: 'critical',
        };
      }

      const noIndent = bodyParas.filter(p =>
        !p.indentFirstLine || p.indentFirstLine < INDENT_HALF_INCH
      );

      if (noIndent.length === 0) {
        return makeResult('INDENT-001', 'First Line Indent 0.5"', 'critical', true, true,
          `All ${bodyParas.length} body paragraph(s) have correct 0.5" first-line indent`);
      }

      const pct = Math.round((noIndent.length / bodyParas.length) * 100);
      return makeResult('INDENT-001', 'First Line Indent 0.5"', 'critical', true, false,
        `${noIndent.length} of ${bodyParas.length} body paragraph(s) (${pct}%) lack correct first-line indent`,
        `Expected 0.5" (${INDENT_HALF_INCH} twips) first-line indent`,
        'Select all body text paragraphs and set the first-line indent to 0.5". In Word: Home → Paragraph → Indentation → Special → First Line → 0.5".'
      );
    },
  },
  {
    id: 'INDENT-002',
    category: 'indentation',
    name: 'No Block-Style Paragraphs',
    description: 'Body text should not use block paragraph style (no indent + extra space between paragraphs)',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const bodyParas = doc.paragraphs.filter(p =>
        !p.isHeading &&
        !p.isCaption &&
        !p.isEmpty &&
        p.text.trim().length > 20
      );

      if (bodyParas.length === 0) {
        return {
          ruleId: 'INDENT-002', category: 'indentation', name: 'No Block-Style Paragraphs',
          status: 'skipped', message: 'No body paragraphs detected', autoFixable: true, severity: 'major',
        };
      }

      // Block style = no first-line indent AND extra space after paragraph
      const blockStyle = bodyParas.filter(p =>
        (!p.indentFirstLine || p.indentFirstLine < 100) &&
        (p.spaceAfter && p.spaceAfter > 200)
      );

      if (blockStyle.length === 0) {
        return makeResult('INDENT-002', 'No Block-Style Paragraphs', 'major', true, true,
          'No block-style paragraphs detected');
      }

      return makeResult('INDENT-002', 'No Block-Style Paragraphs', 'major', true, false,
        `${blockStyle.length} paragraph(s) may be using block formatting style`,
        'Block style detected: no first-line indent with extra space between paragraphs',
        'GEPA requires first-line indented paragraph style (0.5" indent, no extra space between paragraphs). Remove extra paragraph spacing and add first-line indentation to body text.'
      );
    },
  },
];

export default indentationRules;
