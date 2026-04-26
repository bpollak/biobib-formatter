import { FormattingRule, DocumentModel, RuleResult } from '../types';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'pagination', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const paginationRules: FormattingRule[] = [
  {
    id: 'PAGE-001',
    category: 'pagination',
    name: 'Title Page Not Numbered',
    description: 'Title page counts as page i but must not show a page number',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const titleSection = doc.sections.find(s => s.type === 'title');
      if (!titleSection) {
        return makeResult('PAGE-001', 'Title Page Not Numbered', 'critical', true, false,
          'Title page could not be detected',
          undefined,
          'Ensure the title page is the first page of the document. It counts as page i but must NOT display a page number.'
        );
      }
      return makeResult('PAGE-001', 'Title Page Not Numbered', 'critical', true, true,
        'Title page detected — verify it has no visible page number');
    },
  },
  {
    id: 'PAGE-002',
    category: 'pagination',
    name: 'Copyright Page Not Numbered',
    description: 'Blank/copyright page counts as page ii but must not show a number',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const copyrightSection = doc.sections.find(s => s.type === 'copyright');
      if (!copyrightSection) {
        return makeResult('PAGE-002', 'Copyright Page Not Numbered', 'critical', true, false,
          'Copyright/blank page could not be detected',
          undefined,
          'Ensure the second page is blank or contains only a copyright notice. It counts as page ii but must NOT display a page number.'
        );
      }
      return makeResult('PAGE-002', 'Copyright Page Not Numbered', 'critical', true, true,
        'Copyright/blank page detected — verify it has no visible page number');
    },
  },
  {
    id: 'PAGE-003',
    category: 'pagination',
    name: 'Approval Page Numbered iii',
    description: 'The approval page must always be numbered "iii"',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const { hasPrelimRoman, romanStartsAtIii } = doc.pageNumbering;
      if (hasPrelimRoman && romanStartsAtIii) {
        return makeResult('PAGE-003', 'Approval Page Numbered iii', 'critical', true, true,
          'Preliminary pages use Roman numerals starting at iii');
      }
      return makeResult('PAGE-003', 'Approval Page Numbered iii', 'critical', true, false,
        'Cannot verify approval page is numbered "iii"',
        undefined,
        'Go to the approval page and ensure the page number shows "iii". Use Insert → Page Numbers and set starting number to 3 (lowercase Roman numerals) in the footer for the preliminary section.'
      );
    },
  },
  {
    id: 'PAGE-004',
    category: 'pagination',
    name: 'Preliminary Pages Use Roman Numerals',
    description: 'All preliminary pages must use lowercase Roman numerals (iii, iv, v...)',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const { hasPrelimRoman } = doc.pageNumbering;
      if (hasPrelimRoman) {
        return makeResult('PAGE-004', 'Preliminary Pages Use Roman Numerals', 'critical', true, true,
          'Preliminary pages use lowercase Roman numerals');
      }
      return makeResult('PAGE-004', 'Preliminary Pages Use Roman Numerals', 'critical', true, false,
        'Roman numeral page numbering for preliminary pages not detected',
        undefined,
        'Set the footer in preliminary pages to use Roman numerals. In Word: Insert → Page Numbers → Format Page Numbers → Number Format → i, ii, iii...'
      );
    },
  },
  {
    id: 'PAGE-005',
    category: 'pagination',
    name: 'Body Pages Start at Arabic 1',
    description: 'The first page of the body chapter must be numbered 1 in Arabic numerals',
    severity: 'critical',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const { hasBodyArabic, arabicStartsAtOne } = doc.pageNumbering;
      if (hasBodyArabic && arabicStartsAtOne) {
        return makeResult('PAGE-005', 'Body Pages Start at Arabic 1', 'critical', true, true,
          'Body pages start at Arabic numeral 1');
      }
      return makeResult('PAGE-005', 'Body Pages Start at Arabic 1', 'critical', true, false,
        'Arabic page numbering starting at 1 not detected for body',
        undefined,
        'Add a section break before Chapter 1. In the new section footer, set page numbers to restart at 1 using Arabic numerals. Unlink from previous section.'
      );
    },
  },
  {
    id: 'PAGE-006',
    category: 'pagination',
    name: 'Page Numbers Centered at Bottom',
    description: 'Page numbers must be centered at the bottom of each page',
    severity: 'major',
    autoFixable: true,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const { pageNumbersAtBottom, pageNumbersCentered } = doc.pageNumbering;
      if (pageNumbersAtBottom && pageNumbersCentered) {
        return makeResult('PAGE-006', 'Page Numbers Centered at Bottom', 'major', true, true,
          'Page numbers are centered at the bottom');
      }
      const issues: string[] = [];
      if (!pageNumbersAtBottom) issues.push('not in footer');
      if (!pageNumbersCentered) issues.push('not centered');
      return makeResult('PAGE-006', 'Page Numbers Centered at Bottom', 'major', true, false,
        `Page number positioning issue: ${issues.join(', ')}`,
        undefined,
        'Click into the footer, select the page number, and center it. Page numbers must be centered and 0.5" from the bottom of the page.'
      );
    },
  },
  {
    id: 'PAGE-007',
    category: 'pagination',
    name: 'No Missing Page Numbers',
    description: 'No page numbers should be missing in the sequence',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(_doc: DocumentModel): RuleResult {
      // This requires full page analysis which is not available in MVP
      // Flag as warning with instructions
      return {
        ruleId: 'PAGE-007',
        category: 'pagination',
        name: 'No Missing Page Numbers',
        status: 'warning',
        message: 'Manually verify no page numbers are missing in the sequence',
        autoFixable: false,
        severity: 'critical',
        manualFixInstruction: 'Print the document or use Print Preview to verify all pages have sequential page numbers with no gaps.',
      };
    },
  },
  {
    id: 'PAGE-008',
    category: 'pagination',
    name: 'No Duplicate Page Numbers',
    description: 'No page numbers should be duplicated',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(_doc: DocumentModel): RuleResult {
      return {
        ruleId: 'PAGE-008',
        category: 'pagination',
        name: 'No Duplicate Page Numbers',
        status: 'warning',
        message: 'Manually verify no page numbers are duplicated',
        autoFixable: false,
        severity: 'critical',
        manualFixInstruction: 'Check section breaks in your document. Duplicate numbers often occur when a new section incorrectly continues numbering from the same start. Use View → Navigation Pane to find section breaks.',
      };
    },
  },
  {
    id: 'PAGE-009',
    category: 'pagination',
    name: 'No Blank Numbered Pages',
    description: 'Every numbered page must contain content',
    severity: 'major',
    autoFixable: false,
    appliesTo: 'all',
    check(_doc: DocumentModel): RuleResult {
      return {
        ruleId: 'PAGE-009',
        category: 'pagination',
        name: 'No Blank Numbered Pages',
        status: 'warning',
        message: 'Manually verify no blank pages have visible page numbers',
        autoFixable: false,
        severity: 'major',
        manualFixInstruction: 'Check that any blank pages in your document do not show page numbers in the footer. The blank/copyright page (page ii) should not display a number.',
      };
    },
  },
];

export default paginationRules;
