import { FormattingRule, DocumentModel, RuleResult } from '../types';

function makeResult(
  ruleId: string, name: string, severity: FormattingRule['severity'],
  autoFixable: boolean, pass: boolean, message: string,
  details?: string, manualFixInstruction?: string
): RuleResult {
  return {
    ruleId, category: 'approval-page', name,
    status: pass ? 'pass' : 'fail',
    message, details, autoFixable, severity, manualFixInstruction,
  };
}

const approvalPageRules: FormattingRule[] = [
  {
    id: 'APPROVAL-001',
    category: 'approval-page',
    name: 'Approval Page Present',
    description: 'The Dissertation/Thesis Approval page must be present',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const approvalSection = doc.sections.find(s => s.type === 'approval');
      if (approvalSection) {
        return makeResult('APPROVAL-001', 'Approval Page Present', 'critical', false, true,
          'Approval page detected');
      }
      return makeResult('APPROVAL-001', 'Approval Page Present', 'critical', false, false,
        'Approval page not detected',
        undefined,
        'Add a Dissertation/Thesis Approval page as page iii. Download the template from the GEPA website. The approval page must contain the committee signatures block.'
      );
    },
  },
  {
    id: 'APPROVAL-002',
    category: 'approval-page',
    name: 'Approval Page Is Page iii',
    description: 'The approval page must always be page iii',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const approvalSection = doc.sections.find(s => s.type === 'approval');
      if (!approvalSection) {
        return makeResult('APPROVAL-002', 'Approval Page Is Page iii', 'critical', false, false,
          'Approval page not detected — cannot verify page number',
          undefined,
          'Ensure the approval page is page iii. It must be the third page of the document.'
        );
      }
      return {
        ruleId: 'APPROVAL-002', category: 'approval-page', name: 'Approval Page Is Page iii',
        status: 'warning', message: 'Manually verify the approval page is numbered "iii"',
        autoFixable: false, severity: 'critical',
        manualFixInstruction: 'Check that the approval page shows page number "iii" in the footer. If not, adjust the page numbering in the preliminary pages section.',
      };
    },
  },
  {
    id: 'APPROVAL-003',
    category: 'approval-page',
    name: 'Approval Page Uses GEPA Template',
    description: 'The approval page must follow the GEPA-provided template format',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const approvalSection = doc.sections.find(s => s.type === 'approval');
      if (!approvalSection) {
        return makeResult('APPROVAL-003', 'Approval Page Uses GEPA Template', 'critical', false, false,
          'Approval page not detected',
          undefined,
          'Download and use the official GEPA approval page template. Do not modify the template formatting.'
        );
      }
      return {
        ruleId: 'APPROVAL-003', category: 'approval-page', name: 'Approval Page Uses GEPA Template',
        status: 'warning', message: 'Manually verify the approval page follows the GEPA template format',
        autoFixable: false, severity: 'critical',
        manualFixInstruction: 'Ensure the approval page matches the GEPA-provided template. Do not alter the layout, spacing, or signature line format.',
      };
    },
  },
  {
    id: 'APPROVAL-004',
    category: 'approval-page',
    name: 'Committee Signatures Present',
    description: 'All committee members must have signature lines on the approval page',
    severity: 'critical',
    autoFixable: false,
    appliesTo: 'all',
    check(doc: DocumentModel): RuleResult {
      const approvalSection = doc.sections.find(s => s.type === 'approval');
      if (!approvalSection) {
        return makeResult('APPROVAL-004', 'Committee Signatures Present', 'critical', false, false,
          'Approval page not detected — cannot verify signatures',
          undefined,
          'Add signature lines for all committee members on the approval page.'
        );
      }
      return {
        ruleId: 'APPROVAL-004', category: 'approval-page', name: 'Committee Signatures Present',
        status: 'warning', message: 'Manually verify all committee members have signature lines on the approval page',
        autoFixable: false, severity: 'critical',
        manualFixInstruction: 'Verify each committee member listed on the title page has a corresponding signature line on the approval page. The chair\'s signature should appear first.',
      };
    },
  },
];

export default approvalPageRules;
